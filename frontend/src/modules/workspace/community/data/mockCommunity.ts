import type { Cohort, Post, TrendingTag } from '../types';

const hr = 1000 * 60 * 60;
const day = hr * 24;
const now = Date.now();

function iso(offsetMs: number) {
  return new Date(now - offsetMs).toISOString();
}

export const MOCK_POSTS: Post[] = [
  // ─── Pinned owner announcement ──────────────────────────────────────
  {
    id: 'p_announce',
    author: { id: 'tm_owner', name: 'Dr. Sharma (You)', role: 'owner' },
    body:
      "Welcome to our weekly wellness circle 🌿 This Friday at 11 AM we're hosting a live PCOS Q&A - Priya, Aanya, and two new members will be there. Drop your questions below and I'll group them ahead of time.",
    hashtags: ['announcement', 'PCOS', 'liveSession'],
    reactions: { cheer: 12, strength: 4, love: 8, celebrate: 2 },
    reactedByMe: ['love'],
    commentCount: 6,
    comments: [
      { id: 'c1', author: { id: 'c_priya', name: 'Priya Sharma', role: 'client' }, body: 'Will be there! Want to ask about cycle-syncing the diet.', createdAt: iso(2 * hr) },
      { id: 'c2', author: { id: 'c_aanya', name: 'Aanya Iyer', role: 'client' }, body: 'Same here. Question on inflammation markers.', createdAt: iso(1.5 * hr) },
    ],
    createdAt: iso(4 * hr),
    pinned: true,
    cohort: 'All cohorts',
  },

  // ─── Priya — milestone with progress photo ──────────────────────────
  {
    id: 'p_priya_milestone',
    author: { id: 'c_priya', name: 'Priya Sharma', role: 'client' },
    body:
      "3 weeks in and I finally don't crash at 4 PM anymore 🌿 Energy is even, sleep is better, and I'm starting to like my routine. Thank you @Dr Sharma for the protein-first breakfast nudge - it changed everything.",
    hashtags: ['PCOS', 'week3', 'win'],
    imageUrl: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80',
    reactions: { cheer: 18, strength: 5, love: 22, celebrate: 14 },
    reactedByMe: [],
    commentCount: 8,
    comments: [
      { id: 'c1', author: { id: 'c_aanya', name: 'Aanya Iyer', role: 'client' }, body: 'This is so beautiful to read 💚', createdAt: iso(3 * hr) },
      { id: 'c2', author: { id: 'tm_owner', name: 'Dr. Sharma', role: 'owner' }, body: 'Proud of you Priya. Steady wins. 🌿', createdAt: iso(2 * hr) },
    ],
    createdAt: iso(6 * hr),
    cohort: 'PCOS Reset',
  },

  // ─── Coach Aditya — recipe tip ──────────────────────────────────────
  {
    id: 'p_aditya_recipe',
    author: { id: 'tm_aditya', name: 'Aditya Rao', role: 'coach' },
    body:
      "Pro-tip for the muscle gain group: post-workout shake doesn't need to be fancy. Whey + banana + 2 dates + milk = 35g protein + the carbs you actually need for recovery. Skip the overpriced powders.",
    hashtags: ['muscleGain', 'postWorkout', 'recipe'],
    reactions: { cheer: 9, strength: 16, love: 3, celebrate: 1 },
    reactedByMe: ['strength'],
    commentCount: 4,
    comments: [
      { id: 'c1', author: { id: 'c_karan', name: 'Karan Singh', role: 'client' }, body: 'Tried this yesterday. Hit my macro target without feeling stuffed. Solid.', createdAt: iso(12 * hr) },
    ],
    createdAt: iso(20 * hr),
    cohort: 'Muscle Gain',
  },

  // ─── Aanya — question post ──────────────────────────────────────────
  {
    id: 'p_aanya_q',
    author: { id: 'c_aanya', name: 'Aanya Iyer', role: 'client' },
    body:
      "Honest question for the diabetes group - do your post-meal glucose readings spike higher in the evening even with the same meal? Mine consistently jump 15-20 points more at dinner vs lunch.",
    hashtags: ['diabetes', 'question'],
    reactions: { cheer: 3, strength: 0, love: 1, celebrate: 0 },
    reactedByMe: [],
    commentCount: 5,
    comments: [
      { id: 'c1', author: { id: 'tm_vanya', name: 'Dr. Vanya Pillai', role: 'manager' }, body: 'Yes - cortisol and reduced insulin sensitivity in the evening. Try moving dinner 90 min earlier and a 10-min walk after. We can chat more in our session Wed.', createdAt: iso(1 * day - 3 * hr) },
    ],
    createdAt: iso(1 * day),
    cohort: 'Diabetes Care',
  },

  // ─── Meera — introduction ───────────────────────────────────────────
  {
    id: 'p_meera_intro',
    author: { id: 'c_meera', name: 'Meera Nair', role: 'client' },
    body:
      "Hi everyone 👋 Just joined this week, working on cardiac recovery after a stent placement. Looking forward to learning from all of you and Dr. Sharma. Already inspired by what I've read here.",
    hashtags: ['hello', 'cardiac', 'firstWeek'],
    reactions: { cheer: 11, strength: 4, love: 14, celebrate: 6 },
    reactedByMe: ['love', 'cheer'],
    commentCount: 7,
    comments: [
      { id: 'c1', author: { id: 'c_priya', name: 'Priya Sharma', role: 'client' }, body: 'Welcome Meera! This community is honestly the best part of the program.', createdAt: iso(2 * day - 1 * hr) },
    ],
    createdAt: iso(2 * day),
    cohort: 'Cardiac Care',
  },

  // ─── Karan — milestone ──────────────────────────────────────────────
  {
    id: 'p_karan_pr',
    author: { id: 'c_karan', name: 'Karan Singh', role: 'client' },
    body:
      "Hit a deadlift PR this morning. 80kg × 5 clean reps 💪 Three weeks ago this was a struggle at 70kg. Real proof that progressive overload + protein + actually sleeping works.",
    hashtags: ['muscleGain', 'PR', 'week5'],
    reactions: { cheer: 14, strength: 22, love: 6, celebrate: 10 },
    reactedByMe: ['strength'],
    commentCount: 3,
    comments: [],
    createdAt: iso(3 * day),
    cohort: 'Muscle Gain',
  },

  // ─── Sneha — vegan recipe ───────────────────────────────────────────
  {
    id: 'p_sneha_recipe',
    author: { id: 'c_sneha', name: 'Sneha Rao', role: 'client' },
    body:
      "Discovered chickpea pancakes (besan chilla) packed with spinach as a high-protein vegan breakfast. ~18g protein for the whole stack. Sharing the recipe in comments - feel free to riff on it.",
    hashtags: ['vegan', 'recipe', 'breakfast'],
    imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80',
    reactions: { cheer: 8, strength: 5, love: 11, celebrate: 2 },
    reactedByMe: [],
    commentCount: 6,
    comments: [],
    createdAt: iso(4 * day),
    cohort: 'Vegan Strength',
  },
];

