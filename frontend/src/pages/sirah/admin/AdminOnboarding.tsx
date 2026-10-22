import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, Loader2, Rocket, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { AdminHeader } from './AdminHeader';
import {
  SECTION_LABELS, practiceOnboardingApi, type AdminOnboarding, type OnboardingStatus, type SectionKey, type SectionStatus,
} from '@/modules/super-admin/api/practiceOnboarding';

const STATUS: Record<OnboardingStatus, { label: string; cls: string }> = {
  invited: { label: 'Invited', cls: 'bg-foreground/[0.06] text-foreground/70' },
  opened: { label: 'Opened', cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  in_progress: { label: 'In progress', cls: 'bg-amber-400/15 text-amber-700 dark:text-amber-300' },
  submitted: { label: 'Waiting for your approval', cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  changes: { label: 'Changes requested', cls: 'bg-orange-400/15 text-orange-700 dark:text-orange-300' },
  approved: { label: 'Trial active', cls: 'bg-teal-700 text-teal-100' },
  cancelled: { label: 'Cancelled', cls: 'bg-foreground/[0.06] text-foreground/50' },
};
const ago = (iso: string | null) => {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const waLink = (o: { phone: string | null; name: string; link: string }) => {
  const digits = (o.phone ?? '').replace(/\D/g, '');
  const to = digits.length === 10 ? `91${digits}` : digits;
  const text = `Hi ${o.name.split(' ')[0]}, here is your personal link to set up your practice on NUSI. Fill it at your own pace; it saves as you go:\n${o.link}`;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
};

function SectionBox({ status, n, label }: { status: SectionStatus; n: number; label: string }) {
  return (
    <span title={`${label}: ${status === 'done' ? 'completed' : status === 'in_progress' ? 'in progress' : 'not started'}`}
      className={cn('grid h-7 w-7 place-items-center rounded-lg text-[11px] font-bold',
        status === 'done' ? 'bg-teal-600 text-white' : status === 'in_progress' ? 'bg-amber-300/30 text-amber-700 ring-1 ring-amber-400/60 dark:text-amber-300' : 'bg-foreground/[0.05] text-foreground/35')}>
      {status === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : status === 'in_progress' ? '•' : n}
    </span>
  );
}

/**
 * Guided practice onboarding: create a personal setup link, send it, watch
 * each of the six sections fill in, then approve to start their trial.
 */
export default function AdminOnboarding() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'practice-onboarding'], queryFn: () => practiceOnboardingApi.list(), refetchInterval: 15_000 });
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', plan: 'trial' });
  const [created, setCreated] = useState<AdminOnboarding | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'practice-onboarding'] });

  const create = useMutation({
    mutationFn: () => practiceOnboardingApi.create({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, plan: form.plan }),
    onSuccess: (o) => { setCreated(o); setSel(o.id); setForm({ name: '', email: '', phone: '', plan: 'trial' }); void refresh(); toast.success('Link created'); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not create the link'),
  });

  const rows = q.data ?? [];
  const current = rows.find((r) => r.id === sel) ?? null;
  const waiting = rows.filter((r) => r.status === 'submitted').length;
  const canCreate = form.name.trim().length >= 2 && /@/.test(form.email);
  const input = 'h-10 w-full min-w-0 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 text-sm outline-none focus:border-teal-500/60';

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
      <div className="mb-6">
        <AdminHeader
          eyebrow="Growth"
          title={<span className="flex items-center gap-2"><Rocket className="h-7 w-7" /> Practice onboarding</span>}
          subtitle="Send a nutritionist a personal setup link. Watch each section fill in, then approve to start their trial."
        />
      </div>

      <Glass className="mb-5 grid gap-3 p-5">
        <div className="text-sm font-semibold">Create an onboarding link</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs font-medium text-foreground/65">Nutritionist name<input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Kavya Menon" /></label>
          <label className="grid gap-1 text-xs font-medium text-foreground/65">Email<input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="kavya@clinic.in" /></label>
          <label className="grid gap-1 text-xs font-medium text-foreground/65">WhatsApp number<input className={input} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98470 11223" /></label>
          <label className="grid gap-1 text-xs font-medium text-foreground/65">Plan they're interested in
            <select className={input} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              <option value="trial">Not decided (trial)</option><option value="starter">Starter</option><option value="growth">Growth</option><option value="scale_pro">Scale Pro</option>
            </select></label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!canCreate || create.isPending} onClick={() => create.mutate()}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-teal-600 px-5 text-sm font-semibold text-white disabled:opacity-40">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Create link
          </button>
          <span className="text-xs text-foreground/55">The link expires in 7 days. Their name, email and phone are pre-filled for them. The trial length is the one set in platform settings; the plan is a note for later.</span>
        </div>
        {created && <LinkRow o={created} onClose={() => setCreated(null)} />}
      </Glass>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">Onboarding {waiting > 0 && <span className="ml-2 rounded-full bg-teal-500/15 px-2.5 py-1 text-xs text-teal-700 dark:text-teal-300">{waiting} waiting for approval</span>}</div>
        <div className="flex flex-wrap gap-3 text-xs text-foreground/60">
          <span className="inline-flex items-center gap-1.5"><SectionBox status="done" n={1} label="" />Completed</span>
          <span className="inline-flex items-center gap-1.5"><SectionBox status="in_progress" n={1} label="" />In progress</span>
          <span className="inline-flex items-center gap-1.5"><SectionBox status="none" n={1} label="" />Not started</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Glass className="overflow-x-auto p-0">
          {q.isLoading ? <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-foreground/40" /></div>
            : q.isError ? <div className="flex items-center justify-between gap-3 p-5 text-sm text-rose-700 dark:text-rose-200">Couldn't load onboarding links.<button type="button" onClick={() => void q.refetch()} className="rounded-full border border-current/30 px-3 py-1 text-xs font-semibold">Try again</button></div>
              : rows.length === 0 ? <div className="p-8 text-center text-sm text-foreground/55">No links yet. Create one above and send it to a nutritionist.</div>
                : (
                  <table className="w-full min-w-[640px] text-sm">
                    <thead><tr className="border-b border-foreground/[0.06] text-left text-[11px] text-foreground/50">
                      <th className="px-4 py-3 font-medium">Nutritionist</th><th className="px-2 py-3 font-medium">Sections</th><th className="px-2 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Last activity</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} tabIndex={0} onClick={() => setSel(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(r.id); }}
                          className={cn('cursor-pointer border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.02]', sel === r.id && 'bg-teal-500/[0.06]')}>
                          <td className="px-4 py-3"><div className="font-semibold">{r.name}</div><div className="text-xs text-foreground/55">{r.practice_name ?? r.email}</div></td>
                          <td className="px-2 py-3"><div className="flex gap-1">{r.sections.map((s, i) => <SectionBox key={s.key} status={s.status} n={i + 1} label={s.label} />)}</div><div className="mt-1 text-[11px] text-foreground/50">{r.done_count}/6</div></td>
                          <td className="px-2 py-3"><span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold', r.expired ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : STATUS[r.status].cls)}>{r.expired ? 'Link expired' : STATUS[r.status].label}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground/55">{ago(r.last_activity_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </Glass>
        {current ? <Detail o={current} onChanged={() => void refresh()} /> : <Glass className="grid place-items-center p-8 text-center text-sm text-foreground/55">Select a nutritionist to see their sections.</Glass>}
      </div>
    </div>
  );
}

