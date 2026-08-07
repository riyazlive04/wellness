import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, BadgeCheck, FileText, Loader2 } from 'lucide-react';
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

  // PDF-template fields. Seeded from the workspace row (raw values, not the
  // composed contact fallback) once it loads — see the hydration effect below.
  const [pdfContact, setPdfContact] = useState('');
  const [pdfFooter, setPdfFooter] = useState('');

  // Plan + current white-label flag drive the real, gated toggle.
  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: () => workspacesApi.me() });
  const brandingQ = useQuery({ queryKey: ['workspace', 'branding'], queryFn: () => workspacesApi.branding() });
  const eligible = canWhiteLabel(wsQ.data?.plan);
  const whitelabel = !!brandingQ.data?.white_label;

  const whitelabelMut = useMutation({
    mutationFn: (next: boolean) => workspacesApi.updateBranding({ white_label: next }),
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ['workspace', 'branding'] });
      toast.success(next ? 'White-label enabled - NUSI branding hidden from clients.' : 'White-label disabled.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not update white-label.'),
  });

  // Hydrate the PDF fields from the workspace row exactly once, so a background
  // refetch never clobbers what the owner is typing.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !wsQ.data) return;
    hydrated.current = true;
    setPdfContact(wsQ.data.pdf_contact_line ?? '');
    setPdfFooter(wsQ.data.pdf_footer_note ?? '');
  }, [wsQ.data]);

  const palette =
    paletteId === 'custom'
      ? { id: 'custom', name: 'Custom', primary: customPrimary, accent: customAccent }
      : (BRAND_PALETTES.find((p) => p.id === paletteId) ?? BRAND_PALETTES[0]);

  const [savingPdf, setSavingPdf] = useState(false);

  async function save() {
    setWorkspaceBranding({
      palette: { id: palette.id, primary: palette.primary, accent: palette.accent },
      tagline: tagline.trim(),
    });
    // PDF fields aren't part of the portal-theme cache, so persist them directly.
    setSavingPdf(true);
    try {
      await workspacesApi.updateBranding({
        pdf_contact_line: pdfContact.trim(),
        pdf_footer_note: pdfFooter.trim(),
      });
      qc.invalidateQueries({ queryKey: ['workspace', 'branding'] });
      qc.invalidateQueries({ queryKey: ['workspace', 'me'] });
      toast.success('Branding saved - your portal and PDF exports now use it.');
    } catch (e) {
      toast.error((e as Error).message ?? 'Could not save PDF branding.');
    } finally {
      setSavingPdf(false);
    }
  }

  return (
    <SectionHeader
      title="Branding"
      subtitle="Colors, tagline, and white-label options for your client portal and invoices."
    >
      {/* Palette picker */}
      <div className="rounded-3xl border border-foreground/[0.06] bg-card p-6 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Color palette</div>
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
                  active ? 'border-[hsl(var(--brand-blue))]/60 ring-1 ring-[hsl(var(--brand-blue))]/40' : 'border-foreground/[0.06] hover:bg-foreground/[0.04]',
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
      </div>

      {/* Custom brand colour - free picker that themes the whole workspace */}
      <div className="rounded-3xl border border-foreground/[0.06] bg-card p-6 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Custom brand colour</div>
        <div className="mt-1 text-[11px] text-foreground/75 dark:text-foreground/55">
          Pick your own - it re-themes your whole dashboard and your clients’ portal.
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
            <span className="rounded-full border border-[hsl(var(--brand-blue))]/40 bg-[hsl(var(--brand-blue))]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--brand-blue))]">
              Custom
            </span>
          )}
        </div>
      </div>

      {/* Tagline */}
      <div className="rounded-3xl border border-foreground/[0.06] bg-card p-6 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Tagline</div>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="mt-2 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-[hsl(var(--brand-blue))]/60 focus:bg-[hsl(var(--brand-blue))]/[0.04] focus:outline-none"
        />
        <div className="mt-1.5 text-[11px] text-foreground/75 dark:text-foreground/55">Shown on the client portal login screen.</div>
      </div>

      {/* PDF documents — meal plans, reports, food library, invoices */}
      <div className="rounded-3xl border border-foreground/[0.06] bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-xl bg-[hsl(var(--brand-blue))]/10 text-[hsl(var(--brand-blue))]">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">PDF documents</div>
        </div>
        <p className="mt-1.5 text-[11px] text-foreground/70 dark:text-foreground/55">
          Your logo and brand colours already appear on every export. Add a contact line and a
          footer note to finish the template.
        </p>

        <div className="mt-4 space-y-4">
          <label className="block">
            <div className="text-[11px] font-semibold text-foreground/75 dark:text-foreground/60">Header contact line</div>
            <input
              value={pdfContact}
              onChange={(e) => setPdfContact(e.target.value)}
              placeholder="Leave blank to use your workspace phone & email"
              maxLength={200}
              className="mt-1.5 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/45 focus:border-[hsl(var(--brand-blue))]/60 focus:bg-[hsl(var(--brand-blue))]/[0.04] focus:outline-none"
            />
            <div className="mt-1 text-[11px] text-foreground/60 dark:text-foreground/50">
              e.g. +91 98765 43210 · hello@practice.in · practice.in
            </div>
          </label>

          <label className="block">
            <div className="text-[11px] font-semibold text-foreground/75 dark:text-foreground/60">Footer note</div>
            <textarea
              value={pdfFooter}
              onChange={(e) => setPdfFooter(e.target.value)}
              placeholder="e.g. This plan is guidance, not medical advice. Consult your doctor before major changes."
              maxLength={400}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/45 focus:border-[hsl(var(--brand-blue))]/60 focus:bg-[hsl(var(--brand-blue))]/[0.04] focus:outline-none"
            />
            <div className="mt-1 text-[11px] text-foreground/60 dark:text-foreground/50">
              Printed at the bottom of every page (above the invoice's legal line).
            </div>
          </label>
        </div>
      </div>

      {/* Live preview */}
      <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card shadow-sm">
        <div className="border-b border-foreground/[0.06] px-5 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Preview</div>
          <div className="text-sm font-bold text-foreground">What clients see</div>
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
      </div>

      {/* White-label toggle - gated to the Enterprise plan */}
      <div className={cn('rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm', whitelabel && 'ring-1 ring-emerald-400/30')}>
        <div className="flex items-start gap-4">
          <div className={cn(
            'grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl',
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
                  toast('White-label is available on the Enterprise plan - upgrade to enable.');
                  return;
                }
                whitelabelMut.mutate(v);
              }}
            />
          )}
        </div>
      </div>

      <FooterBar
        onSave={() => { void save(); }}
        onCancel={() => toast('Changes discarded.')}
        saving={savingPdf}
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
