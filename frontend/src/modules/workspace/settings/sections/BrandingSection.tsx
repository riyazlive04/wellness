import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, BadgeCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { BRAND_PALETTES } from '../data/mockSettings';
import { FooterBar, SectionHeader } from './GeneralSection';
import { cn } from '@/lib/utils';
import { getWorkspaceBrand, setWorkspaceBranding } from '@/lib/workspaceBrand';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { canWhiteLabel } from '@/lib/planCapabilities';

export function BrandingSection() {
  const saved = getWorkspaceBrand();
  const qc = useQueryClient();
  const savedIsPreset = BRAND_PALETTES.some((p) => p.id === saved.palette.id);
  const [paletteId, setPaletteId] = useState(savedIsPreset ? saved.palette.id : 'custom');
  const [customPrimary, setCustomPrimary] = useState(saved.palette.primary);
  const [customAccent, setCustomAccent] = useState(saved.palette.accent);
  const [tagline, setTagline] = useState(saved.tagline);

  // Plan + current white-label flag drive the real, gated toggle.
  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: () => workspacesApi.me() });
  const brandingQ = useQuery({ queryKey: ['workspace', 'branding'], queryFn: () => workspacesApi.branding() });
  const eligible = canWhiteLabel(wsQ.data?.plan);
  const whitelabel = !!brandingQ.data?.white_label;

  const whitelabelMut = useMutation({
    mutationFn: (next: boolean) => workspacesApi.updateBranding({ white_label: next }),
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ['workspace', 'branding'] });
      toast.success(next ? 'White-label enabled — NUSI branding hidden from clients.' : 'White-label disabled.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not update white-label.'),
  });

  const palette =
    paletteId === 'custom'
      ? { id: 'custom', name: 'Custom', primary: customPrimary, accent: customAccent }
      : (BRAND_PALETTES.find((p) => p.id === paletteId) ?? BRAND_PALETTES[0]);

  function save() {
    setWorkspaceBranding({
      palette: { id: palette.id, primary: palette.primary, accent: palette.accent },
      tagline: tagline.trim(),
    });
    toast.success('Branding saved — your client portal now uses it.');
  }

  return (
    <SectionHeader
      title="Branding"
      subtitle="Colors, tagline, and white-label options for your client portal and invoices."
    >
      {/* Palette picker */}
      <Glass className="p-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Color palette</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BRAND_PALETTES.map((p) => {
            const active = paletteId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaletteId(p.id)}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl border bg-foreground/[0.02] p-3 text-left transition-all',
                  active ? 'border-teal-400/60 ring-1 ring-teal-400/40' : 'border-foreground/[0.06] hover:bg-foreground/[0.04]',
                )}
              >
                <div className="flex -space-x-2">
                  <span
                    className="h-7 w-7 rounded-full border-2 border-surface"
                    style={{ background: p.primary }}
                  />
                  <span
                    className="h-7 w-7 rounded-full border-2 border-surface"
                    style={{ background: p.accent }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{p.name}</div>
                  <div className="text-[10px] text-foreground/75 dark:text-foreground/55 tabular-nums">
                    {p.primary} · {p.accent}
                  </div>
                </div>
                {active && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400 text-canvas">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Glass>

      {/* Custom brand colour — free picker that themes the whole workspace */}
      <Glass className="p-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Custom brand colour</div>
        <div className="mt-1 text-[11px] text-foreground/75 dark:text-foreground/55">
          Pick your own — it re-themes your whole dashboard and your clients’ portal.
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <ColorField
            label="Primary"
            value={customPrimary}
            onChange={(v) => { setCustomPrimary(v); setPaletteId('custom'); }}
          />
          <ColorField
            label="Accent"
            value={customAccent}
            onChange={(v) => { setCustomAccent(v); setPaletteId('custom'); }}
          />
          {paletteId === 'custom' && (
            <span className="rounded-full border border-teal-400/40 bg-teal-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-teal-700 dark:text-teal-200">
              Custom
            </span>
          )}
        </div>
      </Glass>

      {/* Tagline */}
      <Glass className="p-6">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Tagline</div>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="mt-2 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none"
        />
        <div className="mt-1.5 text-[11px] text-foreground/75 dark:text-foreground/55">Shown on the client portal login screen.</div>
      </Glass>

      {/* Live preview */}
      <Glass variant="heavy" className="overflow-hidden">
        <div className="border-b border-foreground/[0.06] px-5 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Preview</div>
          <div className="text-sm font-medium text-foreground">What clients see</div>
        </div>
        <div
          className="p-8"
          style={{
            background:
              `radial-gradient(circle at 20% 0%, ${palette.accent}33, transparent 50%),` +
              `radial-gradient(circle at 80% 100%, ${palette.primary}33, transparent 55%),` +
              `linear-gradient(180deg, hsl(var(--canvas)) 0%, hsl(var(--surface)) 100%)`,
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
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Sharma Nutrition Clinic
          </h3>
          <p className="mt-1 max-w-sm text-sm text-foreground/80 dark:text-foreground/65">{tagline}</p>
          <button
            type="button"
            className="mt-5 rounded-full px-4 py-2 text-xs font-medium text-foreground"
            style={{
              background: `linear-gradient(135deg, ${palette.accent}, ${palette.primary})`,
            }}
          >
            Sign in to your portal
          </button>
        </div>
      </Glass>

      {/* White-label toggle — gated to the Enterprise plan */}
      <Glass className={cn('p-5', whitelabel && 'ring-1 ring-teal-400/30')}>
        <div className="flex items-start gap-4">
          <div className={cn(
            'grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg',
            eligible ? 'bg-emerald-400/10 text-emerald-600 dark:text-emerald-300' : 'bg-foreground/[0.04] text-foreground/80 dark:text-foreground/65',
          )}>
            {eligible ? <BadgeCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">White-label</h3>
              {eligible ? (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
                  Included
                </span>
              ) : (
                <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
                  Enterprise
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
              Remove the “Powered by Sirah Digital” branding from your client portal.
              {!eligible && ' Upgrade to the Enterprise plan to enable it.'}
            </p>
          </div>
          {whitelabelMut.isPending ? (
            <Loader2 className="mt-1 h-4 w-4 animate-spin text-foreground/50" />
          ) : (
            <Switch
              checked={whitelabel}
              disabled={!eligible || wsQ.isLoading}
              onChange={(v) => {
                if (!eligible) {
                  toast('White-label is available on the Enterprise plan — upgrade to enable.');
                  return;
                }
                whitelabelMut.mutate(v);
              }}
            />
          )}
        </div>
      </Glass>

      <FooterBar
        onSave={save}
        onCancel={() => toast('Changes discarded.')}
      />
    </SectionHeader>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3">
      <span
        className="relative block h-10 w-10 overflow-hidden rounded-xl border border-foreground/10"
        style={{ background: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${label} brand colour`}
        />
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-[11px] tabular-nums text-foreground/75 dark:text-foreground/55">{value}</span>
      </span>
    </label>
  );
}

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'mt-1 grid h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-emerald-400' : 'bg-foreground/15',
        disabled && 'cursor-not-allowed opacity-50',
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
