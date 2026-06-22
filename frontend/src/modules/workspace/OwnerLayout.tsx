import { useState, type ReactNode } from 'react';
import { GradientOrb } from '@/design-system';
import { useServerBrandingSync } from '@/lib/workspaceBrand';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileSidebar } from './MobileSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { AnnouncementBanner } from './AnnouncementBanner';
import { ImpersonationBanner } from './ImpersonationBanner';
import { FloatingAssistant } from '@/modules/assistant/FloatingAssistant';
import { CommandPalette } from '@/modules/search/CommandPalette';
import { DeviceRegistrar } from '@/components/DeviceRegistrar';
import { SessionRevocationGuard } from '@/components/SessionRevocationGuard';
import { PrivacyPolicyGate } from './PrivacyPolicyGate';

interface OwnerLayoutProps {
  practiceName: string;
  ownerName: string;
  initials: string;
  trialDaysLeft?: number | null;
  topbarContext?: string;
  onSignOut?: () => void;
  children: ReactNode;
}

export function OwnerLayout(props: OwnerLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useServerBrandingSync();

  return (
    <div className="relative flex h-screen overflow-hidden bg-canvas text-foreground">
      <DeviceRegistrar />
      <SessionRevocationGuard />
      <PrivacyPolicyGate />
      {/* Ambient orbs — used very lightly here so they don't fight the content */}
      <GradientOrb color="indigo" size={420} position="-top-32 -left-20" />
      <GradientOrb color="sage" size={360} position="bottom-0 -right-16" delay={2} driftDuration={22} />

      {/* Desktop sidebar */}
      <Sidebar
        practiceName={props.practiceName}
        ownerName={props.ownerName}
        initials={props.initials}
        trialDaysLeft={props.trialDaysLeft}
        onSignOut={props.onSignOut}
      />

      {/* Mobile drawer */}
      <MobileSidebar
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        practiceName={props.practiceName}
        ownerName={props.ownerName}
        initials={props.initials}
        trialDaysLeft={props.trialDaysLeft}
        onSignOut={props.onSignOut}
      />

      <div
        className="relative z-10 flex h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out md:pl-[var(--sidebar-width,260px)]"
      >
        <Topbar
          practiceName={props.practiceName}
          context={props.topbarContext}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <ImpersonationBanner />
        <AnnouncementBanner />
        {/* The single scroll container for owner pages — guarantees the mouse
            wheel scrolls the content (the topbar + banners stay fixed above it).
            `min-h-0` is essential: without it a flex child defaults to
            min-height:auto and grows to its content height instead of scrolling,
            so the overflow gets clipped by the parent and the wheel does nothing.
            pb on mobile clears the fixed bottom nav + home-indicator inset. */}
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0">
          {props.children}
        </main>
      </div>

      {/* Mobile bottom tab bar — owner shell. "More" opens the full drawer. */}
      <MobileBottomNav onMore={() => setMobileNavOpen(true)} />

      {/* Global command palette (Cmd/Ctrl-K). */}
      <CommandPalette />

      {/* Always-available role-scoped AI chat (Clinical AI for workspace staff). */}
      <FloatingAssistant />
    </div>
  );
}
