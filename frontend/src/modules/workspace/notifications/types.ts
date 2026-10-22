export type ChannelKey = 'email' | 'push' | 'whatsapp' | 'inapp';
export type EventKey =
  | 'new_client_message'
  | 'urgent_client_silent'
  | 'meal_photo_review'
  | 'assessment_submitted'
  | 'failed_payment'
  | 'subscription_renewal'
  | 'trial_ending'
  | 'team_activity'
  | 'community_mention'
  | 'weekly_report';

export interface Channel {
  key: ChannelKey;
  label: string;
  description: string;
  /**
   * Current status. 'unconfigured' shows a connect CTA.
   *
   * 'pending' is a half-finished link - WhatsApp issues a QR and waits for it
   * to be scanned, and a practice that walked away from that screen is left
   * here. It must not read as connected: the dispatcher refuses to send until
   * the token is live, so a tick on this channel would silently go nowhere.
   *
   * 'managed' means the practice cannot turn this on itself - the NUSI team
   * sets it up. Shown locked, with no connect path.
   */
  status: 'connected' | 'pending' | 'unconfigured' | 'permission_denied' | 'managed';
  /** Optional sub-label e.g. user's email address */
  meta?: string;
  /** Master enable */
  enabled: boolean;
}

export interface EventDef {
  key: EventKey;
  label: string;
  description: string;
  category: 'client' | 'billing' | 'team' | 'system';
  /** Default channels — current preferences */
  channels: Record<ChannelKey, boolean>;
}

export interface QuietHours {
  enabled: boolean;
  startHour: number;       // 0..23
  endHour: number;         // 0..23
  /** ISO weekday indices (0=Sun..6=Sat) when quiet hours apply */
  days: number[];
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  channels: ChannelKey[];
  category: 'client' | 'billing' | 'team' | 'system';
  sentAt: string;          // ISO
}
