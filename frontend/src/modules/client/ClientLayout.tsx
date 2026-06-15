import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  type LucideIcon,
} from 'lucide-react';

import { BrandMark, GradientOrb } from '@/design-system';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useServerBrandingSync, useWorkspaceBrand } from '@/lib/workspaceBrand';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Show in mobile bottom-tab (5 max). Others live in More drawer. */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { to: '/portal',                label: 'Today',         icon: Home,          primary: true },
  { to: '/portal/meals',          label: 'Meals',         icon: Utensils,      primary: true },
  { to: '/portal/plate-vision',   label: 'Plate Vision',  icon: Camera,        primary: true },
  { to: '/portal/voice',          label: 'Voice AI',      icon: Mic,           primary: true },
  { to: '/portal/progress',       label: 'Progress',      icon: Activity,      primary: true },
  { to: '/portal/assistant',      label: 'Wellness AI',   icon: Sparkles },
  { to: '/portal/goals',          label: 'Goals',         icon: Target },
  { to: '/portal/habits',         label: 'Habits',        icon: Repeat },
  { to: '/portal/journal',        label: 'Journal',       icon: PenLine },
  { to: '/portal/timeline',       label: 'Timeline',      icon: Clock },
  { to: '/portal/programs',       label: 'Programs',      icon: ClipboardList },
  { to: '/portal/chat',           label: 'Chat',          icon: MessageCircle },
  { to: '/portal/appointments',   label: 'Appointments',  icon: Calendar },
  { to: '/portal/measurements',   label: 'Measurements',  icon: Ruler },
  { to: '/portal/wellbeing',      label: 'Wellbeing',     icon: HeartHandshake },
  { to: '/portal/cycle',          label: 'Cycle',         icon: Droplet },
  { to: '/portal/photos',         label: 'Photos',        icon: ImageIcon },
  { to: '/portal/supplements',    label: 'Supplements',   icon: Pill },
  { to: '/portal/assessments',    label: 'Assessments',   icon: CheckSquare },
  { to: '/portal/recipes',        label: 'Recipes',       icon: BookOpen },
  { to: '/portal/foods',          label: 'Food lookup',   icon: BookOpen },
  { to: '/portal/files',          label: 'Files',         icon: Folder },
  { to: '/portal/community',      label: 'Community',     icon: Users },
  { to: '/portal/reports',        label: 'Reports',       icon: FileText },
  { to: '/portal/notifications',  label: 'Notifications', icon: Bell },
  { to: '/portal/settings',       label: 'Settings',      icon: Settings },
];

const PRIMARY = NAV.filter((n) => n.primary);

interface ClientLayoutProps {
  /** Greeting name shown in the topbar. */
  firstName?: string;
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
export function ClientLayout({ firstName, children }: ClientLayoutProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useServerBrandingSync();
  const { logoUrl, practiceName, palette, tagline } = useWorkspaceBrand();
  // Expose the practice palette as CSS variables so portal accents re-theme.
  const brandVars = {
    '--brand-primary': palette.primary,
    '--brand-accent': palette.accent,
  } as CSSProperties;

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    try { localStorage.removeItem('app-user-role'); } catch { /* */ }
    navigate('/auth');
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-canvas text-foreground" style={brandVars}>
      {/* Soft ambient backdrop — these are slow, low-opacity, and behind everything */}
      <GradientOrb color="blue"    size={520} position="-top-32 -left-20" delay={0} driftDuration={26} />
      <GradientOrb color="magenta" size={420} position="-bottom-32 -right-10" delay={3} driftDuration={28} />

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
            <span className="truncate text-sm font-semibold tracking-tight">{practiceName}</span>
            <span className="truncate text-[10px] uppercase tracking-[0.16em] text-foreground/55">
              {tagline || 'Your wellness'}
            </span>
          </div>
        </Link>

        <nav className="scrollbar-hide flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/portal'}
              style={({ isActive }) =>
                isActive
                  ? {
                      background:
                        'linear-gradient(to right, color-mix(in srgb, var(--brand-primary) 16%, transparent), color-mix(in srgb, var(--brand-accent) 10%, transparent))',
                    }
                  : undefined
              }
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all',
                  isActive
                    ? 'text-foreground'
                    : 'text-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground/90',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="client-nav-active"
                      className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                      style={{ background: 'linear-gradient(to bottom, var(--brand-primary), var(--brand-accent))' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-foreground/[0.06] p-3">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-foreground/65 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar — greeting + hamburger */}
      <header className="sticky top-0 z-20 border-b border-foreground/[0.04] bg-canvas/85 backdrop-blur-xl md:hidden">
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
              <nav className="scrollbar-hide flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/portal'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm',
                        isActive
                          ? 'bg-foreground/[0.06] text-foreground'
                          : 'text-foreground/65 hover:bg-foreground/[0.04]',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <button
                type="button"
                onClick={signOut}
                className="m-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-foreground/65 hover:bg-foreground/[0.04]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="relative z-10 md:pl-[260px] pb-24 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom-tab — iOS frosted-glass style */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-foreground/[0.06] bg-canvas/85 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-16 items-center justify-around px-2">
          {PRIMARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/portal'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors',
                  isActive
                    ? 'text-violet-600 dark:text-violet-300'
                    : 'text-foreground/55',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
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