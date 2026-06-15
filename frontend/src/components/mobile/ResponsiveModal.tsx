import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes for the content surface (Drawer panel / Dialog box). */
  className?: string;
  /** Hide the visible header (still rendered for a11y when title is set). */
  hideHeader?: boolean;
}

/**
 * ResponsiveModal — one API, native-correct presentation per device.
 *
 * - **Mobile**: a bottom sheet (vaul Drawer) that swipes up from the bottom,
 *   drag-to-dismiss, with safe-area padding so content clears the home bar.
 * - **Tablet / desktop**: a centered modal dialog.
 *
 * This is the spec's "Native Style Modals / Bottom Sheets" primitive. Replace
 * ad-hoc `<Dialog>` usages with this wherever a sheet feels more app-like on
 * phones (filters, quick actions, pickers, confirmations).
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideHeader,
}: ResponsiveModalProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn(
            "max-h-[92vh] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]",
            className,
          )}
        >
          {title && (
            <DrawerHeader className={cn("px-0 text-left", hideHeader && "sr-only")}>
              <DrawerTitle>{title}</DrawerTitle>
              {description && <DrawerDescription>{description}</DrawerDescription>}
            </DrawerHeader>
          )}
          <div className="momentum-scroll overflow-y-auto">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        {title && (
          <DialogHeader className={hideHeader ? "sr-only" : undefined}>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
