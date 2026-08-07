import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Ruler, Target, Apple, Activity, Heart, AlertCircle,
  ChevronRight, ChevronLeft, Loader2, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import {
  AIGlow, BrandMark, Glass, GradientOrb, fadeUp, stagger,
  Wordmark,
} from '@/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  { value: 'female',              key: 'female' },
  { value: 'male',                key: 'male' },
  { value: 'non-binary',          key: 'nonBinary' },
  { value: 'prefer not to say',   key: 'preferNotToSay' },
];

const GOAL_PRESETS = [
  'Weight loss',
  'Muscle gain',
  'Better energy',
  'Sleep & recovery',
  'Manage a health condition',
  'General wellness',
];

/** Stable value (stored + sent to the API) → i18n key under goals.presets. */
const GOAL_PRESET_KEYS: Record<string, string> = {
  'Weight loss': 'weightLoss',
  'Muscle gain': 'muscleGain',
  'Better energy': 'betterEnergy',
  'Sleep & recovery': 'sleepRecovery',
  'Manage a health condition': 'manageCondition',
  'General wellness': 'generalWellness',
};

const ACTIVITY: Array<{ value: NonNullable<OnboardingPayload['activity_level']>; label: string; sub: string }> = [
  { value: 'sedentary',   label: 'Mostly sitting',     sub: 'Desk job, little exercise' },
  { value: 'light',       label: 'Light movement',     sub: '1-2 workouts a week' },
  { value: 'moderate',    label: 'Moderately active',  sub: '3-4 workouts a week' },
  { value: 'active',      label: 'Active',             sub: '5+ workouts a week' },
  { value: 'very_active', label: 'Very active',        sub: 'Athlete / heavy training' },
];

interface FormState {
  age: string;
  gender: string;
  heightCm: string;
  weightKg: string;
  /** Multi-select: people rarely have exactly one goal. */
  goals: string[];
  /** Free-text goal, kept separate so it survives toggling presets. */
  goalsNote: string;
  activity: NonNullable<OnboardingPayload['activity_level']>;
  allergies: string;
  medical: string;
  preferences: string;
}

const EMPTY: FormState = {
  age: '', gender: '', heightCm: '', weightKg: '',
  goals: [], goalsNote: '', activity: 'moderate',
  allergies: '', medical: '', preferences: '',
};

/**
 * Flatten the selected presets + free text into the single `goals` string the
 * API and clients.goals column expect. Order follows GOAL_PRESETS so the
 * stored value doesn't depend on which chip they tapped first.
 */
function joinGoals(form: FormState): string {
  return [...form.goals, form.goalsNote.trim()].filter(Boolean).join(', ');
}

const STEPS = ['Basics', 'Body', 'Goals', 'Activity', 'Health', 'Done'] as const;

export default function ClientOnboarding() {
  const { t } = useTranslation('clientOnboarding');
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
      toast.success(t('toast.success'));
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'wellness', 'snapshot'] });
      navigate('/portal', { replace: true });
    },
    onError: (err: Error) => toast.error(err.message ?? t('toast.error')),
  });

  function finish() {
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const str = (v: string) => (v.trim() === '' ? undefined : v.trim());

    const body: OnboardingPayload = {};
    if (num(form.age) !== undefined && Number.isFinite(num(form.age))) body.age = num(form.age) as number;
    if (str(form.gender))     body.gender = form.gender;
    if (num(form.heightCm) !== undefined && Number.isFinite(num(form.heightCm))) body.height_cm = num(form.heightCm) as number;
    if (num(form.weightKg) !== undefined && Number.isFinite(num(form.weightKg))) body.initial_weight_kg = num(form.weightKg) as number;
    if (str(joinGoals(form))) body.goals = joinGoals(form);
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
    // No `overflow-hidden` here: it also clips vertically, which cut off the
    // footer buttons whenever a step grew past the viewport (the Done summary
    // did). The orbs get their own fixed, clipped layer so they still can't
    // cause a horizontal scrollbar.
    <div className="relative min-h-screen bg-canvas text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <GradientOrb color="magenta" size={520} position="-top-32 -left-20" />
        <GradientOrb color="violet"  size={420} position="-bottom-32 -right-20" delay={3} driftDuration={26} />
      </div>

      <header className="relative z-10 border-b border-foreground/[0.06]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <BrandMark size={28} animated={false} />
          <Wordmark className="text-sm" />
          <div className="ml-auto text-[11px] uppercase tracking-[0.18em] text-foreground/55">
            {t('header.stepCounter', { current: stepIdx + 1, total: totalSteps })}
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

      {/* pb-16 so the footer buttons always clear the bottom edge (and any
          mobile browser chrome) instead of sitting flush against it. */}
      <main className="relative z-10 mx-auto w-full max-w-xl px-5 pb-16 pt-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
          <motion.div variants={fadeUp} className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              <Sparkles className="h-3 w-3" />
              {profileQ.data?.workspace_name ?? t('header.badgeFallback')}
            </span>
            <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight md:text-3xl">
              {step === 'Done' ? t('header.titleDone') : t('header.title')}
            </h1>
            <p className="mt-1.5 text-pretty text-sm text-foreground/70">
              {step === 'Done'
                ? t('header.subtitleDone')
                : t('header.subtitle')}
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
              <ChevronLeft className="h-4 w-4" /> {t('common:actions.back')}
            </button>

            {!isFinalStep ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1))}
                  className="text-[12px] text-foreground/55 hover:text-foreground"
                >
                  {t('nav.skip')}
                </button>
                <button
                  type="button"
                  onClick={() => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97]"
                >
                  {t('common:actions.continue')} <ChevronRight className="h-4 w-4" />
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
                {t('nav.finish')}
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