function LinkRow({ o, onClose }: { o: AdminOnboarding; onClose?: () => void }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(o.link); toast.success('Link copied'); } catch { toast.error('Copy failed. Select the link and copy it.'); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-teal-500/40 bg-teal-500/[0.04] px-3 py-2.5">
      <code className="min-w-0 flex-1 break-all text-[13px] text-teal-800 dark:text-teal-200">{o.link}</code>
      <button type="button" onClick={() => void copy()} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/10 px-3 text-xs font-semibold"><Copy className="h-3.5 w-3.5" />Copy</button>
      <a href={waLink(o)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25d366] px-3 text-xs font-semibold text-white"><Send className="h-3.5 w-3.5" />Send on WhatsApp</a>
      {onClose && <button type="button" onClick={onClose} aria-label="Hide" className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-foreground/[0.05]"><X className="h-4 w-4" /></button>}
    </div>
  );
}

function Detail({ o, onChanged }: { o: AdminOnboarding; onChanged: () => void }) {
  const [asking, setAsking] = useState(false);
  const [section, setSection] = useState<SectionKey>('billing');
  const [note, setNote] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const run = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { toast.success(ok); onChanged(); }).catch((e: Error) => toast.error(e.message));
  const approve = useMutation({ mutationFn: () => practiceOnboardingApi.approve(o.id), onSuccess: () => { toast.success('Approved. Their trial has started.'); onChanged(); }, onError: (e: Error) => toast.error(e.message) });
  const d = o.section_data;
  const val = (k: SectionKey, f: string) => {
    const v = d[k]?.[f];
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? String((x as { label?: string; slot?: string }).label || (x as { slot?: string }).slot) : String(x))).join(', ') || '—';
    return v === null || v === undefined || v === '' ? '—' : String(v);
  };
  const facts: Array<[SectionKey, string, string]> = [
    ['practice', 'Practice', 'practice_name'], ['practice', 'City', 'city'], ['practice', 'Specialities', 'specializations'],
    ['meals', 'Meal times', 'slots'], ['clients', 'Clients now', 'client_count'], ['billing', 'PAN', 'pan'], ['billing', 'GSTIN', 'gstin'],
  ];

  return (
    <Glass className="grid content-start gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="text-base font-semibold">{o.name}</div><div className="text-xs text-foreground/55">{o.email}{o.phone ? ` · ${o.phone}` : ''} · plan: {o.plan_key.replace('_', ' ')}</div></div>
        <span className={cn('rounded-full px-2.5 py-1 text-[11.5px] font-semibold', o.expired ? 'bg-rose-500/10 text-rose-700' : STATUS[o.status].cls)}>{o.expired ? 'Link expired' : STATUS[o.status].label}</span>
      </div>

      <div className="divide-y divide-foreground/[0.05]">
        {o.sections.map((s, i) => (
          <div key={s.key} className="flex items-center gap-3 py-2.5 text-sm">
            <SectionBox status={s.status} n={i + 1} label={s.label} />
            <div className="min-w-0 flex-1"><div className="font-medium">{s.label}</div><div className="text-xs text-foreground/50">{SECTION_LABELS[s.key].hint}</div></div>
            <span className={cn('text-xs font-semibold', s.status === 'done' ? 'text-teal-600' : s.status === 'in_progress' ? 'text-amber-600' : 'text-foreground/40')}>
              {s.status === 'done' ? 'Completed' : s.status === 'in_progress' ? 'In progress' : 'Not started'}
            </span>
          </div>
        ))}
      </div>

      {o.done_count > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-foreground/[0.03] p-3 text-xs">
          {facts.map(([k, label, f]) => (<Fragment key={label}><dt className="text-foreground/50">{label}</dt><dd className="break-words font-medium">{val(k, f)}</dd></Fragment>))}
        </dl>
      )}

      {o.changes && <p className="rounded-xl bg-orange-400/10 px-3 py-2 text-xs text-orange-800 dark:text-orange-200"><b>Asked to change {SECTION_LABELS[o.changes.section].label}:</b> {o.changes.note}</p>}

      <ul className="grid gap-1 text-xs text-foreground/60">
        {[...o.activity].reverse().slice(0, 8).map((a, i) => <li key={i}>• {a.text} <span className="text-foreground/40">· {ago(a.at)}</span></li>)}
      </ul>

      {o.status === 'submitted' && !asking && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={approve.isPending} onClick={() => approve.mutate()} className="inline-flex h-10 items-center gap-2 rounded-full bg-teal-600 px-5 text-sm font-semibold text-white disabled:opacity-50">
            {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Approve & start trial
          </button>
          <button type="button" onClick={() => setAsking(true)} className="h-10 rounded-full border border-foreground/10 px-4 text-sm font-medium">Ask for changes</button>
        </div>
      )}
      {asking && (
        <div className="grid gap-2 rounded-xl border border-orange-400/30 p-3">
          <label className="grid gap-1 text-xs font-medium text-foreground/65">Which section
            <select className="h-9 rounded-lg border border-foreground/10 bg-transparent px-2 text-sm" value={section} onChange={(e) => setSection(e.target.value as SectionKey)}>
              {(Object.keys(SECTION_LABELS) as SectionKey[]).map((k) => <option key={k} value={k}>{SECTION_LABELS[k].label}</option>)}
            </select></label>
          <label className="grid gap-1 text-xs font-medium text-foreground/65">What should they fix
            <textarea rows={2} className="rounded-lg border border-foreground/10 bg-transparent p-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. PAN does not match your name" /></label>
          <div className="flex gap-2">
            <button type="button" disabled={note.trim().length < 3} onClick={() => void run(() => practiceOnboardingApi.changes(o.id, section, note.trim()), 'Sent back with your note').then(() => { setAsking(false); setNote(''); })}
              className="h-9 rounded-full bg-orange-500 px-4 text-xs font-semibold text-white disabled:opacity-40">Send back</button>
            <button type="button" onClick={() => setAsking(false)} className="h-9 rounded-full border border-foreground/10 px-4 text-xs">Cancel</button>
          </div>
        </div>
      )}
      {o.status === 'approved' && o.workspace_id && <a href={`/admin/workspaces/${o.workspace_id}`} className="text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">Open their workspace →</a>}

      {!['approved', 'cancelled'].includes(o.status) && (
        <div className="grid gap-2 border-t border-foreground/[0.06] pt-3">
          <LinkRow o={o} />
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => void run(() => practiceOnboardingApi.extend(o.id), 'Link extended by 7 days')} className="h-8 rounded-full border border-foreground/10 px-3">Extend link 7 days</button>
            {confirmCancel
              ? <><span className="self-center text-foreground/60">Cancel this link?</span><button type="button" onClick={() => void run(() => practiceOnboardingApi.cancel(o.id), 'Link cancelled')} className="h-8 rounded-full bg-rose-600 px-3 font-semibold text-white">Yes, cancel</button><button type="button" onClick={() => setConfirmCancel(false)} className="h-8 rounded-full border border-foreground/10 px-3">No</button></>
              : <button type="button" onClick={() => setConfirmCancel(true)} className="h-8 rounded-full border border-foreground/10 px-3 text-rose-600">Cancel link</button>}
          </div>
        </div>
      )}
    </Glass>
  );
}