export const TRENDING: TrendingTag[] = [
  { tag: 'PCOS',         posts: 14, trend: 'up' },
  { tag: 'muscleGain',   posts: 9,  trend: 'up' },
  { tag: 'protein',      posts: 8,  trend: 'flat' },
  { tag: 'recipe',       posts: 12, trend: 'up' },
  { tag: 'win',          posts: 6,  trend: 'up' },
  { tag: 'cardiac',      posts: 3,  trend: 'up' },
];

export const COHORTS: Cohort[] = [
  { id: 'all',           label: 'All cohorts',     members: 12 },
  { id: 'pcos',          label: 'PCOS Reset',      members: 4 },
  { id: 'muscle',        label: 'Muscle Gain',     members: 2 },
  { id: 'diabetes',      label: 'Diabetes Care',   members: 3 },
  { id: 'cardiac',       label: 'Cardiac Care',    members: 1 },
  { id: 'vegan',         label: 'Vegan Strength',  members: 1 },
];

export const REACTION_META: Record<
  import('../types').ReactionKey,
  { emoji: string; label: string }
> = {
  cheer:     { emoji: '🌿', label: 'Cheer' },
  strength:  { emoji: '💪', label: 'Strong' },
  love:      { emoji: '❤️', label: 'Love' },
  celebrate: { emoji: '🙌', label: 'Celebrate' },
};
