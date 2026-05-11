import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footerButtons?: React.ReactNode;
  className?: string;
}

export function PreviewModal({
  open,
  onClose,
  title,
  children,
  footerButtons,
  className,
}: PreviewModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={cn(
        "bg-background rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden",
        "sm:max-h-[90vh] sm:rounded-lg",
        "max-sm:w-full max-sm:h-full max-sm:max-h-screen max-sm:rounded-none",
        className
      )}>
        {/* Fixed Header */}
        <div className="preview-header p-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-xl font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Body */}
        <div className="preview-body flex-1 overflow-y-auto p-4 min-h-0">
          {children}
        </div>

        {/* Fixed Footer */}
        {footerButtons && (
          <div className="preview-footer p-4 border-t flex justify-end gap-2 shrink-0">
            {footerButtons}
          </div>
        )}
      </div>
    </div>
  );
}
