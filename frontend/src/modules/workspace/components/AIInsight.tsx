import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { AIGlow, Glass } from '@/design-system';

interface AIInsightProps {
  headline: string;
  body: string;
  cta?: { label: string; onClick: () => void };
  variant?: 'default' | 'subtle';
}

/**
 * AIInsight — the AI's daily nudge to the workspace owner. Rendered with
 * a soft animated glow to signal "this is AI-generated", but kept calm
 * enough to live above the fold every day without becoming noise.
 */
export function AIInsight({ headline, body, cta, variant = 'default' }: AIInsightProps) {
  return (
    <AIGlow intensity={variant === 'subtle' ? 'soft' : 'default'} animated>
      <Glass variant="heavy" className="overflow-hidden p-5 md:p-6">
        <div className="flex items-start gap-4">
          <motion.div
            animate={{ rotate: [0, 6, -4, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20"
          >
            <Sparkles className="h-5 w-5 text-violet-700 dark:text-violet-200" />
          </motion.div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                Today's insight
              </span>
              <span className="h-1 w-1 rounded-full bg-foreground/20" />
              <span className="text-[10px] text-foreground/75 dark:text-foreground/55">Generated just now</span>
            </div>

            <h3 className="mt-1.5 text-base font-medium tracking-tight md:text-lg">
              {headline}
            </h3>
            <p className="mt-1 text-sm text-foreground/75 dark:text-foreground/55">{body}</p>

            {cta && (
              <button
                type="button"
                onClick={cta.onClick}
                className="group mt-4 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.04] px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.08]"
              >
                {cta.label}
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </Glass>
    </AIGlow>
  );
}
