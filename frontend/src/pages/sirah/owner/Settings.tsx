import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { SECTIONS, SECTION_ICONS } from '@/modules/workspace/settings/data/settingsConfig';
import { GeneralSection } from '@/modules/workspace/settings/sections/GeneralSection';
import { BrandingSection } from '@/modules/workspace/settings/sections/BrandingSection';
import { PublicProfileSection } from '@/modules/workspace/settings/sections/PublicProfileSection';
import { VerificationSection } from '@/modules/workspace/settings/sections/VerificationSection';
import { IntegrationsSection } from '@/modules/workspace/settings/sections/IntegrationsSection';
import { AiSection } from '@/modules/workspace/settings/sections/AiSection';
import { VideoSection } from '@/modules/workspace/settings/sections/VideoSection';
import { NotificationsSection } from '@/modules/workspace/settings/sections/NotificationsSection';
import { SecuritySection } from '@/modules/workspace/settings/sections/SecuritySection';
import { DataSection } from '@/modules/workspace/settings/sections/DataSection';
import type { SectionKey } from '@/modules/workspace/settings/types';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { verificationApi } from '@/modules/workspace/api/verification';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';

const RENDERERS: Partial<Record<SectionKey, React.ComponentType>> = {
  general:      GeneralSection,
  // Written but never mounted: the white-label toggle, logo and palette
  // lived in a component nothing rendered, so the tab did not exist.
  branding:     BrandingSection,
  public:       PublicProfileSection,
  verification: VerificationSection,
  integrations: IntegrationsSection,
  ai:           AiSection,
  video:        VideoSection,
  notifications: NotificationsSection,
  security:     SecuritySection,
  data:         DataSection,
};

const SECTION_KEYS = new Set(SECTIONS.map((s) => s.key));

export default function OwnerSettings() {
  const { t } = useTranslation('ownerSettings');
  const workspace = readWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const section: SectionKey =
    rawTab && SECTION_KEYS.has(rawTab as SectionKey) ? (rawTab as SectionKey) : 'general';
  const setSection = (key: SectionKey) =>
    setSearchParams(key === 'general' ? {} : { tab: key }, { replace: true });

  const ActiveSection = RENDERERS[section] ?? GeneralSection;

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={t('common:nav.settings')}
    >
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate">
          {/* Header */}
          <motion.div variants={fadeUp} className="mb-7">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('common:nav.settings')}</span>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
              {t('header.title')}
            </h1>
            <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">
              {t('header.subtitle')}
            </p>
          </motion.div>

          {/* Tabs across the top: one per section, scrolling sideways on phones. */}
          <nav className="-mx-1 mb-6 overflow-x-auto border-b border-foreground/[0.08]" aria-label="Settings sections">
            <ul className="flex min-w-max gap-1 px-1">
              {SECTIONS.map((s) => {
                const active = section === s.key;
                const Icon = SECTION_ICONS[s.key];
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => setSection(s.key)}
                      title={s.description}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative inline-flex items-center gap-2 whitespace-nowrap px-3.5 pb-3 pt-1 text-sm transition-colors',
                        active ? 'font-bold text-foreground' : 'font-medium text-foreground/55 hover:text-foreground/85',
                      )}
                    >
                      {Icon && <Icon className={cn('h-4 w-4', active ? 'text-[hsl(var(--brand-blue))]' : '')} />}
                      {s.label}
                      {active && (
                        <motion.span
                          layoutId="settings-tab"
                          className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-[hsl(var(--brand-blue))]"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Active section; General also shows what clients see. */}
          <div className={cn('grid grid-cols-1 gap-6', section === 'general' && 'xl:grid-cols-[1fr_300px]')}>
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="min-w-0 space-y-5"
            >
              <ActiveSection />
            </motion.div>
            {section === 'general' && (
              <aside className="hidden space-y-4 xl:block">
                <ClientsSeeCard />
                <VerifyNudge onOpen={() => setSection('verification')} />
              </aside>
            )}
          </div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

/** How the practice appears to its clients (portal, invoices, PDFs). */
function ClientsSeeCard() {
  const { data: ws } = useQuery({ queryKey: ['workspace', 'me'], queryFn: () => workspacesApi.me() });
  const { logoUrl } = useWorkspaceBrand();
  const name = ws?.display_name || ws?.name || 'Your practice';
  return (
    <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/45">What clients see</div>
      <div className="mt-3 flex items-center gap-3">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-foreground/[0.04]">
          {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <Building2Fallback />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{name}</div>
          <div className="truncate text-xs text-foreground/55">{ws?.contact_email || ws?.contact_phone || 'Add your contact details'}</div>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-foreground/[0.03] px-3 py-2 text-[11.5px] text-foreground/55">
        On the client app, invoices and every PDF you send.
      </div>
    </div>
  );
}

function Building2Fallback() {
  const Icon = SECTION_ICONS.general!;
  return <Icon className="h-5 w-5 text-foreground/40" />;
}

/** A nudge to get verified, until the practice is. */
function VerifyNudge({ onOpen }: { onOpen: () => void }) {
  const { data } = useQuery({ queryKey: ['workspace', 'verification'], queryFn: () => verificationApi.get() });
  const status = data?.status;
  if (!status || status === 'verified') return null;
  const pending = status === 'pending';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-3xl border border-amber-300/50 bg-amber-50 p-5 text-left transition-colors hover:bg-amber-100/70 dark:border-amber-500/20 dark:bg-amber-500/[0.06]"
    >
      <div className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-100">
        <BadgeCheck className="h-4 w-4" /> {pending ? 'Verification in review' : 'Get verified'}
      </div>
      <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/70">
        {pending
          ? "We're checking your credentials. You'll get the verified badge once approved."
          : status === 'rejected'
            ? 'Your last submission needs changes. Open Verification to see why.'
            : 'Verified practices get a badge on their public page, which helps new clients trust you.'}
      </p>
      {!pending && (
        <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-bold text-amber-900 dark:text-amber-100">
          {status === 'rejected' ? 'See what to fix' : 'Start'} <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
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
