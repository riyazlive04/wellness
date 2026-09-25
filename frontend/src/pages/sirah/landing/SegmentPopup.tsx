import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Building2, Loader2, User, Users, X } from 'lucide-react';

import { BrandMark, Glass } from '@/design-system';
import { getSegment, hasAsked, markAsked, setSegment, setVisitorName, type PracticeSegment } from './practiceSegment';
import { checkInput } from './inputCheck';
import { trackButtonClick } from './landingEvents';

const OPTIONS: Array<{ value: PracticeSegment; icon: typeof User; label: string; hint: string }> = [
  { value: 'solo', icon: User, label: 'Just me', hint: 'A solo practice' },
  { value: 'small', icon: Users, label: 'A small team', hint: '2 - 5 people' },
  { value: 'clinic', icon: Building2, label: 'A full clinic', hint: '6 or more' },
];

/**
 * One-question popup, asked once per visit, right when the landing page opens:
 * "How do you run your practice?" The answer personalises the hero headline
 * (see practiceSegment.ts + HeroSection.tsx) so a solo dietitian and a clinic
 * owner each see a line written for them, not a generic middle ground.
 *
 * Skippable (✕ or backdrop click) - defaults to 'solo' (the largest segment)
 * so the page still reads sensibly for anyone who closes it without choosing.
 * Never asks twice in the same visit (sessionStorage via hasAsked()).
 */
export function SegmentPopup() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'segment' | 'name'>('segment');
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (hasAsked() || getSegment()) return;
    setOpen(true);
  }, []);

  function choose(value: PracticeSegment) {
    setSegment(value);
    trackButtonClick('segment_popup_choose', { value });
    setStep('name');
  }

  async function submitName(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (value.length < 2) {
      setNameError('Please enter your name.');
      return;
    }
    setChecking(true);
    setNameError('');
    const verdict = await checkInput('name', value);
    setChecking(false);
    if (verdict.status === 'bad') {
      setNameError(verdict.message ?? 'Please enter your real name.');
      return;
    }
    // The name itself never goes to analytics - only that it was given.
    trackButtonClick('segment_popup_name_submit');
    setVisitorName(value);
    setOpen(false);
  }

  function skip() {
    markAsked();
    trackButtonClick('segment_popup_skip');
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="How do you run your practice?"
          onClick={step === 'segment' ? skip : undefined}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm"
          >
            <Glass variant="heavy" className="relative overflow-hidden p-6 text-center sm:p-7">
              {step === 'segment' && (
              <button
                type="button"
                onClick={skip}
                aria-label="Skip"
                className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-foreground/45 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              )}

              <BrandMark size={40} className="mx-auto" />

              {step === 'name' ? (
                <form onSubmit={submitName} className="mt-4">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">Lovely! What's your name?</h2>
                  <p className="mt-1.5 text-sm text-foreground/60">We'll set this page up just for you.</p>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value.slice(0, 60));
                      setNameError('');
                    }}
                    autoComplete="name"
                    placeholder="e.g. Priya Sharma"
                    aria-label="Your name"
                    aria-invalid={!!nameError}
                    className={
                      'mt-5 w-full rounded-xl border bg-foreground/[0.03] px-4 py-3 text-center text-base text-foreground placeholder:text-foreground/35 focus:outline-none focus:ring-4 ' +
                      (nameError
                        ? 'border-rose-500/60 focus:ring-rose-500/15'
                        : 'border-foreground/12 focus:border-teal-600/50 focus:ring-teal-500/15')
                    }
                  />
                  {nameError && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{nameError}</p>}
                  <button
                    type="submit"
                    disabled={checking}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
                  >
                    {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {checking ? 'One moment…' : 'Continue'}
                    {!checking && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              ) : (
              <>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                How do you run your practice?
              </h2>
              <p className="mt-1.5 text-sm text-foreground/60">
                So we can show you the right details for you.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                {OPTIONS.map(({ value, icon: Icon, label, hint }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => choose(value)}
                    className="group flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-left transition-colors hover:border-teal-600/50 hover:bg-teal-500/[0.06]"
                  >
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-teal-500/12 text-teal-700 dark:text-teal-300">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{label}</span>
                      <span className="block text-xs text-foreground/55">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              </>
              )}
            </Glass>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
