'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  CONNECTED:
    'border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  QR: 'border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100',
  DISCONNECTED:
    'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-100',
};

const labels: Record<string, string> = {
  CONNECTED: 'Conectado',
  QR: 'Escanea QR',
  DISCONNECTED: 'Desconectado',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full font-medium',
        styles[status] || styles.DISCONNECTED,
      )}
    >
      {labels[status] || status}
    </Badge>
  );
}
