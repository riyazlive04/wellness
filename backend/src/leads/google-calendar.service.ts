import { Injectable, Logger } from '@nestjs/common';

/**
 * Creates the demo call in NUSI's own Google Calendar.
 *
 * Auth is a refresh token for one Google Workspace account (scripts/google-calendar-token.mjs
 * fetches it once), not a service account: a Workspace user can mint Google Meet
 * links, a service account generally cannot. Env-gated - with the token unset,
 * `enabled` is false and a booking is still saved, just without a calendar event.
 *
 * Only writes. It never reads the calendar, so it can hold the narrow
 * calendar.events scope rather than full calendar access.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = (calendarId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;

export interface CalendarEvent {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  attendeeEmail: string;
  attendeeName: string;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private token: { value: string; expiresAt: number } | null = null;

  /**
   * The calendar has its own client id/secret: GOOGLE_OAUTH_* already exists in
   * this env as a marker for the integrations dashboard (a different Google
   * project), and sharing the names would let one break the other.
   */
  private get clientId(): string | undefined {
    return process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  }

  private get clientSecret(): string | undefined {
    return process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  }

  get enabled(): boolean {
    return !!(this.clientId && this.clientSecret && process.env.GOOGLE_CALENDAR_REFRESH_TOKEN);
  }

  private get calendarId(): string {
    return process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary';
  }

  /** Access tokens last an hour; keep one until a minute before it expires. */
  private async accessToken(): Promise<string | null> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    try {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
          refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
      if (!res.ok || !body?.access_token) {
        this.logger.warn(`Google token refresh failed ${res.status}`);
        return null;
      }
      this.token = { value: body.access_token, expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
      return this.token.value;
    } catch (err) {
      this.logger.warn(`Google token refresh error: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Create the call. Returns the event id, or null when calendar is off or the
   * call fails - a booking must never be lost because Google was unreachable.
   */
  async createEvent(e: CalendarEvent): Promise<{ id: string; meetUrl: string | null } | null> {
    if (!this.enabled) return null;
    const token = await this.accessToken();
    if (!token) return null;

    try {
      const res = await fetch(EVENTS_URL(this.calendarId), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: e.summary,
          description: e.description,
          start: { dateTime: e.startIso, timeZone: 'Asia/Kolkata' },
          end: { dateTime: e.endIso, timeZone: 'Asia/Kolkata' },
          attendees: [{ email: e.attendeeEmail, displayName: e.attendeeName }],
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'email', minutes: 60 }] },
          conferenceData: {
            createRequest: { requestId: `nusi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; hangoutLink?: string; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.id) {
        this.logger.warn(`Google Calendar create failed ${res.status}: ${body?.error?.message ?? ''}`);
        return null;
      }
      return { id: body.id, meetUrl: body.hangoutLink ?? null };
    } catch (err) {
      this.logger.warn(`Google Calendar create error: ${(err as Error).message}`);
      return null;
    }
  }
}
