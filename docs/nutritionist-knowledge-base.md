# NUSI — Nutritionist Knowledge Base

Source corpus for the nutritionist-facing assistant.

**How to use this file.** Every section below is written to stand on its own,
because retrieval returns individual chunks, not whole documents. A section
never says "as described above" or "see the previous section" — if a fact is
needed in two places it is repeated. Headings are phrased the way a
nutritionist would actually ask, so a question embeds close to its answer.

**Accuracy rule.** Everything here was verified against the running code and
the production database. Where the product does not do something, this file
says so plainly rather than staying silent — an assistant that omits a
limitation will invent a workaround for it.

---

## What is NUSI?

NUSI is practice-management software for nutritionists, dietitians and
wellness clinics. One workspace holds your clients, their programs, their food
logs, your appointments, your messages, your billing and your reports.

Your clients get their own app and portal, linked to your workspace. What they
log flows to you; what you assign flows to them.

There are three kinds of account, and the software decides which you get from
your identity — you cannot choose it:

- **Client** — a person you coach
- **Workspace staff** — you and your team (owner, nutritionist, or another staff role)
- **Super admin** — platform-level, across all workspaces

---

## How do I add a client?

Three ways:

1. **Create them directly with a login.** You enter their details and the
   system creates the account. No confirmation email is required, so they can
   sign in immediately with the credentials you give them.
2. **Send a join link.** They open the link, see your practice name, and
   request to join. The request queues for your approval — they do not appear
   in your roster until you approve them.
3. **They sign up and request to join** your workspace, which also queues for
   approval.

A client always belongs to exactly one workspace. Clients are never shared
between practices.

---

## A client requested to join but I cannot see their data

Requests are queued until approved. Until you approve them, the person has an
account but is not attached to your roster, so nothing of theirs appears.
Approve the request and their record becomes visible.

If someone signs in and is told their profile cannot be loaded, that usually
means their account exists but has no client record and no workspace role
attached — a provisioning problem, not something they did wrong.

---

## What are Programs and how do they work?

A **program template** is a protocol you build once and give to many clients.

A template has a name, description, category, duration (in weeks or days),
goals, difficulty, and optional cover image and accent colour.

Inside it you add **tasks**. Each task has a title, description, type, and a
**cadence**:

- **daily** — every day of the program
- **weekly** — one specific day each week
- **once** — a single day, set by week number and day

Tasks can be grouped into **phases** with a label and an order, so a six-week
protocol can read as "Phase 1 · Reset", "Phase 2 · Build", "Phase 3 · Sustain".

---

## How do I give a program to several clients at once?

Open the template, select the clients, and assign. It happens in one action.

Three things happen automatically:

- Clients not in your workspace are rejected
- Anyone already **active** on that program is skipped, so you never create
  duplicate enrolments. Someone who previously **completed** it can be assigned
  again to start over
- The template's tasks are **copied** onto each client's assignment

That copy matters. Each client gets their own set of task rows, so editing the
template later does not silently rewrite what someone is already working
through, and their history stays as it was given to them.

The assignment records the template version and computes an end date from the
program's duration.

---

## I edited a template. Do clients already on it get the change?

Not automatically on every edit — you push it with **Sync**, which sends the
template's current tasks to all **active** assignments.

Sync matches existing tasks by their identity — title, type, cadence, week and
day — and updates those in place rather than deleting and recreating them.
That is deliberate: recreating tasks would throw away every completion the
client has already logged.

Clients whose assignment is completed or archived are not touched.

---

## How is a client's program progress calculated?

Progress is **completed ÷ expected**, where "expected" is the number of times a
task has actually come due since the program started:

- a **daily** task is expected once per day elapsed
- a **weekly** task once per occurrence of its weekday
- a **once** task once, if its scheduled date has passed

This is the same rule that decides whether a task appears in the client's list
for today, so the bar always reflects what the client was actually asked to do.

Progress is stored on the assignment, so practice-level analytics can average
it. An assignment marked completed shows 100%.

---

## Can clients join a program themselves?

Yes, if you publish it. A published template appears in the client's
**catalog**, where they can self-enrol and later leave.

You control this with the template's settings: whether it is published,
visible, open for enrolment, featured, and whether there is a maximum number
of enrolments.

Each program also has a **group chat** shared between your practice and the
clients enrolled in it — both sides can post.

---

## What is Plate Vision?

A client photographs a meal, and the app identifies the dish and estimates its
nutrition.

It works at **dish level**. It names the dish, breaks it into the foods on the
plate, and estimates grams and nutrition for each. It is built to recognise
regional food properly — it should say "Dal Tadka" and "Raita", not "lentil
soup" and "yogurt".

The client can correct it before logging: pick one of the alternative dishes
the model considered, or drag a portion, which rescales that food's calories
and macros live.

---

## Are Plate Vision numbers accurate? Can I rely on them clinically?

