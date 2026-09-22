'use client';

import { CommercialActivityTimeline } from '@/components/CommercialActivityTimeline';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, clearToken } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { StatusBadge } from './StatusBadge';
import { PipelineBoard } from './PipelineBoard';
import { cn } from '@/lib/utils';
import {
  LEAD_STATUS_OPTIONS,
  type LeadStatus,
} from '@/lib/lead-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type WaStatus = 'DISCONNECTED' | 'QR' | 'CONNECTED';
type AiMode = 'AI' | 'MANUAL';
type Tab = 'chats' | 'kb' | 'contacts' | 'pipeline' | 'simulator';

const isDev = process.env.NODE_ENV !== 'production';

interface ContactSummary {
  id: string;
  displayName: string | null;
  phoneE164: string | null;
  waJid: string;
}

interface Conversation {
  id: string;
  remoteJid: string;
  name: string | null;
  lastMessageAt: string | null;
  aiMode?: AiMode;
  contactId?: string | null;
  contact?: ContactSummary | null;
}

interface Message {
  id: string;
  conversationId: string;
  direction: 'IN' | 'OUT';
  body: string;
  timestamp: string;
}

interface KnowledgeBase {
  id: string;
  content: string;
  updatedAt: string;
}

interface BotSettings {
  id: string;
  welcomeMessage: string;
  firstAction: string;
  hfModel: string | null;
  globalAutoReplyEnabled?: boolean;
  updatedAt: string;
}

interface ContactRow {
  id: string;
  waJid: string;
  phoneE164: string | null;
  displayName: string | null;
  profileName: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
  leadStatus?: LeadStatus;
  notes?: string | null;
  tags?: string[];
}

interface ContactConversation {
  id: string;
  remoteJid: string;
  lastMessageAt: string | null;
  name: string | null;
}

interface ContactDetail extends ContactRow {
  conversationId: string | null;
  conversations: ContactConversation[];
}

function convLabel(c: Conversation) {
  return (
    c.contact?.displayName ||
    c.name ||
    c.remoteJid.split('@')[0]
  );
}

