import { Info } from 'lucide-react';
import { Glass } from '@/design-system';
import { useOnboarding } from '../OnboardingContext';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
];

export function StepKyc() {
  const { draft, set } = useOnboarding();

  return (
    <div className="space-y-6">
      <Glass className="flex items-start gap-3 p-4 text-xs text-foreground/65">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-300" />
        <div>
          We use this only for GST-compliant invoices and to keep your billing on the
          right side of Indian tax law. You can skip GSTIN if you don't have one yet —
          we'll prompt for it before issuing your first invoice.
        </div>
      </Glass>

      <Glass className="p-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field
            label="PAN"
            placeholder="ABCDE1234F"
            maxLength={10}
            value={draft.pan}
            onChange={(v) => set('pan', v.toUpperCase())}
            hint="10-character PAN"
          />
          <Field
            label="GSTIN"
            placeholder="22ABCDE1234F1Z5"
            maxLength={15}
            value={draft.gstin}
            onChange={(v) => set('gstin', v.toUpperCase())}
            hint="Optional — required before first invoice"
          />
        </div>

        <div className="mt-6 border-t border-foreground/[0.06] pt-6">
          <div className="mb-4 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            Business address
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1fr_180px]">
            <Field
              label="City"
              placeholder="Bengaluru"
              value={draft.city}
              onChange={(v) => set('city', v)}
            />
            <label className="block">
              <div className="mb-1.5 text-xs font-medium text-foreground/60">State</div>
              <select
                value={draft.state}
                onChange={(e) => set('state', e.target.value)}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
              >
                <option value="" className="bg-elevated">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s} className="bg-elevated">
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Pincode"
              placeholder="560001"
              maxLength={6}
              value={draft.pincode}
              onChange={(v) => set('pincode', v.replace(/\D/g, ''))}
            />
          </div>
        </div>
      </Glass>
    </div>
  );
}

interface FieldProps {
  label: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  value: string;
  onChange: (v: string) => void;
}

function Field({ label, placeholder, hint, maxLength, value, onChange }: FieldProps) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground/60">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
      />
      {hint && <div className="mt-1.5 text-[11px] text-foreground/35">{hint}</div>}
    </label>
  );
}
