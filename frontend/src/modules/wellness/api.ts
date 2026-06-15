import { api } from '@/lib/api';

/** Module 7 — Client Wellness OS: goals, habits, journal, timeline. All
 *  endpoints resolve the caller's client row from the JWT (self-scoped). */

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  category: string;
  target_value: string | null;
  current_value: string;
  unit: string | null;
  target_date: string | null;
  status: 'active' | 'achieved' | 'archived';
  achieved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitDayDot { date: string; done: boolean }
export interface Habit {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  cadence: 'daily' | 'weekly';
  target_per_day: number;
  sort_order: number;
  active: boolean;
  done_today: boolean;
  streak: number;
  last7: HabitDayDot[];
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  title: string | null;
  body: string;
  mood: number | null;
  tags: string[];
  ai_reflection: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineItem {
  kind: 'goal' | 'journal' | 'appointment' | 'milestone' | 'report';
  title: string;
  detail: string;
  at: string | null;
  variant: string;
}

const BASE = '/api/v1/me/wellness';

export const wellnessApi = {
  // Goals
  listGoals: () => api.get<Goal[]>(`${BASE}/goals`),
  createGoal: (body: {
    title: string; description?: string; category?: string;
    targetValue?: number; currentValue?: number; unit?: string; targetDate?: string;
  }) => api.post<Goal>(`${BASE}/goals`, { body }),
  updateGoal: (id: string, body: Record<string, unknown>) => api.patch<Goal>(`${BASE}/goals/${id}`, { body }),
  deleteGoal: (id: string) => api.delete<{ deleted: true }>(`${BASE}/goals/${id}`),

  // Habits
  listHabits: () => api.get<Habit[]>(`${BASE}/habits`),
  createHabit: (body: { title: string; icon?: string; color?: string; cadence?: string; targetPerDay?: number }) =>
    api.post<Habit>(`${BASE}/habits`, { body }),
  updateHabit: (id: string, body: Record<string, unknown>) => api.patch<Habit>(`${BASE}/habits/${id}`, { body }),
  deleteHabit: (id: string) => api.delete<{ archived: true }>(`${BASE}/habits/${id}`),
  toggleHabit: (id: string, date?: string) =>
    api.post<{ done: boolean; streak: number }>(`${BASE}/habits/${id}/toggle`, { body: date ? { date } : {} }),

  // Journal
  listJournal: () => api.get<JournalEntry[]>(`${BASE}/journal`),
  createJournal: (body: { body: string; title?: string; mood?: number; tags?: string[] }) =>
    api.post<JournalEntry>(`${BASE}/journal`, { body }),
  updateJournal: (id: string, body: Record<string, unknown>) => api.patch<JournalEntry>(`${BASE}/journal/${id}`, { body }),
  deleteJournal: (id: string) => api.delete<{ deleted: true }>(`${BASE}/journal/${id}`),
  reflectJournal: (id: string) => api.post<JournalEntry>(`${BASE}/journal/${id}/reflect`),

  // Timeline
  getTimeline: () => api.get<TimelineItem[]>(`${BASE}/timeline`),
};