function formatDt(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function Dashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('chats');
  const [status, setStatus] = useState<WaStatus>('DISCONNECTED');
  const [qr, setQr] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [togglingAi, setTogglingAi] = useState(false);

  // KB / Bot settings
  const [kbContent, setKbContent] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [firstAction, setFirstAction] = useState('');
  const [hfModel, setHfModel] = useState('');
  const [kbSaving, setKbSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [kbSavedAt, setKbSavedAt] = useState<string | null>(null);
  const [settingsSavedAt, setSettingsSavedAt] = useState<string | null>(null);
  const [globalAutoReplyEnabled, setGlobalAutoReplyEnabled] = useState(false);
  const [togglingGlobalAutoReply, setTogglingGlobalAutoReply] = useState(false);

  // Contacts
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(
    null,
  );
  const [contactDetailLoading, setContactDetailLoading] = useState(false);
  const [contactDetailError, setContactDetailError] = useState('');
  const [draftLeadStatus, setDraftLeadStatus] = useState<LeadStatus>('NEW');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [contactSaving, setContactSaving] = useState(false);
  const [contactSaveOk, setContactSaveOk] = useState('');

  // DEV simulator
  const [simDisplayName, setSimDisplayName] = useState('Cliente prueba');
  const [simContactKey, setSimContactKey] = useState('test-001');
  const [simBody, setSimBody] = useState('Hola');
  const [simSending, setSimSending] = useState(false);
  const [simOk, setSimOk] = useState('');
  const [simError, setSimError] = useState('');

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId],
  );

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const name = (c.displayName || '').toLowerCase();
      const phone = (c.phoneE164 || '').toLowerCase();
      const jid = c.waJid.toLowerCase();
      return name.includes(q) || phone.includes(q) || jid.includes(q);
    });
  }, [contacts, contactSearch]);

  const loadConversations = useCallback(async () => {
    try {
      const list = await api<Conversation[]>('/conversations');
      setConversations(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando chats');
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const list = await api<Message[]>(`/conversations/${id}/messages`);
      setMessages(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando mensajes');
    }
  }, []);

  const loadKbAndSettings = useCallback(async () => {
    try {
      const [kb, settings] = await Promise.all([
        api<KnowledgeBase>('/knowledge-base'),
        api<BotSettings>('/bot-settings'),
      ]);
      setKbContent(kb.content);
      setWelcomeMessage(settings.welcomeMessage);
      setFirstAction(settings.firstAction);
      setHfModel(settings.hfModel || '');
      setGlobalAutoReplyEnabled(settings.globalAutoReplyEnabled ?? false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Error cargando base de conocimiento',
      );
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError('');
    try {
      const list = await api<ContactRow[]>('/contacts');
      setContacts(list);
    } catch (e) {
      setContactsError(
        e instanceof Error ? e.message : 'Error cargando contactos',
      );
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const loadContactDetail = useCallback(async (id: string) => {
    setContactDetailLoading(true);
    setContactDetailError('');
    setContactSaveOk('');
    try {
      const detail = await api<ContactDetail>(`/contacts/${id}`);
      setContactDetail(detail);
      setDraftLeadStatus(detail.leadStatus || 'NEW');
      setDraftNotes(detail.notes || '');
      setDraftTags(detail.tags || []);
      setTagInput('');
    } catch (e) {
      setContactDetail(null);
      setContactDetailError(
        e instanceof Error ? e.message : 'Error cargando contacto',
      );
    } finally {
      setContactDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    api<{ status: WaStatus }>('/whatsapp/status')
      .then((s) => setStatus(s.status))
      .catch(() => undefined);
    api<{ status: WaStatus }>('/whatsapp/start', { method: 'POST' }).catch(
      () => undefined,
    );
    loadConversations();
    api<BotSettings>('/bot-settings')
      .then((s) => setGlobalAutoReplyEnabled(s.globalAutoReplyEnabled ?? false))
      .catch(() => setGlobalAutoReplyEnabled(false));

    const socket = getSocket();
    const onQr = (p: { qr: string }) => {
      setQr(p.qr);
      setStatus('QR');
    };
    const onStatus = (p: { status: WaStatus }) => {
      setStatus(p.status);
      if (p.status === 'CONNECTED') setQr(null);
    };
    const onMessage = (msg: Message) => {
      setMessages((prev) => {
        if (selectedIdRef.current !== msg.conversationId) return prev;
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    const onConv = (conv: Conversation) => {
      setConversations((prev) => {
        const rest = prev.filter((c) => c.id !== conv.id);
        return [conv, ...rest].sort((a, b) => {
          const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
          const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
          return tb - ta;
        });
      });
    };

    socket.on('whatsapp:qr', onQr);
    socket.on('whatsapp:status', onStatus);
    socket.on('chat:message', onMessage);
    socket.on('chat:conversation', onConv);

    return () => {
      socket.off('whatsapp:qr', onQr);
      socket.off('whatsapp:status', onStatus);
      socket.off('chat:message', onMessage);
      socket.off('chat:conversation', onConv);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (tab === 'kb') loadKbAndSettings();
  }, [tab, loadKbAndSettings]);

  useEffect(() => {
    if (tab === 'contacts') loadContacts();
  }, [tab, loadContacts]);

  useEffect(() => {
    if (tab === 'contacts' && selectedContactId) {
      loadContactDetail(selectedContactId);
    } else if (!selectedContactId) {
      setContactDetail(null);
      setContactDetailError('');
    }
  }, [tab, selectedContactId, loadContactDetail]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const msg = await api<Message>(`/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: draft.trim() }),
      });
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setSending(false);
    }
  }

  async function toggleAiMode() {
    if (!selected) return;
    const next: AiMode = (selected.aiMode || 'AI') === 'AI' ? 'MANUAL' : 'AI';
    setTogglingAi(true);
    setError('');
    try {
      const updated = await api<Conversation>(
        `/conversations/${selected.id}/ai-mode`,
        {
          method: 'PATCH',
          body: JSON.stringify({ aiMode: next }),
        },
      );
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo cambiar modo IA',
      );
    } finally {
      setTogglingAi(false);
    }
  }

  async function toggleGlobalAutoReply() {
    const next = !globalAutoReplyEnabled;
    setTogglingGlobalAutoReply(true);
    setError('');
    try {
      const row = await api<BotSettings>('/bot-settings', {
        method: 'PATCH',
        body: JSON.stringify({ globalAutoReplyEnabled: next }),
      });
      setGlobalAutoReplyEnabled(row.globalAutoReplyEnabled ?? next);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cambiar respuestas automáticas',
      );
    } finally {
      setTogglingGlobalAutoReply(false);
    }
  }

  async function saveKnowledgeBase(e: React.FormEvent) {
    e.preventDefault();
    setKbSaving(true);
    setError('');
    try {
      const row = await api<KnowledgeBase>('/knowledge-base', {
        method: 'PUT',
        body: JSON.stringify({ content: kbContent }),
      });
      setKbContent(row.content);
      setKbSavedAt(row.updatedAt);
      toast.success('Base de conocimiento guardada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar KB');
    } finally {
      setKbSaving(false);
    }
  }

  async function saveBotSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    setError('');
    try {
      const row = await api<BotSettings>('/bot-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          welcomeMessage,
          firstAction,
          hfModel: hfModel.trim() || null,
        }),
      });
      setWelcomeMessage(row.welcomeMessage);
      setFirstAction(row.firstAction);
      setHfModel(row.hfModel || '');
      setSettingsSavedAt(row.updatedAt);
      toast.success('Ajustes guardados');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo guardar ajustes',
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function saveContactCommercial(e: React.FormEvent) {
    e.preventDefault();
    if (!contactDetail) return;
    setContactSaving(true);
    setContactDetailError('');
    setContactSaveOk('');
    try {
      const updated = await api<ContactDetail>(
        `/contacts/${contactDetail.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            leadStatus: draftLeadStatus,
            notes: draftNotes,
            tags: draftTags,
          }),
        },
      );
      setContactDetail(updated);
      setDraftLeadStatus(updated.leadStatus || 'NEW');
      setDraftNotes(updated.notes || '');
      setDraftTags(updated.tags || []);
      setContactSaveOk('Cambios guardados');
      toast.success('Datos comerciales guardados');
      await loadContacts();
    } catch (err) {
      setContactDetailError(
        err instanceof Error ? err.message : 'No se pudo guardar',
      );
    } finally {
      setContactSaving(false);
    }
  }

  function addDraftTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (!draftTags.includes(t)) setDraftTags((prev) => [...prev, t]);
    setTagInput('');
  }

  function removeDraftTag(tag: string) {
    setDraftTags((prev) => prev.filter((x) => x !== tag));
  }

  async function simulateInbound(e: React.FormEvent) {
    e.preventDefault();
    if (!simContactKey.trim() || !simBody.trim()) return;
    setSimSending(true);
    setSimError('');
    setSimOk('');
    try {
      const res = await api<{
        contactId: string;
        conversationId: string;
        messageId: string;
        remoteJid: string;
      }>('/dev/simulate-inbound', {
        method: 'POST',
        body: JSON.stringify({
          contactKey: simContactKey.trim(),
          displayName: simDisplayName.trim() || undefined,
          body: simBody.trim(),
        }),
      });
      const okMsg = `OK — ${res.remoteJid} · conversación ${res.conversationId.slice(0, 8)}…`;
      setSimOk(okMsg);
      toast.success('Mensaje simulado', { description: okMsg });
      await loadConversations();
      setSelectedId(res.conversationId);
      setTab('chats');
    } catch (err) {
      setSimError(
        err instanceof Error ? err.message : 'No se pudo simular el mensaje',
      );
    } finally {
      setSimSending(false);
    }
  }

  function logout() {
    clearToken();
    router.replace('/login');
  }

  const NEAR_BOTTOM_PX = 80;

  const isNearBottom = useCallback(() => {
    const el = messagesViewportRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const end = messagesEndRef.current;
    if (!end) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    end.scrollIntoView({ behavior: reduce ? 'auto' : behavior, block: 'end' });
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const onMessagesScroll = useCallback(() => {
    const near = isNearBottom();
    stickToBottomRef.current = near;
    setShowJumpToLatest(!near);
  }, [isNearBottom]);

  // Open conversation → jump to latest (instant)
  useEffect(() => {
    if (!selectedId) return;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    // after paint
    requestAnimationFrame(() => scrollToLatest('auto'));
  }, [selectedId, scrollToLatest]);

  // New messages → stick only if user was near bottom
  useEffect(() => {
    if (!selectedId || messages.length === 0) return;
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollToLatest('smooth'));
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, selectedId, scrollToLatest]);

  const aiMode = selected?.aiMode || 'AI';

  const navBtn = (id: Tab, label: string) => (
    <Button
      key={id}
      type="button"
      variant={tab === id ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => setTab(id)}
      className={cn(
        tab === id && 'bg-brand-50 text-brand-700 hover:bg-brand-50 hover:text-brand-700',
      )}
    >
      {label}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={300}>
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col bg-background">
      <header className="shrink-0 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <h1 className="font-semibold text-lg tracking-tight">WhatsApp Manager</h1>
          <StatusBadge status={status} />
          <Separator orientation="vertical" className="hidden sm:block h-6" />
          <div className="flex items-center gap-2">
            <Label
              htmlFor="global-auto-reply"
              className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap font-normal"
            >
              Respuestas automáticas
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Switch
                    id="global-auto-reply"
                    checked={globalAutoReplyEnabled}
                    disabled={togglingGlobalAutoReply}
                    onCheckedChange={() => toggleGlobalAutoReply()}
                    aria-label="Respuestas automáticas"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {globalAutoReplyEnabled
                  ? 'ON — auto-respuestas globales activas'
                  : 'OFF — kill switch; no se envía bienvenida ni IA'}
              </TooltipContent>
            </Tooltip>
            <Badge
              variant="outline"
              className={cn(
                'rounded-full text-[10px] uppercase',
                globalAutoReplyEnabled
                  ? 'border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                  : 'border-transparent bg-red-100 text-red-700 hover:bg-red-100',
              )}
            >
              {globalAutoReplyEnabled ? 'ON' : 'OFF'}
            </Badge>
          </div>
          <nav className="flex items-center gap-1 ml-1">
            {navBtn('chats', 'Chats')}
            {navBtn('contacts', 'Contactos')}
            {navBtn('pipeline', 'Pipeline')}
            {navBtn('kb', 'Base de conocimiento')}
            {isDev ? navBtn('simulator', 'Simulador') : null}
          </nav>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          Cerrar sesión
        </Button>
      </header>

      {error && tab !== 'contacts' && tab !== 'pipeline' && (
        <div className="shrink-0 bg-destructive/10 text-destructive text-sm px-4 py-2 border-b border-destructive/20">
          {error}
        </div>
      )}

      {tab === 'simulator' && isDev ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          <div className="max-w-lg mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Simulador de mensajes</CardTitle>
                <CardDescription>
                  Inyecta un mensaje entrante por el mismo pipeline que Baileys
                  (solo DEV). No envía nada a WhatsApp real.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  id="sim-form"
                  onSubmit={simulateInbound}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="sim-name">Contacto</Label>
                    <Input
                      id="sim-name"
                      value={simDisplayName}
                      onChange={(e) => setSimDisplayName(e.target.value)}
                      placeholder="Cliente prueba"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sim-key">Identificador</Label>
                    <Input
                      id="sim-key"
                      className="font-mono"
                      value={simContactKey}
                      onChange={(e) => setSimContactKey(e.target.value)}
                      placeholder="test-001"
                    />
                    <p className="text-xs text-muted-foreground">
                      JID resultante:{' '}
                      {(simContactKey.replace(/[^a-zA-Z0-9-]/g, '') || '…')}
                      @simulator.local
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sim-body">Mensaje</Label>
                    <Textarea
                      id="sim-body"
                      className="min-h-[100px]"
                      value={simBody}
                      onChange={(e) => setSimBody(e.target.value)}
                      placeholder="Hola"
                    />
                  </div>
                  {simError && (
                    <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 border border-destructive/20">
                      {simError}
                    </div>
                  )}
                  {simOk && (
                    <div className="rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2 border border-emerald-100">
                      {simOk}
                    </div>
                  )}
                </form>
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  type="submit"
                  form="sim-form"
                  disabled={
                    simSending || !simContactKey.trim() || !simBody.trim()
                  }
                  className="bg-brand-600 hover:bg-brand-700 text-white"
                >
                  {simSending ? 'Simulando…' : 'Simular mensaje'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      ) : tab === 'kb' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Base de conocimiento</CardTitle>
                <CardDescription>
                  Markdown/texto que la IA usa para responder (productos,
                  horarios, FAQs…).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form id="kb-form" onSubmit={saveKnowledgeBase} className="space-y-3">
                  <Textarea
                    className="min-h-[220px] font-mono"
                    value={kbContent}
                    onChange={(e) => setKbContent(e.target.value)}
                    placeholder="# Información del negocio…"
                  />
                </form>
              </CardContent>
              <CardFooter className="justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {kbSavedAt
                    ? `Guardado: ${new Date(kbSavedAt).toLocaleString()}`
                    : ' '}
                </span>
                <Button
                  type="submit"
                  form="kb-form"
                  disabled={kbSaving}
                  className="bg-brand-600 hover:bg-brand-700 text-white"
                >
                  {kbSaving ? 'Guardando…' : 'Guardar KB'}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bienvenida y primera acción</CardTitle>
                <CardDescription>
                  Se envían en el primer mensaje entrante de cada conversación
                  (modo IA).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  id="settings-form"
                  onSubmit={saveBotSettings}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="welcome">Mensaje de bienvenida</Label>
                    <Textarea
                      id="welcome"
                      className="min-h-[100px]"
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="first-action">Primera acción / CTA</Label>
                    <Textarea
                      id="first-action"
                      className="min-h-[72px]"
                      value={firstAction}
                      onChange={(e) => setFirstAction(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hf-model">Modelo HF (opcional)</Label>
                    <Input
                      id="hf-model"
                      value={hfModel}
                      onChange={(e) => setHfModel(e.target.value)}
                      placeholder="deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"
                    />
                    <p className="text-xs text-muted-foreground">
                      Vacío = usa HF_MODEL del entorno.
                    </p>
                  </div>
                </form>
              </CardContent>
              <CardFooter className="justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {settingsSavedAt
                    ? `Guardado: ${new Date(settingsSavedAt).toLocaleString()}`
                    : ' '}
                </span>
                <Button
                  type="submit"
                  form="settings-form"
                  disabled={settingsSaving}
                  className="bg-brand-600 hover:bg-brand-700 text-white"
                >
                  {settingsSaving ? 'Guardando…' : 'Guardar ajustes'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      ) : tab === 'pipeline' ? (
        <PipelineBoard
          onOpenContact={(id) => {
            setSelectedContactId(id);
            setTab('contacts');
          }}
          onOpenConversation={(conversationId) => {
            setSelectedId(conversationId);
            setTab('chats');
          }}
        />
      ) : tab === 'contacts' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr]">
          <aside className="border-r bg-card overflow-y-auto flex flex-col min-h-0">
            <div className="p-3 border-b space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                Contactos
              </div>
              <Input
                placeholder="Buscar por nombre o teléfono…"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
              />
            </div>
            {contactsError && (
              <div className="m-3 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 border border-destructive/20">
                {contactsError}
              </div>
            )}
            {contactsLoading ? (
              <div className="px-3 py-4 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {contacts.length === 0
                  ? 'Sin contactos aún'
                  : 'Ningún contacto coincide con la búsqueda'}
              </p>
            ) : (
              <ul className="flex-1 overflow-y-auto">
                {filteredContacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedContactId(c.id)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 border-b hover:bg-muted/50',
                        selectedContactId === c.id && 'bg-brand-50',
                      )}
                    >
                      <div className="font-medium text-sm truncate">
                        {c.displayName || c.waJid.split('@')[0]}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.phoneE164 || c.waJid}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between gap-2">
                        <span>Visto: {formatDt(c.lastSeenAt)}</span>
                        {c.leadStatus ? (
                          <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
                            {LEAD_STATUS_OPTIONS.find((o) => o.value === c.leadStatus)
                              ?.label || c.leadStatus}
                          </Badge>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="flex flex-col min-h-0 bg-muted/30 overflow-y-auto">
            {!selectedContactId ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-6">
                Selecciona un contacto
              </div>
            ) : contactDetailLoading ? (
              <div className="p-6 max-w-2xl w-full mx-auto space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-56 w-full" />
              </div>
            ) : contactDetailError ? (
              <div className="m-4 rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-3 border border-destructive/20">
                {contactDetailError}
              </div>
            ) : contactDetail ? (
              <div className="p-4 md:p-6 max-w-2xl w-full mx-auto space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="truncate text-lg">
                      {contactDetail.displayName ||
                        contactDetail.waJid.split('@')[0]}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">
                          Nombre
                        </dt>
                        <dd>{contactDetail.displayName || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">
                          Teléfono
                        </dt>
                        <dd>{contactDetail.phoneE164 || '—'}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">
                          WhatsApp JID
                        </dt>
                        <dd className="break-all">{contactDetail.waJid}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">
                          Primera vez
                        </dt>
                        <dd>{formatDt(contactDetail.firstSeenAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-muted-foreground">
                          Última vez
                        </dt>
                        <dd>{formatDt(contactDetail.lastSeenAt)}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Datos comerciales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form
                      id="contact-commercial-form"
                      onSubmit={saveContactCommercial}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label>Estado del lead</Label>
                        <Select
                          value={draftLeadStatus}
                          onValueChange={(v) =>
                            setDraftLeadStatus(v as LeadStatus)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Estado" />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_STATUS_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-notes">Notas</Label>
                        <Textarea
                          id="contact-notes"
                          className="min-h-[96px]"
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          placeholder="Notas internas del contacto…"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Etiquetas</Label>
                        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                          {draftTags.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              Sin etiquetas
                            </span>
                          ) : (
                            draftTags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="gap-1 rounded-full border-brand-100 bg-brand-50 text-brand-800"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => removeDraftTag(tag)}
                                  className="text-brand-600 hover:text-brand-900 font-bold leading-none"
                                  aria-label={`Quitar ${tag}`}
                                >
                                  ×
                                </button>
                              </Badge>
                            ))
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            className="flex-1"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addDraftTag();
                              }
                            }}
                            placeholder="Agregar etiqueta…"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={addDraftTag}
                          >
                            Añadir
                          </Button>
                        </div>
                      </div>
                      {contactSaveOk && (
                        <div className="rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2 border border-emerald-100">
                          {contactSaveOk}
                        </div>
                      )}
                    </form>
                  </CardContent>
                  <CardFooter className="justify-end">
                    <Button
                      type="submit"
                      form="contact-commercial-form"
                      disabled={contactSaving}
                      className="bg-brand-600 hover:bg-brand-700 text-white"
                    >
                      {contactSaving ? 'Guardando…' : 'Guardar cambios'}
                    </Button>
                  </CardFooter>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Historial comercial</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CommercialActivityTimeline
                      contactId={contactDetail?.id ?? selectedContactId}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Conversaciones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!contactDetail.conversations?.length ? (
                      <p className="text-sm text-muted-foreground">
                        Sin conversaciones vinculadas
                      </p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {contactDetail.conversations.map((cv) => (
                          <li
                            key={cv.id}
                            className="px-3 py-2.5 text-sm flex flex-col gap-0.5"
                          >
                            <span className="font-medium truncate">
                              {cv.name || cv.remoteJid.split('@')[0]}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {cv.remoteJid}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Último mensaje: {formatDt(cv.lastMessageAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </section>
        </div>
      ) : status !== 'CONNECTED' && !isDev ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 overflow-y-auto">
          <Card className="max-w-md w-full shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Conectar WhatsApp</CardTitle>
              <CardDescription>
                Escanea el código QR con WhatsApp → Dispositivos vinculados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt="QR WhatsApp"
                  className="mx-auto w-64 h-64 rounded-lg border"
                />
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  Esperando QR… (pulsa reiniciar si no aparece)
                </div>
              )}
              <Button
                className="bg-brand-600 hover:bg-brand-700 text-white"
                onClick={() =>
                  api('/whatsapp/start', { method: 'POST' }).catch(() => undefined)
                }
              >
                Reiniciar sesión WA
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_1fr]">
          <aside className="border-r bg-card min-h-0 flex flex-col overflow-hidden">
            <div className="shrink-0 p-3 text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Conversaciones
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {conversations.length === 0 && (
                <p className="px-3 text-sm text-muted-foreground">Sin chats aún</p>
              )}
              <ul>
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 border-b hover:bg-muted/50',
                        selectedId === c.id && 'bg-brand-50',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm truncate">
                          {convLabel(c)}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 text-[10px] uppercase rounded',
                            (c.aiMode || 'AI') === 'AI'
                              ? 'border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                              : 'border-transparent bg-slate-200 text-slate-600 hover:bg-slate-200',
                          )}
                        >
                          {(c.aiMode || 'AI') === 'AI' ? 'IA' : 'Manual'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.remoteJid}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <section className="flex flex-col min-h-0 bg-muted/30 overflow-hidden">
            {selected ? (
              <>
                <div className="shrink-0 border-b bg-card px-4 py-3 flex items-center justify-between gap-3 z-10">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {convLabel(selected)}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {selected.remoteJid}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {aiMode === 'AI' ? 'IA' : 'Manual'}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Switch
                            checked={aiMode === 'AI'}
                            disabled={togglingAi}
                            onCheckedChange={() => toggleAiMode()}
                            aria-label="Modo IA de la conversación"
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {aiMode === 'AI'
                          ? 'Cambiar a Manual (sin auto-respuesta)'
                          : 'Cambiar a IA (auto-respuesta)'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="relative flex-1 min-h-0">
                  <div
                    className="chat-fade-top pointer-events-none absolute inset-x-0 top-0 z-[1] h-8 bg-gradient-to-b from-slate-50/95 via-slate-50/50 to-transparent backdrop-blur-[2px]"
                    aria-hidden
                  />
                  <div
                    ref={messagesViewportRef}
                    onScroll={onMessagesScroll}
                    className="h-full overflow-y-auto overscroll-contain p-4 space-y-2"
                  >
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                          m.direction === 'OUT'
                            ? 'ml-auto bg-brand-600 text-white'
                            : 'bg-white border text-slate-800'
                        }`}
                      >
                        {m.body}
                        <div
                          className={`text-[10px] mt-1 ${
                            m.direction === 'OUT'
                              ? 'text-emerald-100'
                              : 'text-slate-400'
                          }`}
                        >
                          {new Date(m.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  {showJumpToLatest && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => scrollToLatest('smooth')}
                      className="absolute bottom-3 right-3 z-[2] rounded-full shadow-md h-8"
                      title="Ir al último mensaje"
                    >
                      ↓ Nuevos
                    </Button>
                  )}
                </div>

                <form
                  onSubmit={sendMessage}
                  className="shrink-0 border-t bg-card p-3 flex gap-2"
                >
                  <Input
                    className="flex-1"
                    placeholder={
                      aiMode === 'MANUAL'
                        ? 'Modo Manual — escribe tu respuesta…'
                        : 'Escribe un mensaje…'
                    }
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="bg-brand-600 hover:bg-brand-700 text-white"
                  >
                    Enviar
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Selecciona una conversación
              </div>
            )}
          </section>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
