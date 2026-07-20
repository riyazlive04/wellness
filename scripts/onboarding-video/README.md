# SIRAH LIFE — client onboarding video (Playwright)

Records a clean walkthrough of the **client portal** as a video, by driving the
real app with Playwright. Re-runnable: regenerate the video any time the UI
changes, or point it at a different environment.

- Adds a smooth **fake cursor**, click ripples, and **on-screen captions**.
- Records `.webm` and auto-produces `.mp4` if `ffmpeg` is installed.
- Steps are **data-driven** in [`steps.mjs`](./steps.mjs) — edit captions/routes there.

## 1. Install
```bash
cd scripts/onboarding-video
npm install            # also downloads the Chromium browser (postinstall)
# optional, for the .mp4: install ffmpeg  (choco install ffmpeg  /  apt install ffmpeg  /  brew install ffmpeg)
```

## 2. You need a demo CLIENT account
Record with a **seeded demo client** (fake data), never a real client's login —
the video shows whatever is on screen. Create one the normal way (owner invites
a client, client accepts) and add a bit of sample data (a meal, a program, an
appointment) so the tour looks alive. Ask us to add a seed script if you'd rather
generate it.

## 3. Record
Against your **local** dev server (start it first: `npm run dev` in `frontend/`):
```bash
DEMO_EMAIL=demo.client@example.com DEMO_PASSWORD=yourpass npm run record
```
Against the **live** site:
```bash
BASE_URL=https://nusi.sirahagents.com DEMO_EMAIL=... DEMO_PASSWORD=... npm run record
```
Output lands in `videos/` (`.webm` + `.mp4`).

### Windows PowerShell
```powershell
$env:DEMO_EMAIL="demo.client@example.com"; $env:DEMO_PASSWORD="yourpass"; npm run record
```

## Options (env vars)
| Var | Default | Notes |
|---|---|---|
| `BASE_URL` | `http://localhost:4000` | Local is fastest/most stable; or the live URL |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | — | **Required** — the demo client login |
| `THEME` | `light` | `light` or `dark` |
| `WIDTH` / `HEIGHT` | `1280` / `720` | Use `1920` / `1080` for full-HD |
| `HEADLESS` | `true` | `false` to watch it drive live |
| `SLOWMO` | `180` | ms between actions — raise for a calmer pace |
| `OUT_DIR` | `videos` | Output folder |

## 4. Polish (voiceover / captions / music)
Playwright captures **video only** (no audio). Add a voiceover/music track:
```bash
# already have the .mp4 from the run; add narration:
ffmpeg -i videos/<name>.mp4 -i voice.mp3 -c:v copy -c:a aac -shortest onboarding-final.mp4
```
For zooms, burned-in captions, intro/outro cards, or subtitles, drop the `.mp4`
into CapCut / DaVinci Resolve / Premiere. Record narration yourself or via a TTS.

## Customising the tour
Edit [`steps.mjs`](./steps.mjs) — reorder, add/remove routes, reword captions.
To add an **action** (open a dialog, click a tile) rather than just navigating,
add a click in `record.mjs`'s loop using a resilient locator, e.g.
`page.getByRole('button', { name: /book|request/i }).click()`.

## Notes
- The recording is just the page (no browser chrome) — clean product footage.
- Each run makes a fresh video; `videos/` is git-ignored.
- If a route needs data that isn't seeded, that page will look empty — seed it or
  drop that step.
