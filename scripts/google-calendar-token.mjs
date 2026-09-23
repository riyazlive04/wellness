/**
 * One-time: get a Google Calendar refresh token for NUSI's booking calendar.
 *
 * The backend creates demo-call events as this Google account (a Workspace user,
 * so Google Meet links work). Google only hands out a refresh token after a
 * human consents once - that is what this script is for.
 *
 * Before running, in Google Cloud Console (console.cloud.google.com):
 *   1. Create (or pick) a project.
 *   2. APIs & Services -> Library -> enable "Google Calendar API".
 *   3. APIs & Services -> OAuth consent screen -> Internal (Workspace) ->
 *      add the scope https://www.googleapis.com/auth/calendar.events
 *   4. Credentials -> Create credentials -> OAuth client ID -> Web application
 *      -> Authorised redirect URI: http://localhost:5310/callback
 *   5. Copy the client ID and secret into the command below.
 *
 * Run:
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/google-calendar-token.mjs
 *
 * It opens a consent page; sign in as the account whose calendar holds the
 * calls. It then prints GOOGLE_CALENDAR_REFRESH_TOKEN for the server env.
 */

import { createServer } from 'node:http';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT = 'http://localhost:5310/callback';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first (see the comment at the top).');
  process.exit(1);
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:5310');
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('No code in the callback.');
    return;
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const body = await tokenRes.json();

  if (!body.refresh_token) {
    res.writeHead(500).end('No refresh token came back. Remove NUSI at myaccount.google.com/permissions and run this again.');
    console.error(body);
    process.exit(1);
  }

  res.writeHead(200, { 'Content-Type': 'text/html' }).end(
    '<h2 style="font-family:system-ui">Connected. You can close this tab.</h2>',
  );

  console.log('\nAdd these to the backend env:\n');
  console.log(`GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`);
  console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${body.refresh_token}`);
  console.log('GOOGLE_CALENDAR_ID=primary   # or the calendar address, e.g. demos@yourdomain.com\n');
  server.close();
  process.exit(0);
});

server.listen(5310, () => {
  console.log('Opening Google consent in your browser...\nIf it does not open, visit:\n' + authUrl + '\n');
  exec(`start "" "${authUrl}"`, { shell: 'cmd.exe' }, () => {});
});
