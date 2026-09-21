import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(_client: Socket) {
    // Clients join the default namespace; auth optional for MVP realtime
  }

  emitQr(qr: string) {
    this.server.emit('whatsapp:qr', { qr });
  }

  emitStatus(status: 'DISCONNECTED' | 'QR' | 'CONNECTED') {
    this.server.emit('whatsapp:status', { status });
  }

  emitMessage(message: unknown) {
    this.server.emit('chat:message', message);
  }

  emitConversation(conversation: unknown) {
    this.server.emit('chat:conversation', conversation);
  }
}
