import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  SECTION_LABELS, SECTION_ORDER, practiceOnboardingApi, type PublicOnboarding, type SectionKey, type SectionStatus,
} from '@/modules/super-admin/api/practiceOnboarding';

const SPECIALITIES = ['Weight loss', 'Diabetes', 'PCOS', 'Thyroid', 'Heart health', 'Sports nutrition', 'Pregnancy', 'Kids', 'Gut health', 'Kidney care'];
const MEAL_SLOTS: Array<{ slot: string; label: string }> = [
  { slot: 'cleansing_water', label: 'Cleansing water' }, { slot: 'early_morning', label: 'Early morning' },
  { slot: 'breakfast', label: 'Breakfast' }, { slot: 'mid_breakfast', label: 'Mid-breakfast' }, { slot: 'mid_morning', label: 'Mid-morning' },
  { slot: 'lunch', label: 'Lunch' }, { slot: 'evening_snack_1', label: 'Evening snack 1' }, { slot: 'evening_snack', label: 'Evening snack' },
  { slot: 'evening_snack_2', label: 'Evening snack 2' }, { slot: 'dinner', label: 'Dinner' },
];
const STANDARD = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'];
const STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Jammu and Kashmir', 'Other'];

type Draft = Record<string, unknown>;
const msg = (e: unknown) => (e instanceof ApiError ? e.message : (e as Error)?.message) || 'Something went wrong';

/**
 * The page a nutritionist opens from the onboarding link NUSI sent them. Six
 * sections, any order, autosaved. After submitting they wait on a "checking"
 * screen that updates by itself when NUSI approves.
 */
export default function PracticeSetup() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['practice-setup', token],
    queryFn: () => practiceOnboardingApi.open(token),
    retry: false,
    // While waiting for approval, check every 8 s so the page flips by itself.
    refetchInterval: (query) => (query.state.data?.status === 'submitted' ? 8000 : false),
  });

  if (q.isLoading) return <Shell><div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[#3f9b0b]" /></div></Shell>;
  if (q.isError || !q.data) {
    return (
      <Shell>
        <div className="grid justify-items-center gap-3 px-6 py-20 text-center">
          <h1 className="text-2xl font-bold">This link can't be opened</h1>
          <p className="max-w-sm text-[15px] text-[#56615a]">{msg(q.error)}</p>
          <p className="text-sm text-[#98a29b]">Contact the NUSI team at support.nusi@gmail.com for a new link.</p>
        </div>
      </Shell>
    );
  }
  const set = (d: PublicOnboarding) => qc.setQueryData(['practice-setup', token], d);
  if (q.data.status === 'approved') return <Approved data={q.data} />;
  if (q.data.status === 'submitted') return <Waiting />;
  return <Form token={token} data={q.data} onData={set} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#eef2eb] px-0 py-0 font-['Poppins',ui-sans-serif,system-ui] text-[#1b241d] sm:px-4 sm:py-8">
      <style>{'@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap");'}</style>
      <div className="mx-auto w-full max-w-[720px] overflow-hidden bg-white sm:rounded-[22px] sm:shadow-[0_30px_60px_-36px_rgb(0_0_0/0.35)]">{children}</div>
    </div>
  );
}

function Waiting() {
  return (
    <Shell>
      <div className="grid min-h-[560px] content-center justify-items-center gap-4 px-6 py-14 text-center">
        <div className="h-16 w-16 animate-spin rounded-full border-[5px] border-[#e2eedb] border-t-[#3f9b0b] motion-reduce:animate-none" aria-hidden />
        <h1 className="text-[24px] font-bold">Checking your details…</h1>
        <p className="max-w-[40ch] text-[15px] leading-relaxed text-[#56615a]">Your trial will be activated within a few minutes. The NUSI team is reviewing your practice details.</p>
        <div className="grid w-full max-w-[300px] gap-2 text-left text-sm">
          <p className="flex items-center gap-2"><Check className="h-4 w-4 text-[#3f9b0b]" />All 6 sections received</p>
          <p className="flex items-center gap-2"><Check className="h-4 w-4 text-[#3f9b0b]" />Your account is created</p>
          <p className="flex items-center gap-2 text-[#98a29b]"><span className="grid h-4 w-4 place-items-center">◌</span>NUSI team reviewing</p>
          <p className="flex items-center gap-2 text-[#98a29b]"><span className="grid h-4 w-4 place-items-center">◌</span>14-day trial starts</p>
        </div>
        <span className="rounded-full bg-[#fef3c7] px-4 py-2 text-sm font-semibold text-[#b45309]">Please don't close this page</span>
        <p className="text-[13px] text-[#98a29b]">This page updates by itself. If it takes longer, we'll email you when your trial is active.</p>
      </div>
    </Shell>
  );
}

