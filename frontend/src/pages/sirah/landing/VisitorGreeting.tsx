import { useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';

import { firstNameOf, getSegment, getVisitorName, subscribeSegment, type PracticeSegment } from './practiceSegment';

/** Who the page was set up for, after "this one's for you -". */
const GREETING_FOR: Record<PracticeSegment, string> = {
  solo: 'built for dietitians who run it all themselves',
  small: 'built for small teams like yours',
  clinic: 'built for clinics like yours',
};

/**
 * "Hi Zac 👋 this one's for you - built for ..." in the header, once the
 * visitor has given their name in the welcome popup. `inline` sits in the
 * header row on tablets and up; `bar` is its own line under the header row on
 * phones, where the row has no room left beside the Book a demo button.
 */
export function VisitorGreeting({ layout }: { layout: 'inline' | 'bar' }) {
  const name = useSyncExternalStore(subscribeSegment, getVisitorName, () => null);
  const segment = useSyncExternalStore(subscribeSegment, getSegment, () => null);
  if (!name) return null;

  return (
    <motion.p
      key={name}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={
        layout === 'inline'
          ? 'hidden min-w-0 flex-1 truncate px-6 text-center text-[15px] font-semibold text-foreground/80 md:block'
          : 'truncate px-6 pb-2.5 text-center text-sm font-semibold text-foreground/80 md:hidden'
      }
    >
      Hi{' '}
      <span className="bg-gradient-to-br from-teal-700 via-teal-500 to-teal-400 bg-clip-text text-transparent">
        {firstNameOf(name)}
      </span>{' '}
      <span aria-hidden>👋</span>
      <span> this one's for you</span>
      <span className="hidden lg:inline"> - {GREETING_FOR[segment ?? 'solo']}</span>
    </motion.p>
  );
}
