'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { leadStatusLabel, type LeadStatus } from '@/lib/lead-status';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export type CommercialActivityType =
  | 'CONTACT_CREATED'
  | 'STATUS_CHANGED'
  | 'NOTES_UPDATED'
  | 'TAGS_UPDATED';

export type CommercialActivitySource = 'SYSTEM' | 'USER' | 'SEED';

export type CommercialActivity = {
  id: string;
  contactId: string;
  type: CommercialActivityType;
  source: CommercialActivitySource;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Props = {
  contactId: string | null;
  /** Optional class on the outer wrapper */
  className?: string;
  /** Max items requested from API (default 50) */
  limit?: number;
};

function formatActivityTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusMeta({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) return null;
  const from = metadata.from as string | undefined;
  const to = metadata.to as string | undefined;
  if (!from && !to) return null;
  return (
    <p className="text-xs text-muted-foreground mt-1">
      {from ? leadStatusLabel(from as LeadStatus) : '—'}
      {' → '}
      {to ? leadStatusLabel(to as LeadStatus) : '—'}
    </p>
  );
}

function TagsMeta({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) return null;
  const added = Array.isArray(metadata.added)
    ? (metadata.added as string[])
    : [];
  const removed = Array.isArray(metadata.removed)
    ? (metadata.removed as string[])
    : [];
  if (added.length === 0 && removed.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {added.map((t) => (
        <Badge
          key={`+${t}`}
          variant="secondary"
          className="text-[10px] font-normal text-emerald-700 bg-emerald-50 border-emerald-100"
        >
          +{t}
        </Badge>
      ))}
      {removed.map((t) => (
        <Badge
          key={`-${t}`}
          variant="outline"
          className="text-[10px] font-normal text-destructive/80"
        >
          −{t}
        </Badge>
      ))}
    </div>
  );
}

export function CommercialActivityTimeline({
  contactId,
  className,
  limit = 50,
}: Props) {
  const [items, setItems] = useState<CommercialActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!contactId) {
      setItems([]);
      setError('');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setItems([]);
    (async () => {
      try {
        const list = await api<CommercialActivity[]>(
          `/contacts/${contactId}/activities?limit=${limit}`,
        );
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) {
          setItems([]);
          setError(
            e instanceof Error ? e.message : 'Error cargando historial',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, limit]);

  if (!contactId) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Historial comercial
      </p>

      {loading ? (
        <div className="space-y-3 py-1">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          Sin actividad comercial aún
        </p>
      ) : (
        <ol className="relative ms-2 border-s border-border space-y-0">
          {items.map((act) => (
            <li key={act.id} className="relative ps-5 pb-4 last:pb-0">
              <span
                className="absolute -start-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-brand-500"
                aria-hidden
              />
              <div className="space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">{act.title}</p>
                  <time
                    className="shrink-0 text-[10px] text-muted-foreground tabular-nums"
                    dateTime={act.createdAt}
                  >
                    {formatActivityTime(act.createdAt)}
                  </time>
                </div>
                {act.type === 'STATUS_CHANGED' ? (
                  <StatusMeta metadata={act.metadata} />
                ) : null}
                {act.type === 'TAGS_UPDATED' ? (
                  <TagsMeta metadata={act.metadata} />
                ) : null}
                {act.description ? (
                  <p className="text-xs text-muted-foreground">
                    {act.description}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
