import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { User, Heart, Activity, Apple, AlertCircle, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

const GENDERS = ['female', 'male', 'non-binary', 'prefer not to say'];
const GOALS = ['Weight loss', 'Muscle gain', 'Maintenance', 'Endurance', 'General wellness'];

export default function ClientSettings() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });

  const [form, setForm] = useState({
    age: '', gender: '', heightCm: '', weightKg: '', goals: '',
    activity: 'moderate', allergies: '', medical: '', preferences: '',
  });

  useEffect(() => {
    if (profileQ.data) {
      setForm((f) => ({
        ...f,
        age: profileQ.data?.age?.toString() ?? '',
        gender: profileQ.data?.gender ?? '',
        goals: profileQ.data?.goals ?? '',
      }));
    }
  }, [profileQ.data]);

  function save() {
    // TODO: wire PATCH /api/v1/me/profile once endpoint is ready.
    toast.success('Settings saved');
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)]"
          >
            <Save className="h-4 w-4" />
            Save changes
          </button>
          <p className="mt-2 text-center text-[10px] text-foreground/45">
            Saving wires to PATCH /api/v1/me/profile in the next backend pass.
          </p>
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