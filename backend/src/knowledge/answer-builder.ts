/**
 * Deterministic answer assembly — no language model anywhere in this file.
 *
 * Every reply is either a figure read out of the database or a passage quoted
 * verbatim from an indexed document. Nothing is paraphrased, because there is
 * nothing doing the paraphrasing: the wording below is fixed, and the only
 * variable parts are the values substituted into it.
 *
 * That constraint is the point. A generated sentence can be fluent and wrong;
 * these cannot be wrong about anything the database is right about.
 */

/** One of the fixed shapes an answer can take, matched from the question. */
type LiveIntent =
  | 'attention'
  | 'appointments_today'
  | 'clients_active'
  | 'clients_onboarding'
  | 'reviews_pending'
  | 'programs'
  | 'recipes'
  | 'overview';

const LIVE_PATTERNS: Array<[LiveIntent, RegExp]> = [
  // Order matters: the first match wins, so narrow phrasings sit above the
  // broad "my day" catch-all that would otherwise swallow them.
  ['attention', /need(s|ing)? attention|at risk|falling behind|not logg|haven'?t logg|has(n'?t| not) logg|stopped logg|inactive client|gone quiet|slipping/i],
  ['appointments_today', /appointment|consultation|schedul|calendar|booked|who am i seeing|my day/i],
  ['clients_onboarding', /onboard/i],
  ['clients_active', /how many (active )?clients|client count|number of clients|active clients/i],
  ['reviews_pending', /review/i],
  ['programs', /program|template|draft/i],
  ['recipes', /recipe/i],
  ['overview', /what'?s on my plate|my plate today|overview|summary|how('s| is) my practice|where do (i|we) stand/i],
];

/** Sub-questions about one named client, so the answer can lead with the fact asked for. */
type ClientFacet =
  | 'logging' | 'program' | 'allergies' | 'appointments'
  | 'measurements' | 'target' | 'reviews' | 'all';

const FACET_PATTERNS: Array<[ClientFacet, RegExp]> = [
  ['logging', /logg|meal|eaten|eating|adheren|complian|tracking/i],
  ['program', /program|plan|protocol|how far|progress/i],
  ['allergies', /allerg|condition|medical|intoleran|avoid/i],
  ['appointments', /appointment|consultation|next see|schedul|booked/i],
  ['measurements', /waist|hip|chest|arm|thigh|measurement|inches|circumference/i],
  ['target', /target|calorie|kcal|goal/i],
  ['reviews', /review|pending|waiting/i],
];

/**
 * Questions the snapshot cannot answer however well the keywords match.
 *
 * "Which program has the best adherence?" contains "program", and without this
 * guard the router happily answered it with a program *count* - a confident
 * reply to a question nobody asked. Every figure here is a reading of right
 * now, so anything asking to rank, compare or trend has no data behind it.
 */
const UNANSWERABLE = /\bbest\b|\bworst\b|\bmost\b|\bleast\b|\btop\b|rank(ing|ed)?\b|compare|comparison|versus|\bvs\b|trend|over time|last (month|week|year)|this month vs|busier|growth|improv(ing|ed)|adherence rate|average across|which (one|of my|program|client).*(best|worst|most|least|highest|lowest)/i;

/**
 * True when the question asks for a ranking, comparison or trend.
 *
 * Nothing in the corpus or the snapshot can answer one, so a passage that
 * merely shares vocabulary is not an answer - "how does billing work" is not a
 * reply to "how much revenue did I make this month". The caller raises its
 * evidence bar rather than presenting a near-miss as though it answered.
 */
export function asksForComparison(question: string): boolean {
  return UNANSWERABLE.test(question);
}

export function detectLiveIntent(question: string): LiveIntent | null {
  if (UNANSWERABLE.test(question)) return null;
  for (const [intent, re] of LIVE_PATTERNS) if (re.test(question)) return intent;
  return null;
}