**No — they are estimates from a photograph, and you should treat them as
indicative rather than measured.**

They are produced by a vision model reading the image. They are not looked up
in a food database, they carry no audit trail, and the same photo can produce
slightly different numbers on a second scan.

This is why the app shows a **calorie range** rather than a single confident
figure, and why every estimated meal is labelled as an estimate wherever you
see it.

Meals logged by other routes — voice, barcode, manual entry — are different.
Those are computed by the deterministic nutrition engine from IFCT 2017 and
USDA data, and each item is traceable to the database row it came from.

When you review a plate, check the source label. "Photo estimate" means the
model's reading. "Engine" means a database-backed calculation you can trace.

---

## How do I review a client's plate?

Plates your clients log arrive in your **plate review queue**, pending first.

For each plate you see the photo, the totals, the macro breakdown, each item
with its own calories, and — for estimated plates — the dish the model settled
on and its calorie range.

You then choose one of three outcomes:

- **Approve** — the numbers stand
- **Adjust** — you have corrected something
- **Flag** — something is wrong or needs a conversation

You can attach a note for the client with any of them. A plate stays pending
until you act on it.

---

## Can I improve the accuracy of a plate scan?

Yes, and the single most effective thing is telling it the portion size before
scanning. Choosing Small, Medium or Large measurably shifts the gram estimate —
far more than adjusting sliders afterwards.

Two other things help:

- Leave a spoon, hand or card in the frame and tick the scale-reference option,
  so it has a real-world object to measure the plate against
- Add a short note like "cooked in ghee, 2 rotis"

And if the dish is wrong, correcting it rebuilds the entire breakdown around
your correction rather than adjusting the old guess.

---

## What is the nutrition engine, and how is it different from Plate Vision?

The nutrition engine is the deterministic calculator. Given a food, a quantity
and a cooking method, it computes nutrition from authoritative database rows —
IFCT 2017 and USDA — applying cooking yield, oil absorption and nutrient
retention.

Every calculation writes an audit record, so any number can be re-explained
later. Numbers are reproducible: the same input always gives the same output.

It backs voice logging, barcode scanning, recipes, meal plans and manual entry.

Plate Vision does **not** use it. Photo scans are model estimates. That is the
core distinction: engine numbers are traceable and reproducible, photo
estimates are neither.

---

## What food data does NUSI have?

A food database drawn from IFCT 2017 (Indian Food Composition Tables) and USDA
FoodData Central, with cooking methods, yield factors and nutrient retention
applied when a method is specified.

Foods are matched by name using fuzzy text matching across canonical names and
aliases, so near-misses and spelling variants still resolve. When a match is
not confident enough, the item is flagged for manual review rather than
guessed at.

---

## Can I add my own recipes?

Yes. You create a recipe together with its ingredient list in one step, and its
nutrition is computed from those ingredients by the engine.

Recipes are drafts until published. You can publish or unpublish every draft in
the workspace in a single action. Deleting a recipe removes its ingredient rows
with it.

---

## What can I do with assessments?

You can build custom assessment forms for your workspace, or install one of the
ready-made starter forms as an editable draft and change it to suit your
practice. Forms you no longer use are archived rather than deleted.

Separately, NUSI computes body metrics from a client's measurements: BMI, ideal
body weight, BMR, TDEE, waist-to-hip ratio and body fat. Recording a new
measurement recomputes the assessment, and you can see the full measurement
history newest first.

---

## How do appointments and video calls work?

Appointments are scheduled inside NUSI, and video calls run inside the product
— you do not need a separate meeting tool or a link pasted into a chat.

Both the client and the practice see the same schedule.

---

## What can I do in Messaging?

Messaging holds your conversations with clients.

Two AI helpers are available on a conversation:

- **Summarise the thread** — a summary of a client conversation
- **Suggested replies** — reply options you can use or edit

Both assist you; neither sends anything on its own.

---

## What is Community?

A feed for your workspace where you post to your clients. Pinned posts appear
first.

You can create **cohorts** — groups of clients — and target posts at one
cohort, for a focused challenge. Deleting a cohort moves its posts back to the
general feed rather than destroying them.

You also get the top hashtags from the last seven days, and a moderation
summary showing flagged content and engagement rate.

---

## What reports can I generate?

Five kinds:

- **Client health** — one client's nutrition and adherence picture
- **Client monthly** — a month of progress for one client
- **Engagement** — how actively your clients are using the product
- **GST billing** — for Indian tax compliance
- **Overview** — a practice-level summary

Reports carry your branding and can include your own coach notes. They are
generated asynchronously — a report moves from generating to completed — and
can be scheduled rather than produced by hand each time.

The nutrition figures come from the frozen snapshot stored with each meal at
the time it was logged, so a report rendered today shows what the client saw
then, even if the engine has changed since.

---

## How does billing work?

