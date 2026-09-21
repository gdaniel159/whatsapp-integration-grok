'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { StatusBadge } from './StatusBadge';

type WaStatus = 'DISCONNECTED' | 'QR' | 'CONNECTED';
type AiMode = 'AI' | 'MANUAL';
type Tab = 'chats' | 'kb';

interface Conversation {
  id: string;
  remoteJid: string;
  name: string | null;
  lastMessageAt: string | null;
  aiMode?: AiMode;
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
  updatedAt: string;
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

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId],
  );

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
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Error cargando base de conocimiento',
      );
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

  function logout() {
    clearToken();
    router.replace('/login');
  }

  const aiMode = selected?.aiMode || 'AI';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-semibold text-lg">WhatsApp Manager</h1>
          <StatusBadge status={status} />
          <nav className="flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={() => setTab('chats')}
              className={`text-sm px-3 py-1.5 rounded-lg ${
                tab === 'chats'
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Chats
            </button>
            <button
              type="button"
              onClick={() => setTab('kb')}
              className={`text-sm px-3 py-1.5 rounded-lg ${
                tab === 'kb'
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Base de conocimiento
            </button>
          </nav>
        </div>
        <button
          onClick={logout}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Cerrar sesión
        </button>
      </header>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 border-b border-red-100">
          {error}
        </div>
      )}

      {tab === 'kb' ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
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
      ) : status !== 'CONNECTED' ? (
        <div className="flex-1 flex items-center justify-center p-6">
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
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-0">
          <aside className="border-r bg-white overflow-y-auto">
            <div className="p-3 text-xs font-semibold uppercase text-slate-400 tracking-wide">
              Conversaciones
            </div>
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
                        {c.name || c.remoteJid.split('@')[0]}
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
          </aside>

          <section className="flex flex-col min-h-0 bg-slate-50">
            {selected ? (
              <>
                <div className="border-b bg-white px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {selected.name || selected.remoteJid.split('@')[0]}
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
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                </div>
                <form
                  onSubmit={sendMessage}
                  className="border-t bg-white p-3 flex gap-2"
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
