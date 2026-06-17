import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { useScope } from '@/hooks/useScope';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { WorkspacePhotoModal } from '@/modules/workspace/WorkspacePhotoModal';

export function GeneralSection() {
  // The signed-in user's login email is the source of truth for "Contact email".
  const { data: scope } = useScope();
  const queryClient = useQueryClient();
  // Real workspace row — the source of truth for every field on this form.
  const { data: ws } = useQuery({
    queryKey: ['workspace', 'me'],
    queryFn: () => workspacesApi.me(),
    staleTime: 5 * 60 * 1000,
  });

  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [language, setLanguage] = useState('en-IN');
  // Reactive logo from the shared workspace brand; the photo modal handles
  // upload + remove, identical to the sidebar profile avatar.
  const { logoUrl } = useWorkspaceBrand();
  const [photoOpen, setPhotoOpen] = useState(false);

  // Seed the form from the workspace row once it loads. A ref guards against
  // re-seeding on background refetches, so it never clobbers an in-progress edit.
  const seeded = useRef(false);
  useEffect(() => {
    if (!ws || seeded.current) return;
    seeded.current = true;
    setName(ws.name ?? '');
    setLegalName(ws.legal_name ?? '');
    // Fall back to the login email when the workspace has no contact email yet.
    setContactEmail(ws.contact_email ?? scope?.email ?? '');
    setPhone(ws.contact_phone ?? '');
    if (ws.timezone) setTimezone(ws.timezone);
    if (ws.locale) setLanguage(ws.locale);
  }, [ws, scope?.email]);

  // Until the workspace row arrives, still surface the login email so the field
  // is never blank for the user.
  useEffect(() => {
    if (!seeded.current && scope?.email) setContactEmail((cur) => cur || scope.email!);
  }, [scope?.email]);

  const save = useMutation({
    mutationFn: () => {
      // Only send fields that have a value: keeps the required `name` from being
      // blanked and avoids @IsEmail rejecting an empty contact email.
      const payload: Parameters<typeof workspacesApi.update>[0] = { timezone, locale: language };
      if (name.trim()) payload.name = name.trim();
      if (legalName.trim()) payload.legal_name = legalName.trim();
      if (contactEmail.trim()) payload.contact_email = contactEmail.trim();
      if (phone.trim()) payload.contact_phone = phone.trim();
      return workspacesApi.update(payload);
    },
    onSuccess: () => {
      // Refresh the workspace row + branding (so the topbar/sidebar name updates).
      void queryClient.invalidateQueries({ queryKey: ['workspace'] });
      toast.success('General settings saved.');
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : 'Could not save settings.'),
  });

  return (
    <SectionHeader
      title="General"
      subtitle="The basics of your practice. Visible to clients on invoices and the client portal."
    >
      <WorkspacePhotoModal open={photoOpen} onClose={() => setPhotoOpen(false)} />
      <Glass className="p-6">
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[120px_1fr]">
          {/* Logo */}
          <div>
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              aria-label="Workspace logo — click to change"
              className="group flex aspect-square w-24 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-foreground/20 bg-foreground/[0.03] transition-all hover:border-violet-400/40 hover:bg-foreground/[0.06] hover:ring-2 hover:ring-violet-400/30"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-foreground/75 dark:text-foreground/55">
                  <Camera className="h-5 w-5" />
                  <span className="text-[10px] uppercase tracking-[0.18em]">Logo</span>
                </div>
              )}
            </button>
            <div className="mt-2 text-[11px] text-foreground/75 dark:text-foreground/55">~256px PNG/SVG</div>
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="mt-1 text-[11px] text-violet-600 hover:underline dark:text-violet-300"
            >
              {logoUrl ? 'Change or remove' : 'Upload photo'}
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Practice name" value={name} onChange={setName} hint="Shown to clients" />
              <Field label="Legal entity" value={legalName} onChange={setLegalName} hint="On invoices" />
              <Field label="Contact email" value={contactEmail} onChange={setContactEmail} type="email" />
              <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
              <Select
                label="Timezone"
                value={timezone}
                onChange={setTimezone}
                options={['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York']}
              />
              <Select
                label="Default language"
                value={language}
                onChange={setLanguage}
                options={['en-IN', 'en-US', 'hi-IN', 'ta-IN']}
              />
            </div>
          </div>
        </div>
      </Glass>

      <FooterBar
        saving={save.isPending}
        onSave={() => save.mutate()}
        onCancel={() => {
          // Reset the form back to the persisted workspace values.
          if (ws) {
            setName(ws.name ?? '');
            setLegalName(ws.legal_name ?? '');
            setContactEmail(ws.contact_email ?? scope?.email ?? '');
            setPhone(ws.contact_phone ?? '');
            setTimezone(ws.timezone ?? 'Asia/Kolkata');
            setLanguage(ws.locale ?? 'en-IN');
          }
          toast('Changes discarded.');
        }}
      />
    </SectionHeader>
  );
}

// ─── Shared field building blocks (used across sections) ─────────────────

export function SectionHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function FooterBar({
  onSave,
  onCancel,
  saving = false,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-1">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-foreground hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

export function Field({
  label, value, onChange, type = 'text', hint, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
      />
      {hint && <div className="mt-1 text-[11px] text-foreground/35">{hint}</div>}
    </label>
  );
}

export function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-elevated">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
