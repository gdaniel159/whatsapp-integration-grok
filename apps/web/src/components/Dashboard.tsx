'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { StatusBadge } from './StatusBadge';

type WaStatus = 'DISCONNECTED' | 'QR' | 'CONNECTED';
type AiMode = 'AI' | 'MANUAL';
type Tab = 'chats' | 'kb' | 'contacts' | 'simulator';

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
    try {
      const detail = await api<ContactDetail>(`/contacts/${id}`);
      setContactDetail(detail);
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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo guardar ajustes',
      );
    } finally {
      setSettingsSaving(false);
    }
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
      setSimOk(
        `OK — ${res.remoteJid} · conversación ${res.conversationId.slice(0, 8)}…`,
      );
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
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`text-sm px-3 py-1.5 rounded-lg ${
        tab === id
          ? 'bg-brand-50 text-brand-700 font-medium'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-dvh max-h-dvh overflow-hidden flex flex-col">
      <header className="shrink-0 border-b bg-white px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-semibold text-lg">WhatsApp Manager</h1>
          <StatusBadge status={status} />
          <div className="flex items-center gap-2 ml-1 pl-2 border-l border-slate-200">
            <span className="text-xs sm:text-sm text-slate-600 whitespace-nowrap">
              Respuestas automáticas
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={globalAutoReplyEnabled}
              aria-label="Respuestas automáticas"
              disabled={togglingGlobalAutoReply}
              onClick={toggleGlobalAutoReply}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 ${
                globalAutoReplyEnabled
                  ? 'bg-brand-600 focus:ring-brand-500'
                  : 'bg-slate-400 focus:ring-red-300'
              }`}
              title={
                globalAutoReplyEnabled
                  ? 'ON — auto-respuestas globales activas'
                  : 'OFF — kill switch; no se envía bienvenida ni IA'
              }
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  globalAutoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span
              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                globalAutoReplyEnabled
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {globalAutoReplyEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
          <nav className="flex items-center gap-1 ml-2">
            {navBtn('chats', 'Chats')}
            {navBtn('contacts', 'Contactos')}
            {navBtn('kb', 'Base de conocimiento')}
            {isDev ? navBtn('simulator', 'Simulador') : null}
          </nav>
        </div>
        <button
          onClick={logout}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Cerrar sesión
        </button>
      </header>

      {error && tab !== 'contacts' && (
        <div className="shrink-0 bg-red-50 text-red-700 text-sm px-4 py-2 border-b border-red-100">
          {error}
        </div>
      )}

      {tab === 'simulator' && isDev ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          <div className="max-w-lg mx-auto">
            <form
              onSubmit={simulateInbound}
              className="bg-white rounded-2xl border shadow-sm p-5 space-y-4"
            >
              <div>
                <h2 className="font-semibold text-lg">Simulador de mensajes</h2>
                <p className="text-sm text-slate-500">
                  Inyecta un mensaje entrante por el mismo pipeline que Baileys
                  (solo DEV). No envía nada a WhatsApp real.
                </p>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  Contacto
                </span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={simDisplayName}
                  onChange={(e) => setSimDisplayName(e.target.value)}
                  placeholder="Cliente prueba"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  Identificador
                </span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={simContactKey}
                  onChange={(e) => setSimContactKey(e.target.value)}
                  placeholder="test-001"
                />
                <span className="text-xs text-slate-400">
                  JID resultante: {(simContactKey.replace(/[^a-zA-Z0-9-]/g, '') || '…')}@simulator.local
                </span>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  Mensaje
                </span>
                <textarea
                  className="w-full min-h-[100px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={simBody}
                  onChange={(e) => setSimBody(e.target.value)}
                  placeholder="Hola"
                />
              </label>
              {simError && (
                <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-100">
                  {simError}
                </div>
              )}
              {simOk && (
                <div className="rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2 border border-emerald-100">
                  {simOk}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={
                    simSending || !simContactKey.trim() || !simBody.trim()
                  }
                  className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
                >
                  {simSending ? 'Simulando…' : 'Simular mensaje'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : tab === 'kb' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <form
              onSubmit={saveKnowledgeBase}
              className="bg-white rounded-2xl border shadow-sm p-5 space-y-3"
            >
              <div>
                <h2 className="font-semibold text-lg">Base de conocimiento</h2>
                <p className="text-sm text-slate-500">
                  Markdown/texto que la IA usa para responder (productos,
                  horarios, FAQs…).
                </p>
              </div>
              <textarea
                className="w-full min-h-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={kbContent}
                onChange={(e) => setKbContent(e.target.value)}
                placeholder="# Información del negocio…"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  {kbSavedAt
                    ? `Guardado: ${new Date(kbSavedAt).toLocaleString()}`
                    : ' '}
                </span>
                <button
                  type="submit"
                  disabled={kbSaving}
                  className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
                >
                  {kbSaving ? 'Guardando…' : 'Guardar KB'}
                </button>
              </div>
            </form>

            <form
              onSubmit={saveBotSettings}
              className="bg-white rounded-2xl border shadow-sm p-5 space-y-4"
            >
              <div>
                <h2 className="font-semibold text-lg">
                  Bienvenida y primera acción
                </h2>
                <p className="text-sm text-slate-500">
                  Se envían en el primer mensaje entrante de cada conversación
                  (modo IA).
                </p>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  Mensaje de bienvenida
                </span>
                <textarea
                  className="w-full min-h-[100px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  Primera acción / CTA
                </span>
                <textarea
                  className="w-full min-h-[72px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={firstAction}
                  onChange={(e) => setFirstAction(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  Modelo HF (opcional)
                </span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={hfModel}
                  onChange={(e) => setHfModel(e.target.value)}
                  placeholder="deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"
                />
                <span className="text-xs text-slate-400">
                  Vacío = usa HF_MODEL del entorno.
                </span>
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  {settingsSavedAt
                    ? `Guardado: ${new Date(settingsSavedAt).toLocaleString()}`
                    : ' '}
                </span>
                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
                >
                  {settingsSaving ? 'Guardando…' : 'Guardar ajustes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : tab === 'contacts' ? (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr]">
          <aside className="border-r bg-white overflow-y-auto flex flex-col min-h-0">
            <div className="p-3 border-b space-y-2">
              <div className="text-xs font-semibold uppercase text-slate-400 tracking-wide">
                Contactos
              </div>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Buscar por nombre o teléfono…"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
              />
            </div>
            {contactsError && (
              <div className="m-3 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-100">
                {contactsError}
              </div>
            )}
            {contactsLoading ? (
              <p className="px-3 py-4 text-sm text-slate-400">Cargando…</p>
            ) : filteredContacts.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-400">
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
                      className={`w-full text-left px-3 py-2.5 border-b hover:bg-slate-50 ${
                        selectedContactId === c.id ? 'bg-brand-50' : ''
                      }`}
                    >
                      <div className="font-medium text-sm truncate">
                        {c.displayName || c.waJid.split('@')[0]}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {c.phoneE164 || c.waJid}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Visto: {formatDt(c.lastSeenAt)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="flex flex-col min-h-0 bg-slate-50 overflow-y-auto">
            {!selectedContactId ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-6">
                Selecciona un contacto
              </div>
            ) : contactDetailLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-6">
                Cargando detalle…
              </div>
            ) : contactDetailError ? (
              <div className="m-4 rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">
                {contactDetailError}
              </div>
            ) : contactDetail ? (
              <div className="p-4 md:p-6 max-w-2xl w-full mx-auto space-y-4">
                <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
                  <h2 className="font-semibold text-lg truncate">
                    {contactDetail.displayName ||
                      contactDetail.waJid.split('@')[0]}
                  </h2>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase text-slate-400">
                        Nombre
                      </dt>
                      <dd className="text-slate-800">
                        {contactDetail.displayName || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-slate-400">
                        Teléfono
                      </dt>
                      <dd className="text-slate-800">
                        {contactDetail.phoneE164 || '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase text-slate-400">
                        WhatsApp JID
                      </dt>
                      <dd className="text-slate-800 break-all">
                        {contactDetail.waJid}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-slate-400">
                        Primera vez
                      </dt>
                      <dd className="text-slate-800">
                        {formatDt(contactDetail.firstSeenAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-slate-400">
                        Última vez
                      </dt>
                      <dd className="text-slate-800">
                        {formatDt(contactDetail.lastSeenAt)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-3">
                  <h3 className="font-semibold text-base">Conversaciones</h3>
                  {!contactDetail.conversations?.length ? (
                    <p className="text-sm text-slate-400">
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
                          <span className="text-xs text-slate-500 truncate">
                            {cv.remoteJid}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Último mensaje: {formatDt(cv.lastMessageAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : status !== 'CONNECTED' && !isDev ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
            <h2 className="text-xl font-semibold">Conectar WhatsApp</h2>
            <p className="text-sm text-slate-500">
              Escanea el código QR con WhatsApp → Dispositivos vinculados.
            </p>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="QR WhatsApp"
                className="mx-auto w-64 h-64 rounded-lg border"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                Esperando QR… (pulsa reiniciar si no aparece)
              </div>
            )}
            <button
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm"
              onClick={() =>
                api('/whatsapp/start', { method: 'POST' }).catch(() => undefined)
              }
            >
              Reiniciar sesión WA
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_1fr]">
          <aside className="border-r bg-white min-h-0 flex flex-col overflow-hidden">
            <div className="shrink-0 p-3 text-xs font-semibold uppercase text-slate-400 tracking-wide">
              Conversaciones
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {conversations.length === 0 && (
                <p className="px-3 text-sm text-slate-400">Sin chats aún</p>
              )}
              <ul>
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left px-3 py-2.5 border-b hover:bg-slate-50 ${
                        selectedId === c.id ? 'bg-brand-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm truncate">
                          {convLabel(c)}
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            (c.aiMode || 'AI') === 'AI'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {(c.aiMode || 'AI') === 'AI' ? 'IA' : 'Manual'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {c.remoteJid}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <section className="flex flex-col min-h-0 bg-slate-50 overflow-hidden">
            {selected ? (
              <>
                <div className="shrink-0 border-b bg-white px-4 py-3 flex items-center justify-between gap-3 z-10">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {convLabel(selected)}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {selected.remoteJid}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">
                      {aiMode === 'AI' ? 'IA' : 'Manual'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={aiMode === 'AI'}
                      disabled={togglingAi}
                      onClick={toggleAiMode}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:opacity-50 ${
                        aiMode === 'AI' ? 'bg-brand-600' : 'bg-slate-300'
                      }`}
                      title={
                        aiMode === 'AI'
                          ? 'Cambiar a Manual (sin auto-respuesta)'
                          : 'Cambiar a IA (auto-respuesta)'
                      }
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                          aiMode === 'AI' ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
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
                    <button
                      type="button"
                      onClick={() => scrollToLatest('smooth')}
                      className="absolute bottom-3 right-3 z-[2] rounded-full bg-white border shadow-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      title="Ir al último mensaje"
                    >
                      ↓ Nuevos
                    </button>
                  )}
                </div>

                <form
                  onSubmit={sendMessage}
                  className="shrink-0 border-t bg-white p-3 flex gap-2"
                >
                  <input
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder={
                      aiMode === 'MANUAL'
                        ? 'Modo Manual — escribe tu respuesta…'
                        : 'Escribe un mensaje…'
                    }
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
                  >
                    Enviar
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Selecciona una conversación
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
