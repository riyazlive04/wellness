import { Construction, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

import { Glass, fadeUp, stagger } from '@/design-system';

interface PendingPageProps {
  /** Section title shown in <h1>. */
  title: string;
  /** What lives here once the dependency lands. */
  description: string;
  /** Vendor / decision the section is waiting on. */
  waitingOn: string;
  /** Bullets describing the features that will appear here. */
  willInclude: string[];
  icon?: LucideIcon;
}

/**
 * Shared scaffold for admin sections whose data source requires an external
 * vendor decision (Razorpay/Stripe, email provider, monitoring tool, etc.).
 * Renders a clearly-labelled "coming next" surface so the section feels
 * planned, not broken.
 */
export function PendingPage({
  title,
  description,
  waitingOn,
  willInclude,
  icon: Icon = Construction,
}: PendingPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-8 md:py-14">
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="space-y-6"
      >
        <motion.div variants={fadeUp} className="space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
            <Icon className="h-3 w-3" />
            Coming next
          </span>
          <h1 className="text-balance">{title}</h1>
          <p className="text-pretty text-base text-foreground/65 md:text-lg md:leading-relaxed">
            {description}
          </p>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="p-6 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Waiting on</div>
              <div className="mt-1 text-sm font-medium text-foreground">{waitingOn}</div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Will include</div>
              <ul className="mt-2 space-y-1.5 text-sm text-foreground/75">
                {willInclude.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-foreground/40">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}
