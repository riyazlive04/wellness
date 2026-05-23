import type { MessageTemplate } from '../types';

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // Welcome
  {
    id: 't_welcome',
    category: 'welcome',
    title: 'Welcome — Day 1',
    body: 'Welcome aboard, {name}! I\'m really glad you\'re here. Over the next few weeks we\'re going to build small, steady habits — nothing dramatic. Start with logging today\'s meals, even imperfectly. We\'ll refine as we go.',
    variables: ['name'],
  },
  {
    id: 't_welcome_program',
    category: 'welcome',
    title: 'Program kickoff',
    body: 'Hey {name}, your {program} program starts today. The first week is all about awareness — log meals, log water, sleep how you sleep. We adjust from week 2. Reach out anytime.',
    variables: ['name', 'program'],
  },

  // Check-ins
  {
    id: 't_checkin_friendly',
    category: 'check_in',
    title: 'Friendly check-in (3 days quiet)',
    body: 'Hey {name} — haven\'t heard from you in a few days. No pressure to log anything, but I want to know you\'re okay. A "fine" emoji is enough 🌿',
    variables: ['name'],
  },
  {
    id: 't_checkin_urgent',
    category: 'check_in',
    title: 'Urgent check-in (5+ days silent)',
    body: 'Hey {name}, it\'s been a week. I\'m holding space — no judgement. Want me to pause your program, restructure it, or just send a voice note? Whatever feels easiest.',
    variables: ['name'],
  },

  // Milestones
  {
    id: 't_milestone_week',
    category: 'milestone',
    title: 'Weekly win',
    body: 'You completed week {week} of {program}, {name}. Compliance: {compliance}%. Reflecting on what felt easy vs hard helps us tune the next week — share one of each when you have a minute.',
    variables: ['name', 'program', 'week', 'compliance'],
  },
  {
    id: 't_milestone_streak',
    category: 'milestone',
    title: 'Streak celebration',
    body: '{name}, that\'s {streak} days of logging in a row. Habits this consistent are how transformations actually happen. Keep it up.',
    variables: ['name', 'streak'],
  },

  // Reminders
  {
    id: 't_reminder_hydration',
    category: 'reminder',
    title: 'Hydration nudge',
    body: '{name}, water intake\'s been low this week. Aim for 3L today — keep a bottle visible at your desk. Small lever, big effect.',
    variables: ['name'],
  },
  {
    id: 't_reminder_dinner',
    category: 'reminder',
    title: 'Earlier dinner reminder',
    body: 'Reminder: aim to finish dinner by 8pm tonight. The 12-hour fasting window is one of the biggest levers we have. You got this.',
    variables: [],
  },

  // Nudges
  {
    id: 't_nudge_walk',
    category: 'nudge',
    title: 'Post-meal walk',
    body: 'Quick reminder, {name}: a 10-min walk after lunch lowers glucose response significantly. Doesn\'t need to be a workout — just movement.',
    variables: ['name'],
  },
];
