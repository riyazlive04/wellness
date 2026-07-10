import { useState } from 'react';

import { cn } from '@/lib/utils';
import { useWorkspaceBrand } from '@/lib/workspaceBrand';
import { WorkspacePhotoModal } from './WorkspacePhotoModal';

/**
 * Clickable workspace profile avatar (sidebar footer). Shows the practice
 * logo or an initials fallback; clicking opens the shared zoom + change/remove
 * dialog.
 */
export function WorkspaceProfileButton({
  initials, className,
}: { initials: string; className?: string }) {
  const { logoUrl } = useWorkspaceBrand();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Workspace profile photo"
        className={cn(
          'flex-shrink-0 overflow-hidden rounded-full transition-all hover:ring-2 hover:ring-teal-400/40',
          className,
        )}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.40)] to-[hsl(var(--brand-magenta)_/_0.30)] text-xs font-medium">
            {initials}
          </div>
        )}
      </button>

      <WorkspacePhotoModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
