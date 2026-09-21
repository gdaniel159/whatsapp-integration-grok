-- CreateEnum
CREATE TYPE "AiMode" AS ENUM ('AI', 'MANUAL');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "aiMode" "AiMode" NOT NULL DEFAULT 'AI';

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "welcomeMessage" TEXT NOT NULL,
    "firstAction" TEXT NOT NULL,
    "hfModel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSettings_pkey" PRIMARY KEY ("id")
);
