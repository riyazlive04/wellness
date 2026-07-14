import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { History, Loader2, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { policiesApi } from '@/modules/workspace/api/policies';

const DATE = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function AdminPrivacyPolicy() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('Privacy Policy');
  const [content, setContent] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const policyQ = useQuery({
    queryKey: ['admin', 'privacy-policy'],
    queryFn: policiesApi.adminGet,
    staleTime: 30_000,
  });

  // Prefill the editor from the current policy once.
  useEffect(() => {
    if (!hydrated && policyQ.data?.current) {
      setTitle(policyQ.data.current.title);
      setContent(policyQ.data.current.content);
      setHydrated(true);
    }
  }, [hydrated, policyQ.data]);

  const publishMut = useMutation({
    mutationFn: () => policiesApi.adminPublish({ title: title.trim(), content: content.trim() }),
    onSuccess: (p) => {
      toast.success(`Published v${p.version}. Workspace owners will be asked to re-accept.`);
      void qc.invalidateQueries({ queryKey: ['admin', 'privacy-policy'] });
      void qc.invalidateQueries({ queryKey: ['privacy-policy'] });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const current = policyQ.data?.current ?? null;
  const versions = policyQ.data?.versions ?? [];
  const dirty = current
    ? title.trim() !== current.title || content.trim() !== current.content
    : content.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-teal-700 dark:text-teal-200">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
            <p className="mt-0.5 text-sm text-foreground/60">
              Author the NUSI privacy policy shown to every workspace owner. Publishing creates a
              new version — owners must re-accept after each change.
            </p>
          </div>
        </motion.div>

        {/* Editor */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-foreground/[0.08] px-5 py-3">
              <h2 className="text-sm font-medium">
                Editor{current && <span className="ml-2 text-[11px] text-foreground/45">current: v{current.version}</span>}
              </h2>
              <div className="flex items-center gap-2.5">
                {current && !dirty && (
                  <span className="text-[11px] text-foreground/45">No changes to publish</span>
                )}
                <button
                  type="button"
                  disabled={publishMut.isPending || !content.trim() || !dirty}
                  title={current && !dirty ? 'Edit the title or content to enable publishing' : undefined}
                  onClick={() => publishMut.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-xs font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {publishMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Publish new version
                </button>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Title</span>
                <input
                  type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm focus:border-teal-500/40 focus:outline-none"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Content</span>
                <textarea
                  value={content} onChange={(e) => setContent(e.target.value)}
                  rows={18}
                  placeholder="Write the full privacy policy here. Plain text — line breaks are preserved."
                  className="mt-1.5 w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-teal-500/40 focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-foreground/45">{content.length.toLocaleString()} characters</p>
              </div>
            </div>
          </Glass>
        </motion.div>

        {/* Version history */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-foreground/[0.08] px-5 py-3">
              <History className="h-3.5 w-3.5 text-foreground/45" />
              <h2 className="text-sm font-medium">Version history</h2>
              <span className="text-[11px] text-foreground/45">{versions.length}</span>
            </div>
            {policyQ.isLoading ? (
              <div className="p-6 text-center text-xs text-foreground/55"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
            ) : versions.length === 0 ? (
              <div className="p-6 text-center text-xs text-foreground/55">No versions published yet.</div>
            ) : (
              <ul className="divide-y divide-foreground/[0.05]">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">v{v.version}</span>
                        <span className="truncate text-foreground/70">{v.title}</span>
                        {current?.id === v.id && (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-foreground/45">{DATE.format(new Date(v.published_at))}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setTitle(v.title); setContent(v.content); toast('Loaded into editor — edit and publish to make a new version.'); }}
                      className="rounded-full border border-foreground/10 px-3 py-1 text-[11px] text-foreground/75 hover:bg-foreground/[0.05]"
                    >
                      Load into editor
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}
