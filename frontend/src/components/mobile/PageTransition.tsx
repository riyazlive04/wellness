import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

interface PageTransitionProps {
  /** Unique key per route so the transition fires on navigation. */
  transitionKey: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * PageTransition — subtle, native-style page entrance.
 *
 * A short fade + upward slide on each route change, the kind of motion a
 * native stack navigator gives you. Kept deliberately understated (8px / 0.22s)
 * so it reads as "polish", not "animation demo", and respects reduced-motion
 * via framer-motion's global setting.
 *
 * Apply inside a layout's <main> keyed on the pathname.
 */
export function PageTransition({
  transitionKey,
  children,
  className,
}: PageTransitionProps) {
  return (
    <motion.div
      key={transitionKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
