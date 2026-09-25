import { GoogleCalendarService } from './google-calendar.service';

/** Every demo call is also put on the team members listed in LEAD_CALENDAR_GUESTS. */
describe('GoogleCalendarService.createEvent guests', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  async function attendeesFor(guests: string | undefined): Promise<string[]> {
    Object.assign(process.env, {
      GOOGLE_CALENDAR_CLIENT_ID: 'id',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'secret',
      GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh',
    });
    if (guests === undefined) delete process.env.LEAD_CALENDAR_GUESTS;
    else process.env.LEAD_CALENDAR_GUESTS = guests;
    let sent: { attendees: Array<{ email: string }> } | null = null;
    jest.spyOn(global, 'fetch').mockImplementation((async (url: string, init?: { body?: string }) => {
      if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
      sent = JSON.parse(init!.body!);
      return { ok: true, json: async () => ({ id: 'evt', hangoutLink: 'https://meet.google.com/x' }) };
    }) as never);
    await new GoogleCalendarService().createEvent({
      summary: 's',
      description: 'd',
      startIso: '2026-10-01T05:30:00Z',
      endIso: '2026-10-01T06:15:00Z',
      attendeeEmail: 'lead@example.com',
      attendeeName: 'Lead',
    });
    return sent!.attendees.map((a) => a.email);
  }

  it('invites only the lead when no team guests are set', async () => {
    expect(await attendeesFor(undefined)).toEqual(['lead@example.com']);
  });

  it('adds every valid team guest, skipping blanks and bad entries', async () => {
    expect(await attendeesFor(' sales@sirahdigital.in, ,not-an-email, Ops@SirahDigital.in ')).toEqual([
      'lead@example.com',
      'sales@sirahdigital.in',
      'ops@sirahdigital.in',
    ]);
  });
});
