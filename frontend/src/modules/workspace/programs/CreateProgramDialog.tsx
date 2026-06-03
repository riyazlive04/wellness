import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass } from '@/design-system';
import { SPECIALIZATIONS } from '@/modules/onboarding/data/specializations';

interface CreateProgramDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: CreateProgramPayload) => Promise<void> | void;
}

export interface CreateProgramPayload {
  name: string;
  specialization: string;
  durationWeeks: number;
  aiAssisted: boolean;
}

const DURATIONS = [
  { weeks: 4,  label: '30 days' },
  { weeks: 8,  label: '8 weeks' },
  { weeks: 12, label: '12 weeks' },
  { weeks: 16, label: '16 weeks' },
];

export function CreateProgramDialog({ open, onClose, onCreate }: CreateProgramDialogProps) {
  const [name, setName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [aiAssisted, setAiAssisted] = useState(true);
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const canCreate = name.trim().length >= 3 && specialization.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      await onCreate({ name: name.trim(), specialization, durationWeeks, aiAssisted });
      toast.success(
        aiAssisted
          ? `Creating "${name}" with AI-assisted curriculum…`
          : `Created "${name}" — ready for you to build the curriculum.`,
      );
      // Reset & close
      setName('');
      setSpecialization('');
      setDurationWeeks(12);
      setAiAssisted(true);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create program.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-xl p-4 md:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <AIGlow intensity="soft" animated={false}>
          <Glass variant="heavy" className="overflow-hidden rounded-2xl">
            <div className="flex items-start justify-between px-6 pt-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Create a program</h2>
                <p className="mt-1 text-xs text-foreground/55">
                  Start a fresh template or have SIRAH draft a starting curriculum tuned to your
                  specialization.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-6 pb-6 pt-5">
              <label className="block">
                <div className="mb-1.5 text-xs font-medium text-foreground/60">Program name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. PCOS Reset"
                  autoFocus
                  className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
                />
              </label>

              <label className="block">
                <div className="mb-1.5 text-xs font-medium text-foreground/60">Specialization</div>
                <select
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm text-foreground focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
                >
                  <option value="" className="bg-elevated">Pick a specialization</option>
                  {SPECIALIZATIONS.map((cat) => (
                    <optgroup key={cat.id} label={cat.label} className="bg-elevated">
                      {cat.items.map((item) => (
                        <option key={item} value={item} className="bg-elevated">
                          {item}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <div>
                <div className="mb-2 text-xs font-medium text-foreground/60">Duration</div>
                <div className="grid grid-cols-4 gap-2">
                  {DURATIONS.map((d) => {
                    const active = durationWeeks === d.weeks;
                    return (
                      <button
                        key={d.weeks}
                        type="button"
                        onClick={() => setDurationWeeks(d.weeks)}
                        className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-violet-400/60 bg-violet-400/15 text-foreground'
                            : 'border-foreground/10 bg-foreground/[0.03] text-foreground/65 hover:bg-foreground/[0.06]'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI toggle */}
              <button
                type="button"
                onClick={() => setAiAssisted((v) => !v)}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  aiAssisted
                    ? 'border-violet-400/40 bg-violet-400/[0.06]'
                    : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.04]'
                }`}
              >
                <div
                  className={`mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${
                    aiAssisted
                      ? 'bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-violet-700 dark:text-violet-200'
                      : 'bg-foreground/[0.04] text-foreground/55'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">SIRAH AI-assist</div>
                  <div className="mt-0.5 text-xs text-foreground/55">
                    Draft a starting curriculum from {specialization || 'your specialization'}'s best practices. You can edit everything.
                  </div>
                </div>
                <div
                  className={`mt-0.5 grid h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                    aiAssisted ? 'bg-violet-400' : 'bg-foreground/15'
                  }`}
                >
                  <span
                    className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      aiAssisted ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`}
                  />
                </div>
              </button>

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={creating}
                  className="rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/70 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canCreate || creating}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create program'}
                </button>
              </div>
            </form>
          </Glass>
        </AIGlow>
      </motion.div>
    </div>
  );
}
