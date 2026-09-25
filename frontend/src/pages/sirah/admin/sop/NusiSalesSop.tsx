import { useMemo } from 'react';
import {
  type Fields,
  type Section,
  type StackRow,
  type Tab,
  ToolShell,
  esc,
  gap,
  m,
  money,
  round,
  stackSum,
  toolCss,
  useToolState,
  v,
} from './toolKit';

/**
 * NUSI demo-call SOP - the 45-minute call a lead books from the landing page.
 *
 * Same shape as the Sirah Digital sales SOPs: frame, find the end goal, get
 * the numbers, label the real problem, past pain, a live demo mapped to their
 * pain, then price and close - where "close" means their workspace is created
 * on the call. Fill the rail as the call runs; the script, the objection
 * handles and the proposal rebuild from those answers on every keystroke.
 */

const STORAGE_KEY = 'nusi-sales-sop-v1';

/** Mirrors backend/src/billing/plans.ts (2026 pricing sheet). */
const PLANS = {
  starter: { name: 'Starter', monthly: 3999, annual: 39999, setup: 4999, fits: 'solo dietitians - up to 100 clients, 1 user' },
  growth: { name: 'Growth', monthly: 8999, annual: 89999, setup: 9999, fits: 'small teams - up to 500 clients, 5 users' },
  scale_pro: { name: 'Scale Pro', monthly: 19999, annual: 199999, setup: 24999, fits: 'clinics - unlimited clients, white-label' },
} as const;
type PlanKey = keyof typeof PLANS;
const PLAN_ORDER: PlanKey[] = ['starter', 'growth', 'scale_pro'];

/* ------------------------------------------------------------ end goals */

/**
 * Nobody buys practice software. A dietitian buys one of these outcomes; NUSI
 * is only the machine that produces it. Sold as "an app", it is compared with
 * WhatsApp and Excel - which are free. Sold as the outcome, it isn't.
 */
interface EndGoal {
  id: string;
  label: string;
  buying: string;
  proof: string;
  diag: string;
}

const END_GOALS: EndGoal[] = [
  {
    id: 'time',
    label: 'Get my evenings and weekends back',
    buying: 'your evenings back - a practice that runs without you doing the admin at night',
    proof: 'hours a week spent on charts, chats and follow-ups',
    diag: "You don't have a software problem, you have a time problem. Every hour you spend copying charts and answering the same WhatsApp questions is an hour you can't bill and can't get back.",
  },
  {
    id: 'capacity',
    label: 'Take on more clients without more hours',
    buying: 'room for more clients without working longer or hiring',
    proof: 'active clients you can handle in the same week',
    diag: "Your practice has a ceiling, and it isn't demand - it's you. Right now every new client adds admin, so growth means longer nights.",
  },
  {
    id: 'retention',
    label: 'Stop losing clients after the first month',
    buying: 'clients who stay long enough to get results - and keep paying you',
    proof: 'share of clients still active after three months',
    diag: "Clients don't leave because your advice is wrong. They leave because between consultations they're on their own, and by the time you notice they've gone quiet, they've already gone.",
  },
  {
    id: 'results',
    label: 'Better client results (and the referrals they bring)',
    buying: 'results you can see, prove and turn into referrals',
    proof: 'clients reaching their goal, and referrals a month',
    diag: "You're adjusting plans half-blind - a blurry photo, a guessed portion, a 'yes I followed it'. You can't coach what you can't see.",
  },
  {
    id: 'premium',
    label: 'Look like a premium practice and charge like one',
    buying: 'an app with your name on it - and permission to charge more than the dietitian down the road',
    proof: 'average fee per client',
    diag: 'When your service arrives as a PDF on WhatsApp, it looks like everyone else - and price becomes the only thing left to compare.',
  },
  {
    id: 'team',
    label: 'Run a team without everything going through me',
    buying: 'a practice that runs without you in every conversation',
    proof: 'hours a week you spend coordinating the team',
    diag: 'Right now your team is only as good as the last WhatsApp message they read. Every handover goes through you, so the practice can only grow as far as your attention reaches.',
  },
];

const END_GOAL_OPTS: Array<[string, string]> = [
  ['', '- pick the one that matters most -'],
  ...END_GOALS.map((g) => [g.id, g.label] as [string, string]),
];

const findEndGoal = (id: string | undefined) => END_GOALS.find((g) => g.id === id);

