import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { BRAND_PALETTES } from '../data/mockSettings';
import { FooterBar, SectionHeader } from './GeneralSection';
import { cn } from '@/lib/utils';

export function BrandingSection() {
  const [paletteId, setPaletteId] = useState('default');
  const [tagline, setTagline] = useState('Wellness, intelligently delivered.');
  const [whitelabel, setWhitelabel] = useState(false);

  const palette = BRAND_PALETTES.find((p) => p.id === paletteId) ?? BRAND_PALETTES[0];

  return (
    <SectionHeader
      title="Branding"
      subtitle="Colors, tagline, and white-label options for your client portal and invoices."
    >
      {/* Palette picker */}
      <Glass className="p-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Color palette</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BRAND_PALETTES.map((p) => {
            const active = paletteId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaletteId(p.id)}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl border bg-white/[0.02] p-3 text-left transition-all',
                  active ? 'border-violet-400/60 ring-1 ring-violet-400/40' : 'border-white/[0.06] hover:bg-white/[0.04]',
                )}
              >
                <div className="flex -space-x-2">
                  <span
                    className="h-7 w-7 rounded-full border-2 border-[#0F1115]"
                    style={{ background: p.primary }}
                  />
                  <span
                    className="h-7 w-7 rounded-full border-2 border-[#0F1115]"
                    style={{ background: p.accent }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">{p.name}</div>
                  <div className="text-[10px] text-white/40 tabular-nums">
                    {p.primary} · {p.accent}
                  </div>
                </div>
                {active && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400 text-[#0A0C10]">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Glass>

      {/* Tagline */}
      <Glass className="p-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Tagline</div>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-violet-400/60 focus:bg-white/[0.06] focus:outline-none"
        />
        <div className="mt-1.5 text-[11px] text-white/40">Shown on the client portal login screen.</div>
      </Glass>

      {/* Live preview */}
      <Glass variant="heavy" className="overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Preview</div>
          <div className="text-sm font-medium text-white">What clients see</div>
        </div>
        <div
          className="p-8"
          style={{
            background:
              `radial-gradient(circle at 20% 0%, ${palette.accent}33, transparent 50%),` +
              `radial-gradient(circle at 80% 100%, ${palette.primary}33, transparent 55%),` +
              `linear-gradient(180deg, #0A0C10 0%, #111318 100%)`,
          }}
        >
          <div
            className="mx-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em]"
            style={{
              color: palette.primary,
              borderColor: `${palette.primary}66`,
              background: `${palette.primary}1A`,
            }}
          >
            Welcome
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Sharma Nutrition Clinic
          </h3>
          <p className="mt-1 max-w-sm text-sm text-white/65">{tagline}</p>
          <button
            type="button"
            className="mt-5 rounded-full px-4 py-2 text-xs font-medium text-white"
            style={{
              background: `linear-gradient(135deg, ${palette.accent}, ${palette.primary})`,
            }}
          >
            Sign in to your portal
          </button>
        </div>
      </Glass>

      {/* White-label toggle (Enterprise only) */}
      <Glass className={cn('p-5', whitelabel && 'ring-1 ring-violet-400/30')}>
        <div className="flex items-start gap-4">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white/[0.04] text-white/65">
            <Lock className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white">White-label</h3>
              <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-200">
                Enterprise
              </span>
            </div>
            <p className="mt-1 text-xs text-white/55">
              Remove all "SIRAH LIFE" branding from your client portal and invoices. Custom domain + your branding only.
            </p>
          </div>
          <Switch
            checked={whitelabel}
            onChange={(v) => {
              setWhitelabel(v);
              if (v) toast('Available on the Enterprise plan — upgrade to enable.');
            }}
          />
        </div>
      </Glass>

      <FooterBar
        onSave={() => toast.success('Branding saved.')}
        onCancel={() => toast('Changes discarded.')}
      />
    </SectionHeader>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'mt-1 grid h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-emerald-400' : 'bg-white/15',
      )}
    >
      <span
        className={cn(
          'block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}
