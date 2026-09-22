-- Phase 13: commercial automation mode + DeepSeek activity source
CREATE TYPE "CommercialAutomationMode" AS ENUM ('OFF', 'OBSERVE', 'APPLY');

ALTER TYPE "CommercialActivitySource" ADD VALUE 'DEEPSEEK';

ALTER TABLE "BotSettings"
ADD COLUMN "commercialAutomationMode" "CommercialAutomationMode" NOT NULL DEFAULT 'OFF';
