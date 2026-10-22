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
  /**
   * WhatsApp only: which number this practice sends from.
   * 'platform' = NUSI's official Meta sender (the default, nothing to link).
   * 'own'      = the practice's linked number via Evolution.
   */
  sender?: 'platform' | 'own';
  /**
   * WhatsApp only: whether the practice lets NUSI send client reminders
   * (appointments, new meal plans) from this number. Off until they turn it on.
   */
  notify_clients?: boolean;
}

/** Input to connect a workspace's own Resend email sender. */
export interface SaveEmailInput {
  apiKey: string;
  fromEmail: string;
  fromName?: string | null;
}
