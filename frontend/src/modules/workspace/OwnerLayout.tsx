import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { GradientOrb } from '@/design-system';
import { useServerBrandingSync } from '@/lib/workspaceBrand';
import { useApplyBrandTheme } from '@/lib/brandTheme';
import { useScope } from '@/hooks/useScope';
import { daysUntil } from '@/modules/workspace/billing/helpers';
import { permissionForPath } from './nav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileSidebar } from './MobileSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { ImpersonationBanner } from './ImpersonationBanner';
import { FloatingAssistant } from '@/modules/assistant/FloatingAssistant';
import { CommandPalette } from '@/modules/search/CommandPalette';
import { DeviceRegistrar } from '@/components/DeviceRegistrar';
import { SessionRevocationGuard } from '@/components/SessionRevocationGuard';
import { PrivacyPolicyGate } from './PrivacyPolicyGate';
import { AppFooter } from '@/components/AppFooter';

interface OwnerLayoutProps {
  practiceName: string;
  ownerName: string;
  initials: string;
  /** @deprecated Ignored — the real countdown is now resolved from scope inside
   *  OwnerLayout. Pages no longer need to pass this; safe to drop over time. */
  trialDaysLeft?: number | null;
  topbarContext?: string;
  onSignOut?: () => void;
  children: ReactNode;
}

export function OwnerLayout(props: OwnerLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useServerBrandingSync();
  useApplyBrandTheme();

  // Central permission gate for every owner page: if a non-owner opens a route
  // whose feature they lack permission for (e.g. a manager denied Messaging),
  // bounce them to the dashboard. The backend enforces the same on its APIs.
  const { pathname } = useLocation();
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner' || !!scope?.isSuperAdmin;

  // Real trial countdown, resolved once here from the workspace's trial end date
  // (the backend only sends trialEndsAt while actually on the trial plan). This
  // replaces the hardcoded trialDaysLeft each page used to pass, so every page
  // shows the true "N days left" and paid workspaces see no banner at all.
  const trialDaysLeft = scope?.trialEndsAt ? Math.max(0, daysUntil(scope.trialEndsAt)) : null;
  const needed = permissionForPath(pathname);
  if (scope && !isOwner && needed && !(scope.permissions ?? []).includes(needed)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative flex h-dvh overflow-hidden bg-canvas text-foreground">
      <DeviceRegistrar />
      <SessionRevocationGuard />
      <PrivacyPolicyGate />
      {/* Ambient orbs - used very lightly here so they don't fight the content */}
      <GradientOrb color="indigo" size={420} position="-top-32 -left-20" />
      <GradientOrb color="sage" size={360} position="bottom-0 -right-16" delay={2} driftDuration={22} />

      {/* Desktop sidebar */}
      <Sidebar
        practiceName={props.practiceName}
        ownerName={props.ownerName}
        initials={props.initials}
        trialDaysLeft={trialDaysLeft}
        onSignOut={props.onSignOut}
      />

      {/* Mobile drawer */}
      <MobileSidebar
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        practiceName={props.practiceName}
        ownerName={props.ownerName}
        initials={props.initials}
        trialDaysLeft={trialDaysLeft}
        onSignOut={props.onSignOut}
      />

      <div
        className="relative z-10 flex h-dvh min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out md:pl-[var(--sidebar-width,260px)]"
      >
        <Topbar
          practiceName={props.practiceName}
          context={props.topbarContext}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <ImpersonationBanner />
        {/* The single scroll container for owner pages - guarantees the mouse
            wheel scrolls the content (the topbar + banners stay fixed above it).
            `min-h-0` is essential: without it a flex child defaults to
            min-height:auto and grows to its content height instead of scrolling,
            so the overflow gets clipped by the parent and the wheel does nothing.
            pb on mobile clears the fixed bottom nav + home-indicator inset. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom)+2rem)] md:pb-0">
          {props.children}
          <AppFooter practiceName={props.practiceName} />
        </main>
      </div>

      {/* Mobile bottom tab bar - owner shell. "More" opens the full drawer. */}
      <MobileBottomNav onMore={() => setMobileNavOpen(true)} />

      {/* Global command palette (Cmd/Ctrl-K). */}
      <CommandPalette />

      {/* Always-available role-scoped AI chat (Clinical AI for workspace staff). */}
      <FloatingAssistant />
    </div>
  );
}
