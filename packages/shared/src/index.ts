export type WaStatus = 'DISCONNECTED' | 'QR' | 'CONNECTED';
export type MessageDirection = 'IN' | 'OUT';

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
}

export interface MessageDto {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  timestamp: string;
  waMessageId?: string | null;
}