export function detectFacet(question: string): ClientFacet {
  for (const [facet, re] of FACET_PATTERNS) if (re.test(question)) return facet;
  return 'all';
}

// ── formatting helpers ───────────────────────────────────────────────

/** "17 July 2026", or null when there is no date to show. */
function d(value: unknown): string | null {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function dt(value: unknown): string | null {
  if (!value) return null;
  const x = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(x.getTime())) return null;
  return `${d(x)} at ${x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

function daysSince(value: unknown): number | null {
  if (!value) return null;
  const x = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(x.getTime())) return null;
  return Math.floor((Date.now() - x.getTime()) / 86_400_000);
}

/** Never print a bare `null` at a clinician. */
function val(v: unknown, suffix = ''): string {
  if (v === null || v === undefined || v === '') return 'not set';
  // Free-text fields hold "No" / "None" / "nil" where the intake form was
  // answered in the negative. Printing "Conditions: No" reads as a reply to a
  // different question.
  if (typeof v === 'string' && /^(no|none|nil|n\/a|na)\.?$/i.test(v.trim())) return 'none recorded';
  return `${v}${suffix}`;
}

function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const get = (o: unknown, k: string): unknown =>
  o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;

// ── workspace figures ────────────────────────────────────────────────

/**
 * Answer a live intent from the workspace snapshot, or null when the snapshot
 * has nothing for it — in which case the caller falls back to documents rather
 * than printing a confident zero.
 */
export function buildLiveAnswer(intent: LiveIntent, data: Record<string, unknown>): string | null {
  switch (intent) {
    case 'attention': {
      const rows = (data.clients_needing_attention as Array<Record<string, unknown>>) ?? [];
      if (!rows.length) return 'No clients need attention — everyone has logged recently.';
      const lines = rows.map((r) => {
        const last = r.last_logged;
        const since = daysSince(last);
        return last
          ? `• ${r.client} — last logged ${d(last)}${since === null ? '' : ` (${plural(since, 'day')} ago)`}`
          : `• ${r.client} — has never logged`;
      });
      // The list is capped upstream, so say so rather than letting ten look
      // like the whole picture.
      const total = num(data.clients_needing_attention_total) || rows.length;
      const shown = total > rows.length ? `\n\nShowing the ${rows.length} longest without a log.` : '';
      return `${plural(total, 'client needs', 'clients need')} attention:\n\n${lines.join('\n')}${shown}`;
    }

    case 'appointments_today': {
      const rows = (data.appointments_today as Array<Record<string, unknown>>) ?? [];
      if (!rows.length) return 'You have no appointments scheduled today.';
      const lines = rows.map((r) => {
        const when = r.at instanceof Date ? r.at : new Date(String(r.at));
        const time = Number.isNaN(when.getTime())
          ? '' : when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return `• ${time} — ${r.client ?? 'unnamed client'}${r.kind ? ` (${r.kind}` : ''}${r.mode ? `, ${r.mode})` : r.kind ? ')' : ''}`;
      });
      const total = num(data.appointments_today_count) || rows.length;
      const shown = total > rows.length ? `\n\nShowing the first ${rows.length}.` : '';
      return `${plural(total, 'appointment')} today:\n\n${lines.join('\n')}${shown}`;
    }

    case 'clients_active':
      return `You have ${plural(num(get(data.clients, 'active')), 'active client')}.`;

    case 'clients_onboarding': {
      const n = num(get(data.clients, 'onboarding'));
      return n === 0
        ? 'No clients are still onboarding.'
        : `${plural(n, 'client is', 'clients are')} still onboarding.`;
    }

    case 'reviews_pending': {
      const n = num(data.pending_reviews);
      return n === 0
        ? 'Nothing is waiting for your review.'
        : `${plural(n, 'review is', 'reviews are')} waiting for you.`;
    }

    case 'programs': {
      const p = data.programs;
      if (!p) return null;
      return `You have ${plural(num(get(p, 'total')), 'program')} — ${num(get(p, 'published'))} published and ${num(get(p, 'draft'))} still in draft.`;
    }

    case 'recipes':
      return `You have ${plural(num(data.recipes_published), 'published recipe')}.`;

    case 'overview': {
      const appts = num(data.appointments_today_count) ||
        ((data.appointments_today as unknown[])?.length ?? 0);
      const attention = num(data.clients_needing_attention_total) ||
        ((data.clients_needing_attention as unknown[])?.length ?? 0);
      return [
        'Your practice right now:',
        '',
        `• ${plural(appts, 'appointment')} today`,
        `• ${plural(num(get(data.clients, 'active')), 'active client')}`,
        `• ${plural(num(data.pending_reviews), 'review')} waiting for you`,
        `• ${plural(attention, 'client needs', 'clients need')} attention`,
      ].join('\n');
    }

    default:
      return null;
  }
}

// ── one client ───────────────────────────────────────────────────────

/**
 * A client's record, led by whichever fact the question asked for.
 *
 * The full card follows the focused line rather than replacing it: a
 * nutritionist asking about allergies still benefits from seeing that the
 * client stopped logging three weeks ago.
 */
export function buildClientAnswer(
  name: string,
  data: Record<string, unknown>,
  facet: ClientFacet,
): string {
  const profile = (data.profile ?? {}) as Record<string, unknown>;
  const log = (data.logging_14d ?? {}) as Record<string, unknown>;
  const programs = (data.programs as Array<Record<string, unknown>>) ?? [];
  const measures = (data.measurements_latest_two as Array<Record<string, unknown>>) ?? [];
  const appts = (data.appointments_nearest as Array<Record<string, unknown>>) ?? [];

  const lines: string[] = [];
  const focus: string[] = [];

  // — focused answer —
  if (facet === 'logging') {
    const days = num(log.days_logged_of_14);
    const last = log.last_log_ever;
    focus.push(
      days === 0
        ? `${name} has not logged a meal in the last 14 days.`
        : `${name} logged on ${plural(days, 'day')} of the last 14 (${plural(num(log.meals), 'meal')}).`,
      last ? `Last log: ${d(last)}${daysSince(last) === null ? '' : ` — ${plural(daysSince(last)!, 'day')} ago.`}` : 'No meal has ever been logged.',
    );
  } else if (facet === 'allergies') {
    focus.push(
      `Allergies: ${val(profile.allergies)}`,
      `Medical conditions: ${val(profile.medical_conditions)}`,
    );
  } else if (facet === 'target') {
    focus.push(`${name}'s calorie target: ${val(profile.target_kcal, ' kcal')}`);
  } else if (facet === 'reviews') {
    const n = num(data.pending_reviews);
    focus.push(n === 0
      ? `Nothing from ${name} is waiting for your review.`
      : `${plural(n, 'item')} from ${name} ${n === 1 ? 'is' : 'are'} waiting for your review.`);
  } else if (facet === 'program') {
    if (!programs.length) focus.push(`${name} is not on a program.`);
    else focus.push(...programs.map(programLine));
  } else if (facet === 'appointments') {
    const future = appts.filter((a) => new Date(String(a.scheduled_at)).getTime() > Date.now());
    focus.push(future.length
      ? `Next appointment with ${name}: ${dt(future[0].scheduled_at)}${future[0].kind ? ` (${future[0].kind})` : ''}.`
      : `No upcoming appointment is scheduled with ${name}.`);
  } else if (facet === 'measurements') {
    focus.push(...measurementLines(name, measures));
  }

  if (focus.length) {
    // The focused answer stands on its own; repeating it inside a full card
    // below made every reply twice as long as the question deserved. What
    // follows is only the context that is useful whatever was asked.
    const days = num(log.days_logged_of_14);
    const active = programs.find((p) => String(p.status) === 'active');
    const context = [
      `${name} — ${val(profile.status)}`,
      `Logging: ${days} of the last 14 days` +
        (log.last_log_ever ? ` · last log ${d(log.last_log_ever)}` : ' · never logged'),
      active ? `Program: ${programLine(active)}` : 'Program: none active',
    ];
    return [focus.join('\n'), '', ...context].join('\n').trim();
  }

  // — full card —
  lines.push(`${name} — ${val(profile.status)}`);
  const bio = [
    profile.age ? `${profile.age}` : null,
    profile.gender ? String(profile.gender) : null,
    profile.height_cm ? `${profile.height_cm} cm` : null,
    profile.last_weight ? `${profile.last_weight} kg` : null,
  ].filter(Boolean);
  if (bio.length) lines.push(bio.join(' · '));
  if (profile.goals) lines.push(`Goal: ${profile.goals}`);

  lines.push('');
  const days = num(log.days_logged_of_14);
  lines.push(`Logging: ${days} of the last 14 days` +
    (log.last_log_ever ? ` · last log ${d(log.last_log_ever)}` : ' · never logged'));
  lines.push(`Program: ${programs.length ? programs.map(programLine).join(' | ') : 'none'}`);
  lines.push(`Allergies: ${val(profile.allergies)} · Conditions: ${val(profile.medical_conditions)}`);
  lines.push(`Calorie target: ${val(profile.target_kcal, ' kcal')}`);
  if (measures.length) lines.push(measurementLines(name, measures).join(' '));
  lines.push(`Pending reviews: ${num(data.pending_reviews)}`);

  return lines.join('\n').trim();
}

