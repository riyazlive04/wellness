/**
 * Sales stages for landing-page leads, and the WhatsApp message a lead gets
 * when the team moves them into a stage.
 *
 * Messages only go on a FORWARD move (New → Contacted → Demo done → Won), plus
 * Lost from any stage, and each at most once per lead — so an accidental drag
 * backwards, or back-and-forth, never messages the lead twice.
 */

export const LEAD_STAGES = ['new', 'contacted', 'demo_done', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Position in the pipeline; Lost sits outside the forward order. */
const ORDER: Record<LeadStage, number> = { new: 0, contacted: 1, demo_done: 2, won: 3, lost: 99 };

export function isLeadStage(v: string): v is LeadStage {
  return (LEAD_STAGES as readonly string[]).includes(v);
}

/** Should moving from `from` to `to` send that stage's message? */
export function isForwardMove(from: string, to: LeadStage): boolean {
  if (to === 'new') return false;
  if (to === 'lost') return from !== 'lost';
  const fromOrder = isLeadStage(from) ? ORDER[from] : 0;
  return from !== 'lost' && ORDER[to] > fromOrder;
}

export function stageMessage(stage: LeadStage, name: string): string | null {
  switch (stage) {
    case 'contacted':
      return [
        `Hi ${name}! 😊`,
        '',
        "It was lovely speaking with you. As discussed, we'll set up your personalized NUSI demo — you'll see how to manage clients, diet plans, food diaries and follow-ups, all in one place.",
        '',
        "If a particular day or time suits you better, just reply here and we'll arrange it.",
        '',
        '- Team NUSI',
      ].join('\n');
    case 'demo_done':
      return [
        `Hi ${name}! 🌿`,
        '',
        'Thank you for joining the NUSI demo today. We hope you could picture your practice running on it!',
        '',
        'You can start your 14-day free trial anytime here: https://nusi.in',
        '',
        'Our team is happy to help you set up your workspace and move your existing clients across — just reply to this message.',
        '',
        '- Team NUSI',
      ].join('\n');
    case 'won':
      return [
        `Welcome to NUSI, ${name}! 🎉`,
        '',
        "We're delighted to have you on board. Your practice is now set up to run smoothly — clients, programs, food diaries and follow-ups in one place.",
        '',
        "If you need anything at all while getting started, reply here and we'll help right away.",
        '',
        '- Team NUSI',
      ].join('\n');
    case 'lost':
      return [
        `Hi ${name},`,
        '',
        'Thank you for taking the time to explore NUSI. We understand it may not be the right fit just now.',
        '',
        "If anything changes, or you'd like another look later, simply reply to this message — we'll be glad to help. Wishing you and your practice all the best! 🌿",
        '',
        '- Team NUSI',
      ].join('\n');
    default:
      return null;
  }
}
