import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { User, Heart, Activity, Apple, AlertCircle, Save, Loader2, Camera, X, Quote, Plus, Trash2 } from 'lucide-react';
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

  // Banner quotes — saved on their own (independent of the profile form).
  const [quotes, setQuotes] = useState<string[]>([]);
  const [quoteDraft, setQuoteDraft] = useState('');
  useEffect(() => {
    const q = profileQ.data?.banner_quotes;
    if (Array.isArray(q)) setQuotes(q);
  }, [profileQ.data]);

  const quotesMut = useMutation({
    mutationFn: (next: string[]) => clientsApi.setBannerQuotes(next),
    onSuccess: (res) => {
      setQuotes(res.banner_quotes);
      toast.success('Banner quotes saved');
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save quotes.'),
  });

  function addQuote() {
    const q = quoteDraft.trim();
    if (!q) return;
    if (quotes.length >= 20) { toast.error('You can keep up to 20 quotes.'); return; }
    quotesMut.mutate([...quotes, q.slice(0, 200)]);
    setQuoteDraft('');
  }
  function removeQuote(i: number) {
    quotesMut.mutate(quotes.filter((_, idx) => idx !== i));
  }

  // Hydrate the form once profile data arrives. Each field falls back to ''
  // so the inputs stay controlled even when the column is null in the DB.
  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    setForm({
      age: p.age?.toString() ?? '',
      gender: p.gender ?? '',
      heightCm: p.height_cm?.toString() ?? '',
      weightKg: p.weight_kg?.toString() ?? '',
      goals: p.goals ?? '',
      activity: p.activity_level ?? 'moderate',
      allergies: p.allergies ?? '',
      medical:   p.medical_conditions ?? '',
      preferences: p.food_preferences ?? '',
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

  // Profile photo — saved on its own so it persists instantly without the form.
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarMut = useMutation({
    mutationFn: (avatar_url: string) => clientsApi.updateMyProfile({ avatar_url }),
    onSuccess: () => {
      toast.success('Profile photo updated');
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not update photo.'),
  });

  async function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image is too large — keep it under 8 MB.'); return; }
    setAvatarBusy(true);
    try {
      avatarMut.mutate(await downscaleToDataUrl(f, 512, 0.85));
    } catch {
      toast.error('Could not process that image.');
    } finally {
      setAvatarBusy(false);
    }
  }

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
    if (num(form.weightKg) !== undefined && Number.isFinite(num(form.weightKg))) patch.weight_kg = num(form.weightKg) as number;
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
        className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-10">
        {/* Header */}
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Account · Settings</span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Your wellness profile</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            What SIRAH LIFE and your nutritionist use to personalize your plan.
          </p>
        </motion.div>

        {/* Profile photo — full-width banner card */}
        <motion.div variants={fadeUp} className="mt-7">
          <Section title="Profile photo" icon={<Camera className="h-4 w-4" />}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid h-24 w-24 flex-shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.30)] to-[hsl(var(--brand-magenta)_/_0.20)] text-xl font-semibold ring-1 ring-inset ring-white/20">
                {profileQ.data?.avatar_url ? (
                  <img src={profileQ.data.avatar_url} alt="Your photo" className="h-full w-full object-cover" />
                ) : (
                  initialsOf(profileQ.data?.name ?? '')
                )}
              </div>
              <div className="flex flex-col gap-2.5">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={avatarBusy || avatarMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white shadow-[0_8px_24px_-12px_rgba(14,154,168,0.6)] disabled:opacity-50">
                    {avatarBusy || avatarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    {profileQ.data?.avatar_url ? 'Change photo' : 'Upload photo'}
                  </button>
                  {profileQ.data?.avatar_url && (
                    <button type="button" onClick={() => avatarMut.mutate('')} disabled={avatarMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-2 text-xs text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50">
                      <X className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-foreground/55">Shown to your nutritionist. Square images look best.</p>
              </div>
            </div>
          </Section>
        </motion.div>

        {/* Two-column section grid */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Identity */}
          <motion.div variants={fadeUp}>
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
          <motion.div variants={fadeUp}>
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

          {/* Health profile — spans both columns */}
          <motion.div variants={fadeUp} className="lg:col-span-2">
            <Section title="Health profile" icon={<Activity className="h-4 w-4" />}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Allergies" icon={<AlertCircle className="h-3.5 w-3.5 text-rose-500" />}>
                  <textarea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                    placeholder="e.g. nuts, dairy, shellfish" rows={3} className={inputCls} />
                </Field>
                <Field label="Medical conditions">
                  <textarea value={form.medical} onChange={(e) => setForm({ ...form, medical: e.target.value })}
                    placeholder="e.g. PCOS, diabetes, hypertension" rows={3} className={inputCls} />
                </Field>
                <Field label="Food preferences" icon={<Apple className="h-3.5 w-3.5 text-emerald-500" />}>
                  <textarea value={form.preferences} onChange={(e) => setForm({ ...form, preferences: e.target.value })}
                    placeholder="e.g. vegetarian, no spice, South Indian" rows={3} className={inputCls} />
                </Field>
              </div>
            </Section>
          </motion.div>
        </div>

        {/* Banner quotes — saved instantly, independent of the form */}
        <motion.div variants={fadeUp} className="mt-5">
          <Section title="Banner quotes" icon={<Quote className="h-4 w-4" />}>
            <p className="-mt-1 text-xs text-foreground/55">
              Add lines that inspire you — one shows on your Home banner each day. Leave empty to use SIRAH LIFE's defaults.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={quoteDraft}
                onChange={(e) => setQuoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuote(); } }}
                maxLength={200}
                placeholder="e.g. Small steps, every day."
                className={inputCls}
              />
              <button
                type="button"
                onClick={addQuote}
                disabled={quotesMut.isPending || !quoteDraft.trim()}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {quotesMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </button>
            </div>

            {quotes.length === 0 ? (
              <p className="mt-3 text-xs text-foreground/45">No quotes yet — SIRAH LIFE's defaults are showing on your banner.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {quotes.map((q, i) => (
                  <li key={`${q}-${i}`} className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
                    <Quote className="h-3.5 w-3.5 flex-shrink-0 text-teal-500" />
                    <span className="min-w-0 flex-1 truncate text-sm italic text-foreground/85">{q}</span>
                    <button
                      type="button"
                      onClick={() => removeQuote(i)}
                      disabled={quotesMut.isPending}
                      className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-foreground/45 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </motion.div>

        {/* Save */}
        <motion.div variants={fadeUp} className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saveMut.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-6 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] disabled:opacity-60 sm:w-auto"
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}

const inputCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none';

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

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '–';
}

/** Read an image File → square-ish JPEG data URL, longest edge `max` px. */
async function downscaleToDataUrl(file: File, max = 512, quality = 0.85): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not decode the image.'));
    i.src = raw;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}