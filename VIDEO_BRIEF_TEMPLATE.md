# Product Video Brief

Copy this file for each new video, for example `films/<product>/BRIEF.md`, fill it in, and hand it over with "build the video from this brief".

- **[R]** = required. The video can't be built without it.
- **[O]** = optional. A sensible default is used if you leave it blank, and the default is shown.

Delete the example text in *italics* as you fill each field in.

---

## 1. Product

| Field | | Your answer |
|---|---|---|
| Product name **[R]** | Exactly as it should appear on screen | |
| How it's pronounced **[R]** | Write it the way it sounds, e.g. *"AW-ruh-tel"*. Voice engines often get brand names wrong. | |
| One-line description **[R]** | What it is, in one sentence | |
| Tagline / campaign line **[R]** | Shown on the end card, e.g. *"Every call, heard."* | |
| Website **[R]** | The main URL | |
| Call-to-action URL **[R]** | Where viewers go next, e.g. *a demo or sign-up page* | |
| Call-to-action text **[R]** | e.g. *"Book your personalised demo"* | |

## 2. Audience and goal

| Field | | Your answer |
|---|---|---|
| Who is watching **[R]** | e.g. *business owners, sales managers, parents, schools* | |
| The one pain point **[R]** | The problem the opening should make them feel | |
| The one takeaway **[R]** | What they should remember after watching | |
| Where it will be shown **[O]** | Website, ads, social, keynote or sales meeting. Default: website and social. | |

## 3. Format

| Field | | Your answer |
|---|---|---|
| Length **[R]** | e.g. *30 s / 60 s / 100 s / 3 min*. A longer master script can be cut down later. | |
| Pace **[R]** | Calm and cinematic / balanced / fast and punchy | |
| Aspect ratio **[O]** | Default: 16:9 at 1920×1080. Also available: 9:16 (Reels/Shorts) or 1:1. | |
| Language(s) **[R]** | e.g. *English only*, or *English + Tamil*. Each language is a separate video. | |
| Captions **[O]** | Separate `.srt` file (default) or burned into the picture | |

## 4. Brand assets

| Field | | Your answer |
|---|---|---|
| Logo file path **[R]** | PNG with a transparent background, at least 1000 px | |
| Brand colours **[R]** | Primary, accent and any gradient, as hex codes, e.g. *#2563EB* | |
| Fonts **[O]** | Default: Inter. Must be a free (OFL) font or one you own. | |
| Real UI screenshots or designs **[O]** | Paths to screenshots or design files of the real product. Strongly recommended, because the screens are redrawn to match these. | |
| Light or dark product UI **[O]** | Default: dark opening, light product screens | |

## 5. Voice-over

| Field | | Your answer |
|---|---|---|
| Voice **[R]** | ElevenLabs voice name and ID, e.g. *Donovan, `DMyrgzQFny3JI1Y1paM5`* | |
| Tone **[R]** | e.g. *warm and measured, confident, not a movie trailer* | |
| Speed **[O]** | Default 1.0. Use 1.1–1.15 for a faster cut. | |
| Your own recording instead **[O]** | Path to the audio file, if a person will narrate | |

## 6. Script

Write the voice-over line by line. Keep each line short: one idea per line. Mark each line with the section it belongs to.

| # | Section | Voice-over line | What we see on screen |
|---|---|---|---|
| 1 | Problem | *"It's eleven forty-two on a Tuesday morning."* | *One phone in a dark room starts ringing.* |
| 2 | | | |
| 3 | Reveal | *"Meet <Product>."* | *Logo reveal.* |
| 4 | Feature | | |
| … | Close | *"<Product>. <Tagline>."* | *Logo, tagline, call-to-action button, URL.* |

**Suggested story shape:**
1. **Problem:** 15–25% of the running time.
2. **Reveal:** about 5%.
3. **Features:** 50–60%, one feature per section.
4. **Close + call to action:** 10–15%.

## 7. Features to show

One row per feature, in the order they appear. **Only list features that are live today.** Anything not yet released must be removed or labelled as coming soon.

| Feature | What the screen shows step by step | Live today? (Yes/No) | Who confirmed it |
|---|---|---|---|
| *Call transcription* | *Call → transcript appears → key details highlighted* | | |
| | | | |

## 8. Demo data

Everything on screen must be made up. Never use real customers.

| Field | | Your answer |
|---|---|---|
| Example customer **[R]** | Name, need, budget, location, next step | |
| Example team members **[O]** | Names for staff shown on screen | |
| Numbers / figures **[O]** | Any stats shown. Label them as illustrative unless they're real. | |
| Number format **[O]** | Default: Indian formatting, e.g. *₹80,00,000 = ₹80 lakh* | |
| Industry for the example **[O]** | e.g. *real estate, education, healthcare* | |

## 9. Sound

| Field | | Your answer |
|---|---|---|
| Music mood **[O]** | Default: felt piano and strings, quiet at the start and building to the end | |
| Sound effects **[O]** | Specific sounds you want, e.g. *phone ringing, notification* | |
| Moments of silence **[O]** | Where to leave a pause, e.g. *before the logo reveal* | |

## 10. Final checks before building

- [ ] Every feature in section 7 is confirmed as live.
- [ ] The brand name's pronunciation is written out in section 1.
- [ ] The logo is a transparent PNG.
- [ ] No real customer names, phone numbers or data appear anywhere.
- [ ] The call-to-action URL works.
- [ ] The music and voice licences cover commercial use. ElevenLabs needs a paid plan for this, and some piano samples need a credit line in the video description.

---

## What you get back

- `<product>.mp4`: the finished film, 1080p, loudness-normalised for online platforms.
- `<product>.srt`: subtitles.
- `poster.jpg`: a thumbnail frame.
- `CREDITS`: music, voice and font licences to paste into the video description.
- `build.sh`: rebuilds the film after edits without spending voice credits again.
