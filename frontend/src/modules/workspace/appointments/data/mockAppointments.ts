import type { Appointment } from '../types';

const day = 1000 * 60 * 60 * 24;

// Anchor "today" to a deterministic weekday — Tuesday — so the week view
// looks the same regardless of when you open the demo.
function thisTuesday(): Date {
  const d = new Date();
  const offset = (d.getDay() + 5) % 7; // back up to most recent Tuesday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
}

const monday = (() => {
  const d = thisTuesday();
  d.setDate(d.getDate() - 1);
  return d;
})();

function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(monday);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const WEEK_ANCHOR = monday;

export const MOCK_APPOINTMENTS: Appointment[] = [
  // ─── Tuesday (today) ─────────────────────────────────────────────────
  {
    id: 'a_priya_followup',
    clientId: 'c_priya',
    clientName: 'Priya Sharma',
    program: 'PCOS Reset · W3',
    type: 'video',
    kind: 'follow_up',
    status: 'scheduled',
    startAt: at(1, 11, 0),
    durationMin: 30,
    aiBrief:
      'Week-3 follow-up for Priya. Compliance is strong (92%). Discuss: protein-first breakfast wins, dinner-by-8pm habit, and her recent insulin-stabilization questions. Bloodwork due in 2 weeks - set expectation now.',
  },
  {
    id: 'a_karan_video',
    clientId: 'c_karan',
    clientName: 'Karan Singh',
    program: 'Muscle Gain · W5',
    type: 'video',
    kind: 'monthly_review',
    status: 'scheduled',
    startAt: at(1, 16, 30),
    durationMin: 45,
    aiBrief:
      'Month-1 review. Karan hit an 80kg deadlift PR - celebrate it. Adherence at 95%. Surplus is dialed in but sleep dipped this week (6.2h avg). Discuss sleep protocol and Week-6 progressive overload plan.',
  },

  // ─── Wednesday ───────────────────────────────────────────────────────
  {
    id: 'a_aanya_intake',
    clientId: 'c_aanya',
    clientName: 'Aanya Iyer',
    program: 'Diabetes Care · W2',
    type: 'video',
    kind: 'follow_up',
    status: 'scheduled',
    startAt: at(2, 10, 30),
    durationMin: 30,
    aiBrief:
      'First proper review since intake. Aanya is logging consistently. Glucose readings post-meal are coming down (-12% avg). Walk through her concerns about evening hunger and the dates-as-snack rule we discussed yesterday.',
  },
  {
    id: 'a_rohan_checkin',
    clientId: 'c_rohan',
    clientName: 'Rohan Mehta',
    program: 'Weight Loss · W6',
    type: 'phone',
    kind: 'urgent',
    status: 'scheduled',
    startAt: at(2, 18, 0),
    durationMin: 20,
    aiBrief:
      "Re-engagement call. Rohan disengaged for 5 days after a travel week. Adherence at 48%. Goal: validate his struggle, reset expectations, NOT add tasks. Suggest one minimum-viable habit to rebuild momentum.",
  },

  // ─── Thursday ────────────────────────────────────────────────────────
  {
    id: 'a_tanvi_urgent',
    clientId: 'c_tanvi',
    clientName: 'Tanvi Kapoor',
    program: 'Endurance · W4',
    type: 'video',
    kind: 'urgent',
    status: 'scheduled',
    startAt: at(3, 9, 0),
    durationMin: 30,
    aiBrief:
      "Tanvi has been silent for 5 days. Adherence dropped from 68% to 38%. Half-marathon is 4 weeks out. Open with care, not pressure. Likely needs program-tier change (lighter base) - have options ready.",
  },
  {
    id: 'a_nisha_quarterly',
    clientId: 'c_nisha',
    clientName: 'Nisha Patel',
    program: 'Thyroid Support · W8',
    type: 'in_person',
    kind: 'monthly_review',
    status: 'scheduled',
    startAt: at(3, 14, 0),
    durationMin: 60,
    aiBrief:
      'Two-month milestone. TSH dropped 4.8 → 3.2 (excellent). Energy and hair quality both rated improved. Plan Phase-2 of the program: introduce strength training, reduce supplementation by 25%.',
  },

  // ─── Friday ──────────────────────────────────────────────────────────
  {
    id: 'a_group_session',
    clientId: '',
    clientName: 'PCOS Group Session',
    program: 'Group · PCOS cohort (4 attendees)',
    type: 'video',
    kind: 'group',
    status: 'scheduled',
    startAt: at(4, 11, 0),
    durationMin: 60,
    aiBrief:
      'Monthly PCOS cohort session. 4 confirmed attendees: Priya, Aanya (cross-program), and two new. Topic: hormonal eating beyond the plate - sleep, stress, cycle awareness. Live Q&A in last 15 min.',
  },

  // ─── Saturday ────────────────────────────────────────────────────────
  {
    id: 'a_meera_initial',
    clientId: 'c_meera',
    clientName: 'Meera Nair',
    program: 'Cardiac Care · W1',
    type: 'video',
    kind: 'initial',
    status: 'scheduled',
    startAt: at(5, 10, 0),
    durationMin: 60,
    aiBrief:
      "Initial consultation. Cardiologist referral. Recent stent placement (3 weeks post-op). High motivation. Walk through her food diary from intake, set realistic Week-1 targets - focus on sodium and saturated fat, NOT calorie restriction this early.",
  },
];