Billing runs on Razorpay, with subscription plans across tiers and monthly or
annual terms.

You can see MRR and ARR, total revenue, subscription counts and failed
payments; MRR and active subscriptions split by plan tier; retention analytics
including churn, trial conversion and ARPA; and captured revenue bucketed by
month. You can list and filter subscriptions and payments — captured, failed,
refunded — and open any subscription or payment for detail.

GST-compliant invoicing is supported, and there is a dedicated GST billing
report.

---

## Can I sell products to my clients?

Yes, through the store. You maintain a product catalog for your workspace —
create, update and delete products. A product with existing orders is archived
rather than deleted, so order history is never orphaned.

Clients see the products published by their nutritionist and their own purchase
history. Payment goes through Razorpay: an order is opened, the payment
signature is verified, and fulfilment is owned by the webhook rather than the
client's browser, so a closed tab cannot lose a purchase.

---

## What can Automation do?

An automation rule watches for an event, checks conditions, and runs actions.

Conditions test values from the event using operators like equals, not equals,
greater than, less than, contains, exists and does not exist.

Actions available:

- **Notify** — an in-app notification
- **Send a message** — a chat message to the client the event was about
- **Push** — a web push notification to the client or to your staff
- **Webhook** — an outbound HTTP POST to a URL you choose
- **AI summarise** — run a prompt with the event's context through AI

Recipients are either the client the event concerned, or your workspace staff.

A typical use: a client stops logging for three days, so they get a message and
you get a notification.

---

## How do I add my team?

You invite staff to your workspace and manage active members. Staff have roles
and permissions, so what someone sees and can do depends on the role you give
them.

Sections of the product a staff member's role or your plan does not permit are
not shown to them at all, rather than shown and then refused.

---

## How do notifications work?

You control your own notification preferences and can send a test notification
to your own email or WhatsApp to check those channels actually work before
relying on them.

You can see your unread count, mark one notification read, or mark all read.
Staff can also subscribe a browser for push notifications.

---

## Is there a mobile app?

Yes, for Android — NUSI on the Play Store, and also downloadable directly from
nusi.in/download.

The same app serves both sides. Sign in as a client and you get the client
experience — meals, habits, progress, Plate Vision. Sign in as workspace staff
and you get the nutritionist experience — overview, clients, messaging,
appointments, and the rest of your practice.

Which one you get is decided by your account, not by a choice at login.

---

## Can I scan a plate from my nutritionist account?

No. Plate Vision is a client feature. Signing in with a nutritionist account
takes you to the practice dashboard, and the scanner is not reachable from
there.

As a nutritionist you review the plates your clients log; you do not scan your
own meals from the same account.

---

## The app updated itself. How does that work?

NUSI updates in two ways.

Most improvements arrive **automatically** as an over-the-air update. It
downloads when you open the app and applies the next time you open it — so if
you have just been told about a change and cannot see it, close the app fully
and open it again.

Changes to the app icon, the splash screen or anything in the underlying
platform need a **full app update** from the Play Store or the download page.

---

## Can I brand the product as my own practice?

Yes. Workspace settings cover your branding, and it carries into client-facing
output such as PDF reports.

You also get a **public page** — a profile link you can share with prospective
clients.

---

## What is the AI Assistant?

An assistant scoped to your role. As workspace staff you get the clinical
assistant: a dietitian assistant and clinical secretary that can run through
today's appointments, clients needing attention, pending plate reviews and
follow-ups, and help you act on them.

It keeps conversations, has memory scoped to your workspace, offers a
role-specific brief, and can execute suggested actions — each validated and
permission-checked before it runs, and logged afterwards.

Clients get a different assistant entirely — a personal wellness companion —
with memory scoped to them alone. The two never share memory.

---

## A client's meals show zero calories. Why?

Most often the items could not be matched to a database food, so the engine
declined to produce numbers rather than invent them. Those items are marked as
needing review, and you can resolve them.

If the meal came from Plate Vision it should carry estimated numbers and an
"estimate" label instead. A photo-scanned meal showing zero with everything
flagged is not expected behaviour and is worth reporting.

---

## A client is not appearing in my roster

Check whether their join request is still awaiting approval — a request queues
until you approve it, and the person is not attached to your workspace before
that.

Also check that they belong to your workspace. Clients belong to exactly one
workspace and are never shared between practices.

---

## What NUSI does not do

Being explicit about limits, so nothing here is inferred:

- **Plate Vision does not give clinically reliable numbers.** It estimates from
  a photograph. Use it as a starting point that you review, not as a
  measurement.
- **Nutritionists cannot scan plates.** It is a client-side feature.
- **NUSI does not diagnose, prescribe or give medical advice.** It supports
  your practice; clinical judgement remains yours.
- **Clients are not shared between workspaces.** Each belongs to one practice.
- **Editing a template does not automatically rewrite active client programs.**
  You push changes with Sync.
