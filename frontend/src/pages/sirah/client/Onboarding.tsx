import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Ruler, Target, Apple, Activity, Heart, AlertCircle,
  ChevronRight, ChevronLeft, Loader2, Check,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AIGlow, BrandMark, Glass, GradientOrb, fadeUp, stagger,
  Wordmark,
} from '@/design-system';
import { clientsApi, type OnboardingPayload } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Post-invite wellness wizard. Lives at /portal/onboarding and is the only
 * page a freshly-accepted invitee can reach until they finish — the gate
 * inside RequireClient routes them here when `onboarded_at IS NULL`.
 *
 * Six steps, each one optional. Skipping is allowed (we still mark the
 * row onboarded_at = now() so they can re-fill via Settings later).
 */

const GENDERS = [
  { value: 'female',              label: 'Female' },
  { value: 'male',                label: 'Male' },
  { value: 'non-binary',          label: 'Non-binary' },
  { value: 'prefer not to say',   label: 'Prefer not to say' },
];

const GOAL_PRESETS = [
  'Weight loss',
  'Muscle gain',
  'Better energy',
  'Sleep & recovery',
  'Manage a health condition',
  'General wellness',
];

const ACTIVITY: Array<{ value: NonNullable<OnboardingPayload['activity_level']>; label: string; sub: string }> = [
  { value: 'sedentary',   label: 'Mostly sitting',     sub: 'Desk job, little exercise' },
  { value: 'light',       label: 'Light movement',     sub: '1–2 workouts a week' },
  { value: 'moderate',    label: 'Moderately active',  sub: '3–4 workouts a week' },
  { value: 'active',      label: 'Active',             sub: '5+ workouts a week' },
  { value: 'very_active', label: 'Very active',        sub: 'Athlete / heavy training' },
];

interface FormState {
  age: string;
  gender: string;
  heightCm: string;
  weightKg: string;
  goals: string;
  activity: NonNullable<OnboardingPayload['activity_level']>;
  allergies: string;
  medical: string;
  preferences: string;
}

const EMPTY: FormState = {
  age: '', gender: '', heightCm: '', weightKg: '',
  goals: '', activity: 'moderate',
  allergies: '', medical: '', preferences: '',
};

const STEPS = ['Basics', 'Body', 'Goals', 'Activity', 'Health', 'Done'] as const;

