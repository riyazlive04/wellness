import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { User, Heart, Activity, Apple, AlertCircle, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

const GENDERS = ['female', 'male', 'non-binary', 'prefer not to say'];
const GOALS = ['Weight loss', 'Muscle gain', 'Maintenance', 'Endurance', 'General wellness'];

export default function ClientSettings() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });

  const [form, setForm] = useState({
    age: '', gender: '', heightCm: '', weightKg: '', goals: '',
    activity: 'moderate', allergies: '', medical: '', preferences: '',
  });

  // Hydrate the form once profile data arrives. Each field falls back to ''
  // so the inputs stay controlled even when the column is null in the DB.
  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    setForm({
      age: p.age?.toString() ?? '',
      gender: p.gender ?? '',
      heightCm: (p as { height_cm?: number }).height_cm?.toString() ?? '',
      weightKg: '',
      goals: p.goals ?? '',
      activity: (p as { activity_level?: string }).activity_level ?? 'moderate',
      allergies: (p as { allergies?: string }).allergies ?? '',
      medical:   (p as { medical_conditions?: string }).medical_conditions ?? '',
      preferences: (p as { food_preferences?: string }).food_preferences ?? '',
    });
  }, [profileQ.data]);

  const saveMut = useMutation({
    mutationFn: clientsApi.updateMyProfile,
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'wellness', 'snapshot'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save changes.'),
  });

  function save() {
    // Only send fields that have a value — the backend treats undefined as
    // "leave alone" and an empty string as "set to empty string." For
    // nullable text fields the latter is usually wrong (the user just
    // hasn't filled it in yet), so we strip empty strings before sending.
    const patch: Parameters<typeof clientsApi.updateMyProfile>[0] = {};
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const str = (v: string) => (v.trim() === '' ? undefined : v.trim());
    if (num(form.age) !== undefined && Number.isFinite(num(form.age))) patch.age = num(form.age) as number;
    if (num(form.heightCm) !== undefined && Number.isFinite(num(form.heightCm))) patch.height_cm = num(form.heightCm) as number;
    if (str(form.gender))     patch.gender = str(form.gender);
    if (str(form.goals))      patch.goals = str(form.goals);
    if (str(form.activity))   patch.activity_level = str(form.activity);
    if (str(form.allergies))  patch.allergies = str(form.allergies);
    if (str(form.medical))    patch.medical_conditions = str(form.medical);
    if (str(form.preferences)) patch.food_preferences = str(form.preferences);
    saveMut.mutate(patch);
  }

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Account · Settings</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Your wellness profile</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            What SIRAH and your nutritionist use to personalize your plan.
          </p>
        </motion.div>

        {/* Identity */}
        <motion.div variants={fadeUp} className="mt-6">
          <Section title="About you" icon={<User className="h-4 w-4" />}>
            <Grid>
              <Field label="Name">
                <input value={profileQ.data?.name ?? ''} disabled
                  className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm" />
              </Field>
              <Field label="Email">
                <input value={profileQ.data?.email ?? ''} disabled
                  className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm" />
              </Field>
              <Field label="Age">
                <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })}
                  type="number" placeholder="e.g. 32"
                  className={inputCls} />
              </Field>
              <Field label="Gender">
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className={inputCls}>
                  <option value="">Select…</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Height (cm)">
                <input value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                  type="number" placeholder="e.g. 172" className={inputCls} />
              </Field>
              <Field label="Current weight (kg)">
                <input value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                  type="number" placeholder="e.g. 68" className={inputCls} />
              </Field>
            </Grid>
          </Section>
        </motion.div>

        {/* Goals + lifestyle */}
        <motion.div variants={fadeUp} className="mt-4">
          <Section title="Goals + lifestyle" icon={<Heart className="h-4 w-4" />}>
            <Grid>
              <Field label="Primary goal">
                <select value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })}
                  className={inputCls}>
                  <option value="">Select…</option>
                  {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Activity level">
                <select value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })}
                  className={inputCls}>
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="active">Active</option>
                  <option value="very_active">Very active</option>
                </select>
              </Field>
            </Grid>
          </Section>
        </motion.div>

        {/* Health profile */}
        <motion.div variants={fadeUp} className="mt-4">
          <Section title="Health profile" icon={<Activity className="h-4 w-4" />}>
            <Field label="Allergies" icon={<AlertCircle className="h-3.5 w-3.5 text-rose-500" />}>
              <textarea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                placeholder="e.g. nuts, dairy, shellfish" rows={2} className={inputCls} />
            </Field>
            <Field label="Medical conditions">
              <textarea value={form.medical} onChange={(e) => setForm({ ...form, medical: e.target.value })}
                placeholder="e.g. PCOS, diabetes, hypertension" rows={2} className={inputCls} />
            </Field>
            <Field label="Food preferences" icon={<Apple className="h-3.5 w-3.5 text-emerald-500" />}>
              <textarea value={form.preferences} onChange={(e) => setForm({ ...form, preferences: e.target.value })}
                placeholder="e.g. vegetarian, no spice, South Indian" rows={2} className={inputCls} />
            </Field>
          </Section>
        </motion.div>

        {/* Save */}
        <motion.div variants={fadeUp} className="mt-6">
          <button
            type="button"
            onClick={save}
            disabled={saveMut.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)] disabled:opacity-60"
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}

const inputCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-violet-400/50 focus:outline-none';

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Glass className="p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground/[0.05]">{icon}</span>
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </Glass>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className={cn('flex items-center gap-1.5 text-xs font-medium text-foreground/65')}>
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}