/**
 * `as="div"` is for fields wrapping a Radix Select: <button> is a labelable
 * element, so a wrapping <label> forwards its click to the trigger on top of
 * the trigger's own click — the menu opens and instantly closes. Those
 * triggers carry an aria-label instead.
 */
function Field({
  label, children, as: Tag = 'label',
}: { label: React.ReactNode; children: React.ReactNode; as?: 'label' | 'div' }) {
  return (
    <Tag className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/75">{label}</div>
      {children}
    </Tag>
  );
}

const inputCls =
  'w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/60 focus:outline-none';
// Same look as inputCls, minus the bits SelectTrigger already supplies.
const selectCls = 'h-auto w-full rounded-xl border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm';

function BasicsStep({ form, set }: StepProps) {
  const { t } = useTranslation('clientOnboarding');
  return (
    <>
      <StepHeader icon={Sparkles} title={t('basics.title')} hint={t('basics.hint')} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('basics.age')}>
          <input
            type="number"
            min={10}
            max={120}
            inputMode="numeric"
            value={form.age}
            onChange={(e) => set((f) => ({ ...f, age: e.target.value }))}
            className={inputCls}
            placeholder={t('basics.agePlaceholder')}
          />
        </Field>
        <Field label={t('basics.gender')} as="div">
          {/* "Select…" was a placeholder, not a choice - Radix shows it
              whenever the value is ''. */}
          <Select
            value={form.gender}
            onValueChange={(v) => set((f) => ({ ...f, gender: v }))}
          >
            <SelectTrigger aria-label={t('basics.gender')} className={selectCls}>
              <SelectValue placeholder={t('basics.genderPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => (
                <SelectItem key={g.value} value={g.value}>{t(`basics.genders.${g.key}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </>
  );
}

function BodyStep({ form, set }: StepProps) {
  const { t } = useTranslation('clientOnboarding');
  return (
    <>
      <StepHeader icon={Ruler} title={t('body.title')} hint={t('body.hint')} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('body.height')}>
          <input
            type="number"
            min={50}
            max={250}
            inputMode="numeric"
            value={form.heightCm}
            onChange={(e) => set((f) => ({ ...f, heightCm: e.target.value }))}
            className={inputCls}
            placeholder={t('body.heightPlaceholder')}
          />
        </Field>
        <Field label={t('body.weight')}>
          <input
            type="number"
            min={20}
            max={300}
            step={0.1}
            inputMode="decimal"
            value={form.weightKg}
            onChange={(e) => set((f) => ({ ...f, weightKg: e.target.value }))}
            className={inputCls}
            placeholder={t('body.weightPlaceholder')}
          />
        </Field>
      </div>
      <p className="text-[11px] text-foreground/55">
        {t('body.note')}
      </p>
    </>
  );
}

function GoalsStep({ form, set }: StepProps) {
  const { t } = useTranslation('clientOnboarding');
  function toggle(goal: string) {
    set((f) => ({
      ...f,
      // Rebuild from GOAL_PRESETS rather than appending, so the saved order is
      // stable regardless of tap order.
      goals: f.goals.includes(goal)
        ? f.goals.filter((g) => g !== goal)
        : GOAL_PRESETS.filter((g) => g === goal || f.goals.includes(g)),
    }));
  }

  return (
    <>
      <StepHeader
        icon={Target}
        title={t('goals.title')}
        hint={t('goals.hint')}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {GOAL_PRESETS.map((g) => {
          const active = form.goals.includes(g);
          return (
            <button
              key={g}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(g)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                active
                  ? 'border-teal-400/60 bg-teal-400/10 text-foreground'
                  : 'border-foreground/10 bg-foreground/[0.02] text-foreground/80 hover:bg-foreground/[0.05]',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-colors',
                  active ? 'border-teal-400 bg-teal-400 text-white' : 'border-foreground/25',
                )}
              >
                {active && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              {t(`goals.presets.${GOAL_PRESET_KEYS[g]}`)}
            </button>
          );
        })}
      </div>
      <Field label={t('goals.noteLabel')}>
        <input
          type="text"
          maxLength={500}
          value={form.goalsNote}
          onChange={(e) => set((f) => ({ ...f, goalsNote: e.target.value }))}
          className={inputCls}
          placeholder={t('goals.notePlaceholder')}
        />
      </Field>
    </>
  );
}

function ActivityStep({ form, set }: StepProps) {
  const { t } = useTranslation('clientOnboarding');
  return (
    <>
      <StepHeader icon={Activity} title={t('activity.title')} hint={t('activity.hint')} />
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
              <div className="text-sm font-medium">{t(`activity.levels.${a.value}.label`)}</div>
              <div className="text-[11px] text-foreground/55">{t(`activity.levels.${a.value}.sub`)}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function HealthStep({ form, set }: StepProps) {
  const { t } = useTranslation('clientOnboarding');
  return (
    <>
      <StepHeader
        icon={Heart}
        title={t('health.title')}
        hint={t('health.hint')}
      />
      <Field label={<><AlertCircle className="mr-1 inline h-3 w-3" /> {t('health.allergies')}</>}>
        <input
          type="text"
          maxLength={1000}
          value={form.allergies}
          onChange={(e) => set((f) => ({ ...f, allergies: e.target.value }))}
          className={inputCls}
          placeholder={t('health.allergiesPlaceholder')}
        />
      </Field>
      <Field label={t('health.medical')}>
        <input
          type="text"
          maxLength={1000}
          value={form.medical}
          onChange={(e) => set((f) => ({ ...f, medical: e.target.value }))}
          className={inputCls}
          placeholder={t('health.medicalPlaceholder')}
        />
      </Field>
      <Field label={<><Apple className="mr-1 inline h-3 w-3" /> {t('health.foodPrefs')}</>}>
        <input
          type="text"
          maxLength={1000}
          value={form.preferences}
          onChange={(e) => set((f) => ({ ...f, preferences: e.target.value }))}
          className={inputCls}
          placeholder={t('health.foodPrefsPlaceholder')}
        />
      </Field>
    </>
  );
}

function DoneStep({ form }: { form: FormState }) {
  const { t } = useTranslation('clientOnboarding');
  const activityMatch = ACTIVITY.find((a) => a.value === form.activity);
  return (
    <>
      <StepHeader icon={Check} title={t('done.title')} hint={t('done.hint')} />
      <div className="space-y-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 text-sm">
        <Row label={t('done.rows.age')}       value={form.age || '-'} />
        <Row label={t('done.rows.gender')}    value={form.gender || '-'} />
        <Row label={t('done.rows.height')}    value={form.heightCm ? `${form.heightCm} cm` : '-'} />
        <Row label={t('done.rows.weight')}    value={form.weightKg ? `${form.weightKg} kg` : '-'} />
        <Row label={t('done.rows.goals')}     value={joinGoals(form) || '-'} />
        <Row label={t('done.rows.activity')}  value={activityMatch ? t(`activity.levels.${activityMatch.value}.label`) : '-'} />
        <Row label={t('done.rows.allergies')} value={form.allergies || '-'} />
        <Row label={t('done.rows.medical')}   value={form.medical || '-'} />
        <Row label={t('done.rows.foodPrefs')} value={form.preferences || '-'} />
      </div>
      <p className="text-center text-[11px] text-foreground/55">
        {t('done.editHint')}
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-foreground/[0.06] pb-1.5 last:border-0 last:pb-0">
      <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-foreground/55">{label}</span>
      {/* Wraps rather than truncates: several goals joined together is now the
          normal case, and "Weight loss, Muscle gain, Bett…" helps nobody. */}
      <span className="min-w-0 text-right text-sm text-foreground/85 [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}