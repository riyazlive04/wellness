import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { SECTIONS } from '@/modules/workspace/settings/data/mockSettings';
import { GeneralSection } from '@/modules/workspace/settings/sections/GeneralSection';
import { BrandingSection } from '@/modules/workspace/settings/sections/BrandingSection';
import { VerificationSection } from '@/modules/workspace/settings/sections/VerificationSection';
import { IntegrationsSection } from '@/modules/workspace/settings/sections/IntegrationsSection';
import { SecuritySection } from '@/modules/workspace/settings/sections/SecuritySection';
import { DataSection } from '@/modules/workspace/settings/sections/DataSection';
import type { SectionKey } from '@/modules/workspace/settings/types';
import { cn } from '@/lib/utils';

const RENDERERS: Record<SectionKey, React.ComponentType> = {
  general:      GeneralSection,
  branding:     BrandingSection,
  verification: VerificationSection,
  integrations: IntegrationsSection,
  security:     SecuritySection,
  data:         DataSection,
};

export default function OwnerSettings() {
  const workspace = readWorkspace();
  const [section, setSection] = useState<SectionKey>('general');

  const ActiveSection = RENDERERS[section];

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext="Settings"
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate">
          {/* Header */}
          <motion.div variants={fadeUp} className="mb-7">
            <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Settings</span>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
              Workspace configuration
            </h1>
            <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
              The dials behind your practice — identity, integrations, security, and data.
            </p>
          </motion.div>

          {/* Layout: left rail + content.
              Plain div (not motion) — a transformed ancestor would break the
              sticky nav below, so the entrance animation lives on the children. */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
            {/* Side nav — stays fixed in view while the content scrolls */}
            <nav className="lg:sticky lg:top-6 lg:self-start">
              <ul className="space-y-1">
                {SECTIONS.map((s) => {
                  const active = section === s.key;
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => setSection(s.key)}
                        className={cn(
                          'group relative w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'bg-foreground/[0.06] text-foreground'
                            : 'text-foreground/75 dark:text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground/90',
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-active"
                            className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]"
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                          />
                        )}
                        <div className="text-sm font-medium">{s.label}</div>
                        <div className="mt-0.5 text-[11px] text-foreground/75 dark:text-foreground/55">{s.description}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Active section */}
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="min-w-0 space-y-5"
            >
              <ActiveSection />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