function endGoalReference(): string {
  const ladder = [
    '"Forget software for a second. If your practice worked exactly the way you wanted twelve months from now - what\'s different?"',
    '"Walk me through last week - not the consultations, everything around them. Where did the hours go?"',
    '"How many clients do you have right now, and how many could you take if the admin disappeared?"',
    '"Of every ten clients who start with you, how many are still with you three months later?" <i>(let them count - the silence after is the sale)</i>',
    '"What\'s an hour of your time worth - what do you charge for a consultation?"',
    '"What would have to be true for this to be the best money you spent on the practice this year?"',
  ];
  const goals = END_GOALS.map(
    (g) => `<div class="ocard"><h4><span class="btype">${esc(g.label)}</span></h4><div class="say">
      <p><b>They're not buying an app.</b> They're buying ${esc(g.buying)}.</p>
      <p>"${esc(g.diag)}"</p>
      <p class="do"><b>Prove it with:</b> ${esc(g.proof)}</p>
    </div></div>`,
  ).join('');
  return `<div class="say"><p><b>Nobody wants practice software.</b> They want what it gives them back. Sold as "an app", NUSI is compared with WhatsApp and Excel - and those are free.</p>
      <p>Sold as the outcome, it isn't comparable to anything. So your first job is to find which of these six outcomes they're actually buying - and then talk about that, not features.</p></div>
    <div class="beat"><div class="beat-h"><span class="stage">the ladder</span><b>Questions that surface the end goal</b></div>
    <div class="say">${ladder.map((q) => `<p>${q}</p>`).join('')}</div>
    <p class="do">Ask these <b>before</b> you open the demo. Once you have the end goal and the numbers behind it, the demo only has to show three screens.</p></div>
    <h4 style="margin:18px 0 10px;font-size:11.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink-3)">The six end goals</h4>
    ${goals}`;
}

/* ------------------------------------------------------- practice economics */

interface Roi {
  ok: boolean;
  hoursSavedMonth: number;
  timeValue: number;
  keptClients: number;
  retentionValue: number;
  monthlyGain: number;
  planMonthly: number;
  multiple: number | null;
  paybackDays: number | null;
}

/**
 * Turns the call into arithmetic: the admin hours NUSI takes off their plate,
 * valued at what their hour earns, plus the clients it keeps from drifting
 * away, valued at their monthly fee - set against the plan's monthly cost.
 */
function practiceRoi(f: Fields): Roi {
  const n = (k: string) => parseFloat(f[k] || '') || 0;
  const adminHours = n('adminHours');
  const hourValue = n('hourValue');
  const savePct = n('savePct');
  const dropoffs = n('dropoffs');
  const keepPct = n('keepPct');
  const fee = n('fee');

  const hoursSavedMonth = (adminHours * 4.33 * savePct) / 100;
  const timeValue = hoursSavedMonth * hourValue;
  const keptClients = (dropoffs * keepPct) / 100;
  const retentionValue = keptClients * fee;
  const monthlyGain = timeValue + retentionValue;

  const plan = PLANS[(f.plan as PlanKey) || 'starter'] ?? PLANS.starter;
  const planMonthly = f.billing === 'annual' ? plan.annual / 12 : plan.monthly;

  return {
    ok: adminHours > 0 && hourValue > 0 && savePct > 0,
    hoursSavedMonth,
    timeValue,
    keptClients,
    retentionValue,
    monthlyGain,
    planMonthly,
    multiple: monthlyGain > 0 ? monthlyGain / planMonthly : null,
    paybackDays: monthlyGain > 0 ? (planMonthly / monthlyGain) * 30 : null,
  };
}

