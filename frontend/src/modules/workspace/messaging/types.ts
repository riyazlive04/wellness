export type MessageAuthor = 'owner' | 'client' | 'ai' | 'system';
export type MessageKind = 'text' | 'voice' | 'photo' | 'system';
export type ConversationFlag = 'active' | 'urgent' | 'paused';

export interface Message {
  id: string;
  author: MessageAuthor;
  kind: MessageKind;
  body: string;             // text content / voice transcript / photo caption / system note
  imageUrl?: string;        // for photo kind
  durationSec?: number;     // for voice kind
  sentAt: string;           // ISO
  read?: boolean;
  /** Non-empty array attaches AI-suggested replies *after* this message in the owner composer */
  aiSuggestions?: string[];
}

export interface Conversation {
  id: string;
  clientId: string;         // matches MOCK_CLIENTS ids
  clientName: string;
  program: string;
  flag: ConversationFlag;
  unread: number;
  lastMessageAt: string;
  messages: Message[];
}

export interface MessageTemplate {
  id: string;
  category: 'welcome' | 'check_in' | 'milestone' | 'reminder' | 'nudge';
  title: string;
  body: string;
  variables: string[];      // e.g. ['name', 'program']
}

export type BulkAudience =
  | { kind: 'all' }
  | { kind: 'status'; status: 'active' | 'at_risk' | 'paused' }
  | { kind: 'program'; program: string };
