import type { ReactNode } from 'react';
import { GradientOrb } from '@/design-system';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

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
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#0A0C10] text-white">
      {/* Ambient orbs — used very lightly here so they don't fight the content */}
      <GradientOrb color="indigo" size={420} position="-top-32 -left-20" />
      <GradientOrb color="sage" size={360} position="bottom-0 -right-16" delay={2} driftDuration={22} />

      <Sidebar
        practiceName={props.practiceName}
        ownerName={props.ownerName}
        initials={props.initials}
        trialDaysLeft={props.trialDaysLeft}
        onSignOut={props.onSignOut}
      />

      <div className="relative z-10 flex min-h-screen flex-1 flex-col">
        <Topbar practiceName={props.practiceName} context={props.topbarContext} />
        <main className="flex-1">{props.children}</main>
      </div>
    </div>
  );
}