function programLine(p: Record<string, unknown>): string {
  const unit = String(p.duration_unit ?? 'weeks');
  const count = p.duration_count ?? p.duration_weeks;
  const span = count ? `${count} ${unit}` : null;
  const pct = p.progress_pct === null || p.progress_pct === undefined
    ? null : `${Math.round(Number(p.progress_pct))}% complete`;
  const dates = p.start_date ? `${d(p.start_date)}${p.end_date ? ` → ${d(p.end_date)}` : ''}` : null;
  return [`${p.name} (${p.status})`, pct, span, dates].filter(Boolean).join(', ');
}

/** Two readings become a direction; one becomes a single value. */
function measurementLines(name: string, rows: Array<Record<string, unknown>>): string[] {
  if (!rows.length) return [`No measurements recorded for ${name}.`];
  const [latest, previous] = rows;
  const keys: Array<[string, string]> = [
    ['waist_inches', 'Waist'], ['hip_inches', 'Hip'], ['chest_inches', 'Chest'],
    ['arm_inches', 'Arm'], ['thigh_inches', 'Thigh'],
  ];
  const parts: string[] = [];
  for (const [key, label] of keys) {
    const now = latest?.[key];
    if (now === null || now === undefined) continue;
    const before = previous?.[key];
    let move = '';
    if (before !== null && before !== undefined) {
      const delta = Number(now) - Number(before);
      move = delta === 0
        ? ' (unchanged)'
        : ` (${delta > 0 ? '+' : ''}${delta.toFixed(1)} since ${d(previous.recorded_at)})`;
    }
    parts.push(`${label} ${now} in${move}`);
  }
  if (!parts.length) return [`No measurements recorded for ${name}.`];
  return [`${parts.join(' · ')} — recorded ${d(latest.recorded_at)}.`];
}

