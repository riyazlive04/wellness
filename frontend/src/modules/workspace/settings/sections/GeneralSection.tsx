import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';

// This file exports its own `Select` field wrapper (used above and by other
// sections), so the Radix root is aliased to SelectRoot to avoid the clash.
import {
  Select as SelectRoot, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Glass } from '@/design-system';
import { useScope } from '@/hooks/useScope';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { WorkspacePhotoModal } from '@/modules/workspace/WorkspacePhotoModal';

export function GeneralSection() {
  // The signed-in user's login email is the source of truth for "Contact email".
  const { data: scope } = useScope();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Real workspace row — the source of truth for every field on this form.
  const { data: ws } = useQuery({
    queryKey: ['workspace', 'me'],
    queryFn: () => workspacesApi.me(),
    staleTime: 5 * 60 * 1000,
  });

  // The owner's own name — drives the dashboard greeting + sidebar. Stored on
  // the Supabase account (user_metadata.name), not the workspace row.
  const [yourName, setYourName] = useState('');
  const seededName = useRef(false);
  useEffect(() => {
    if (seededName.current || !user) return;
    seededName.current = true;
    const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string };
    setYourName((meta.name || meta.full_name || '').trim());
  }, [user]);

  const [name, setName] = useState('');
  const [dashboardQuote, setDashboardQuote] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
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
    setDashboardQuote(ws.dashboard_quote ?? '');
    // Fall back to the login email when the workspace has no contact email yet.
    setContactEmail(ws.contact_email ?? scope?.email ?? '');
    setPhone(ws.contact_phone ?? '');
    if (ws.timezone) setTimezone(ws.timezone);
  }, [ws, scope?.email]);

  // Until the workspace row arrives, still surface the login email so the field
  // is never blank for the user.
  useEffect(() => {
    if (!seeded.current && scope?.email) setContactEmail((cur) => cur || scope.email!);
  }, [scope?.email]);

  const save = useMutation({
    mutationFn: async () => {
      // Only send fields that have a value: keeps the required `name` from being
      // blanked and avoids @IsEmail rejecting an empty contact email.
      const payload: Parameters<typeof workspacesApi.update>[0] = { timezone };
      if (name.trim()) payload.name = name.trim();
      if (contactEmail.trim()) payload.contact_email = contactEmail.trim();
      if (phone.trim()) payload.contact_phone = phone.trim();
      // Sent even when empty so the owner can clear the quote.
      payload.dashboard_quote = dashboardQuote.trim();
      await workspacesApi.update(payload);

      // Persist the owner's display name to the Supabase account so the
      // greeting + sidebar update everywhere it's read from the session.
      const current = ((user?.user_metadata ?? {}) as { name?: string }).name ?? '';
      if (yourName.trim() && yourName.trim() !== current) {
        const { error } = await supabase.auth.updateUser({ data: { name: yourName.trim() } });
        if (error) throw new Error(error.message);
      }
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
              aria-label="Workspace logo - click to change"
              className="group flex aspect-square w-24 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-foreground/20 bg-foreground/[0.03] transition-all hover:border-teal-400/40 hover:bg-foreground/[0.06] hover:ring-2 hover:ring-teal-400/30"
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
              className="mt-1 text-[11px] text-teal-600 hover:underline dark:text-teal-300"
            >
              {logoUrl ? 'Change or remove' : 'Upload photo'}
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Your name" value={yourName} onChange={setYourName} hint="Used in your dashboard greeting" placeholder="e.g. Dr. Aakash Kumar" />
              <Field label="Practice name" value={name} onChange={setName} hint="Shown to clients" />
              <Field label="Contact email" value={contactEmail} onChange={setContactEmail} type="email" />
              <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
              <Select
                label="Timezone"
                value={timezone}
                onChange={setTimezone}
                options={['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York']}
                hint="Used for your dashboard clock"
              />
            </div>
            <Field
              label="Dashboard quote"
              value={dashboardQuote}
              onChange={setDashboardQuote}
              hint="A personal line shown on your dashboard banner. Leave blank for a rotating quote."
              placeholder="e.g. Small steps, every day."
            />
          </div>
        </div>
      </Glass>

      <FooterBar
        saving={save.isPending}
        onSave={() => save.mutate()}
        onCancel={() => {
          // Reset the form back to the persisted values.
          const meta = (user?.user_metadata ?? {}) as { name?: string; full_name?: string };
          setYourName((meta.name || meta.full_name || '').trim());
          if (ws) {
            setName(ws.name ?? '');
            setDashboardQuote(ws.dashboard_quote ?? '');
            setContactEmail(ws.contact_email ?? scope?.email ?? '');
            setPhone(ws.contact_phone ?? '');
            setTimezone(ws.timezone ?? 'Asia/Kolkata');
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
        className="rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 text-sm font-medium text-foreground hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-60 disabled:hover:scale-100"
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
        className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none"
      />
      {hint && <div className="mt-1 text-[11px] text-foreground/35">{hint}</div>}
    </label>
  );
}

export function Select({
  label, value, onChange, options, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  hint?: string;
}) {
  return (
    // A <div>, not a <label>: <button> is a labelable element, so a wrapping
    // label forwards its click to the Radix trigger on top of the trigger's
    // own click — the menu opens and instantly closes. The trigger carries an
    // aria-label instead.
    <div className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">{label}</div>
      <SelectRoot value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="h-auto w-full rounded-xl border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground focus:border-teal-400/60 focus:bg-foreground/[0.06]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-sm">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
      {hint && <div className="mt-1 text-[11px] text-foreground/35">{hint}</div>}
    </div>
  );
}
