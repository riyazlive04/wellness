# Shot list — NUSI Film 50 "The Close"

**Master:** 150 s · 16:9 1920×1080 · Plus Jakarta Sans · VO speed 1.0
**Cut markers:** `[90s]` = keep in the 90 s cut · `[45s]` = keep in the 45 s cut

⚠️ **Warm audiences only.** Scene 1 assumes the viewer has seen Film 05.

| # | In | Dur | Shot | Asset / build | Cuts |
|---|---|---|---|---|---|
| 1 | 0:00 | 5s | Text on black, centred. No logo, no music yet. | Build. #0A0C10 / #F3FAE8 | `[90s]` `[45s]` |
| 2 | 0:05 | 10s | Three fast callbacks to Film 05, 3 s each: six greyed tool marks · a client avatar dimming in a grid · a lit laptop in a dark room. Each slightly degraded, like a memory. | Reuse Film 05 scenes 8, 11, and a new build | `[90s]` |
| 3 | 0:15 | 5s | Text on black: "So the only question left is whether this one fixes it." Hold. | Build | `[90s]` `[45s]` |
| 4 | 0:20 | 7s | **The turn to light.** Client detail page loads — profile, program, meals, measurements, messages, assessments, files. Slow scroll down the record. | Redraw from Client detail | `[90s]` |
| 5 | 0:27 | 9s | Program builder: a template with phases and daily tasks. Then **one edit** to a task, and a sync ripple across a grid of active client cards. Completion streaks visibly survive. | `landing/problem-diet-templates.webp` + Programs | `[90s]` |
| 6 | 0:36 | 7s | Food library. Cooking-method selector cycles boiled → pressure-cooked → fried. Nutrient values visibly change with each. | Redraw from Food library | — |
| 7 | 0:43 | 10s | Client app montage, phone frame, 2 s each: habit rings closing · Plate Vision reading a thali · barcode scan resolving · streak badge at day 18 · progress chart rising. | `landing/problem-plate-vision.webp` | `[90s]` |
| 8 | 0:53 | 7s | Morning brief card, then the at-risk list ranked by days silent. Cursor rests on the top entry. | `landing/problem-at-risk.webp` | `[90s]` |
| 9 | 1:00 | 7s | Automation rule builder: trigger → action → run log, executing with no cursor present. | `landing/problem-daily-tasks.webp` + Automation | — |
| 10 | 1:07 | 8s | Billing lifecycle: Razorpay subscription → GST invoice PDF → failed charge → retry → grace window. One cut per state. | Redraw from Billing | — |
| 11 | 1:15 | 8s | Four-up grid, appearing one at a time: team roles · franchise dashboard with per-branch MRR · audit log · white-label toggle flipping NUSI branding to a practice logo. | Redraw. **"Scale Pro" badge on the grid.** | — |
| 12 | 1:23 | 9s | Three pricing columns build. Growth carries "most popular". Annual toggle flips and the "2 months free" saving appears. | Redraw from `plans.ts` | `[90s]` |
| 13 | 1:32 | 7s | **Hard cut to black.** Text: "Now the risk, honestly." Then: "You spend a fortnight on a tool you abandon." | Build | `[90s]` `[45s]` |
| 14 | 1:39 | 4s | Hold on black. Text: "So here is how we remove it." No motion. | Build | `[90s]` `[45s]` |
| 15 | 1:43 | 7s | Trial card on white: "14 days free · No card needed". Beat, then a second line: "Nothing can charge you by accident." | Build | `[90s]` `[45s]` |
| 16 | 1:50 | 7s | Trial limits card: 50 clients · 5 team members · 500 AI credits · 1 GB. ⚠️ See `BRIEF.md` §7 — do not add a "Growth feature set" claim here without verifying entitlement. | Build from `TRIAL_LIMITS` | `[90s]` `[45s]` |
| 17 | 1:57 | 8s | "10 clients · 1 program" graphic. A small grid of ten avatars beside a single program card. Deliberately modest. | Build | `[90s]` `[45s]` |
| 18 | 2:05 | 11s | Four result tiles counting up: logged · streaked · completed tasks · had to be chased. Then a second column labelled "the ten you left alone" for comparison. | Build from Compliance dashboard | `[90s]` `[45s]` |
| 19 | 2:16 | 6s | Text on black: "That is not a sales argument. That is an experiment, and you run it." | Build | `[90s]` `[45s]` |
| 20 | 2:22 | 7s | Text on black, two beats: "If the numbers are not better, close the tab." / "You will have lost a fortnight and learned something about your own practice." | Build | `[45s]` |
| 21 | 2:29 | 6s | Full client grid lighting up, left to right — the other ninety. | Build | `[90s]` `[45s]` |
| 22 | 2:35 | 5s | NUSI mark. Text: "Built by Sirah Digital, for practices here." | `nusi-mark.png` | `[90s]` |
| 23 | 2:40 | 8s | End card: `nusi-logo.png` · "Run your practice, not your admin." · **nusi.in** · "Start free trial — 14 days, no card needed" | `nusi-logo.png` | `[90s]` `[45s]` |

**Total: 2:48 (168 s).** Over the 150 s target by 18 s — trim scenes 6, 9 and 10 by ~6 s each, or accept a 168 s master. `[?]` Your call.

## Production notes

- **Scene 13 is the pivot of the entire film.** Hard cut, music drops out completely, back to black after 70 s of light product footage. The viewer should feel the film stop selling and start being honest. If this cut is soft, the risk reversal that follows carries no weight.
- **Scenes 13–20 run with little or no music.** Candour has no soundtrack. Bring the bed back only at scene 21.
- **Scene 17 must look small.** Ten avatars, one program card, generous white space. An editor will want to make it impressive — resist. The modesty of the ask is the conversion mechanism.
- **Scene 18 needs believable numbers.** `[?]` Supply real figures from a pilot workspace if you have one. If you do not, use the compliance dashboard's own rendering and do not invent percentages — an unverifiable stat in a closing film is the fastest way to lose a clinician.
- **Scene 11 requires the Scale Pro badge.** Franchise dashboard, audit log, API and white-label are all Scale Pro *[src: `FEATURES.md` §2]*. Showing them unbadged in a film whose price card starts at ₹3,999 misrepresents the tier.
- **Voice and pronunciation must match Film 05 exactly.** Same artist, same ID, same "NOO-see".
- 45 s cut: scenes 1, 3, 13–20, 23. That sequence is a complete offer on its own — diagnosis, risk, reversal, experiment, close — and is the single best-performing asset in this package for abandoned-signup retargeting.
