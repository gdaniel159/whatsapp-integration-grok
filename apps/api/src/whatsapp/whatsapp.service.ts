import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { ChatService } from '../chat/chat.service';
import { AutoReplyService } from '../llm/auto-reply.service';
import { WaSessionStatus } from '@prisma/client';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private sock: WASocket | null = null;
  private status: WaSessionStatus = WaSessionStatus.DISCONNECTED;
  private starting = false;
  private authDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
    @Inject(forwardRef(() => AutoReplyService))
    private readonly autoReply: AutoReplyService,
  ) {
    const rel = this.config.get<string>('WA_AUTH_DIR') || '.wa-auth';
    this.authDir = path.isAbsolute(rel)
      ? rel
      : path.join(process.cwd(), rel);
  }

  async onModuleInit() {
    await this.prisma.whatsAppSession.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default', status: 'DISCONNECTED' },
    });
    // Auto-start if auth already exists
    if (fs.existsSync(this.authDir)) {
      this.start().catch((e) =>
        this.logger.warn(`Auto-start WA failed: ${e?.message || e}`),
      );
    }
  }

  getStatus() {
    return { status: this.status };
  }

  async start() {
    if (this.starting) return;
    if (this.sock && this.status === WaSessionStatus.CONNECTED) return;
    this.starting = true;
    try {
      await this.connect();
    } finally {
      this.starting = false;
    }
  }

  async logout() {
    try {
      await this.sock?.logout();
    } catch {
      /* ignore */
    }
    this.sock = null;
    if (fs.existsSync(this.authDir)) {
      fs.rmSync(this.authDir, { recursive: true, force: true });
    }
    await this.setStatus(WaSessionStatus.DISCONNECTED);
  }

  async sendText(remoteJid: string, body: string) {
    if (!this.sock || this.status !== WaSessionStatus.CONNECTED) {
      throw new Error('WhatsApp no está conectado');
    }
    const result = await this.sock.sendMessage(remoteJid, { text: body });
    return result;
  }

  private async connect() {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307] as [number, number, number],
    }));

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr);
          await this.setStatus(WaSessionStatus.QR, true);
          this.events.emitQr(dataUrl);
        } catch (e) {
          this.logger.error('QR encode failed', e);
        }
      }

      if (connection === 'open') {
        await this.setStatus(WaSessionStatus.CONNECTED);
        this.logger.log('WhatsApp CONNECTED');
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        this.logger.warn(`WA closed code=${code} reconnect=${shouldReconnect}`);
        this.sock = null;
        if (shouldReconnect) {
          await this.setStatus(WaSessionStatus.DISCONNECTED);
          setTimeout(() => {
            this.start().catch((e) =>
              this.logger.warn(`Reconnect failed: ${e?.message || e}`),
            );
          }, 3000);
        } else {
          await this.setStatus(WaSessionStatus.DISCONNECTED);
          if (fs.existsSync(this.authDir)) {
            fs.rmSync(this.authDir, { recursive: true, force: true });
          }
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        await this.handleIncoming(msg).catch((e) =>
          this.logger.warn(`msg handle: ${e?.message || e}`),
        );
      }
    });
  }

  private async handleIncoming(msg: proto.IWebMessageInfo) {
    if (!msg.message || msg.key.fromMe) return;
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
      // MVP: solo chats 1:1
      return;
    }
    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';
    if (!body) return;

    const name =
      msg.pushName || remoteJid.split('@')[0] || null;

    const saved = await this.chat.persistIncoming({
      remoteJid,
      name,
      body,
      waMessageId: msg.key.id || undefined,
      timestamp: msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000)
        : new Date(),
      rawMeta: msg as unknown as object,
    });

    if (!saved) return;

    // Auto-reply (AI mode): async, do not block inbound handling
    this.autoReply.handleInboundAsync(saved.conversationId, body);
  }

  private async setStatus(status: WaSessionStatus, qr = false) {
    this.status = status;
    await this.prisma.whatsAppSession.upsert({
      where: { id: 'default' },
      update: {
        status,
        ...(qr ? { lastQrAt: new Date() } : {}),
      },
      create: {
        id: 'default',
        status,
        ...(qr ? { lastQrAt: new Date() } : {}),
      },
    });
    this.events.emitStatus(status);
  }
}
