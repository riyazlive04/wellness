import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck, ShieldCheck, Clock, XCircle, Upload, FileText, Loader2, Trash2, Send,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { verificationApi, type VerificationDoc, type VerificationStatus } from '@/modules/workspace/api/verification';
import { cn } from '@/lib/utils';

const inputCls = 'w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none';

export function VerificationSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['workspace', 'verification'], queryFn: () => verificationApi.get() });

  const [form, setForm] = useState({
    legal_name: '', professional_title: '', qualifications: '',
    registration_number: '', experience_years: '', pan: '', gstin: '',
  });
  const [docs, setDocs] = useState<VerificationDoc[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Hydrate from the saved submission once it loads.
  useEffect(() => {
    const v = q.data;
    if (!v) return;
    setForm({
      legal_name: v.legal_name ?? '',
      professional_title: v.professional_title ?? '',
      qualifications: v.qualifications ?? '',
      registration_number: v.registration_number ?? '',
      experience_years: v.experience_years != null ? String(v.experience_years) : '',
      pan: v.pan ?? '',
      gstin: v.gstin ?? '',
    });
    setDocs(v.documents ?? []);
  }, [q.data]);

  const submitMut = useMutation({
    mutationFn: () => verificationApi.submit({
      legal_name: form.legal_name.trim() || undefined,
      professional_title: form.professional_title.trim() || undefined,
      qualifications: form.qualifications.trim() || undefined,
      registration_number: form.registration_number.trim() || undefined,
      experience_years: form.experience_years.trim() === '' ? undefined : Number(form.experience_years),
      pan: form.pan.trim() || undefined,
      gstin: form.gstin.trim() || undefined,
      documents: docs,
    }),
    onSuccess: () => {
      toast.success('Submitted for verification');
      qc.invalidateQueries({ queryKey: ['workspace', 'verification'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not submit.'),
  });

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast.error('Keep documents under 15 MB.'); return; }
    setUploading(true);
    try {
      const ticket = await verificationApi.uploadTicket(f.name);
      const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setDocs((d) => [...d, { type: 'document', file_name: f.name, storage_key: ticket.storageKey }]);
      toast.success('Document attached — submit to send for review.');
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const status: VerificationStatus = q.data?.status ?? 'unsubmitted';

  return (
    <div className="space-y-5">
      <StatusBanner status={status} reviewNotes={q.data?.review_notes ?? null} />

      <Glass className="p-5">
        <div className="mb-4 text-sm font-medium">Professional details</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Legal / business name">
            <input className={inputCls} value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="As on PAN / GST" />
          </Field>
          <Field label="Professional title">
            <input className={inputCls} value={form.professional_title} onChange={(e) => setForm({ ...form, professional_title: e.target.value })} placeholder="e.g. Registered Dietitian" />
          </Field>
          <Field label="Qualifications">
            <input className={inputCls} value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} placeholder="e.g. M.Sc Nutrition, RD" />
          </Field>
          <Field label="Registration / license no.">
            <input className={inputCls} value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} placeholder="e.g. IDA / RD number" />
          </Field>
          <Field label="Years of experience">
            <input className={inputCls} type="number" min={0} value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} placeholder="e.g. 6" />
          </Field>
        </div>
      </Glass>

      <Glass className="p-5">
        <div className="mb-4 text-sm font-medium">Compliance</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="PAN">
            <input className={cn(inputCls, 'uppercase')} maxLength={10} value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" />
          </Field>
          <Field label="GSTIN (optional)">
            <input className={cn(inputCls, 'uppercase')} maxLength={15} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="22ABCDE1234F1Z5" />
          </Field>
        </div>
      </Glass>

      <Glass className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Supporting documents</div>
            <p className="mt-0.5 text-xs text-foreground/55">Degree, registration certificate, or ID. PDF or image.</p>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={onPick} accept="image/*,application/pdf" />
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-foreground/15 px-3.5 py-2 text-xs font-medium text-foreground/85 hover:bg-foreground/[0.05] disabled:opacity-50">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Attach
          </button>
        </div>
        {docs.length > 0 && (
          <ul className="mt-3 space-y-2">
            {docs.map((d, i) => (
              <li key={d.storage_key} className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-cyan-500" />
                <span className="min-w-0 flex-1 truncate text-sm">{d.file_name}</span>
                <button type="button" onClick={() => setDocs((arr) => arr.filter((_, idx) => idx !== i))}
                  className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-foreground/45 hover:bg-rose-500/10 hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Glass>

      <div className="flex justify-end">
        <button type="button" disabled={submitMut.isPending} onClick={() => submitMut.mutate()}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-6 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(14,154,168,0.55)] disabled:opacity-60">
          {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {status === 'unsubmitted' ? 'Submit for verification' : 'Resubmit'}
        </button>
      </div>
    </div>
  );
}

function StatusBanner({ status, reviewNotes }: { status: VerificationStatus; reviewNotes: string | null }) {
  const map = {
    verified:    { icon: BadgeCheck, tint: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-400/30', title: 'Verified practitioner', body: 'Your practice is verified by Sirah Life.' },
    pending:     { icon: Clock,      tint: 'from-amber-400/15 to-amber-400/5 text-amber-700 dark:text-amber-300 border-amber-400/30', title: 'Under review', body: 'We\'re reviewing your submission. This usually takes 1–2 business days.' },
    rejected:    { icon: XCircle,    tint: 'from-rose-500/15 to-rose-500/5 text-rose-700 dark:text-rose-300 border-rose-400/30', title: 'Needs attention', body: reviewNotes || 'Your submission was not approved. Please review and resubmit.' },
    unsubmitted: { icon: ShieldCheck,tint: 'from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.10)] text-foreground border-foreground/10', title: 'Get verified', body: 'Submit your credentials to earn a verified badge and unlock payouts.' },
  }[status];
  const Icon = map.icon;
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border bg-gradient-to-br p-4', map.tint)}>
      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div>
        <div className="text-sm font-semibold">{map.title}</div>
        <p className="mt-0.5 text-xs opacity-90">{map.body}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-foreground/65">{label}</div>
      {children}
    </div>
  );
}
