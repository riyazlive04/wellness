import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Plan } from './data/plans';

export interface OnboardingDraft {
  planId: Plan['id'] | null;
  practiceName: string;
  logoDataUrl: string | null;
  specializations: string[];   // canonical names from SPECIALIZATIONS + custom
  customSpecs: string[];
  pan: string;
  gstin: string;
  city: string;
  state: string;
  pincode: string;
  inviteName: string;
  inviteContact: string;
  inviteChannel: 'whatsapp' | 'email';
}

const initialDraft: OnboardingDraft = {
  planId: null,
  practiceName: '',
  logoDataUrl: null,
  specializations: [],
  customSpecs: [],
  pan: '',
  gstin: '',
  city: '',
  state: '',
  pincode: '',
  inviteName: '',
  inviteContact: '',
  inviteChannel: 'whatsapp',
};

interface OnboardingCtx {
  draft: OnboardingDraft;
  set: <K extends keyof OnboardingDraft>(k: K, v: OnboardingDraft[K]) => void;
  patch: (partial: Partial<OnboardingDraft>) => void;
  reset: () => void;
}

const Ctx = createContext<OnboardingCtx | null>(null);

const STORAGE_KEY = 'sirah:onboarding:draft';

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    if (typeof window === 'undefined') return initialDraft;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? { ...initialDraft, ...JSON.parse(raw) } : initialDraft;
    } catch {
      return initialDraft;
    }
  });

  function persist(next: OnboardingDraft) {
    setDraft(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // sessionStorage unavailable (private mode etc.) — fine, just lose draft on reload
    }
  }

  const value: OnboardingCtx = {
    draft,
    set: (k, v) => persist({ ...draft, [k]: v }),
    patch: (partial) => persist({ ...draft, ...partial }),
    reset: () => {
      persist(initialDraft);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return v;
}
