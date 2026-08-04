export type ConnectionChannel = 'email' | 'whatsapp';
export type ConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'error';

/** Safe, secret-free view returned to the settings UI. */
export interface ConnectionView {
  channel: ConnectionChannel;
  provider: string | null;
  status: ConnectionStatus;
  /** Human label — the from-address (email) or WhatsApp number. */
  identity: string | null;
  /** Whether a secret (API key / password / token) is stored — never the value. */
  has_secret: boolean;
  last_error: string | null;
  last_tested_at: string | null;
}

/** Input to connect a workspace's own Resend email sender. */
export interface SaveEmailInput {
  apiKey: string;
  fromEmail: string;
  fromName?: string | null;
}
