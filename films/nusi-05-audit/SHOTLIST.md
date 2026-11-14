# Shot list — NUSI Film 05 "Audit Your Own Practice"

**Master:** 150 s · 16:9 1920×1080 · Plus Jakarta Sans · VO speed 0.95
**Cut markers:** `[90s]` = keep in the 90 s cut · `[60s]` = keep in the 60 s cut

Timecodes are cumulative and are targets. The five question beats (scenes 2–6) carry mandatory silence — do not tighten them to save runtime. If the film runs long, cut scene 17 or 18 instead.

| # | In | Dur | Shot | Asset / build | Cuts |
|---|---|---|---|---|---|
| 1 | 0:00 | 6s | Title card, dark. Plain sans text, centred, no logo yet. Slow 2% push in. | Build. Canvas #0A0C10, text #F3FAE8 | `[90s]` `[60s]` |
| 2 | 0:06 | 9s | **"1."** large, centred, dark. VO asks. Then **3 s of true silence** — no music bed, no motion. | Build | `[90s]` `[60s]` |
| 3 | 0:15 | 8s | **"2."** Same treatment. Silence after. | Build | `[90s]` `[60s]` |
| 4 | 0:23 | 8s | **"3."** Same. | Build | `[90s]` `[60s]` |
| 5 | 0:31 | 8s | **"4."** Same. | Build | `[90s]` `[60s]` |
| 6 | 0:39 | 10s | **"5."** Same, but hold **4 s** — the longest pause in the film. | Build | `[90s]` `[60s]` |
| 7 | 0:49 | 8s | Text on black, two lines, the second appearing after a beat: "You do not have a practice problem." / "You have an instrumentation problem." | Build | `[90s]` `[60s]` |
| 8 | 0:57 | 6s | Six greyed tool logos in a loose cluster — scheduler, WhatsApp, spreadsheet, payment link, email, notes. Desaturated, slightly misaligned. | Build. Generic marks only — **do not use real competitor logos** (trademark risk) | `[90s]` |
| 9 | 1:03 | 5s | **The turn.** Hard cut from dark to light. NUSI dashboard loads clean. Mark animates in bottom-right and stays as a watermark. | `nusi-mark.png`; redraw dashboard from `landing/*.webp` | `[90s]` `[60s]` |
| 10 | 1:08 | 6s | Answer 1: active-clients KPI tile on Overview. Tile isolates and scales up 10%. Number legible. | Redraw from Overview | `[90s]` `[60s]` |
| 11 | 1:14 | 8s | Answer 2: clients-needing-attention roll-up, then the at-risk list with days-silent values visible. | `landing/problem-at-risk.webp` | `[90s]` `[60s]` |
| 12 | 1:22 | 8s | Answer 3: billing lifecycle — failed charge → automatic retry → grace window. Three states, one cut each. | Redraw from Billing | `[90s]` |
| 13 | 1:30 | 6s | Answer 4: revenue/MRR chart with trend line drawing on. **"Scale Pro" badge must be visible.** | Redraw from Revenue analytics | `[90s]` |
| 14 | 1:36 | 11s | Answer 5: split screen. Left — automation rule (trigger → action → run log) executing unattended. Right — a client phone receiving the daily task. Practitioner absent from frame. | `landing/problem-daily-tasks.webp` + Automation | `[90s]` `[60s]` |
| 15 | 1:47 | 5s | Hold on the client phone alone. No VO for the first 2 s. | Continue from 14 | `[60s]` |
| 16 | 1:52 | 6s | Text on black: "A plan a client follows is worth ten plans you wrote beautifully." | Build | `[90s]` `[60s]` |
| 17 | 1:58 | 14s | Four India-native cards, one per VO beat: IFCT food calculator with cooking-method selector changing values · GST invoice PDF · Razorpay checkout · WhatsApp notification. | `landing/problem-diet-templates.webp` + redraws | — |
| 18 | 2:12 | 16s | Three pricing columns build left to right. Growth carries "most popular". Prices legible: ₹3,999 / ₹8,999 / ₹19,999. | Redraw from `plans.ts` values | — |
| 19 | 2:28 | 7s | Trial card: "14 days free · no card needed". Nothing else on screen. | Build | `[90s]` `[60s]` |
| 20 | 2:35 | 8s | Return to the dashboard, now populated and calm. Mirrors scene 9 to close the loop. | Reuse scene 9 build | `[90s]` `[60s]` |
| 21 | 2:43 | 7s | End card: `nusi-logo.png` · "Run your practice, not your admin." · **nusi.in** · "Start free trial — 14 days, no card needed" | `nusi-logo.png` | `[90s]` `[60s]` |

**Total: 2:50 (170 s).** Over the 150 s target by 20 s — trim by cutting scene 17 to 10 s and scene 18 to 12 s, or accept a 170 s master and let the 90 s cut carry paid placements. `[?]` Your call.

## Production notes

- **The silences are the product.** Scenes 2–6 contain roughly 16 s of deliberate dead air. An editor will instinctively fill it with a music swell. Do not. The viewer needs the space to fail to answer.
- **Scene 9 is the only hard cut** in the film. Everything before it is dark and slow; everything after is light and moving. That single transition carries the whole argument.
- **No faces until scene 14**, and even there the practitioner is deliberately absent — the point of that scene is that the system runs without her.
- **Tile numbers must be legible** on a phone at 9:16. If a KPI value cannot be read at 1080×1920, scale the tile rather than the whole frame.
- **Scale Pro badge in scene 13 is not optional.** Showing revenue analytics without it misrepresents the tier and will generate refund requests.
- Music: sparse, low, no percussion until scene 9. From scene 9 a light pulse is fine. Out by scene 16.
