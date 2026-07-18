import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, LogOut, RefreshCw, XCircle } from 'lucide-react';

import { AIGlow, BrandMark, Glass, GradientOrb, Wordmark, fadeUp } from '@/design-system';
import { clientsApi } from '@/modules/workspace/api/clients';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Where a client waits between requesting a place and the nutritionist
 * deciding. Polls every 20s so an approval lands without a manual refresh —
 * the client is likely sitting on this screen when it happens.
 */
export default function PendingApproval() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    refetchInterval: 20_000,
  });
  const requestQ = useQuery({
    queryKey: ['me', 'join-request'],
    queryFn: () => clientsApi.myJoinRequest(),
    refetchInterval: 20_000,
  });

  const status = profileQ.data?.status;
  const rejected = requestQ.data?.status === 'rejected';

  // Approved while they waited → get them moving.
  useEffect(() => {
    if (status === 'active') navigate('/portal/onboarding', { replace: true });
  }, [status, navigate]);

  return (
    <Shell>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <AIGlow intensity="soft" animated={false}>
          <Glass variant="heavy" className="p-8 text-center">
            {rejected ? (
              <>
                <XCircle className="mx-auto mb-3 h-8 w-8 text-rose-600 dark:text-rose-400" />
                <h1 className="text-lg font-semibold">Request not approved</h1>
                <p className="mt-2 text-sm text-foreground/70">
                  {requestQ.data?.note?.trim()
                    ? requestQ.data.note
                    : 'Your nutritionist didn\'t approve this request. If you think that\'s a mistake, reach out to them directly.'}
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-400/15">
                  <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h1 className="text-lg font-semibold">Waiting for approval</h1>
                <p className="mt-2 text-pretty text-sm text-foreground/70">
                  Your request is with your nutritionist. As soon as they approve it, you'll go
                  straight to setting up your profile - this page updates on its own.
                </p>
                {requestQ.data?.email && (
                  <p className="mt-4 text-xs text-foreground/55">
                    Requested as <span className="font-medium text-foreground/75">{requestQ.data.email}</span>
                  </p>
                )}
              </>
            )}

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => { void profileQ.refetch(); void requestQ.refetch(); }}
                disabled={profileQ.isFetching || requestQ.isFetching}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-4 py-2 text-xs font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.04] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${profileQ.isFetching || requestQ.isFetching ? 'animate-spin' : ''}`} />
                Check again
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium text-foreground/55 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </Glass>
        </AIGlow>
      </motion.div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // See Join.tsx — orbs in a fixed clipped layer so the page root can scroll.
    <div className="relative min-h-screen bg-canvas text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <GradientOrb color="magenta" size={520} position="-top-32 -left-20" />
        <GradientOrb color="violet"  size={420} position="-bottom-32 -right-20" delay={3} driftDuration={26} />
      </div>
      <header className="relative z-10 border-b border-foreground/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <BrandMark size={28} animated={false} />
          <Wordmark className="text-sm" />
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-md px-5 py-16">
        {children}
      </main>
    </div>
  );
}
