import { useState, type ReactNode } from 'react';
import { GradientOrb } from '@/design-system';
import { useServerBrandingSync } from '@/lib/workspaceBrand';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileSidebar } from './MobileSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { AnnouncementBanner } from './AnnouncementBanner';
import { ImpersonationBanner } from './ImpersonationBanner';

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
    <div className="relative flex min-h-screen overflow-hidden bg-canvas text-foreground">
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
        className="relative z-10 flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out md:pl-[var(--sidebar-width,260px)]"
      >
        <Topbar
          practiceName={props.practiceName}
          context={props.topbarContext}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <ImpersonationBanner />
        <AnnouncementBanner />
        {/* pb on mobile clears the fixed bottom nav + home-indicator inset. */}
        <main className="flex-1 pb-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0">
          {props.children}
        </main>
      </div>

      {/* Mobile bottom tab bar — owner shell. "More" opens the full drawer. */}
      <MobileBottomNav onMore={() => setMobileNavOpen(true)} />
    </div>
  );
}