export default function ClientOnboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // If they're already onboarded, bounce home — never re-show the wizard.
  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    retry: 1,
  });
  if (profileQ.data?.onboarded_at) {
    // Defer to next tick so the navigate doesn't race the initial render.
    queueMicrotask(() => navigate('/portal', { replace: true }));
  }

  const [form, setForm] = useState<FormState>(EMPTY);
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const completeMut = useMutation({
    mutationFn: (body: OnboardingPayload) => clientsApi.completeOnboarding(body),
    onSuccess: () => {
      toast.success('Welcome to SIRAH LIFE — your portal is ready');
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'wellness', 'snapshot'] });
      navigate('/portal', { replace: true });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not finish onboarding.'),
  });

  function finish() {
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const str = (v: string) => (v.trim() === '' ? undefined : v.trim());

    const body: OnboardingPayload = {};
    if (num(form.age) !== undefined && Number.isFinite(num(form.age))) body.age = num(form.age) as number;
    if (str(form.gender))     body.gender = form.gender;
    if (num(form.heightCm) !== undefined && Number.isFinite(num(form.heightCm))) body.height_cm = num(form.heightCm) as number;
    if (num(form.weightKg) !== undefined && Number.isFinite(num(form.weightKg))) body.initial_weight_kg = num(form.weightKg) as number;
    if (str(form.goals))      body.goals = form.goals;
    body.activity_level = form.activity;
    if (str(form.allergies))   body.allergies = form.allergies;
    if (str(form.medical))     body.medical_conditions = form.medical;
    if (str(form.preferences)) body.food_preferences = form.preferences;
    completeMut.mutate(body);
  }

  const totalSteps = STEPS.length;
  const progress = useMemo(() => Math.round(((stepIdx + 1) / totalSteps) * 100), [stepIdx, totalSteps]);

  const isFinalStep = step === 'Done';

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-foreground">
      <GradientOrb color="magenta" size={520} position="-top-32 -left-20" />
      <GradientOrb color="violet"  size={420} position="-bottom-32 -right-20" delay={3} driftDuration={26} />

      <header className="relative z-10 border-b border-foreground/[0.06]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <BrandMark size={28} animated={false} />
          <Wordmark className="text-sm" />
          <div className="ml-auto text-[11px] uppercase tracking-[0.18em] text-foreground/55">
            Step {stepIdx + 1} of {totalSteps}
          </div>
        </div>
        {/* progress bar */}
        <div className="h-[2px] w-full bg-foreground/[0.05]">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-teal-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-xl px-5 py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
          <motion.div variants={fadeUp} className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              <Sparkles className="h-3 w-3" />
              {profileQ.data?.workspace_name ?? 'Your wellness journey'}
            </span>
            <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight md:text-3xl">
              {step === 'Done' ? 'You\'re all set' : 'Let\'s personalise your portal'}
            </h1>
            <p className="mt-1.5 text-pretty text-sm text-foreground/70">
              {step === 'Done'
                ? 'Tap finish and we\'ll set up your dashboard.'
                : 'A few quick questions so your dashboard, meal targets, and coach insights fit you.'}
            </p>
          </motion.div>

          <motion.div variants={fadeUp}>
            <AIGlow intensity="soft" animated={false}>
              <Glass variant="heavy" className="p-6 md:p-7">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-5"
                  >
                    {step === 'Basics' && (
                      <BasicsStep form={form} set={setForm} />
                    )}
                    {step === 'Body' && (
                      <BodyStep form={form} set={setForm} />
                    )}
                    {step === 'Goals' && (
                      <GoalsStep form={form} set={setForm} />
                    )}
                    {step === 'Activity' && (
                      <ActivityStep form={form} set={setForm} />
                    )}
                    {step === 'Health' && (
                      <HealthStep form={form} set={setForm} />
                    )}
                    {step === 'Done' && (
                      <DoneStep form={form} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </Glass>
            </AIGlow>
          </motion.div>

          <motion.div variants={fadeUp} className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => (stepIdx === 0 ? null : setStepIdx(stepIdx - 1))}
              disabled={stepIdx === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/[0.04] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>

            {!isFinalStep ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1))}
                  className="text-[12px] text-foreground/55 hover:text-foreground"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97]"
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={completeMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-50"
              >
                {completeMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Check className="h-4 w-4" />}
                Finish & enter portal
              </button>
            )}
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Step components — each renders a tiny form slice + section header.
// ────────────────────────────────────────────────────────────────────

interface StepProps {
  form: FormState;
  set: React.Dispatch<React.SetStateAction<FormState>>;
}

function StepHeader({ icon: Icon, title, hint }: { icon: typeof Sparkles; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-400/10 text-teal-600 dark:text-teal-300">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-base font-semibold">{title}</div>
        {hint && <div className="text-[12px] text-foreground/55">{hint}</div>}
      </div>
    </div>
  );
}

function Field({
  label, children,
}: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/75">{label}</div>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none';

function BasicsStep({ form, set }: StepProps) {
  return (
    <>
      <StepHeader icon={Sparkles} title="A few quick basics" hint="Helps us tune targets to your body." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age">
          <input
            type="number"
            min={10}
            max={120}
            inputMode="numeric"
            value={form.age}
            onChange={(e) => set((f) => ({ ...f, age: e.target.value }))}
            className={inputCls}
            placeholder="e.g. 32"
          />
        </Field>
        <Field label="Gender">
          <select
            value={form.gender}
            onChange={(e) => set((f) => ({ ...f, gender: e.target.value }))}
            className={inputCls}
          >
            <option value="">Select…</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}

function BodyStep({ form, set }: StepProps) {
  return (
    <>
      <StepHeader icon={Ruler} title="Body measurements" hint="We use these for calorie targets and progress tracking." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Height (cm)">
          <input
            type="number"
            min={50}
            max={250}
            inputMode="numeric"
            value={form.heightCm}
            onChange={(e) => set((f) => ({ ...f, heightCm: e.target.value }))}
            className={inputCls}
            placeholder="e.g. 168"
          />
        </Field>
        <Field label="Current weight (kg)">
          <input
            type="number"
            min={20}
            max={300}
            step={0.1}
            inputMode="decimal"
            value={form.weightKg}
            onChange={(e) => set((f) => ({ ...f, weightKg: e.target.value }))}
            className={inputCls}
            placeholder="e.g. 65"
          />
        </Field>
      </div>
      <p className="text-[11px] text-foreground/55">
        Today's weight gets logged automatically so your first progress chart already has a starting point.
      </p>
    </>
  );
}

function GoalsStep({ form, set }: StepProps) {
  return (
    <>
      <StepHeader icon={Target} title="What's driving you?" hint="Pick one — you can refine details later." />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {GOAL_PRESETS.map((g) => {
          const active = form.goals === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => set((f) => ({ ...f, goals: g }))}
              className={cn(
                'rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                active
                  ? 'border-teal-400/60 bg-teal-400/10 text-foreground'
                  : 'border-foreground/10 bg-foreground/[0.02] text-foreground/80 hover:bg-foreground/[0.05]',
              )}
            >
              {g}
            </button>
          );
        })}
      </div>
      <Field label="Or describe in your own words (optional)">
        <input
          type="text"
          maxLength={500}
          value={GOAL_PRESETS.includes(form.goals) ? '' : form.goals}
          onChange={(e) => set((f) => ({ ...f, goals: e.target.value }))}
          className={inputCls}
          placeholder="e.g. recover from a hip injury"
        />
      </Field>
    </>
  );
}

