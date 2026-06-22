import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Utensils,
  Camera,
  Mic,
  ClipboardList,
  Activity,
  MessageCircle,
  Calendar,
  Users,
  FileText,
  Bell,
  Settings,
  LogOut,
  Sparkles,
  Menu,
  X,
  Ruler,
  BookOpen,
  Folder,
  CheckSquare,
  HeartHandshake,
  Droplet,
  Image as ImageIcon,
  Pill,
  Target,
  Repeat,
  PenLine,
  Clock,
  ChevronLeft,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { BrandMark, GradientOrb } from '@/design-system';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { PageTransition, PullToRefresh } from '@/components/mobile';
import { FloatingVoiceAssistant } from './FloatingVoiceAssistant';
import { FloatingAssistant } from '@/modules/assistant/FloatingAssistant';
import { NotificationPrompt } from '@/components/NotificationPrompt';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';
import { useServerBrandingSync, useWorkspaceBrand } from '@/lib/workspaceBrand';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Show in mobile bottom-tab (5 max). Others live in More drawer. */
  primary?: boolean;
  /** Extra routes (merged-section tabs) that also mark this hub active. */
  match?: string[];
}

/** Whether a nav path is the active route. `/portal` must match exactly. */
function isActivePath(to: string, pathname: string): boolean {
  if (to === '/portal') return pathname === '/portal';
  return pathname === to || pathname.startsWith(to + '/');
}

/**
 * Merged sections. Related pages were combined into a single sidebar "hub":
 * the hub opens the first tab, and a sub-tab bar (rendered in the layout) lets
 * the client move between the merged pages without leaving the section.
 * Every original page/route is preserved — only the navigation is consolidated.
 */
interface SectionTab { to: string; label: string; icon: LucideIcon }
const SECTIONS: SectionTab[][] = [
  [ // Meals hub
    { to: '/portal/meals',        label: 'Meals',        icon: Utensils },
    { to: '/portal/plate-vision', label: 'Plate Vision', icon: Camera },
  ],
  [ // Assistant hub
    { to: '/portal/voice',        label: 'Voice',        icon: Mic },
    { to: '/portal/assistant',    label: 'Chat',         icon: Sparkles },
  ],
  [ // Progress hub
    { to: '/portal/progress',     label: 'Progress',     icon: Activity },
    { to: '/portal/measurements', label: 'Measurements', icon: Ruler },
    { to: '/portal/photos',       label: 'Photos',       icon: ImageIcon },
  ],
  [ // Wellbeing hub
    { to: '/portal/wellbeing',    label: 'Wellbeing',    icon: HeartHandshake },
    { to: '/portal/habits',       label: 'Habits',       icon: Repeat },
    { to: '/portal/cycle',        label: 'Cycle',        icon: Droplet },
  ],
  [ // Plan hub
    { to: '/portal/goals',        label: 'Goals',        icon: Target },
    { to: '/portal/programs',     label: 'Programs',     icon: ClipboardList },
    { to: '/portal/assessments',  label: 'Assessments',  icon: CheckSquare },
  ],
  [ // Journal hub
    { to: '/portal/journal',      label: 'Journal',      icon: PenLine },
    { to: '/portal/timeline',     label: 'Timeline',     icon: Clock },
  ],
  [ // Food library hub
    { to: '/portal/recipes',      label: 'Recipes',      icon: BookOpen },
    { to: '/portal/foods',        label: 'Food lookup',  icon: BookOpen },
    { to: '/portal/supplements',  label: 'Supplements',  icon: Pill },
  ],
  [ // Documents hub
    { to: '/portal/reports',      label: 'Reports',      icon: FileText },
    { to: '/portal/files',        label: 'Files',        icon: Folder },
  ],
];

/** The merged section (if any) that owns the current route. */
function activeSection(pathname: string): SectionTab[] | null {
  return SECTIONS.find((tabs) => tabs.some((t) => isActivePath(t.to, pathname))) ?? null;
}

/**
 * Sidebar: one row per destination. Merged sections collapse to a single hub
 * row whose `match` list flags it active for any of its tabs. Order roughly
 * follows daily use, with account utilities at the bottom.
 */
const NAV: NavItem[] = [
  { to: '/portal',              label: 'Today',         icon: Home,          primary: true },
  { to: '/portal/meals',        label: 'Meals',         icon: Utensils,      primary: true, match: ['/portal/meals', '/portal/plate-vision'] },
  { to: '/portal/voice',        label: 'Assistant',     icon: Sparkles,      primary: true, match: ['/portal/voice', '/portal/assistant'] },
  { to: '/portal/progress',     label: 'Progress',      icon: Activity,      primary: true, match: ['/portal/progress', '/portal/measurements', '/portal/photos'] },
  { to: '/portal/wellbeing',    label: 'Wellbeing',     icon: HeartHandshake, match: ['/portal/wellbeing', '/portal/habits', '/portal/cycle'] },
  { to: '/portal/goals',        label: 'Plan',          icon: ClipboardList, match: ['/portal/goals', '/portal/programs', '/portal/assessments'] },
  { to: '/portal/journal',      label: 'Journal',       icon: PenLine,       match: ['/portal/journal', '/portal/timeline'] },
  { to: '/portal/recipes',      label: 'Food library',  icon: BookOpen,      match: ['/portal/recipes', '/portal/foods', '/portal/supplements'] },
  { to: '/portal/chat',         label: 'Chat',          icon: MessageCircle, primary: true },
  { to: '/portal/appointments', label: 'Appointments',  icon: Calendar },
  { to: '/portal/community',    label: 'Community',      icon: Users },
  { to: '/portal/reports',      label: 'Documents',     icon: FileText,      match: ['/portal/reports', '/portal/files'] },
  { to: '/portal/notifications', label: 'Notifications', icon: Bell },
  { to: '/portal/settings',     label: 'Settings',      icon: Settings },
];

