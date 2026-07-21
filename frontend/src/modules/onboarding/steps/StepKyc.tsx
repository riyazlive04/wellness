import { useState } from 'react';
import { Info, AlertTriangle, Upload, FileText, X } from 'lucide-react';
import { Glass } from '@/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOnboarding, type OnboardingDraft } from '../OnboardingContext';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
];

/** Identity document options + per-type number rules. Shared with the wizard's
 *  step-3 "can continue" gate via `isDocValid`. */
export const DOC_TYPES = [
  {
    value: 'aadhaar', label: 'Aadhaar card', numberLabel: 'Aadhaar number',
    placeholder: '1234 5678 9012', max: 12, hint: '12-digit Aadhaar number',
    sanitize: (v: string) => v.replace(/\D/g, '').slice(0, 12),
    valid: (v: string) => /^\d{12}$/.test(v),
  },
  {
    value: 'pan', label: 'PAN card', numberLabel: 'PAN number',
    placeholder: 'ABCDE1234F', max: 10, hint: '10-character PAN',
    sanitize: (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
    valid: (v: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
  },
  {
    value: 'driving_license', label: 'Driving licence', numberLabel: 'Driving licence number',
    placeholder: 'KA0120200012345', max: 20, hint: 'As printed on your licence',
    sanitize: (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20),
    valid: (v: string) => v.trim().length >= 8,
  },
] as const;

export const docRule = (t: string) => DOC_TYPES.find((d) => d.value === t) ?? DOC_TYPES[1];
export const isDocValid = (t: string, v: string) => docRule(t).valid(v);

export function StepKyc() {
  const { draft, set, patch } = useOnboarding();
  const rule = docRule(draft.docType);
  const [uploadError, setUploadError] = useState('');

  function onDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setUploadError('File must be under 5 MB.'); return; }
    setUploadError('');
    const reader = new FileReader();
    reader.onload = () => patch({ docFileDataUrl: String(reader.result), docFileName: file.name });
    reader.readAsDataURL(file);
    e.target.value = ''; // allow re-selecting the same file
  }

  return (
    <div className="space-y-6">
      <Glass className="flex items-start gap-3 p-4 text-xs text-foreground/80 dark:text-foreground/65">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700 dark:text-teal-300" />
        <div>
          We use this to verify your practice identity and for GST-compliant invoices.
          GSTIN is optional — you can skip it now and add it before your first invoice.
        </div>
      </Glass>

      <Glass className="p-6">
        {/* Identity document */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* A <div>, not a <label>: the Radix trigger is a <button>, so a wrapping
              <label> forwards its click to the trigger and the menu instantly closes. */}
          <div className="block">
            <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">Document type</div>
            <Select
              value={draft.docType}
              onValueChange={(v) => { set('docType', v as OnboardingDraft['docType']); set('pan', ''); }}
            >
              <SelectTrigger
                aria-label="Document type"
                className="h-auto w-full rounded-xl border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground focus:border-teal-400/60 focus:bg-foreground/[0.06]"
              >
                <SelectValue placeholder="Select document" />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value} className="text-sm">{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Field
            label={rule.numberLabel}
            placeholder={rule.placeholder}
            maxLength={rule.max}
            value={draft.pan}
            onChange={(v) => set('pan', rule.sanitize(v))}
            hint={rule.hint}
          />
        </div>

        {/* Document upload */}
        <div className="mt-5">
          <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">
            Upload your {rule.label.toLowerCase()}
          </div>
          {draft.docFileName ? (
            <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
              {draft.docFileDataUrl?.startsWith('data:image') ? (
                <img src={draft.docFileDataUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-foreground/60">
                  <FileText className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{draft.docFileName}</div>
                <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Uploaded</div>
              </div>
              <button
                type="button"
                onClick={() => patch({ docFileName: null, docFileDataUrl: null })}
                className="flex-shrink-0 rounded-full p-1.5 text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Remove document"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="doc-upload"
              className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-foreground/20 bg-foreground/[0.03] px-4 py-6 text-center transition-colors hover:bg-foreground/[0.06]"
            >
              <Upload className="h-5 w-5 text-foreground/55" />
              <div className="text-sm font-medium text-foreground/80">Click to upload your {rule.label.toLowerCase()}</div>
              <div className="text-[11px] text-foreground/50">JPG, PNG or PDF · up to 5 MB</div>
            </label>
          )}
          <input id="doc-upload" type="file" accept="image/*,application/pdf" onChange={onDocChange} className="hidden" />
          {uploadError && <div className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">{uploadError}</div>}
        </div>

        {/* GSTIN — optional */}
        <div className="mt-5">
          <Field
            label="GSTIN (optional)"
            placeholder="22ABCDE1234F1Z5"
            maxLength={15}
            value={draft.gstin}
            onChange={(v) => set('gstin', v.toUpperCase())}
            hint="Not required to continue — add it before your first invoice"
          />
        </div>

        <div className="mt-6 border-t border-foreground/[0.06] pt-6">
          <div className="mb-4 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
            Business address
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1fr_180px]">
            <Field
              label="City"
              placeholder="Bengaluru"
              value={draft.city}
              onChange={(v) => set('city', v)}
            />
            <div className="block">
              <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">State</div>
              <Select value={draft.state} onValueChange={(v) => set('state', v)}>
                <SelectTrigger
                  aria-label="State"
                  className="h-auto w-full rounded-xl border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground focus:border-teal-400/60 focus:bg-foreground/[0.06]"
                >
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

      {/* Document-verification disclaimer */}
      <Glass className="flex items-start gap-3 border-amber-400/30 bg-amber-400/[0.06] p-4 text-xs text-amber-800 dark:text-amber-200/90">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-300" />
        <div>
          By continuing, you confirm that every detail above is genuine. Your documents are
          verified after signup — <span className="font-medium">if any detail is found to be fake,
          your payment will be refunded</span> and your workspace removed.
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
      <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none"
      />
      {hint && <div className="mt-1.5 text-[11px] text-foreground/35">{hint}</div>}
    </label>
  );
}