function Approved({ data }: { data: PublicOnboarding }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const practice = String(data.sections.practice?.data?.practice_name ?? 'Your practice');
  const ends = new Date(Date.now() + data.trial_days * 86_400_000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const open = async () => {
    const { data: s } = await supabase.auth.getSession();
    if (s.session) {
      await qc.invalidateQueries();
      navigate('/dashboard', { replace: true });
    } else {
      navigate(`/auth?role=pro&email=${encodeURIComponent(data.email)}`, { replace: true });
    }
  };
  return (
    <Shell>
      <div className="grid min-h-[560px] content-center justify-items-center gap-4 px-6 py-14 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[#3f9b0b] text-white shadow-[0_18px_34px_-16px_rgb(40_110_10/0.8)]"><Check className="h-10 w-10" strokeWidth={3} /></div>
        <h1 className="text-[26px] font-bold">You're approved, {data.name.split(' ')[0]}!</h1>
        <p className="max-w-[40ch] text-[15px] text-[#56615a]">{practice} is ready. Your {data.trial_days}-day free trial has started, with every feature unlocked.</p>
        <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#123a0b] px-4 py-3 text-left text-sm text-[#dff3c8]">
          <span><b className="text-white">Trial active</b> · {data.trial_days} days left · ends {ends}</span><span>Approved by NUSI</span>
        </div>
        <button type="button" onClick={() => void open()} className="h-12 rounded-full bg-[#3f9b0b] px-8 font-semibold text-white">Open my dashboard</button>
      </div>
    </Shell>
  );
}

function Form({ token, data, onData }: { token: string; data: PublicOnboarding; onData: (d: PublicOnboarding) => void }) {
  const firstOpen = SECTION_ORDER.find((k) => data.sections[k].status !== 'done') ?? null;
  const [open, setOpen] = useState<SectionKey | null>(data.changes?.section ?? firstOpen);
  const done = SECTION_ORDER.filter((k) => data.sections[k].status === 'done').length;
  const submit = useMutation({
    mutationFn: () => practiceOnboardingApi.submit(token),
    onSuccess: onData,
    onError: (e) => toast.error(msg(e)),
  });
  return (
    <Shell>
      <header className="grid gap-2 bg-[#123a0b] px-6 py-6 text-[#eaf5e1]">
        <div className="flex items-center gap-2 font-bold text-white"><img src="/nusi-mark.png" alt="" className="h-7 w-7 rounded-lg" />NUSI</div>
        <h1 className="text-[22px] font-bold text-white">Welcome, {data.name.split(' ')[0]}. Let's set up your practice.</h1>
        <p className="text-[13.5px] text-[#c9dfbb]">Fill each section when you're ready. Everything saves automatically, so you can close this and come back to the same link.</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-[#c9dfbb]">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full rounded-full bg-[#8fdc3a] transition-all" style={{ width: `${(done / 6) * 100}%` }} /></span>
          {done} of 6
        </div>
      </header>
      <div className="grid gap-3 p-4 sm:p-5">
        {data.changes && (
          <div className="rounded-2xl border border-[#fed7aa] bg-[#fff1e6] px-4 py-3 text-sm leading-relaxed text-[#9a3412]">
            <b>NUSI asked for a change in {SECTION_LABELS[data.changes.section].label}:</b> {data.changes.note}
          </div>
        )}
        {SECTION_ORDER.map((k, i) => (
          <Section key={k} k={k} n={i + 1} token={token} data={data} open={open === k}
            onToggle={() => setOpen(open === k ? null : k)}
            onSaved={(d, completed) => { onData(d); if (completed) setOpen(SECTION_ORDER.find((x) => d.sections[x].status !== 'done') ?? null); }} />
        ))}
        {done === 6 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[1.5px] border-[#bfe39b] bg-[#e9f6dd] p-4 text-sm">
            <span><b>All 6 sections are complete.</b> Submit to start your {data.trial_days}-day trial.</span>
            <button type="button" disabled={submit.isPending} onClick={() => submit.mutate()} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#3f9b0b] px-6 font-semibold text-white disabled:opacity-60">
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Submit for approval
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function badge(st: SectionStatus) {
  return st === 'done' ? { cls: 'bg-[#3f9b0b] text-white', text: 'Completed', color: 'text-[#3f9b0b]' }
    : st === 'in_progress' ? { cls: 'bg-[#fef3c7] text-[#b45309] ring-1 ring-[#f5d27a]', text: 'In progress', color: 'text-[#b45309]' }
      : { cls: 'bg-[#f1f3f0] text-[#98a29b]', text: 'Start', color: 'text-[#98a29b]' };
}

function Section({ k, n, token, data, open, onToggle, onSaved }: {
  k: SectionKey; n: number; token: string; data: PublicOnboarding; open: boolean; onToggle: () => void;
  onSaved: (d: PublicOnboarding, completed: boolean) => void;
}) {
  const st = data.sections[k].status;
  const b = badge(st);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(k, data.sections[k].data));
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  const save = useMutation({
    mutationFn: (complete: boolean) => practiceOnboardingApi.save(token, k, draft, complete, k === 'account' ? password : undefined),
    onSuccess: async (d, complete) => {
      setError(null);
      dirty.current = false;
      if (complete && k === 'account' && password) {
        // Sign them in now, so "Open my dashboard" works straight after approval.
        await supabase.auth.signInWithPassword({ email: String(draft.email), password }).catch(() => undefined);
      }
      onSaved(d, complete);
    },
    onError: (e, complete) => { if (complete) setError(msg(e)); },
  });

  // Autosave a moment after typing stops (never marks the section done).
  const change = (patch: Draft) => {
    setDraft((cur) => ({ ...cur, ...patch }));
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (dirty.current) save.mutate(false); }, 1200);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const input = 'h-12 w-full rounded-xl border-[1.5px] border-[#e3e8e1] bg-white px-3.5 text-[15px] outline-none focus:border-[#3f9b0b]';
  const lbl = 'mb-1.5 block text-[12.5px] font-semibold text-[#56615a]';
  const field = (key: string, label: string, opts: { type?: string; placeholder?: string; optional?: boolean; inputMode?: 'numeric' | 'email' | 'tel' } = {}) => (
    <label className="block">
      <span className={lbl}>{label}{!opts.optional && <span className="text-rose-600"> *</span>}</span>
      <input className={input} type={opts.type ?? 'text'} inputMode={opts.inputMode} placeholder={opts.placeholder}
        value={String(draft[key] ?? '')} onChange={(e) => change({ [key]: e.target.value })} />
    </label>
  );

  return (
    <div className={cn('overflow-hidden rounded-2xl border-[1.5px] bg-white', open ? 'border-[#3f9b0b]' : 'border-[#e3e8e1]')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#3f9b0b]">
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold', b.cls)}>{st === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : st === 'in_progress' ? '•' : n}</span>
        <span className="min-w-0 flex-1"><b className="block text-[14.5px]">{SECTION_LABELS[k].label}</b><span className="text-xs text-[#98a29b]">{SECTION_LABELS[k].hint}</span></span>
        <span className={cn('text-xs font-semibold', b.color)}>{save.isPending ? 'Saving…' : b.text}</span>
        <ChevronDown className={cn('h-4 w-4 text-[#98a29b] transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-3.5 px-4 pb-4">
          {k === 'account' && (<>
            {field('name', 'Full name')}
            <div className="grid gap-3 sm:grid-cols-2">{field('email', 'Email', { type: 'email', inputMode: 'email' })}{field('phone', 'Phone', { inputMode: 'tel' })}</div>
            <label className="block">
              <span className={lbl}>{data.has_login ? 'Change password' : 'Choose a password'}{!data.has_login && <span className="text-rose-600"> *</span>}</span>
              <input className={input} type="password" autoComplete="new-password" placeholder={data.has_login ? 'Leave empty to keep it' : 'At least 8 characters'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <p className="rounded-xl bg-[#f3f8ef] px-3 py-2.5 text-xs text-[#56615a]">Pre-filled by the NUSI team. You'll sign in with this email and password.</p>
          </>)}
          {k === 'practice' && (<>
            {field('practice_name', 'Practice name', { placeholder: 'e.g. Priya Nutrition Clinic' })}
            <div className="grid gap-3 sm:grid-cols-2">
              {field('city', 'City')}
              <label className="block"><span className={lbl}>State<span className="text-rose-600"> *</span></span>
                <select className={input} value={String(draft.state ?? '')} onChange={(e) => change({ state: e.target.value })}>
                  <option value="">Choose…</option>{STATES.map((s) => <option key={s}>{s}</option>)}
                </select></label>
            </div>
            {field('experience_years', 'Years of experience', { inputMode: 'numeric' })}
            <Chips label="What do you specialise in?" options={SPECIALITIES} value={(draft.specializations as string[]) ?? []} onChange={(v) => change({ specializations: v })} />
          </>)}
          {k === 'branding' && (<>
            {field('tagline', 'Tagline', { placeholder: 'e.g. Eat well, live well' })}
            <LogoPicker value={(draft.logo as string | null) ?? null} onChange={(logo) => change({ logo })} />
          </>)}
          {k === 'meals' && <MealPicker value={(draft.slots as Array<{ slot: string; label: string }>) ?? []} onChange={(slots) => change({ slots })} />}
          {k === 'clients' && (<>
            {field('client_count', 'How many clients do you have now?', { inputMode: 'numeric' })}
            <CsvPicker rows={(draft.rows as Array<Record<string, string>>) ?? []} onChange={(rows) => change({ rows })} />
          </>)}
          {k === 'billing' && (<>
            <div className="grid gap-3 sm:grid-cols-2">{field('pan', 'PAN', { placeholder: 'ABCDE1234F' })}{field('gstin', 'GSTIN', { optional: true, placeholder: 'Optional' })}</div>
            <label className="block"><span className={lbl}>Billing address<span className="text-rose-600"> *</span></span>
              <textarea rows={3} className={cn(input, 'h-auto py-3')} value={String(draft.address ?? '')} onChange={(e) => change({ address: e.target.value })} /></label>
          </>)}
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#98a29b]">Saved automatically</span>
            <button type="button" disabled={save.isPending} onClick={() => { window.clearTimeout(timer.current); save.mutate(true); }}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#3f9b0b] px-6 text-sm font-semibold text-white disabled:opacity-60">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save section
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function initialDraft(k: SectionKey, d: Record<string, unknown>): Draft {
  if (k === 'meals' && !Array.isArray(d.slots)) return { slots: STANDARD.map((slot) => ({ slot, label: '' })) };
  if (k === 'practice' && !Array.isArray(d.specializations)) return { ...d, specializations: [] };
  return { ...d };
}

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState('');
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div>
      <span className="mb-1.5 block text-[12.5px] font-semibold text-[#56615a]">{label}<span className="text-rose-600"> *</span></span>
      <div className="flex flex-wrap gap-2">
        {all.map((o) => (
          <button key={o} type="button" aria-pressed={value.includes(o)} onClick={() => toggle(o)}
            className={cn('rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px]', value.includes(o) ? 'border-[#3f9b0b] bg-[#e9f6dd] font-semibold text-[#1f5a12]' : 'border-[#e3e8e1] text-[#56615a]')}>{o}</button>
        ))}
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="+ Add your own"
          onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { e.preventDefault(); onChange([...value, custom.trim()]); setCustom(''); } }}
          className="h-[34px] w-36 rounded-full border-[1.5px] border-dashed border-[#c9d1cb] px-3 text-[13px] outline-none focus:border-[#3f9b0b]" />
      </div>
    </div>
  );
}

function MealPicker({ value, onChange }: { value: Array<{ slot: string; label: string }>; onChange: (v: Array<{ slot: string; label: string }>) => void }) {
  const on = (slot: string) => value.find((v) => v.slot === slot);
  const toggle = (slot: string) => onChange(on(slot) ? value.filter((v) => v.slot !== slot) : MEAL_SLOTS.filter((m) => m.slot === slot || on(m.slot)).map((m) => on(m.slot) ?? { slot: m.slot, label: '' }));
  const rename = (slot: string, label: string) => onChange(value.map((v) => (v.slot === slot ? { ...v, label } : v)));
  return (
    <div className="grid gap-2">
      <span className="text-[12.5px] font-semibold text-[#56615a]">Tick the meals in your plans. Rename any to your own words (optional).</span>
      {MEAL_SLOTS.map((m) => {
        const sel = on(m.slot);
        return (
          <div key={m.slot} className={cn('flex items-center gap-3 rounded-xl border-[1.5px] px-3 py-2', sel ? 'border-[#bfe39b] bg-[#fbfef8]' : 'border-[#e3e8e1]')}>
            <button type="button" aria-pressed={!!sel} aria-label={m.label} onClick={() => toggle(m.slot)}
              className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px]', sel ? 'border-[#3f9b0b] bg-[#3f9b0b] text-white' : 'border-[#c9d1cb]')}>{sel && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</button>
            <span className="w-32 shrink-0 text-sm">{m.label}</span>
            {sel && <input value={sel.label} onChange={(e) => rename(m.slot, e.target.value)} placeholder="Your name for it (optional)" className="h-9 min-w-0 flex-1 rounded-lg border border-[#e3e8e1] px-2.5 text-[13px] outline-none focus:border-[#3f9b0b]" />}
          </div>
        );
      })}
    </div>
  );
}

function LogoPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const pick = (file: File | undefined) => {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // Shrink to 256 px so the logo is light to store and send.
      const size = 256, c = document.createElement('canvas');
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      onChange(c.toDataURL('image/png'));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { toast.error('That file is not an image we can read.'); URL.revokeObjectURL(url); };
    img.src = url;
  };
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-[#c9d1cb] bg-[#fafbf9]">
        {value ? <img src={value} alt="Your logo" className="h-full w-full object-contain" /> : <Upload className="h-5 w-5 text-[#98a29b]" />}
      </div>
      <label className="cursor-pointer text-sm">
        <b className="text-[#3f9b0b]">{value ? 'Change logo' : 'Upload logo'}</b> <span className="text-[#98a29b]">· optional, JPG or PNG</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {value && <button type="button" onClick={() => onChange(null)} className="text-xs text-[#98a29b] underline">Remove</button>}
    </div>
  );
}

/** Reads a CSV with name / email / phone columns (any order, header row). */
function CsvPicker({ rows, onChange }: { rows: Array<Record<string, string>>; onChange: (r: Array<Record<string, string>>) => void }) {
  const read = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { toast.error('The file has no client rows.'); return; }
    const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const col = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
    const ci = { name: col(['name']), email: col(['email', 'mail']), phone: col(['phone', 'mobile', 'whatsapp']) };
    if (ci.email < 0) { toast.error('Add an "email" column so clients can be invited.'); return; }
    const out = lines.slice(1).map((l) => l.split(',').map((x) => x.trim().replace(/^"|"$/g, '')))
      .map((c) => ({ name: ci.name >= 0 ? c[ci.name] : '', email: c[ci.email] ?? '', phone: ci.phone >= 0 ? c[ci.phone] : '' }))
      .filter((r) => /@/.test(r.email)).slice(0, 500);
    onChange(out);
    toast.success(`${out.length} clients read from the file`);
  };
  return (
    <div className="rounded-xl border border-dashed border-[#c9d1cb] bg-[#fafbf9] p-3 text-sm">
      <label className="cursor-pointer"><b className="text-[#3f9b0b]">Upload your client list</b> <span className="text-[#98a29b]">· optional, CSV with name, email, phone</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void read(e.target.files?.[0])} /></label>
      {rows.length > 0 && <p className="mt-1.5 text-xs text-[#56615a]">{rows.length} clients ready. They get an invite when your practice is approved. <button type="button" className="underline" onClick={() => onChange([])}>Clear</button></p>}
    </div>
  );
}
