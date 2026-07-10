import * as React from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface FloatingActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  /** Sit above the mobile bottom-nav by default; set false for plain pages. */
  aboveBottomNav?: boolean;
}

/**
 * FloatingActionButton — the Material/iOS-style primary action.
 *
 * A circular, gradient FAB pinned bottom-right, lifted above the safe-area and
 * (optionally) the bottom tab bar. Springy press feedback for a native feel.
 * The `label` is used for accessibility and can surface as a tooltip later.
 */
export const FloatingActionButton = React.forwardRef<
  HTMLButtonElement,
  FloatingActionButtonProps
>(({ icon: Icon, label, aboveBottomNav = true, className, ...props }, ref) => {
  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.04 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full text-white shadow-xl",
        "no-select touch-target",
        "bg-gradient-to-br from-teal-500 to-blue-500",
        "shadow-teal-500/30",
        aboveBottomNav
          ? "bottom-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom)+1rem)] md:bottom-6"
          : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]",
        className,
      )}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      <Icon className="h-6 w-6" />
    </motion.button>
  );
});

FloatingActionButton.displayName = "FloatingActionButton";
