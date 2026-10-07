import { useQuery } from '@tanstack/react-query';
import { Loader2, Mail, MessageCircle } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';

/** What moving a lead to a stage would send them (from the server's own rules). */
interface StagePreview {
  status: string;
  will_message: boolean;
  text: string | null;
  whatsapp: boolean;
  email: boolean;
}

export interface PendingMove {
  id: string;
  name: string;
  status: string;
  stageLabel: string;
}

/**
 * Asks before a lead changes stage. When the move would message the lead it
 * shows the exact message and lets the admin send it or not; the stage
 * changes either way. Moves that send nothing just need a confirm.
 */
export function MoveLeadDialog({
  move,
  onCancel,
  onConfirm,
}: {
  move: PendingMove | null;
  onCancel: () => void;
  onConfirm: (notify: boolean) => void;
}) {
  const previewQ = useQuery({
    queryKey: ['admin', 'leads', 'stage-preview', move?.id, move?.status],
    queryFn: () =>
      api.get<StagePreview>(`/api/v1/admin/leads/${move!.id}/stage-preview?status=${encodeURIComponent(move!.status)}`),
    enabled: !!move,
    staleTime: 0,
    retry: 0,
  });
  const p = previewQ.data;
  const who = move?.name || 'this lead';
  const channels = p ? [p.whatsapp && 'WhatsApp', p.email && 'email'].filter(Boolean).join(' and ') : '';

  return (
    <Dialog open={!!move} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move {who} to {move?.stageLabel}?</DialogTitle>
          <DialogDescription>
            {previewQ.isLoading
              ? 'Checking what this move would send…'
              : previewQ.isError
                ? "Couldn't check the message. You can still change the stage without sending anything."
                : p?.will_message
                  ? `This stage sends ${who} a message on ${channels}. Send it?`
                  : 'No message is sent to the lead for this move.'}
          </DialogDescription>
        </DialogHeader>

        {previewQ.isLoading && (
          <div className="flex items-center gap-2 py-4 text-sm text-foreground/55">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {p?.will_message && p.text && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              {p.whatsapp && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </span>
              )}
              {p.email && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                  <Mail className="h-3 w-3" /> Email
                </span>
              )}
            </div>
            <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3 text-[13px] leading-relaxed text-foreground/80">
              {p.text}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-foreground/10 px-4 py-2 text-sm hover:bg-foreground/[0.04]"
          >
            Cancel
          </button>
          {p?.will_message ? (
            <>
              <button
                type="button"
                onClick={() => onConfirm(false)}
                className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium hover:bg-foreground/[0.04]"
              >
                Change without message
              </button>
              <button
                type="button"
                onClick={() => onConfirm(true)}
                className="rounded-full bg-[hsl(var(--brand-blue))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Change &amp; send message
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={previewQ.isLoading}
              onClick={() => onConfirm(false)}
              className="rounded-full bg-[hsl(var(--brand-blue))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Change stage
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
