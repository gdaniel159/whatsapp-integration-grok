'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { StatusBadge } from './StatusBadge';

type WaStatus = 'DISCONNECTED' | 'QR' | 'CONNECTED';

interface Conversation {
  id: string;
  remoteJid: string;
  name: string | null;
  lastMessageAt: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  direction: 'IN' | 'OUT';
  body: string;
  timestamp: string;
}

export function Dashboard() {
  const router = useRouter();
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

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-lg">WhatsApp Manager</h1>
          <StatusBadge status={status} />
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

      {status !== 'CONNECTED' ? (
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
                    <div className="font-medium text-sm truncate">
                      {c.name || c.remoteJid.split('@')[0]}
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
                <div className="border-b bg-white px-4 py-3">
                  <div className="font-medium">
                    {selected.name || selected.remoteJid.split('@')[0]}
                  </div>
                  <div className="text-xs text-slate-400">{selected.remoteJid}</div>
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
                    placeholder="Escribe un mensaje…"
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
