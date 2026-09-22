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
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  LEAD_STATUSES,
  LEAD_STATUS_OPTIONS,
  contactDisplayName,
  formatRelativeLastSeen,
  leadStatusLabel,
  moveContactStatus,
  type LeadStatus,
} from '@/lib/lead-status';
import { handoffReasonLabel, type HandoffReason } from '@/lib/handoff-reason';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CommercialActivityTimeline } from '@/components/CommercialActivityTimeline';

/** Aligned with Dashboard ContactRow + Prisma Contact commercial fields. */
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
  requiresHumanAttention?: boolean;
  humanHandoffReason?: HandoffReason | null;
  humanHandoffUpdatedAt?: string | null;
}

type ContactDetailLite = PipelineContact & {
  conversationId: string | null;
};

type Props = {
  onOpenContact: (contactId: string) => void;
  onOpenConversation: (conversationId: string) => void;
};

const MAX_VISIBLE_TAGS = 3;

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
  const tags = contact.tags ?? [];
  const visible = tags.slice(0, MAX_VISIBLE_TAGS);
  const extra = tags.length - visible.length;
  const hasNotes = !!(contact.notes && contact.notes.trim());

  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className="p-3 pb-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium truncate leading-snug flex items-center gap-1.5">
            {contact.requiresHumanAttention ? (
              <span
                className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0"
                title="Requiere atención comercial"
                aria-label="Requiere atención comercial"
              />
            ) : null}
            <span className="truncate">{contactDisplayName(contact)}</span>
          </CardTitle>
          {hasNotes ? (
            <span
              title="Tiene notas"
              className="shrink-0 text-muted-foreground"
              aria-label="Tiene notas"
            >
              <FileText className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-2">
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {visible.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="text-[10px] font-normal"
              >
                {t}
              </Badge>
            ))}
            {extra > 0 ? (
              <Badge variant="outline" className="text-[10px] font-normal">
                +{extra}
              </Badge>
            ) : null}
          </div>
        ) : null}
        <p className="text-[10px] text-muted-foreground truncate">
          {formatRelativeLastSeen(contact.lastSeenAt)}
        </p>
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
              No hay contactos
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

export function PipelineBoard({ onOpenContact, onOpenConversation }: Props) {
  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetContactId, setSheetContactId] = useState<string | null>(null);
  const [sheetDetail, setSheetDetail] = useState<ContactDetailLite | null>(
    null,
  );
  const [sheetLoading, setSheetLoading] = useState(false);
  const [resolvingHandoff, setResolvingHandoff] = useState(false);

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

  const sheetContact = useMemo(() => {
    if (!sheetContactId) return null;
    return contacts.find((c) => c.id === sheetContactId) ?? null;
  }, [sheetContactId, contacts]);

  useEffect(() => {
    if (!sheetContactId) {
      setSheetDetail(null);
      return;
    }
    let cancelled = false;
    setSheetLoading(true);
    setSheetDetail(null);
    (async () => {
      try {
        const detail = await api<ContactDetailLite>(
          `/contacts/${sheetContactId}`,
        );
        if (!cancelled) setSheetDetail(detail);
      } catch {
        if (!cancelled) setSheetDetail(null);
      } finally {
        if (!cancelled) setSheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetContactId]);

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
    const label = leadStatusLabel(toStatus);
    setContacts((prev) => moveContactStatus(prev, contactId, toStatus!));
    setMovingId(contactId);

    try {
      await api(`/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ leadStatus: toStatus }),
      });
      toast.success(`Contacto movido a ${label}`);
    } catch {
      setContacts(previous);
      toast.error('No se pudo actualizar el estado');
    } finally {
      setMovingId(null);
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
  };

  const openSheet = (id: string) => {
    setSheetContactId(id);
  };

  const closeSheet = (open: boolean) => {
    if (!open) setSheetContactId(null);
  };

  const display = sheetDetail ?? sheetContact;
  const conversationId = sheetDetail?.conversationId ?? null;

  const handleVerConversacion = () => {
    if (!conversationId) {
      toast.error('Este contacto no tiene conversación');
      return;
    }
    setSheetContactId(null);
    onOpenConversation(conversationId);
  };

  const handleResolverAtencion = async () => {
    if (!sheetContactId || !display?.requiresHumanAttention) return;
    setResolvingHandoff(true);
    try {
      const updated = await api<PipelineContact>(
        `/contacts/${sheetContactId}/resolve-human-handoff`,
        { method: 'POST' },
      );
      setContacts((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
      );
      setSheetDetail((prev) =>
        prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
      );
      toast.success('Atención comercial marcada como resuelta');
    } catch {
      toast.error('No se pudo resolver la atención');
    } finally {
      setResolvingHandoff(false);
    }
  };

  const handleEditarContacto = () => {
    if (!sheetContactId) return;
    const id = sheetContactId;
    setSheetContactId(null);
    onOpenContact(id);
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
                onOpenContact={openSheet}
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

      <Sheet open={!!sheetContactId} onOpenChange={closeSheet}>
        <SheetContent side="right" className="flex flex-col gap-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="pr-6 truncate">
              {display ? contactDisplayName(display) : 'Contacto'}
            </SheetTitle>
            <SheetDescription>
              Resumen comercial — edita el detalle completo en Contactos.
            </SheetDescription>
          </SheetHeader>

          {sheetLoading && !display ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : display ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 text-sm">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Estado
                </p>
                <Badge variant="secondary">
                  {leadStatusLabel(statusOf(display))}
                </Badge>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Requiere atención comercial
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      display.requiresHumanAttention ? 'default' : 'outline'
                    }
                    className={
                      display.requiresHumanAttention
                        ? 'bg-amber-500 hover:bg-amber-500 text-white'
                        : ''
                    }
                  >
                    {display.requiresHumanAttention ? 'Sí' : 'No'}
                  </Badge>
                  {display.requiresHumanAttention ? (
                    <span className="text-xs text-muted-foreground">
                      Motivo: {handoffReasonLabel(display.humanHandoffReason)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Teléfono
                </p>
                <p className="truncate">
                  {display.phoneE164 || 'Sin teléfono'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Última actividad
                </p>
                <p>{formatRelativeLastSeen(display.lastSeenAt)}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tags
                </p>
                {(display.tags?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {display.tags!.map((t) => (
                      <Badge key={t} variant="secondary" className="font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Sin tags</p>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Notas
                </p>
                {display.notes && display.notes.trim() ? (
                  <p className="whitespace-pre-wrap text-muted-foreground rounded-md border bg-muted/40 p-2 text-xs max-h-40 overflow-y-auto">
                    {display.notes}
                  </p>
                ) : (
                  <p className="text-muted-foreground">Sin notas</p>
                )}
              </div>

              <Separator />

              <CommercialActivityTimeline contactId={sheetContactId} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No se pudo cargar el contacto.
            </p>
          )}

          <Separator />
          <SheetFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              className="w-full bg-brand-600 hover:bg-brand-700 text-white"
              disabled={sheetLoading}
              onClick={handleVerConversacion}
            >
              Ver conversación
            </Button>
            {display?.requiresHumanAttention ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={sheetLoading || resolvingHandoff}
                onClick={handleResolverAtencion}
              >
                {resolvingHandoff
                  ? 'Guardando…'
                  : 'Marcar atención resuelta'}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleEditarContacto}
            >
              Editar contacto
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
