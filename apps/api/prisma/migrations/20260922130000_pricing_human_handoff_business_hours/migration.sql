-- Pricing, Human Handoff & Business Hours Policy
CREATE TYPE "HandoffReason" AS ENUM (
  'PRICING',
  'QUOTE_REQUEST',
  'NEGOTIATION',
  'DISCOUNT',
  'AVAILABILITY_CONFIRMATION',
  'CUSTOM_REQUEST',
  'MANAGER_DECISION',
  'OTHER'
);

ALTER TYPE "CommercialActivityType" ADD VALUE 'HUMAN_HANDOFF_REQUESTED';
ALTER TYPE "CommercialActivityType" ADD VALUE 'HUMAN_HANDOFF_RESOLVED';

ALTER TABLE "Contact"
ADD COLUMN "requiresHumanAttention" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "humanHandoffReason" "HandoffReason",
ADD COLUMN "humanHandoffUpdatedAt" TIMESTAMP(3);
