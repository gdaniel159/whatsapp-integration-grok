export type WaStatus = 'DISCONNECTED' | 'QR' | 'CONNECTED';
export type MessageDirection = 'IN' | 'OUT';
export type AiMode = 'AI' | 'MANUAL';

export interface AuthUser {
  id: string;
  username: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface ConversationDto {
  id: string;
  remoteJid: string;
  name: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  aiMode: AiMode;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  timestamp: string;
  waMessageId?: string | null;
}

export interface KnowledgeBaseDto {
  id: string;
  content: string;
  updatedAt: string;
}

export interface BotSettingsDto {
  id: string;
  welcomeMessage: string;
  firstAction: string;
  hfModel: string | null;
  updatedAt: string;
}