const PRIMARY = NAV.filter((n) => n.primary);

function NavItemLink({
  item, pathname, mobile, onNavigate,
}: {
  item: NavItem;
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  // A hub is active when the route matches the hub itself or any merged tab.
  const isActive = item.match
    ? item.match.some((p) => isActivePath(p, pathname))
    : isActivePath(item.to, pathname);

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      style={
        isActive && !mobile
          ? {
              background:
                'linear-gradient(to right, color-mix(in srgb, var(--brand-primary) 16%, transparent), color-mix(in srgb, var(--brand-accent) 10%, transparent))',
            }
          : undefined
      }
      className={cn(
        'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all',
        isActive
          ? mobile
            ? 'bg-foreground/[0.06] text-foreground'
            : 'text-foreground'
          : 'text-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground/90',
      )}
    >
      {isActive && !mobile && (
        <motion.span
          layoutId="client-nav-active"
          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
          style={{ background: 'linear-gradient(to bottom, var(--brand-primary), var(--brand-accent))' }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <item.icon className="h-4 w-4 flex-shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

/**
 * Top bar shown above the content area. Carries a Back button on every
 * non-root page (so you can always retrace your steps) and, when the route
 * belongs to a merged section, the sub-tabs to switch between the combined
 * pages (e.g. Meals ↔ Plate Vision).
 */
function ClientTopBar({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const tabs = activeSection(pathname);
  const showBack = pathname !== '/portal';
  if (!showBack && !tabs) return null;

  // Prefer real browser history; fall back to Today if we were deep-linked in.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/portal');
  };

  return (
    <div className="sticky top-14 z-10 border-b border-foreground/[0.06] bg-canvas/80 backdrop-blur-xl md:top-0">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 overflow-x-auto px-4 py-2 md:px-8">
        {showBack && (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
            aria-label="Go back"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}
        {showBack && tabs && <span className="h-5 w-px flex-shrink-0 bg-foreground/10" />}
        {tabs?.map((t) => {
          const active = isActivePath(t.to, pathname);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                'relative inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                active ? 'text-foreground' : 'text-foreground/55 hover:text-foreground/85',
              )}
            >
              {active && (
                <motion.span
                  layoutId="client-section-tab"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600/20 to-fuchsia-500/15"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

interface ClientLayoutProps {
  /** Greeting name shown in the topbar. */
  firstName?: string;
  /**
   * Opt-in mobile pull-to-refresh. When provided, the page content gets a
   * native-style pull-to-refresh on touch devices; the callback should refetch
   * the page's data (e.g. invalidate its react-query keys) and resolve when done.
   */
  onRefresh?: () => Promise<unknown> | void;
  children: ReactNode;
}

/**
 * ClientLayout — wellness-companion shell.
 *
 * Desktop: persistent sidebar (260px) + content. Calm, breathable.
 * Mobile: floating bottom-tab (5 items) + hamburger drawer for everything
 *   else. Bottom bar uses an iOS-style frosted glass + safe-area padding.
 *
 * The whole surface lives inside a gradient mist so the dashboard feels
 * less like a tool and more like a companion app — Headspace / Calm / Apple
 * Health rhythm. GradientOrbs animate softly in the background; everything
 * else stays still so the eye relaxes.
 */
export function ClientLayout({ firstName, onRefresh, children }: ClientLayoutProps) {
  const { confirmSignOut } = useAuth();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useServerBrandingSync();
  const { logoUrl, practiceName, palette, tagline } = useWorkspaceBrand();
  // Verified-practitioner trust badge (shares the branding query's cache).
  const { data: branding } = useQuery({
    queryKey: ['workspace', 'branding'],
    queryFn: () => workspacesApi.branding(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const isVerified = !!branding?.verified;
  // Expose the practice palette as CSS variables so portal accents re-theme.
  const brandVars = {
    '--brand-primary': palette.primary,
    '--brand-accent': palette.accent,
  } as CSSProperties;

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Keep the active nav item visible: with a long list, the current page's
  // link can sit below the fold, so the sidebar appears "stuck" on another
  // section. Scroll it into view whenever the route changes.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = navRef.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [pathname]);

  // Presence heartbeat — stamps the client as "active now" while the app is
  // open and focused, so the nutritionist sees Instagram-style activity.
  useEffect(() => {
    let active = true;
    const ping = () => {
      if (active && document.visibilityState === 'visible') {
        clientsApi.recordPresence().catch(() => { /* offline / not a client — ignore */ });
      }
    };
    ping();
    const id = window.setInterval(ping, 60_000);
    document.addEventListener('visibilitychange', ping);
    window.addEventListener('focus', ping);
    return () => {
      active = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', ping);
      window.removeEventListener('focus', ping);
    };
  }, []);

  return (
    <div className="relative h-screen overflow-hidden bg-canvas text-foreground" style={brandVars}>
      {/* Soft ambient backdrop — fixed + clipped so the decorative orbs never
          add scrollable height to the page (the root's overflow-x-hidden would
          otherwise turn overflow-y into auto and let pages drift on scroll). */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <GradientOrb color="blue"    size={520} position="-top-32 -left-20" delay={0} driftDuration={26} />
        <GradientOrb color="magenta" size={420} position="-bottom-32 -right-10" delay={3} driftDuration={28} />
      </div>

      {/* Desktop sidebar — hidden on mobile */}
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[260px] flex-col border-r border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl md:flex">
        <Link to="/portal" className="flex items-center gap-3 border-b border-foreground/[0.06] px-5 py-5">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-xl object-cover" />
          ) : (
            <span
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, var(--brand-accent), var(--brand-primary))` }}
            >
              <BrandMark size={20} animated={false} />
            </span>
          )}
          <div className="flex min-w-0 flex-col leading-none">
            <span className="flex items-center gap-1 truncate text-sm font-semibold tracking-tight">
              <span className="truncate">{practiceName}</span>
              {isVerified && (
                <BadgeCheck
                  className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500"
                  aria-label="Verified practitioner"
                />
              )}
            </span>
            <span className="truncate text-[10px] uppercase tracking-[0.16em] text-foreground/55">
              {tagline || 'Your wellness'}
            </span>
          </div>
        </Link>

        <nav ref={navRef} className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
          {NAV.map((item) => (
            <NavItemLink key={item.to} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="border-t border-foreground/[0.06] p-3">
          <button
            type="button"
            onClick={confirmSignOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-foreground/65 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar — greeting + hamburger */}
      <header className="fixed inset-x-0 top-0 z-20 border-b border-foreground/[0.04] bg-canvas/85 backdrop-blur-xl md:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg text-foreground/70 hover:bg-foreground/[0.05]"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
              {greetingTime()}
            </div>
            <div className="text-sm font-medium">
              Hi {firstName ?? 'there'} <Sparkles className="ml-1 inline h-3 w-3 text-violet-500" />
            </div>
          </div>
          <Link
            to="/portal/notifications"
            className="grid h-9 w-9 place-items-center rounded-lg text-foreground/70 hover:bg-foreground/[0.05]"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Mobile drawer for full nav */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 md:hidden"
            />
            <motion.aside
              key="drawer"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', stiffness: 400, damping: 36 }}
              className="fixed left-0 top-0 z-50 h-full w-[260px] border-r border-foreground/[0.06] bg-canvas md:hidden"
            >
              <div className="flex h-14 items-center justify-between border-b border-foreground/[0.06] px-4">
                <BrandMark size={24} animated={false} />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-foreground/70 hover:bg-foreground/[0.05]"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
                {NAV.map((item) => (
                  <NavItemLink key={item.to} item={item} pathname={pathname} mobile onNavigate={() => setDrawerOpen(false)} />
                ))}
              </nav>
              <button
                type="button"
                onClick={confirmSignOut}
                className="m-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-foreground/65 hover:bg-foreground/[0.04]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content — keyed page transition for a native stack-nav feel,
          wrapped in pull-to-refresh on mobile when the page opts in. */}
      <main className="relative z-10 h-full overflow-y-auto overflow-x-hidden pt-14 md:pl-[260px] md:pt-0 pb-24 md:pb-0">
        <ClientTopBar pathname={pathname} />
        {onRefresh && isMobile ? (
          <PullToRefresh onRefresh={onRefresh}>
            <PageTransition transitionKey={pathname}>{children}</PageTransition>
          </PullToRefresh>
        ) : (
          <PageTransition transitionKey={pathname}>{children}</PageTransition>
        )}
      </main>

      {/* Mobile bottom-tab — iOS frosted-glass style */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-16 items-center justify-around px-2">
          {PRIMARY.map((item) => {
            const isActive = item.match
              ? item.match.some((p) => isActivePath(p, pathname))
              : isActivePath(item.to, pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors',
                  isActive ? 'text-violet-600 dark:text-violet-300' : 'text-foreground/55',
                )}
              >
                <item.icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Always-available floating companions (bottom-right). Chat stacks above voice. */}
      <FloatingVoiceAssistant />
      <FloatingAssistant stack />

      {/* One-time nudge to enable OS push notifications (messages, reminders…). */}
      <NotificationPrompt />
    </div>
  );
}

function greetingTime(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Wind down';
}