import { useState } from 'react';
import { Check, ChevronDown, ChevronLeft, Crown, Loader2, Menu, RotateCw, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from './ThemeToggle';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { NotificationsBell } from '@/modules/notifications/NotificationsBell';
import { staffNotifications } from '@/modules/notifications/notificationsApi';
import { useScope } from '@/hooks/useScope';
import { planName } from '@/lib/planCapabilities';
import { trialStateFrom } from '@/modules/workspace/trial/trialState';
import { cn } from '@/lib/utils';
import { ROLE_LABEL } from '@/modules/workspace/api/tenancy';
import { useWorkspaceSwitch } from './useWorkspaceSwitch';

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
    // The NUSI green across every page: a gentle gradient bar with white text.
    <header className="sticky top-0 z-20 bg-gradient-to-r from-[#1f6b34] via-[#2f8f46] to-[#6fb84f] text-white shadow-[0_6px_20px_-12px_rgba(16,60,30,0.6)] dark:from-[#10301a] dark:via-[#1b5a2d] dark:to-[#2f6e30]">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="grid h-9 w-9 place-items-center rounded-lg text-white/85 hover:bg-white/15 hover:text-white md:hidden"
          aria-label={t('a11y.openMenu')}
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Back - shown on every section (not the dashboard home) */}
        {!isHome && (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-white/25"
            aria-label={t('a11y.goBack')}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> {t('actions.back')}
          </button>
        )}

        {/* Practice pill - switches practice when the user belongs to several */}
        <PracticePill practiceName={practiceName} logoUrl={logoUrl} />

        {context && (
          <>
            <span className="hidden text-white/45 md:block">/</span>
            <span className="hidden truncate text-sm text-white/85 md:block">{context}</span>
          </>
        )}

        {/* Right: plan, refresh, light/dark, notifications. */}
        <div className="ml-auto flex items-center gap-1.5">
          <PlanBadge />
          {/* Refresh - reloads the whole page. Always shown (not just mobile) so
              there's a consistent reload control next to search on every page. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="grid h-9 w-9 place-items-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white"
            aria-label={t('actions.refresh')}
            title={t('actions.refresh')}
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <ThemeToggle onBrand />
          <NotificationsBell surface={staffNotifications} onBrand />
        </div>
      </div>
    </header>
  );
}

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
    'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
    key === 'trial'
      ? 'bg-amber-300 text-amber-950 shadow-sm'
      : 'bg-white/15 text-white',
    isOwner && (key === 'trial' ? 'transition-colors hover:bg-amber-200' : 'transition-colors hover:bg-white/25'),
  );
  const content = (
    <>
      <Icon className="h-3.5 w-3.5" />
      <span>{name}</span>
      {detail && <span className="hidden font-medium opacity-80 sm:inline">· {detail}</span>}
    </>
  );
  if (isOwner && key === 'trial') {
    return (
      <span className="flex flex-shrink-0 items-center gap-1.5">
        <Link to="/billing" className={className} title="Your plan - view billing">{content}</Link>
        <Link to="/billing" className="hidden rounded-full bg-white px-3 py-1 text-xs font-bold text-[#23733a] shadow-sm transition-transform hover:scale-[1.03] sm:inline-block">
          Upgrade
        </Link>
      </span>
    );
  }
  return isOwner ? (
    <Link to="/billing" className={className} title="Your plan - view billing">{content}</Link>
  ) : (
    <span className={className} title="Your practice's plan">{content}</span>
  );
}

/**
 * The practice's identity pill. A plain label for single-practice users (the
 * common case); for members of several practices it opens a switch menu.
 */
function PracticePill({ practiceName, logoUrl }: { practiceName: string; logoUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const { memberships, current, canSwitch, switching, choose } = useWorkspaceSwitch();

  const body = (
    <>
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center overflow-hidden rounded-lg bg-white/90">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-[11px] font-bold text-[#23733a]">{practiceName.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="hidden max-w-[260px] truncate font-bold sm:inline">{practiceName}</span>
    </>
  );
  const pill = 'inline-flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-white';

  if (!canSwitch) {
    return <div className={pill} title={practiceName}>{body}</div>;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(pill, 'transition-colors hover:bg-white/15')}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch practice"
      >
        {body}
        <ChevronDown className="h-3 w-3 text-white/70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 top-full z-40 mt-1.5 max-h-72 w-64 overflow-y-auto rounded-xl border border-foreground/[0.08] bg-popover p-1 text-foreground shadow-2xl">
            <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">Switch practice</div>
            {memberships.map((m) => {
              const active = m.workspace_id === current?.workspace_id;
              return (
                <button
                  key={m.workspace_id}
                  type="button"
                  role="menuitem"
                  onClick={() => { if (active) setOpen(false); else void choose(m.workspace_id); }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                    active ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.04]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground">{m.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-foreground/45">{ROLE_LABEL[m.role] ?? m.role}</div>
                  </div>
                  {switching === m.workspace_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/40" />
                  ) : active ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
