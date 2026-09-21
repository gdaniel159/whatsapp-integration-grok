'use client';

const styles: Record<string, string> = {
  CONNECTED: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  QR: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  DISCONNECTED: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

const labels: Record<string, string> = {
  CONNECTED: 'Conectado',
  QR: 'Escanea QR',
  DISCONNECTED: 'Desconectado',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status] || styles.DISCONNECTED}`}
    >
      {labels[status] || status}
    </span>
  );
}
