import type { PromptIntent } from '../types';

/**
 * Four pre-canned intents covering the most useful AI Assistant calls:
 * "how is X doing", "who's at risk", "draft a program", "summarize this week".
 *
 * Each intent has matcher phrases so free-text queries also resolve to the
 * right structured response.
 */
export const INTENTS: PromptIntent[] = [
  // ─── 1. Client snapshot ──────────────────────────────────────────────
  {
    id: 'client_snapshot',
    match: ['how is priya', 'priya doing', 'check on priya', 'snapshot priya'],
    prompt: 'How is Priya doing this week?',
    label: 'Client snapshot',
    description: "Pull up a client's adherence, momentum, and next step.",
    icon: 'user',
    response: {
      text:
        "Priya's having a steady week. Adherence's up to 92% and she's hit her protein target six out of seven days. Sleep window is the lever still wobbling - three nights ended past 11 PM. Here's the full picture:",
      blocks: [
        {
          kind: 'snapshot',
          title: 'Priya Sharma',
          subtitle: 'PCOS Reset · Week 3 of 12',
          stats: [
            { label: 'Adherence',    value: '92%',  delta: '+6%', tone: 'sage' },
            { label: 'Sleep avg',    value: '7.1h', delta: '−12m', tone: 'amber' },
            { label: 'Streak',       value: '14d',  tone: 'indigo' },
            { label: 'Last logged',  value: '12m ago', tone: 'sage' },
          ],
          cta: { label: 'Open profile', intent: 'open_client', target: 'c_priya' },
        },
        {
          kind: 'recommendation',
          headline: 'Recommended next nudge',
          body:
            'Reinforce the 8 PM dinner habit - she\'s lost it the last 3 nights and it\'s correlated with her morning energy dips. A single voice note tonight will land better than a written reminder.',
        },
      ],
      suggestions: [
        'Draft a voice-note script for her',
        'Show me her last 7 days of meal logs',
        'Compare her to other PCOS clients',
      ],
    },
  },

  // ─── 2. At-risk clients ──────────────────────────────────────────────
  {
    id: 'at_risk',
    match: ['at risk', 'attention', 'silent', 'need check in', 'check in clients'],
    prompt: 'Which clients need attention right now?',
    label: 'Who needs attention',
    description: 'See at-risk clients and the smallest helpful next step for each.',
    icon: 'alert',
    response: {
      text:
        "Three clients are sliding. They don't all need the same thing - here's how I'd handle each:",
      blocks: [
        {
          kind: 'list',
          title: 'Needs attention this week',
          items: [
            {
              title: 'Tanvi Kapoor',
              subtitle: 'Silent 5 days · Endurance · Adherence 38% (↓ 30)',
              tone: 'rose',
              badge: 'Urgent',
              href: '/clients/c_tanvi',
            },
            {
              title: 'Rohan Mehta',
              subtitle: 'Disengaged after travel · Weight Loss W6 · Adherence 48%',
              tone: 'amber',
              badge: 'Re-engage',
              href: '/clients/c_rohan',
            },
            {
              title: 'Arjun Reddy',
              subtitle: 'Paused 12d ago · Gut Health · No recent contact',
              tone: 'amber',
              badge: 'Touchpoint',
              href: '/clients/c_arjun',
            },
          ],
        },
        {
          kind: 'recommendation',
          headline: "Don't pile on tasks",
          body:
            'Each of these clients needs something small. For Tanvi, schedule the urgent video call you have Thursday. For Rohan, his Wednesday call is the moment. For Arjun, a low-pressure "still thinking of you" note this evening.',
          cta: { label: 'Open messaging drafts', intent: 'open_messaging' },
        },
      ],
      suggestions: [
        'Draft a check-in for Tanvi',
        'What\'s the common pattern with my at-risk clients?',
        'Move Tanvi to a lighter program',
      ],
    },
  },

  // ─── 3. Draft a program ──────────────────────────────────────────────
  {
    id: 'draft_program',
    match: ['draft', 'create program', 'new program', 'pcos program', '4 week'],
    prompt: 'Draft a 4-week PCOS reset for a new client',
    label: 'Draft a program',
    description: 'Generate a starting curriculum tuned to a specialization.',
    icon: 'sparkles',
    response: {
      text:
        "Here's a 4-week starting curriculum tuned for PCOS - assumes a working-professional client, not in cycle disruption. Every week is editable.",
      blocks: [
        {
          kind: 'program',
          name: 'PCOS Reset · 4 Weeks',
          duration: '4 weeks',
          specialization: 'PCOD / PCOS',
          goals: ['Insulin stabilization', 'Sleep regulation', 'Habit foundation'],
          weeks: [
            {
              week: 1,
              theme: 'Foundations',
              highlights: ['Daily hydration log', 'Protein-first breakfast', 'Sleep window 22:30-06:30'],
            },
            {
              week: 2,
              theme: 'Glucose stability',
              highlights: ['Identify hidden sugars', 'Walk after every meal', 'Cycle tracking begins'],
            },
            {
              week: 3,
              theme: 'Strength + recovery',
              highlights: ['2 resistance sessions', 'Magnesium-rich evening meals', 'Stress journal'],
            },
            {
              week: 4,
              theme: 'Reflection & next phase',
              highlights: ['Self-rated mood + energy', 'Bloodwork suggested', 'Plan Phase-2 with coach'],
            },
          ],
          cta: { label: 'Save as program template', intent: 'save_template' },
        },
        {
          kind: 'recommendation',
          headline: 'Tweaks I\'d consider',
          body:
            'Drop hydration tracking if the client already does it well - replace with caffeine timing. If she has a hormonal IUD or PCOS-PMS overlap, add Week 0 (cycle observation only) and shift Phase-2 down.',
        },
      ],
      suggestions: [
        'Show me a 12-week version',
        'Make it more conservative on strength training',
        'Adapt this for a thyroid client',
      ],
    },
  },

  // ─── 4. Weekly digest ────────────────────────────────────────────────
  {
    id: 'weekly_digest',
    match: ['this week', 'summary', 'digest', 'summarize', 'how is the practice'],
    prompt: 'Summarize this week for me',
    label: 'Weekly digest',
    description: 'The story of your workspace in five bullets and one recommendation.',
    icon: 'chart',
    response: {
      text:
        'Quick read on the week - momentum is up, three clients are pulling the average forward, and one needs a careful re-engagement.',
      blocks: [
        {
          kind: 'snapshot',
          title: 'This week vs last',
          stats: [
            { label: 'Active clients', value: '12',  delta: '+3',   tone: 'sage' },
            { label: 'AI calls',       value: '1,284', delta: '+18%', tone: 'indigo' },
            { label: 'Adherence',      value: '86%', delta: '+2%',  tone: 'sage' },
            { label: 'New invites',    value: '2',   delta: '+1',   tone: 'indigo' },
          ],
        },
        {
          kind: 'list',
          title: 'Highlights',
          items: [
            { title: 'Karan hit a 80kg deadlift PR',         subtitle: 'Muscle Gain · W5 - celebrated 22✕ in community',           tone: 'sage' },
            { title: 'Aanya logged 6 of 7 days perfectly',   subtitle: 'Diabetes Care · W2 - fasting glucose down 12%',           tone: 'sage' },
            { title: 'PCOS group session has 4 confirmed',   subtitle: 'Friday 11 AM - moderation prep needed by Thursday eve',   tone: 'indigo' },
            { title: 'Tanvi went quiet for 5 days',          subtitle: 'Endurance · adherence dropped 30pts - Thursday call set', tone: 'rose' },
          ],
        },
        {
          kind: 'recommendation',
          headline: 'One thing to do this weekend',
          body:
            'Spend 10 minutes drafting the PCOS group session talking points. Four attendees means four different stages of the journey - your prep matters more than the slide deck.',
          cta: { label: 'Open Friday\'s appointment', intent: 'view_full', target: 'a_group_session' },
        },
      ],
      suggestions: [
        'What\'s slowing me down most?',
        'Draft the group session outline',
        'Compare this month to last month',
      ],
    },
  },
];

export const FALLBACK_INTENT: PromptIntent['response'] = {
  text:
    "I'm best at workspace-aware tasks right now - client check-ins, drafting programs, weekly summaries, and surfacing who needs attention. Want me to pick one of those?",
  suggestions: INTENTS.map((i) => i.prompt),
};

export function resolveIntent(query: string): PromptIntent | null {
  const q = query.toLowerCase().trim();
  return (
    INTENTS.find((intent) => intent.match.some((m) => q.includes(m))) ?? null
  );
}
