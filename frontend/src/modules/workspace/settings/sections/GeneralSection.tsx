import { useState } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';

export function GeneralSection() {
  const [name, setName] = useState('Sharma Nutrition Clinic');
  const [legalName, setLegalName] = useState('Sharma Wellness LLP');
  const [contactEmail, setContactEmail] = useState('hello@yourpractice.com');
  const [phone, setPhone] = useState('+91 98 21 45 67 89');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [language, setLanguage] = useState('en-IN');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setLogoUrl(String(r.result));
    r.readAsDataURL(f);
  }

  return (
    <SectionHeader
      title="General"
      subtitle="The basics of your practice. Visible to clients on invoices and the client portal."
    >
      <Glass className="p-6">
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[120px_1fr]">
          {/* Logo */}
          <div>
            <label
              htmlFor="logo-upload"
              className="group flex aspect-square w-24 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/20 bg-white/[0.03] transition-colors hover:bg-white/[0.06]"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-white/40">
                  <Camera className="h-5 w-5" />
                  <span className="text-[10px] uppercase tracking-[0.18em]">Logo</span>
                </div>
              )}
            </label>
            <input
              id="logo-upload"
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
            />
            <div className="mt-2 text-[11px] text-white/40">~256px PNG/SVG</div>
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
        onSave={() => toast.success('General settings saved.')}
        onCancel={() => toast('Changes discarded.')}
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
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-sm text-white/55">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function FooterBar({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/[0.04]"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        className="rounded-full bg-gradient-to-br from-indigo-500 to-emerald-400 px-5 py-2 text-sm font-medium text-white hover:scale-[1.02]"
      >
        Save changes
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
      <div className="mb-1.5 text-xs font-medium text-white/60">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/60 focus:bg-white/[0.06] focus:outline-none"
      />
      {hint && <div className="mt-1 text-[11px] text-white/35">{hint}</div>}
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
      <div className="mb-1.5 text-xs font-medium text-white/60">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white focus:border-indigo-400/60 focus:bg-white/[0.06] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#1B1E25]">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