function ActivityStep({ form, set }: StepProps) {
  return (
    <>
      <StepHeader icon={Activity} title="How active are you?" hint="We'll set your initial calorie and protein targets." />
      <div className="space-y-2">
        {ACTIVITY.map((a) => {
          const active = form.activity === a.value;
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => set((f) => ({ ...f, activity: a.value }))}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                active
                  ? 'border-teal-400/60 bg-teal-400/10'
                  : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
              )}
            >
              <div className="text-sm font-medium">{a.label}</div>
              <div className="text-[11px] text-foreground/55">{a.sub}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function HealthStep({ form, set }: StepProps) {
  return (
    <>
      <StepHeader
        icon={Heart}
        title="Anything we should know?"
        hint="Only your nutritionist sees this. Skip whatever doesn't apply."
      />
      <Field label={<><AlertCircle className="mr-1 inline h-3 w-3" /> Allergies & intolerances</>}>
        <input
          type="text"
          maxLength={1000}
          value={form.allergies}
          onChange={(e) => set((f) => ({ ...f, allergies: e.target.value }))}
          className={inputCls}
          placeholder="e.g. nuts, lactose"
        />
      </Field>
      <Field label="Medical conditions">
        <input
          type="text"
          maxLength={1000}
          value={form.medical}
          onChange={(e) => set((f) => ({ ...f, medical: e.target.value }))}
          className={inputCls}
          placeholder="e.g. PCOS, hypothyroid"
        />
      </Field>
      <Field label={<><Apple className="mr-1 inline h-3 w-3" /> Food preferences</>}>
        <input
          type="text"
          maxLength={1000}
          value={form.preferences}
          onChange={(e) => set((f) => ({ ...f, preferences: e.target.value }))}
          className={inputCls}
          placeholder="e.g. vegetarian, low-carb, no seafood"
        />
      </Field>
    </>
  );
}

function DoneStep({ form }: { form: FormState }) {
  return (
    <>
      <StepHeader icon={Check} title="Quick review" hint="Tap finish to enter your portal." />
      <div className="space-y-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 text-sm">
        <Row label="Age"       value={form.age || '—'} />
        <Row label="Gender"    value={form.gender || '—'} />
        <Row label="Height"    value={form.heightCm ? `${form.heightCm} cm` : '—'} />
        <Row label="Weight"    value={form.weightKg ? `${form.weightKg} kg` : '—'} />
        <Row label="Goal"      value={form.goals || '—'} />
        <Row label="Activity"  value={ACTIVITY.find((a) => a.value === form.activity)?.label ?? '—'} />
        <Row label="Allergies" value={form.allergies || '—'} />
        <Row label="Medical"   value={form.medical || '—'} />
        <Row label="Food prefs" value={form.preferences || '—'} />
      </div>
      <p className="text-center text-[11px] text-foreground/55">
        You can edit any of this later under Settings.
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-foreground/[0.06] pb-1.5 last:border-0 last:pb-0">
      <span className="text-[11px] uppercase tracking-[0.14em] text-foreground/55">{label}</span>
      <span className="truncate text-right text-sm text-foreground/85">{value}</span>
    </div>
  );
}