function RoiReadout({ fields }: { fields: Fields }) {
  const r = practiceRoi(fields);
  if (!r.ok) {
    return (
      <p className="hint">
        Fill in admin hours, what an hour is worth and the share NUSI saves - the gain calculates itself, and
        both the script and the proposal pick it up. Add drop-offs and fee to count the clients it keeps.
      </p>
    );
  }
  return (
    <>
      <div className="invest">
        <div className="box">
          <span>Hours back</span>
          <b>{round(r.hoursSavedMonth, 0)} h</b>
          <em>a month · worth {money(r.timeValue, 'INR')}</em>
        </div>
        <div className="box">
          <span>Clients kept</span>
          <b>{round(r.keptClients, 1)}</b>
          <em>a month · worth {money(r.retentionValue, 'INR')}</em>
        </div>
        <div className="box hero">
          <span>Monthly gain</span>
          <b>{money(r.monthlyGain, 'INR')}</b>
          <em>against {money(r.planMonthly, 'INR')} for the plan</em>
        </div>
      </div>
      {r.multiple !== null && (
        <div className="total">
          <span>Pays for itself</span>
          <b>{round(r.multiple, 1)}× · in {r.paybackDays! < 1 ? 'under a day' : `${round(r.paybackDays!, 0)} days`}</b>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- the rail */

const SEED_STACK: StackRow[] = [
  { name: 'Done-for-you setup & client import', does: "so you're live with your existing clients in days, not weeks", val: '' },
  { name: 'Your own branded client app', does: 'so clients open an app with your name on it, not a WhatsApp group', val: '' },
  { name: 'Diet plan templates (weight loss, PCOS, diabetes)', does: "so a new client's plan takes minutes, not an evening", val: '' },
  { name: 'Plate Vision AI food logging', does: 'so you see what clients actually eat, not what they remember', val: '' },
  { name: '1:1 onboarding & training', does: 'so you (and your team) are using it in week one', val: '' },
];

const SECTIONS: Section[] = [
  {
    clock: 'setup',
    na: true,
    title: "Who's on the call",
    open: true,
    groups: [
      [
        { id: 'you', label: 'Your name', req: true, placeholder: 'Riyaz' },
        { id: 'them', label: "Dietitian's name", req: true, placeholder: 'Dt. Priya Sharma' },
      ],
      [
        { id: 'theirco', label: 'Practice name', req: true, placeholder: 'Priya Nutrition Studio' },
        { id: 'city', label: 'City', placeholder: 'Chennai' },
      ],
      [
        {
          id: 'plan',
          label: 'Plan to recommend',
          kind: 'select',
          q: 'Solo → Starter · team of 2-5 → Growth · clinic → Scale Pro.',
          opts: PLAN_ORDER.map((k) => [k, `${PLANS[k].name} - ₹${PLANS[k].monthly.toLocaleString('en-IN')}/mo`] as [string, string]),
        },
        { id: 'billing', label: 'Billing', kind: 'select', opts: [['monthly', 'Monthly'], ['annual', 'Annual (2 months free)']] },
      ],
    ],
  },
  {
    clock: '3:00–8:00',
    title: 'The end goal',
    open: true,
    hint: 'Nobody wants practice software - they want what it gives them back. Find that first, then stop saying "app". The End goal tab has the full question ladder.',
    groups: [
      [
        {
          id: 'endGoal',
          label: 'What are they actually buying?',
          kind: 'select',
          req: true,
          q: 'Pick one. It changes what the script and the proposal say.',
          opts: END_GOAL_OPTS,
        },
      ],
      [
        {
          id: 'goalWhy',
          label: '"If your practice worked exactly how you wanted, 12 months from now - what\'s different?"',
          kind: 'textarea',
          req: true,
          q: 'Their answer, in their words. Ask it before you open the demo.',
          placeholder: "I'd have 80 clients instead of 40 and I wouldn't be writing charts on Sunday nights.",
        },
      ],
      [
        {
          id: 'weekNow',
          label: 'Last week, outside the consultations',
          kind: 'textarea',
          req: true,
          q: '"Walk me through last week - not the sessions, everything around them."',
          placeholder: 'Sunday evening writing charts in Word, 60+ WhatsApp chats a day, chasing follow-ups from memory.',
        },
      ],
    ],
  },
  {
    clock: '8:00–13:00',
    title: 'The numbers',
    open: true,
    readout: true,
    hint: 'Get these live, rapid-fire. The gain they work out for themselves is the entire close - you will not need to argue about price afterwards.',
    groups: [
      [
        { id: 'clients', label: 'Active clients now', kind: 'number', req: true, placeholder: '40' },
        { id: 'fee', label: 'Average fee per client / month (₹)', kind: 'number', req: true, placeholder: '3000' },
      ],
      [
        { id: 'adminHours', label: 'Hours / week on admin', kind: 'number', req: true, q: 'Charts, chats, follow-ups, reminders - everything outside sessions.', placeholder: '15' },
        { id: 'hourValue', label: 'What an hour of theirs is worth (₹)', kind: 'number', req: true, q: 'Their consultation fee per hour is the honest number.', placeholder: '800' },
      ],
      [
        { id: 'dropoffs', label: 'Clients who stop each month', kind: 'number', req: true, placeholder: '5' },
        { id: 'savePct', label: 'Admin NUSI takes off (%)', kind: 'number', req: true, q: 'Be conservative - 50% is a safe promise. Promise what you can beat.', placeholder: '50' },
        { id: 'keepPct', label: 'Drop-offs it keeps (%)', kind: 'number', q: 'Conservative: 20-30%.', placeholder: '25' },
      ],
    ],
  },
  {
    clock: '13:00–16:00',
    title: 'Clarify',
    hint: 'Their words go in these boxes - you read them back at minute 22 and it lands like you read their mind.',
    groups: [
      [
        { id: 'revNow', label: 'Earning now (per month, ₹)', kind: 'number', placeholder: '120000' },
        { id: 'revGoal', label: 'Want to earn (₹)', kind: 'number', placeholder: '250000' },
        { id: 'deadline', label: 'By when', req: true, placeholder: 'March 2027' },
      ],
      [
        {
          id: 'whyNow',
          label: 'Why now - what changed in the last 30 days',
          kind: 'textarea',
          req: true,
          q: '"What made you book this call now?" - the highest-leverage answer on the call.',
          placeholder: 'Lost three clients last month who just stopped replying, and missed my son\'s school event for charts.',
        },
      ],
      [
        {
          id: 'personal',
          label: 'What hitting the goal changes for them personally',
          kind: 'textarea',
          req: true,
          q: 'Not for the practice - for them.',
          placeholder: 'Sundays with the family, and not feeling guilty about switching the phone off.',
        },
      ],
    ],
  },
  {
    clock: '16:00–19:00',
    title: 'Label the real problem',
    groups: [
      [{ id: 'surface', label: 'What they think the problem is', kind: 'textarea', req: true, placeholder: 'needing a better diet chart template' }],
      [
        {
          id: 'real',
          label: 'The real constraint (your diagnosis)',
          kind: 'textarea',
          req: true,
          q: 'Whoever defines the problem controls the solution.',
          placeholder: 'the practice runs on your memory and WhatsApp - there is no system, so every client adds work',
        },
      ],
      [{ id: 'proof', label: "Proof it isn't the surface problem", kind: 'textarea', req: true, placeholder: 'you already have good charts - you still lost 5 clients last month and worked 15 hours of admin' }],
    ],
  },
  {
    clock: '19:00–22:00',
    title: 'Past pain',
    groups: [
      [{ id: 'tried', label: "What they've already tried", kind: 'textarea', req: true, placeholder: 'Excel templates, a Canva chart design and a part-time assistant for three months' }],
      [
        { id: 'spentMoney', label: 'Spent so far (₹)', kind: 'number', req: true, placeholder: '45000' },
        { id: 'spentMonths', label: 'Months lost', kind: 'number', req: true, placeholder: '8' },
      ],
    ],
  },
  {
    clock: '22:00–34:00',
    title: 'Live demo & the offer',
    groups: [
      [
        {
          id: 'demoShow',
          label: 'The three screens you will show (mapped to their pain)',
          kind: 'textarea',
          req: true,
          q: 'Three, not twelve. Each one answers something they said.',
          placeholder: 'Their PCOS protocol as a template → assign in one click; Plate Vision on a thali; the at-risk list on the dashboard',
        },
      ],
      [{ id: 'dream', label: 'The after-state, in one sentence', kind: 'textarea', req: true, q: 'Sell the Sunday off, not the software.', placeholder: 'every client follows their plan in your app between sessions, and your evenings are yours again' }],
      [{ id: 'proofClient', label: 'Proof dietitian + their result', kind: 'textarea', req: true, placeholder: 'Dt. Aysha Nasreen moved her whole practice onto NUSI and runs her clients from one dashboard' }],
      [
        { id: 'firstWin', label: 'First tangible win', req: true, placeholder: 'your first 20 clients on your branded app' },
        { id: 'firstWinDays', label: '…within how many days', kind: 'number', req: true, placeholder: '7' },
      ],
      [{ id: 'effort', label: 'Everything you need from them', kind: 'textarea', req: true, q: 'Every task you hand them is a reason to delay. Make it tiny.', placeholder: 'send us your client Excel and join one 45-minute onboarding call' }],
    ],
  },
  {
    clock: 'the stack',
    na: true,
    title: 'Value stack',
    open: true,
    stack: true,
    stackHint: 'Name it, say what it does for them, price it standalone. The total is your anchor against the plan price.',
  },
  {
    clock: '34:00–45:00',
    title: 'Trial, price & close',
    groups: [
      [
        {
          id: 'guarantee',
          label: 'Your promise',
          kind: 'textarea',
          req: true,
          q: 'Say it calm. The 14-day trial is already risk-free - the promise is what you add on top.',
          placeholder: "14 days free, no card - and if it isn't saving you 5 hours a week by the end of it, walk away",
        },
      ],
      [
        { id: 'bonus', label: 'Start-today bonus', placeholder: 'setup and client import done for you, free' },
        { id: 'holdUntil', label: 'Bonus holds until', placeholder: 'Friday 6pm' },
      ],
    ],
  },
];

const CSS = toolCss('#6db022');

function beat(clock: string, title: string, inner: string): string {
  return `<div class="beat"><div class="beat-h"><span class="stage">${clock}</span><b>${title}</b></div>${inner}</div>`;
}

const inr = (n: number) => money(n, 'INR') ?? '';

export default function NusiSalesSop() {
  const state = useToolState(STORAGE_KEY, SECTIONS, SEED_STACK);
  const { fields: f, rows } = state;

  const tabs: Tab[] = useMemo(() => {
    const them = v(f.them, 'their name');
    const total = stackSum(rows);
    const days = f.firstWinDays ? esc(f.firstWinDays) : gap('N');
    const goal = findEndGoal(f.endGoal);
    const r = practiceRoi(f);
    const planKey = (f.plan as PlanKey) || 'starter';
    const plan = PLANS[planKey] ?? PLANS.starter;
    const annual = f.billing === 'annual';
    const planPrice = annual ? `${inr(plan.annual)} a year` : `${inr(plan.monthly)} a month`;
    const perDay = inr(Math.round((annual ? plan.annual / 365 : plan.monthly / 30)));
    const lower = PLAN_ORDER[PLAN_ORDER.indexOf(planKey) - 1];
    const buying = goal ? esc(goal.buying) : gap('pick the end goal on the left');
    const gainM = r.ok && r.monthlyGain > 0 ? inr(r.monthlyGain) : null;
    const gainY = r.ok && r.monthlyGain > 0 ? inr(r.monthlyGain * 12) : null;

    /* ------------------------------------------------------- call script */
    let s = '';

    s += beat(
      '0:00–3:00',
      'Frame &amp; permission',
      `<div class="say"><p>"Good to meet you ${them}. Before we start - are the full 45 minutes still good for you?</p>
      <p>Here's how I'd like to use them. For the first 20 minutes I'll ask you a lot about ${v(f.theirco, 'their practice')} - how your week actually runs - and some questions will be blunt, because I can't show you the right thing until I understand what's going on. Then I'll show you the three parts of NUSI that matter for you, not all of it. If I think it fits, I'll tell you exactly what it costs and we can set you up today. If I don't think it fits, I'll say so.</p>
      <p>Either way you leave with a clear answer. <b>Does that work for you?</b>"</p></div>
      <p class="do"><b>Don't move on</b> until they say yes out loud. That yes is your permission to talk about money at minute 34.</p>`,
    );

    s += beat(
      '3:00–8:00',
      'The end goal',
      `<div class="say"><p>"So what made you book this call?" <i>(silent - let them talk)</i></p>
      <p>"Let me ask before we look at anything. <b>Forget software for a second.</b> If your practice worked exactly the way you wanted, twelve months from now - what's different?"</p>
      <p><i>(they'll say: ${v(f.goalWhy, 'their answer - get it in their words')})</i></p>
      <p>"Walk me through last week - not the consultations, everything around them. Where did the hours go?"</p>
      <p><i>(${v(f.weekNow, 'their week outside sessions')})</i></p></div>
      <div class="callout left">You're not selling an app. ${them} is buying <b>${buying}</b>.</div>
      <p class="do"><b>Say it back once you have it:</b> "So you don't actually want another app. You want ${buying}. NUSI is just how we get you there. Fair?"<br><br>From here on, talk about the outcome, not features. Every feature you list makes you comparable to WhatsApp and Excel - which are free.</p>`,
    );

    s += beat(
      '8:00–13:00',
      'The numbers',
      `<div class="say"><p>"Can I ask a few quick numbers? This is what tells us whether NUSI would actually pay for itself for you."</p>
      <p>"How many active clients do you have right now?" <i>(${f.clients ? `<span class="num">${esc(f.clients)}</span>` : gap('clients')})</i></p>
      <p>"And roughly what does a client pay you a month?" <i>(${m(f.fee, 'INR', 'fee')})</i></p>
      <p>"How many hours a week go on everything outside sessions - charts, WhatsApp, follow-ups?" <i>(${f.adminHours ? `<span class="num">${esc(f.adminHours)}</span> hours` : gap('admin hours')})</i></p>
      <p>"What do you charge for a consultation hour?" <i>(${m(f.hourValue, 'INR', 'hour value')})</i></p>
      <p>"And in a normal month, how many clients just… stop? Stop replying, don't renew?" <i>(${f.dropoffs ? `<span class="num">${esc(f.dropoffs)}</span>` : gap('drop-offs')})</i></p></div>
      ${
        r.ok && r.monthlyGain > 0
          ? `<div class="callout">Taking ${esc(f.savePct)}% of the admin off is <b>${round(r.hoursSavedMonth, 0)} hours a month</b>${r.keptClients > 0 ? ` and keeping ${round(r.keptClients, 1)} clients who'd have left` : ''} - <b>${gainM} a month, ${gainY} a year</b>.</div>`
          : `<div class="callout">Fill the numbers on the left and the gain calculates itself.</div>`
      }
      <p class="do"><b>Let them do the arithmetic out loud.</b> "So ${f.adminHours ? esc(f.adminHours) : '__'} hours a week, at ${m(f.hourValue, 'INR', 'their rate')} an hour…" - then stop and let them finish the sum. A number they work out is a fact; a number you hand them is a claim.</p>`,
    );

    s += beat(
      '13:00–16:00',
      'Clarify',
      `<div class="say"><p>"And <b>why now?</b> What changed in the last month that made you book this?"</p>
      <p>"Where's the practice today - roughly what does it bring in a month?" <i>(${m(f.revNow, 'INR', 'earning now')})</i></p>
      <p>"And where do you want it to be, realistically, and by when?" <i>(${m(f.revGoal, 'INR', 'their target')} by ${v(f.deadline, 'deadline')})</i></p>
      <p>"What would hitting that change <b>for you</b> - not the practice, you?"</p>
      <p>"Last one. If nothing changes and you're in exactly this spot a year from now - <b>what does that cost you?</b>"</p></div>
      <p class="do"><b>Exit only when you can say this:</b> ${them} wants ${v(f.goalWhy, 'their 12-month answer')} by ${v(f.deadline, 'deadline')}, because ${v(f.personal, 'their personal reason')}. They booked because ${v(f.whyNow, 'why now')}.</p>`,
    );

    s += beat(
      '16:00–19:00',
      'Label',
      `<div class="say"><p>"Can I tell you what I'm hearing? I don't think your problem is <b>${v(f.surface, 'what they think the problem is')}</b>.</p>
      <p>I think it's <b>${v(f.real, 'the real constraint')}</b>.</p>
      ${goal ? `<p>"${esc(goal.diag)}"</p>` : ''}
      <p>And here's how I know: ${v(f.proof, "proof it isn't the surface problem")}. <b>Does that land, or am I off?</b>"</p></div>
      <p class="do">Listen for <b>"yes… that's exactly it."</b> A polite "maybe" means you're wrong - ask more. Never open the demo on a diagnosis they didn't confirm.</p>`,
    );

    const spentLine =
      f.spentMoney || f.spentMonths
        ? `you've put about ${m(f.spentMoney, 'INR', 'amount')} and roughly <span class="num">${f.spentMonths ? esc(f.spentMonths) : '__'}</span> months into this already, and you're still where you started`
        : gap('what it has cost them so far');

    s += beat(
      '19:00–22:00',
      'Past pain',
      `<div class="say"><p>"What have you already tried to fix this?" <i>(they'll say: ${v(f.tried, "what they've tried")})</i></p>
      <p>"How long did that run, and what did it cost you?"</p>
      <p>"Why do you think it didn't solve it?"</p>
      <p>"So if I've got this right, ${spentLine}. <b>Is that fair?</b>"</p></div>
      <p class="do"><b>Blame the tool, never the person.</b> "You didn't fail - Excel and WhatsApp were never built to run a practice. Anyone would have hit the same wall."</p>`,
    );

    const stackSay =
      rows
        .filter((row) => row.name.trim())
        .map(
          (row) =>
            `<p>• <b>${esc(row.name)}</b> - ${row.does ? esc(row.does) : gap('what it does for them')}${
              row.val ? ` &nbsp;<i>(on its own, ${esc(inr(parseFloat(row.val)))})</i>` : ''
            }</p>`,
        )
        .join('') || `<p>${gap('build your stack in the panel on the left')}</p>`;

    s += beat(
      '22:00–34:00',
      'Live demo &amp; the offer',
      `<div class="say"><p>"Let me show you three things - only the ones that matter for what you just told me." <i>(share screen - Meera's demo practice)</i></p>
      <p>${v(f.demoShow, 'the three screens, mapped to their pain')}</p>
      <p><i>(after each screen:)</i> "Would that have saved you time last week?" - get a yes on every one.</p>
      <p>"So here's what I'd do if this were my practice. <b>You're not buying an app - you're buying ${buying}.</b></p>
      <p>A few months from now, <b>${v(f.dream, 'the after-state')}</b>. That's what gets you ${v(f.goalWhy, 'their 12-month answer')} so you can ${v(f.personal, 'their personal reason')}.</p>
      ${r.ok && r.monthlyGain > 0 ? `<p>By your own numbers, that's <b>${gainM} a month</b> back - ${round(r.hoursSavedMonth, 0)} hours${r.keptClients > 0 ? ` and ${round(r.keptClients, 1)} clients` : ''} you aren't getting today.</p>` : ''}
      <p>${v(f.proofClient, 'proof dietitian and their result')}.</p>
      <p>Here's what you get:</p>${stackSay}
      <p>You'll have <b>${v(f.firstWin, 'first win')}</b> within <b>${days} days</b>. All we need from you: ${v(f.effort, 'what you need from them')}. We do the rest.</p>
      ${total > 0 ? `<p>Bought separately, that's about <span class="num">${esc(inr(total))}</span>.</p>` : ''}
      <p>NUSI ${esc(plan.name)} is <b>${esc(planPrice)}</b> - built for ${esc(plan.fits)}. And it starts with <b>14 days free, no card</b>: ${v(f.guarantee, 'your promise')}."</p></div>
      <div class="callout">↓ NOW STOP TALKING. Count to ten. The first person to speak loses. ↓</div>`,
    );

    s += beat(
      '34:00–40:00',
      'Handle concerns',
      `<p class="do">Every objection is money, time, belief or trust in disguise. Acknowledge it, compare it to a bigger cost, then <b>ask again</b> - every handle ends in a question. Full scripts are on the <b>Objections</b> tab.</p>`,
    );

    s += beat(
      '40:00–45:00',
      'Close - set them up on the call',
      `<div class="say"><p>"Perfect. Let's set up your practice right now while we're both here - it takes five minutes. Open <b>nusi.in/auth</b> and click <b>Create workspace</b>. I'll walk you through it."</p>
      <p>"Pick ${esc(plan.name)} - you won't be charged for 14 days. Name it ${v(f.theirco, 'their practice name')}… add your logo… done."</p>
      ${f.bonus ? `<p>"And because you're starting today: ${esc(f.bonus)}${f.holdUntil ? ` - that holds until ${esc(f.holdUntil)}` : ''}."</p>` : ''}
      <p>"Now add one real client with me - you'll see the app they get." <i>(first win, live)</i></p>
      <p>"Around day four it'll feel like extra work before it feels like less. That's normal - it's exactly when your templates are being built. We'll check in on day three."</p>
      <p>"Let's book your onboarding call in both our calendars now."</p></div>
      <p class="do"><b>A promise to sign up is not a sale.</b> Stay on until their workspace is live and one client is added. Then mark the lead <b>Won</b> in Leads.</p>`,
    );

    /* --------------------------------------------------------- objections */
    const gainLine = gainM ? `<span class="num">${esc(gainM)}</span>` : gap('their monthly gain');
    const cards: Array<[string, string]> = [
      [
        '“It’s too expensive.”',
        `<p>"Fair - it should feel like real money, or you wouldn't take it seriously. Is it more than you have, or more than you want to spend on this right now?" <i>(wait)</i></p>
        <p>"${esc(plan.name)} works out to about <b>${esc(perDay)} a day</b>. By your own numbers - not mine - it gives you back ${gainLine} a month. <b>Which one is actually costing you more: the plan, or another year of the same week?</b>"</p>
        ${r.multiple !== null ? `<p>"It pays for itself about <b>${round(r.multiple, 1)} times over</b> - in ${r.paybackDays! < 1 ? 'under a day' : `${round(r.paybackDays!, 0)} days`} a month."</p>` : ''}`,
      ],
      [
        '“WhatsApp and Excel work fine for me.”',
        `<p>"They do - because you work evenings to make them work. You told me last week looked like: ${v(f.weekNow, 'their week outside sessions')}.</p>
        <p>WhatsApp is free because the cost is your time. <b>Is that the price you want to keep paying?</b>"</p>`,
      ],
      [
        '“My clients won’t use another app.”',
        `<p>"Completely fair worry. Two things: it's free for them, and it's <b>your</b> app - your name and logo, not ours. Logging a meal is one photo.</p>
        <p>And the clients who won't use anything are the ones already drifting off - you told me ${f.dropoffs ? esc(f.dropoffs) : gap('N')} a month. The app is how you notice them before they go. <b>Want to try it with your five most engaged clients first?</b>"</p>`,
      ],
      [
        '“I’m not technical / I don’t have time to set it up.”',
        `<p>"You don't have to be. We set it up with you: ${v(f.effort, 'what you need from them')}. That's the whole ask.</p>
        <p>We just did the hardest part together on this call. <b>Shall we finish it now?</b>"</p>`,
      ],
      [
        '“I’ll try the free trial on my own later.”',
        `<p>"You can - but here's what I've seen: people who start alone open it once, get busy, and the trial ends before they've added a client. People who start with us are live in ${days} days.</p>
        <p>It's the same 14 days free either way. <b>Why not spend them with help?</b>"</p>`,
      ],
      [
        '“I need to think about it.”',
        `<p>"Of course. <b>What specifically do you want to think about?</b></p>
        <p>Usually it's one of three: whether it'll work, whether it'll work <i>for you</i>, or the money. Which one is it?" <i>(answer it - then:)</i></p>
        <p>"If we clear that up now, <b>is anything else stopping you from starting the free trial today?</b>"</p>`,
      ],
      [
        '“Can you do it cheaper?”',
        `<p>"I can't change the price, but I can change the plan.</p>
        ${lower ? `<p>${esc(PLANS[lower].name)} is ${esc(inr(PLANS[lower].monthly))} a month - built for ${esc(PLANS[lower].fits)}. You can move up any time without losing anything.</p>` : ''}
        <p>Or pay yearly: ${esc(inr(plan.annual))} instead of ${esc(inr(plan.monthly * 12))} - two months free. <b>Which works better for you?</b>"</p>
        <p class="do" style="margin-top:6px"><b>Never discount.</b> A discount tells them the first price was made up.</p>`,
      ],
      [
        '“What about my clients’ data?”',
        `<p>"Good question - you should ask everyone that. Your clients' data stays yours: it's encrypted, only your practice can see it, and you can ask for a full export or deletion at any time.</p>
        <p>Honestly, it's safer than health details sitting in your WhatsApp chats today. <b>Does that answer it?</b>"</p>`,
      ],
      [
        'It’s a genuine no.',
        `<p>"That's completely fine - I'd rather tell you it isn't the right fit than take your money. Here's what I'd do in your position instead: ${gap('give them something real')}."</p>
        <p class="do" style="margin-top:6px">Mark the lead <b>Nurturing</b> or <b>Lost</b> in Leads. Detachment isn't a tactic - it's why the tactics work.</p>`,
      ],
    ];
    const obj = cards.map(([h, body]) => `<div class="ocard"><h4>${h}</h4><div class="say">${body}</div></div>`).join('');

    /* ----------------------------------------------------------- proposal */
    const listRows = rows.filter((row) => row.name.trim());
    let p = '<div class="prop">';
    p += `<h2>NUSI ${esc(plan.name)} for ${v(f.theirco, 'their practice')}</h2>`;
    p += `<div class="for">Prepared for ${v(f.them, 'their name')}${f.city ? ` &middot; ${esc(f.city)}` : ''}</div>`;

    p += '<h3>What you are actually buying</h3>';
    p += `<p class="lede">Not an app - <b>${buying}</b>.</p>`;
    p += `<p>In your words: ${v(f.goalWhy, 'their 12-month answer')}</p>`;

    p += '<h3>The diagnosis</h3>';
    p += `<p class="lede">Your constraint isn't ${v(f.surface, 'the surface problem')}. It's this - <b>${v(f.real, 'the real constraint')}</b>.</p>`;
    p += `<p>The evidence: ${v(f.proof, "proof it isn't the surface problem")}.</p>`;

    if (r.ok) {
      p += '<h3>In your own numbers</h3>';
      p += `<div class="tblwrap"><table><thead><tr><th></th><th class="n">Today</th><th class="n">With NUSI</th></tr></thead><tbody>
        <tr><td>Hours a week on admin</td><td class="n">${esc(f.adminHours)}</td><td class="n">${round((parseFloat(f.adminHours) || 0) * (1 - (parseFloat(f.savePct) || 0) / 100), 1)}</td></tr>
        <tr><td>Hours back a month</td><td class="n">-</td><td class="n">${round(r.hoursSavedMonth, 0)}</td></tr>
        <tr><td>Clients who stop each month</td><td class="n">${f.dropoffs ? esc(f.dropoffs) : '-'}</td><td class="n">${f.dropoffs ? round((parseFloat(f.dropoffs) || 0) - r.keptClients, 1) : '-'}</td></tr>
        <tr><td>Value of the hours back</td><td class="n">-</td><td class="n">${inr(r.timeValue)}</td></tr>
        <tr><td>Value of the clients kept</td><td class="n">-</td><td class="n">${inr(r.retentionValue)}</td></tr>
      </tbody><tfoot><tr><td colspan="2">Gain every month, against ${esc(inr(r.planMonthly))} for the plan</td><td class="n">${inr(r.monthlyGain)}</td></tr></tfoot></table></div>`;
    }

    p += "<h3>The outcome you're buying</h3>";
    p += `<p class="lede">${v(f.dream, 'the after-state')}${f.revNow || f.revGoal ? ` - taking the practice from ${m(f.revNow, 'INR', 'now')} to ${m(f.revGoal, 'INR', 'target')} a month by ${v(f.deadline, 'deadline')}` : ''}.</p>`;
    p += `<p>${v(f.proofClient, 'proof dietitian and their result')}</p>`;

    p += "<h3>What's included</h3>";
    if (listRows.length) {
      p += '<div class="tblwrap"><table><thead><tr><th>Component</th><th>What it does for you</th><th class="n">Standalone value</th></tr></thead><tbody>';
      listRows.forEach((row) => {
        p += `<tr><td><b>${esc(row.name)}</b></td><td>${row.does ? esc(row.does) : '<span class="empty">-</span>'}</td><td class="n">${row.val ? inr(parseFloat(row.val)) : '-'}</td></tr>`;
      });
      p += `</tbody><tfoot><tr><td colspan="2">Total if bought separately</td><td class="n">${total > 0 ? inr(total) : '-'}</td></tr></tfoot></table></div>`;
    } else {
      p += '<p class="empty">Add your stack lines on the left and they will appear here.</p>';
    }

    p += '<h3>Timeline &amp; what we need from you</h3>';
    p += `<p><b>${v(f.firstWin, 'first tangible win')}</b> within <b>${days} days</b> of starting.</p>`;
    p += `<p>Everything required from your side: ${v(f.effort, 'what you need from them')}. We handle the rest.</p>`;

    p += `<h3>Our promise</h3><p>${v(f.guarantee, 'your promise')}</p>`;

    p += '<h3>Investment</h3>';
    p += `<div class="invest">
      <div class="box hero"><span>NUSI ${esc(plan.name)}</span><b>${esc(inr(annual ? plan.annual : plan.monthly))}</b><em>${annual ? 'a year - two months free' : 'a month'} · first 14 days free, no card</em></div>
      <div class="box"><span>One-time setup</span><b>${esc(inr(plan.setup))}</b><em>${f.bonus ? esc(f.bonus) : 'account setup, branding, client import, training'}</em></div>
      ${r.multiple !== null ? `<div class="box value"><span>Pays for itself</span><b>${round(r.multiple, 1)}×</b><em>every month, from your own numbers</em></div>` : ''}
    </div>`;

    p += '<h3>Next step</h3>';
    p += `<p>Create your workspace at <b>nusi.in</b> - it takes five minutes and your 14 days start today.${f.bonus && f.holdUntil ? ` The start-today bonus holds until <b>${esc(f.holdUntil)}</b>.` : ''}</p>`;
    p += `<div class="sig">${v(f.you, 'your name')} &middot; NUSI by Sirah Digital</div></div>`;

    return [
      { id: 'script', label: 'Call script', html: s },
      { id: 'goal', label: 'End goal', html: endGoalReference() },
      { id: 'obj', label: 'Objections', html: obj },
      { id: 'prop', label: 'Proposal', html: p },
    ];
  }, [f, rows]);

  return (
    <ToolShell
      eyebrow="Diagnose · Demo · Close"
      title="NUSI demo call SOP"
      css={CSS}
      sections={SECTIONS}
      tabs={tabs}
      copyScriptTab="script"
      copyProposalTab="prop"
      state={state}
      renderReadout={(fields) => <RoiReadout fields={fields} />}
      backHref="/admin/leads"
      backLabel="← Leads"
    />
  );
}
