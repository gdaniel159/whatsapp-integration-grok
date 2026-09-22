export type HandoffReason =
  | 'PRICING'
  | 'QUOTE_REQUEST'
  | 'NEGOTIATION'
  | 'DISCOUNT'
  | 'AVAILABILITY_CONFIRMATION'
  | 'CUSTOM_REQUEST'
  | 'HUMAN_DECISION'
  | 'OTHER';

export const HANDOFF_REASON_LABELS_ES: Record<HandoffReason, string> = {
  PRICING: 'Precios',
  QUOTE_REQUEST: 'Cotización',
  NEGOTIATION: 'Negociación',
  DISCOUNT: 'Descuento',
  AVAILABILITY_CONFIRMATION: 'Disponibilidad',
  CUSTOM_REQUEST: 'Pedido especial',
  HUMAN_DECISION: 'Decisión humana',
  OTHER: 'Otro',
};

export function handoffReasonLabel(
  reason: HandoffReason | string | null | undefined,
): string {
  if (!reason) return '—';
  return HANDOFF_REASON_LABELS_ES[reason as HandoffReason] ?? String(reason);
}
