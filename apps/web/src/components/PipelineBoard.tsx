'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  LEAD_STATUSES,
  LEAD_STATUS_OPTIONS,
  leadStatusLabel,
  moveContactStatus,
  type LeadStatus,
} from '@/lib/lead-status';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

export interface PipelineContact {
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

type Props = {
  onOpenContact: (contactId: string) => void;
};

function contactName(c: PipelineContact): string {
  return (
    c.displayName ||
    c.profileName ||
    c.phoneE164 ||
    c.waJid.split('@')[0] ||
    c.waJid
  );
}

function contactPhoneOrJid(c: PipelineContact): string {
  return c.phoneE164 || c.waJid;
}

function formatDt(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusOf(c: PipelineContact): LeadStatus {
  return c.leadStatus && LEAD_STATUSES.includes(c.leadStatus)
    ? c.leadStatus
    : 'NEW';
}

function ContactCardBody({
  contact,
  className,
}: {
  contact: PipelineContact;
  className?: string;
}) {
  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className="p-3 pb-1 space-y-1">
        <CardTitle className="text-sm font-medium truncate leading-snug">
          {contactName(contact)}
        </CardTitle>
        <p className="text-xs text-muted-foreground truncate">
          {contactPhoneOrJid(contact)}
        </p>
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-2">
        {(contact.tags?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-1">
            {contact.tags!.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="text-[10px] font-normal"
              >
                {t}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">
            Actividad: {formatDt(contact.lastSeenAt)}
          </span>
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            {leadStatusLabel(statusOf(contact))}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function DraggableContactCard({
  contact,
  disabled,
  onOpen,
}: {
  contact: PipelineContact;
  disabled?: boolean;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: contact.id,
      data: { contact, status: statusOf(contact) },
      disabled,
    });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-grab active:cursor-grabbing touch-none',
        isDragging && 'opacity-30',
        disabled && 'opacity-60 pointer-events-none',
      )}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (isDragging || disabled) return;
        onOpen(contact.id);
      }}
    >
      <ContactCardBody
        contact={contact}
        className="hover:shadow transition-shadow"
      />
    </div>
  );
}

function PipelineColumn({
  status,
  contacts,
  movingId,
  onOpenContact,
}: {
  status: LeadStatus;
  contacts: PipelineContact[];
  movingId: string | null;
  onOpenContact: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const label =
    LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.label || status;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-[280px] min-w-[280px] max-w-[280px] h-full min-h-0 rounded-xl border bg-muted/40',
        isOver && 'ring-2 ring-brand-500/40 border-brand-500/40',
      )}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-card/80 rounded-t-xl">
        <span className="text-sm font-semibold truncate">{label}</span>
        <Badge variant="secondary" className="tabular-nums">
          {contacts.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-2">
          {contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-2">
              Sin contactos en esta etapa
            </p>
          ) : (
            contacts.map((c) => (
              <DraggableContactCard
                key={c.id}
                contact={c}
                disabled={movingId === c.id}
                onOpen={onOpenContact}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function PipelineBoard({ onOpenContact }: Props) {
  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Allow click-to-open without starting a drag immediately
      activationConstraint: { distance: 8 },
    }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api<PipelineContact[]>('/contacts');
      setContacts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando contactos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      LEAD_STATUSES.map((s) => [s, [] as PipelineContact[]]),
    ) as Record<LeadStatus, PipelineContact[]>;
    for (const c of contacts) {
      map[statusOf(c)].push(c);
    }
    return map;
  }, [contacts]);

  const activeContact = useMemo(
    () => (activeId ? contacts.find((c) => c.id === activeId) ?? null : null),
    [activeId, contacts],
  );

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const contactId = String(active.id);
    const fromContact =
      contacts.find((c) => c.id === contactId) ??
      (active.data.current?.contact as PipelineContact | undefined);
    if (!fromContact) return;
    const fromStatus = statusOf(fromContact);

    // over.id is column status, or another card id — resolve to column
    let toStatus: LeadStatus | null = null;
    const overId = String(over.id);
    if (LEAD_STATUSES.includes(overId as LeadStatus)) {
      toStatus = overId as LeadStatus;
    } else {
      const overContact = contacts.find((c) => c.id === overId);
      if (overContact) toStatus = statusOf(overContact);
    }

    if (!toStatus || toStatus === fromStatus) return;
    if (movingId === contactId) return;

    const previous = contacts;
    setContacts((prev) => moveContactStatus(prev, contactId, toStatus!));
    setMovingId(contactId);

    try {
      await api(`/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ leadStatus: toStatus }),
      });
    } catch (e) {
      setContacts(previous);
      toast.error(
        e instanceof Error
          ? e.message
          : 'No se pudo actualizar el estado del lead',
      );
    } finally {
      setMovingId(null);
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <div className="flex gap-3 h-full overflow-x-auto">
          {LEAD_STATUSES.map((s) => (
            <div
              key={s}
              className="w-[280px] min-w-[280px] h-full rounded-xl border p-3 space-y-2"
            >
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-destructive text-center max-w-md">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={load}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 h-full min-h-0 p-3 md:p-4 w-max">
            {LEAD_STATUSES.map((status) => (
              <PipelineColumn
                key={status}
                status={status}
                contacts={byStatus[status]}
                movingId={movingId}
                onOpenContact={onOpenContact}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeContact ? (
            <div className="w-[264px] rotate-1 cursor-grabbing">
              <ContactCardBody
                contact={activeContact}
                className="shadow-lg ring-1 ring-border"
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