// ── documents ────────────────────────────────────────────────────────

/**
 * Passages, quoted rather than summarised.
 *
 * The heading is shown above each one so the reader can see what they are
 * looking at, and the text is reproduced exactly as written — there is no
 * step here that could change its meaning.
 */
export function buildDocumentAnswer(
  hits: Array<{ title: string; heading: string | null; content: string }>,
): string {
  return hits
    .map((h, i) => `[${i + 1}] ${h.heading ?? h.title}\n\n${h.content.trim()}`)
    .join('\n\n———\n\n');
}

export const NO_MATCH_MESSAGE =
  'I could not find anything on that.\n\n' +
  'I answer from your indexed documents and your live workspace data. ' +
  'Try wording closer to how the guide puts it, or add a document covering it.';

// ── platform (super admin) ───────────────────────────────────────────

/**
 * The super admin asks about the platform, not about a practice.
 *
 * Kept deliberately narrow: these are the only figures the executive snapshot
 * carries, and a question outside them gets no answer rather than the nearest
 * number that happens to be loaded.
 */
type PlatformIntent =
  | 'workspaces' | 'revenue' | 'subscriptions' | 'platform_overview'
  | 'clients' | 'staff' | 'ai_usage' | 'top_workspaces';

const PLATFORM_PATTERNS: Array<[PlatformIntent, RegExp]> = [
  // Order is the whole correctness argument here. "How many clients across all
  // workspaces?" contains "workspaces", and with the broader pattern first it
  // was answered with a workspace count - a true number to a different
  // question. The narrower subject wins.
  ['top_workspaces', /which workspace|biggest|largest|most clients|top workspace|busiest workspace|rank/i],
  // "any errors in the last 24 hours?" never says "AI", so the paired form
  // missed it — errors and the 24-hour window are their own signals.
  ['ai_usage', /\bai\b.*(usage|cost|spend|call|error)|(usage|cost|spend|error).*\bai\b|gemini|token|model (cost|usage)|\berrors?\b|last 24 ?h(our)?s?/i],
  ['clients', /\bclients?\b|\bpatients?\b|end users/i],
  ['staff', /nutritionist|staff|team member|practitioner|dietit/i],
  ['revenue', /revenue|mrr|arr|earning|income|payment|billing|paid|churn/i],
  ['subscriptions', /subscription|subscriber|past due|overdue/i],
  ['workspaces', /workspace|tenant|practice|account|customer|sign ?up|trial/i],
  ['platform_overview', /overview|summary|how('s| is) the platform|how are we doing|status/i],
];

export function detectPlatformIntent(question: string): PlatformIntent | null {
  // Checked before the comparison guard: a workspace ranking is the one
  // comparison the platform snapshot can actually answer.
  if (PLATFORM_PATTERNS[0][1].test(question)) return 'top_workspaces';
  if (UNANSWERABLE.test(question)) return null;
  for (const [intent, re] of PLATFORM_PATTERNS) if (re.test(question)) return intent;
  return null;
}

export function buildPlatformAnswer(
  intent: PlatformIntent,
  data: Record<string, unknown>,
): string | null {
  const ws = data.workspaces;
  const rev = data.revenue;
  const subs = data.subscriptions;

  switch (intent) {
    case 'workspaces':
      if (!ws) return null;
      return [
        `${plural(num(get(ws, 'total')), 'workspace')} on the platform, ${num(get(ws, 'active'))} active.`,
        `${plural(num(get(ws, 'new_7d')), 'new workspace')} in the last 7 days.`,
        `${plural(num(get(ws, 'trials_expiring_7d')), 'trial')} expiring within 7 days.`,
      ].join('\n');

    case 'revenue':
      if (!rev) return null;
      return [
        `Revenue in the last 30 days: ₹${num(get(rev, 'last_30d_inr')).toLocaleString('en-IN')}.`,
        `${plural(num(get(rev, 'failed_payments_30d')), 'failed payment')} in the same period.`,
      ].join('\n');

    case 'subscriptions':
      if (!subs) return null;
      return [
        `MRR: ₹${num(get(subs, 'mrr_inr')).toLocaleString('en-IN')}.`,
        `${plural(num(get(subs, 'active')), 'active subscription')}, ${num(get(subs, 'past_due'))} past due.`,
      ].join('\n');

    case 'clients': {
      const cp = data.clients_platform;
      if (!cp) return null;
      return `${plural(num(get(cp, 'active')), 'active client')} across the platform, ` +
        `${num(get(cp, 'total'))} in total.`;
    }

    case 'staff': {
      if (!data.staff) return null;
      // "How many nutritionists?" deserves the nutritionist count, not a
      // headcount of everyone with a login.
      const byRole = get(data.staff, 'by_role') as Record<string, number> | undefined;
      const lines = [
        `${plural(num(get(data.staff, 'people')), 'person', 'people')} across ` +
          `${plural(num(get(data.staff, 'memberships')), 'workspace membership')}.`,
      ];
      if (byRole && Object.keys(byRole).length) {
        lines.push('', ...Object.entries(byRole)
          .sort((a, b) => b[1] - a[1])
          .map(([role, n]) => `• ${plural(num(n), role.replace(/_/g, ' '))}`));
      }
      return lines.join('\n');
    }

    case 'ai_usage': {
      const ai = data.ai_usage_24h;
      if (!ai) return null;
      return [
        `${plural(num(get(ai, 'calls')), 'AI call')} in the last 24 hours.`,
        `Cost: ₹${num(get(ai, 'cost_inr')).toLocaleString('en-IN')}.`,
        `${plural(num(get(ai, 'errors')), 'error')} in the same period.`,
      ].join('\n');
    }

    case 'top_workspaces': {
      const rows = (data.top_workspaces as Array<Record<string, unknown>>) ?? [];
      if (!rows.length) return null;
      return 'Workspaces by client count:\n\n' +
        rows.map((r) => `• ${r.name} — ${plural(num(r.clients), 'client')}`).join('\n');
    }

    case 'platform_overview':
      if (!ws && !rev && !subs) return null;
      return [
        'Platform right now:',
        '',
        ws ? `• ${plural(num(get(ws, 'active')), 'active workspace')} of ${num(get(ws, 'total'))}` : null,
        data.clients_platform ? `• ${plural(num(get(data.clients_platform, 'active')), 'active client')}` : null,
        subs ? `• MRR ₹${num(get(subs, 'mrr_inr')).toLocaleString('en-IN')} across ${plural(num(get(subs, 'active')), 'subscription')}` : null,
        rev ? `• ₹${num(get(rev, 'last_30d_inr')).toLocaleString('en-IN')} captured in 30 days` : null,
      ].filter(Boolean).join('\n');

    default:
      return null;
  }
}

/**
 * Capitalised words in a question that the corpus does not use.
 *
 * The first token is skipped because every question starts with a capital, and
 * single letters are ignored so "I" never counts. What remains is compared
 * against the product's own vocabulary: "Plate", "Vision", "Community" and
 * "Automation" all appear in the guide, so they are terms; "Priya" does not, so
 * it is a name.
 *
 * Using the corpus as the dictionary means this needs no list to maintain -
 * it learns the vocabulary from whatever has been indexed.
 */
export function unknownProperNouns(question: string, vocabulary: Set<string>): string[] {
  const tokens = question.split(/[^A-Za-z']+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const raw = tokens[i].replace(/'s$/i, '');
    if (!/^[A-Z][a-z]{2,}$/.test(raw)) continue;      // skips ALL-CAPS like NUSI
    if (vocabulary.has(raw.toLowerCase())) continue;
    out.push(raw);
  }
  return out;
}

/**
 * A super admin has no practice of their own, so a question about "my clients"
 * has no subject. Saying so beats returning a passage that merely shares
 * vocabulary, which is what happened before.
 */
export const NO_PRACTICE_MESSAGE =
  'You are signed in as a super admin, which is not attached to a workspace, ' +
  'so there is no client roster or appointment diary to report on.\n\n' +
  'I can answer about the platform as a whole — workspaces, clients, staff, ' +
  'subscriptions, revenue and AI usage — or about anything in the indexed documents.';

/** Nutritionist-shaped questions, which a super admin cannot have an answer to. */
export function asksAboutOwnPractice(question: string): boolean {
  return /\bmy (clients?|roster|appointments?|schedule|programs?|recipes?|reviews?|practice|day)\b|\bon my plate\b|waiting (on|for) me/i.test(question);
}
