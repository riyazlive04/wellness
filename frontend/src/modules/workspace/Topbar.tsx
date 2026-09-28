import { ChevronDown, ChevronLeft, Crown, Menu, RotateCw, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { StaffPushToggle } from '@/modules/activity/StaffPushToggle';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { NotificationsBell } from '@/modules/notifications/NotificationsBell';
import { staffNotifications } from '@/modules/notifications/notificationsApi';
import { useScope } from '@/hooks/useScope';
import { planName } from '@/lib/planCapabilities';
import { trialStateFrom } from '@/modules/workspace/trial/trialState';
import { cn } from '@/lib/utils';

interface TopbarProps {
  practiceName: string;
  /** Optional context message ("Last sync: 2 min ago" etc.) */
  context?: string;
  /** Callback to open the mobile drawer */
  onOpenMobileNav?: () => void;
}

/**
 * Owner topbar — calm by design. Mirrors the admin layout's "one identity
 * pill + status text + lightweight actions" pattern. Search is now an icon
 * button (Cmd+K) instead of a visible input; the input came back when we
 * have a real search index. Help was removed — settings carries those links.
 */
export function Topbar({ practiceName, context, onOpenMobileNav }: TopbarProps) {
  const { logoUrl } = useWorkspaceBrand();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Back appears on every owner section — everywhere except the dashboard home.
  const isHome = pathname === '/dashboard';
  const goBack = () => {
    if (window.history.length > 1) { navigate(-1); return; }
    // Direct load (no history): detail pages fall back to their section list,
    // section pages to the dashboard.
    const seg = pathname.split('/').filter(Boolean);
    navigate(seg.length > 1 ? '/' + seg[0] : '/dashboard');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="grid h-9 w-9 place-items-center rounded-lg text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground md:hidden"
          aria-label={t('a11y.openMenu')}
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Back - shown on every section (not the dashboard home) */}
        {!isHome && (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.02] px-3 py-1 text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            aria-label={t('a11y.goBack')}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> {t('actions.back')}
          </button>
        )}

        {/* Workspace switcher - single identity pill, same shape as admin's */}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-1 text-xs transition-colors hover:bg-foreground/[0.05]"
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-4 w-4 rounded object-cover" />
          ) : (
            <span className="grid h-4 w-4 place-items-center rounded bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)] text-[9px] font-medium text-foreground">
              {practiceName.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="hidden font-medium sm:inline">{practiceName}</span>
          <ChevronDown className="h-3 w-3 text-foreground/55" />
        </button>

        <PlanBadge />

        {context && (
          <span className="hidden text-xs text-foreground/55 md:block">{context}</span>
        )}

        {/* Lightweight actions on the right: search + push + theme + notifications. */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Refresh - reloads the whole page. Always shown (not just mobile) so
              there's a consistent reload control next to search on every page. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="grid h-9 w-9 place-items-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label={t('actions.refresh')}
            title={t('actions.refresh')}
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <span className="hidden sm:inline-flex"><StaffPushToggle /></span>
          <LanguageSwitcher compact />
          <ThemeToggle />
          <NotificationsBell surface={staffNotifications} />
        </div>
      </div>
    </header>
  );
}

// Plan -> badge colours. Trial is amber (time-limited); paid plans step up
// from blue to brand gradient to purple to gold.
const PLAN_STYLE: Record<string, string> = {
  trial:     'border-amber-400/50 bg-amber-400/15 text-amber-800 dark:text-amber-200',
  starter:   'border-sky-400/50 bg-sky-400/15 text-sky-800 dark:text-sky-200',
  basic:     'border-sky-400/50 bg-sky-400/15 text-sky-800 dark:text-sky-200',
  growth:    'border-transparent bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm',
  pro:       'border-transparent bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm',
  scale_pro: 'border-transparent bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-sm',
  elite:     'border-transparent bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-950 shadow-sm',
};

/** The practice's current plan, highlighted. Owners can click through to Billing. */
function PlanBadge() {
  const { data: scope } = useScope();
  const trial = trialStateFrom(scope ?? undefined);
  const key = trial.onTrial ? 'trial' : (scope?.plan ?? '').toLowerCase();
  const name = planName(key);
  if (!scope?.workspaceId || !name) return null;

  const isOwner = scope.workspaceRole === 'owner';
  const Icon = key === 'trial' ? Sparkles : Crown;
  const detail = trial.onTrial ? (trial.expired ? 'ended' : `${trial.daysLeft}d left`) : null;
  const className = cn(
    'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
    PLAN_STYLE[key] ?? 'border-foreground/15 bg-foreground/[0.05] text-foreground',
    isOwner && 'transition-opacity hover:opacity-85',
  );
  const content = (
    <>
      <Icon className="h-3.5 w-3.5" />
      <span>{name}</span>
      {detail && <span className="hidden font-medium opacity-80 sm:inline">· {detail}</span>}
    </>
  );
  return isOwner ? (
    <Link to="/billing" className={className} title="Your plan - view billing">{content}</Link>
  ) : (
    <span className={className} title="Your practice's plan">{content}</span>
  );
}
