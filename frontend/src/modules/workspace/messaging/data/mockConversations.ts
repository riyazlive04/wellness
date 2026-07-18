import type { Conversation, Message } from '../types';

const day = 1000 * 60 * 60 * 24;
const hr = 1000 * 60 * 60;
const min = 1000 * 60;
const now = Date.now();

function iso(offsetMs: number) {
  return new Date(now - offsetMs).toISOString();
}

function m(input: Omit<Message, 'id'> & { id?: string }): Message {
  return { id: input.id ?? Math.random().toString(36).slice(2, 9), ...input };
}

export const MOCK_CONVERSATIONS: Conversation[] = [
  // ─── 1. Priya — active, just sent a meal photo ─────────────────────────
  {
    id: 'conv_priya',
    clientId: 'c_priya',
    clientName: 'Priya Sharma',
    program: 'PCOS Reset · W3',
    flag: 'active',
    unread: 2,
    lastMessageAt: iso(8 * min),
    messages: [
      m({ author: 'owner', kind: 'text', body: 'Morning Priya! How did the protein-first breakfast go yesterday?', sentAt: iso(26 * hr), read: true }),
      m({ author: 'client', kind: 'text', body: 'Pretty good - moong dal chilla with paneer. Felt full till lunch.', sentAt: iso(25 * hr), read: true }),
      m({ author: 'owner', kind: 'text', body: 'That\'s exactly what we want. Carry it forward this week - and try adding a tablespoon of seeds on top for fiber.', sentAt: iso(24 * hr), read: true }),
      m({ author: 'system', kind: 'system', body: 'Yesterday', sentAt: iso(24 * hr) }),
      m({ author: 'client', kind: 'voice', body: 'Quick question about my dinner timing - should I move it earlier?', durationSec: 18, sentAt: iso(5 * hr), read: true }),
      m({ author: 'owner', kind: 'text', body: 'Yes, ideally finish by 8pm. It\'s one of the biggest levers for PCOS - better fasting glucose, deeper sleep, less morning grogginess.', sentAt: iso(4 * hr + 30 * min), read: true }),
      m({ author: 'client', kind: 'photo', body: 'Today\'s lunch ✨', imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&q=80', sentAt: iso(12 * min), read: false }),
      m({ author: 'client', kind: 'text', body: 'Does this look balanced?', sentAt: iso(8 * min), read: false,
         aiSuggestions: [
           'Beautiful plate - that\'s a textbook PCOS lunch.',
           'Yes! Half veggies, palm of protein, a fistful of rice. Add a tsp of ghee for absorption.',
           'Great composition. Try to keep this rhythm - I\'ll log it in your week 3 wins.',
         ],
      }),
    ],
  },

  // ─── 2. Rohan — at-risk, owner sent a check-in ────────────────────────
  {
    id: 'conv_rohan',
    clientId: 'c_rohan',
    clientName: 'Rohan Mehta',
    program: 'Weight Loss · W6',
    flag: 'urgent',
    unread: 0,
    lastMessageAt: iso(2 * day + 3 * hr),
    messages: [
      m({ author: 'client', kind: 'text', body: 'Sorry, was traveling Wed-Fri for work. Didn\'t log anything.', sentAt: iso(5 * day), read: true }),
      m({ author: 'owner', kind: 'text', body: 'No worries at all. Travel weeks happen - let\'s not chase what we missed, only what\'s next.', sentAt: iso(5 * day - 10 * min), read: true }),
      m({ author: 'owner', kind: 'text', body: 'For today: one walk (20 mins is fine), one home-cooked meal, hydrate. We restart together.', sentAt: iso(5 * day - 5 * min), read: true }),
      m({ author: 'client', kind: 'text', body: 'Will do. Lunch will be home today.', sentAt: iso(4 * day + 22 * hr), read: true }),
      m({ author: 'system', kind: 'system', body: '2 days ago', sentAt: iso(2 * day + 4 * hr) }),
      m({ author: 'owner', kind: 'text', body: 'Hey Rohan - haven\'t heard back. Just checking in. No pressure to respond - just want you to know I\'m still in your corner.', sentAt: iso(2 * day + 3 * hr), read: true,
         aiSuggestions: [
           'Following up once more - a short voice note works if typing is hard.',
           'Want me to pause your program for a week while you find your footing?',
           'I\'ll mark this week as a reset. We\'ll begin fresh Monday.',
         ],
      }),
    ],
  },

  // ─── 3. Aanya — active, asked about a snack ───────────────────────────
  {
    id: 'conv_aanya',
    clientId: 'c_aanya',
    clientName: 'Aanya Iyer',
    program: 'Diabetes Care · W2',
    flag: 'active',
    unread: 0,
    lastMessageAt: iso(2 * hr + 12 * min),
    messages: [
      m({ author: 'client', kind: 'text', body: 'Is it okay to have a couple of dates as evening snack?', sentAt: iso(4 * hr), read: true }),
      m({ author: 'owner', kind: 'text', body: 'Limit to 2 - and pair them with a few almonds. Solo, they spike. Paired with protein/fat, they don\'t.', sentAt: iso(3 * hr + 50 * min), read: true }),
      m({ author: 'client', kind: 'text', body: 'Got it 🌿 thanks!', sentAt: iso(2 * hr + 12 * min), read: true }),
    ],
  },

  // ─── 4. Karan — active, milestone moment ──────────────────────────────
  {
    id: 'conv_karan',
    clientId: 'c_karan',
    clientName: 'Karan Singh',
    program: 'Muscle Gain · W5',
    flag: 'active',
    unread: 1,
    lastMessageAt: iso(35 * min),
    messages: [
      m({ author: 'client', kind: 'text', body: 'Hit 80kg deadlift for 5 reps this morning 💪', sentAt: iso(35 * min), read: false,
         aiSuggestions: [
           'Massive. That\'s up from 70kg three weeks ago - that\'s real progress.',
           'Hell yeah. Form first, then add 2.5kg next session.',
           'Logging that as your week-5 milestone. Sleep is paying off.',
         ],
      }),
    ],
  },

  // ─── 5. Tanvi — at-risk, silent for 5 days ────────────────────────────
  {
    id: 'conv_tanvi',
    clientId: 'c_tanvi',
    clientName: 'Tanvi Kapoor',
    program: 'Endurance · W4',
    flag: 'urgent',
    unread: 0,
    lastMessageAt: iso(5 * day),
    messages: [
      m({ author: 'owner', kind: 'text', body: 'Hey Tanvi - you haven\'t logged this week. Everything okay?', sentAt: iso(5 * day + 6 * hr), read: true }),
      m({ author: 'owner', kind: 'text', body: 'No pressure to reply right away. Just want to know if I should adjust the plan or pause it.', sentAt: iso(5 * day), read: true,
         aiSuggestions: [
           'Want me to switch you to a lighter week so you can ease back in?',
           'I\'ll move your long run to next Sunday - let\'s not skip, just shift.',
           'Going to schedule a 15-min call. What time works tomorrow?',
         ],
      }),
    ],
  },

  // ─── 6. Nisha — older, last spoke 4 days ago ──────────────────────────
  {
    id: 'conv_nisha',
    clientId: 'c_nisha',
    clientName: 'Nisha Patel',
    program: 'Thyroid Support · W8',
    flag: 'active',
    unread: 0,
    lastMessageAt: iso(4 * day),
    messages: [
      m({ author: 'client', kind: 'text', body: 'Latest bloodwork report attached', sentAt: iso(4 * day + 1 * hr), read: true }),
      m({ author: 'owner', kind: 'text', body: 'Reviewed - TSH dropped from 4.8 to 3.2. Selenium and dietary shifts are working. Keep going.', sentAt: iso(4 * day), read: true }),
    ],
  },
];
