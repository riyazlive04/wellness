# On-screen text — NUSI Film 50 "The Close"

Every frame of text in the film, verbatim, in order. Typeface **Plus Jakarta Sans** throughout.
Dark frames: canvas `#0A0C10`, text `#F3FAE8`. Light frames: canvas `#FFFFFF`, text `#0A0C10`, accent `#436F17`.

Sentence case. No exclamation marks.

| Scene | Frame text | Treatment |
|---|---|---|
| 1 | You already agree with the diagnosis. | 48 pt / 400, centred, letter-spacing −0.02em. Dark. |
| 2 | *(no text — three callback images)* | Each at 60% opacity, slightly desaturated. |
| 3 | So the only question left<br>is whether this one fixes it. | 44 pt / 400, two lines, centred. Dark. |
| 4 | One record per client | 26 pt / 600, lower third, `#436F17`. Light. |
| 5 | One edit · every active client · progress kept | 24 pt / 600, lower third. The three segments appear in sequence as the ripple spreads. |
| 6 | IFCT-2017 · 15 cooking methods · 48 retention factors | 24 pt / 600, lower third. |
| 7 | An app they open every morning | 28 pt / 600, lower third. |
| 8 | Ranked by who is closest to quitting | 26 pt / 600, `#436F17`. |
| 9 | It chases them. You do not. | 28 pt / 600. |
| 10 | Razorpay · GST invoices · retries · grace window | 22 pt / 500, four sequential labels, one per state. |
| 11 | Roles · Franchise roll-ups · Audit log · API · White-label<br>`Scale Pro` | Grid labels 22 pt / 600. Badge 15 pt / 700, pill, `#436F17` on `#F3FAE8`. **Badge is mandatory.** |
| 12 | **Starter** ₹3,999/mo<br>**Growth** ₹8,999/mo · `Most popular`<br>**Scale Pro** ₹19,999/mo<br>Annual — 2 months free | Plan names 28 pt / 700; prices 40 pt / 700. Growth column lifted 8 px, gradient `#375818 → #436F17 → #558E19` on its top edge. Annual line 20 pt / 500 beneath. |
| 13 | Now the risk, honestly.<br><br>You spend a fortnight on a tool you abandon. | Line 1: 46 pt / 700. Second block appears after a 2 s beat, 36 pt / 400. Dark. **Hard cut into this frame.** |
| 14 | So here is how we remove it. | 44 pt / 400, centred. Dark. No motion. |
| 15 | 14 days free<br>No card needed<br><br>Nothing can charge you by accident. | 56 pt / 700, 28 pt / 400, then third line 22 pt / 400 after a beat. Light. |
| 16 | 50 clients · 5 team members · 500 AI credits · 1 GB<br>Real limits, on the real product. | 26 pt / 600 and 20 pt / 400. ⚠️ **Do not add "Growth feature set"** — unverified, see `BRIEF.md` §7. *Alternate line, only if entitlement is confirmed in `common/features.ts`:* "The full feature set, not a crippled demo." |
| 17 | 10 clients<br>1 program | 72 pt / 700 and 72 pt / 700, stacked, generous white space either side. **Must read as modest, not impressive.** |
| 18 | Logged · Streaked · Completed tasks · Had to be chased<br>vs. the ten you left alone | Tile labels 20 pt / 600. Comparison label 18 pt / 500, `#436F17`. ⚠️ Figures `[?]` — supply from a real pilot or show the dashboard's own rendering. **Do not invent percentages.** |
| 19 | That is not a sales argument.<br>That is an experiment, and you run it. | 44 pt / 400 then 44 pt / 700. Dark. |
| 20 | If the numbers are not better, close the tab. | 38 pt / 400, centred. Dark. Second beat: "You will have lost a fortnight and learned something about your own practice." at 26 pt / 400. |
| 21 | *(no text — client grid lighting up)* | Light. |
| 22 | Built by Sirah Digital,<br>for practices here. | 32 pt / 400, centred, beside `nusi-mark.png` at 96 px. |
| 23 | NUSI<br>Run your practice, not your admin.<br>**nusi.in**<br>Start free trial — 14 days, no card needed | Logo lockup `nusi-logo.png` at 320 px. Tagline 30 pt / 400. URL 38 pt / 700, `#436F17`. CTA 20 pt / 500. |

## Rules for this film

- **Never** display "SIRAH LIFE". Shipped brand is NUSI. *(Source script library uses the wrong name — see `BRIEF.md` §7.)*
- Prices on screen use digits and ₹ (`₹3,999`); the VO spells them out. Intentional.
- **Scene 13 is the pivot.** Hard cut from light to dark, music out. Everything before it sells; everything after it is candid. A soft transition kills the risk reversal.
- **Scene 17 must look small.** Ten avatars and one card, lots of air. Do not scale it up to look more generous — the small ask is the conversion mechanism.
- **Scene 18 carries no invented numbers.** This is a closing film shown to clinicians; one unverifiable stat loses the sale and invites a refund.
- **Scene 11 badge is a compliance item**, not decoration. Those four features are Scale Pro only.
- 9:16 cut: text frames (1, 3, 13, 14, 19, 20), trial cards (15, 16), experiment frames (17, 18) and end card (23) reframe as-is. Scenes 4–11 need the active tile or phone re-centred and scaled, never a crop of the full frame.
- **45 s retargeting cut** uses scenes 1, 3, 13–20, 23. Self-contained offer. Likely the highest-ROI asset here.
