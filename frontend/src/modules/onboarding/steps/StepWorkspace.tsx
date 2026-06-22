import { useMemo, useState } from 'react';
import { Camera, Plus, Search, X } from 'lucide-react';

import { Glass } from '@/design-system';
import { useOnboarding } from '../OnboardingContext';
import { SPECIALIZATIONS } from '../data/specializations';

export function StepWorkspace() {
  const { draft, set, patch } = useOnboarding();
  const [search, setSearch] = useState('');
  const [customInput, setCustomInput] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return SPECIALIZATIONS;
    const q = search.toLowerCase();
    return SPECIALIZATIONS.map((cat) => ({
      ...cat,
      items: cat.items.filter((it) => it.toLowerCase().includes(q)),
    })).filter((cat) => cat.items.length > 0);
  }, [search]);

  function toggleSpec(name: string) {
    const next = draft.specializations.includes(name)
      ? draft.specializations.filter((s) => s !== name)
      : [...draft.specializations, name];
    set('specializations', next);
  }

  function addCustom() {
    const v = customInput.trim();
    if (!v) return;
    if (draft.customSpecs.includes(v) || draft.specializations.includes(v)) {
      setCustomInput('');
      return;
    }
    patch({
      customSpecs: [...draft.customSpecs, v],
      specializations: [...draft.specializations, v],
    });
    setCustomInput('');
  }

  function removeCustom(name: string) {
    patch({
      customSpecs: draft.customSpecs.filter((s) => s !== name),
      specializations: draft.specializations.filter((s) => s !== name),
    });
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('logoDataUrl', String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-8">
      {/* Practice identity */}
      <Glass className="p-6">
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[120px_1fr]">
          {/* Logo */}
          <div>
            <label
              htmlFor="logo-upload"
              className="group flex aspect-square w-24 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-foreground/20 bg-foreground/[0.03] transition-colors hover:bg-foreground/[0.06]"
            >
              {draft.logoDataUrl ? (
                <img src={draft.logoDataUrl} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-foreground/75 dark:text-foreground/55">
                  <Camera className="h-5 w-5" />
                  <span className="text-[10px] uppercase tracking-[0.18em]">Logo</span>
                </div>
              )}
            </label>
            <input
              id="logo-upload"
              type="file"
              accept="image/*"
              onChange={onLogoChange}
              className="hidden"
            />
            <div className="mt-2 text-[11px] text-foreground/75 dark:text-foreground/55">PNG or SVG, ~256px</div>
          </div>

          {/* Practice name */}
          <div>
            <label className="block">
              <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">Practice name</div>
              <input
                value={draft.practiceName}
                onChange={(e) => set('practiceName', e.target.value)}
                placeholder="e.g. Sharma Nutrition Clinic"
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm placeholder:text-foreground/75 dark:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
              />
            </label>
            <p className="mt-3 text-xs text-foreground/75 dark:text-foreground/55">
              Shown on invoices, client invites, and the client portal. You can change this later.
            </p>
          </div>
        </div>
      </Glass>

      {/* Specializations */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground/90">Specializations</div>
            <div className="text-xs text-foreground/75 dark:text-foreground/60">
              Pick what your practice focuses on. {draft.specializations.length > 0 && (
                <span className="text-emerald-700 dark:text-emerald-300">
                  {draft.specializations.length} selected
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/75 dark:text-foreground/55" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-48 rounded-full border border-foreground/10 bg-foreground/[0.03] py-1.5 pl-9 pr-3 text-xs placeholder:text-foreground/75 dark:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-5">
          {filtered.map((cat) => (
            <div key={cat.id}>
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                {cat.label}
              </div>
              <div className="flex flex-wrap gap-2">
                {cat.items.map((item) => {
                  const selected = draft.specializations.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleSpec(item)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs transition-all ${
                        selected
                          ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-700 dark:text-emerald-200'
                          : 'border-foreground/10 bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-xs text-foreground/75 dark:text-foreground/55">
              No matches. Add it as a custom specialization below.
            </div>
          )}
        </div>

        {/* Custom specializations */}
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
            Custom specializations
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {draft.customSpecs.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-200"
              >
                {s}
                <button
                  type="button"
                  onClick={() => removeCustom(s)}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            <div className="flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1">
              <input
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="Add custom…"
                className="w-36 bg-transparent text-xs placeholder:text-foreground/75 dark:text-foreground/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustom}
                className="grid h-5 w-5 place-items-center rounded-full bg-foreground/10 text-foreground/70 hover:bg-foreground/20"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
