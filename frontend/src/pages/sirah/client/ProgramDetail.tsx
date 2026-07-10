import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Loader2, Check, Plus, Target, CheckCircle2, ListChecks, Map, Gift, LifeBuoy,
  ShieldCheck, Users, Sparkles, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { clientProgramsApi, type ClientProgramDetail as Detail } from '@/modules/workspace/api/programEngine';
import { cn } from '@/lib/utils';

const ACCENT_GRADIENT: Record<string, string> = {
  violet: 'from-teal-500 to-cyan-500', blue: 'from-blue-600 to-cyan-500',
  emerald: 'from-emerald-500 to-teal-500', amber: 'from-amber-500 to-orange-500',
  rose: 'from-rose-500 to-pink-500', indigo: 'from-teal-500 to-teal-600',
  teal: 'from-teal-500 to-emerald-500', slate: 'from-slate-600 to-slate-800',
};
const accentGradient = (k: string | null) => ACCENT_GRADIENT[k ?? ''] ?? ACCENT_GRADIENT.violet;

export default function ClientProgramDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const detailQ = useQuery({ queryKey: ['me', 'programs', 'catalog', id], queryFn: () => clientProgramsApi.catalogDetail(id), enabled: !!id, retry: 1 });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['me', 'programs', 'catalog'] });
    qc.invalidateQueries({ queryKey: ['me', 'programs', 'assigned'] });
    qc.invalidateQueries({ queryKey: ['me', 'programs', 'today'] });
  };
  const enrollMut = useMutation({
    mutationFn: () => clientProgramsApi.enroll(id),
    onSuccess: () => { toast.success('Joined the program.'); refresh(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not join.'),
  });
  const leaveMut = useMutation({
    mutationFn: () => clientProgramsApi.leave(id),
    onSuccess: () => { toast('Left the program.'); refresh(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not leave.'),
  });

  const p = detailQ.data;
  const c = p?.content ?? {};
  const busy = enrollMut.isPending || leaveMut.isPending;
  const full = !!p && p.max_enrollments != null && p.enrolled_count >= p.max_enrollments && !p.enrolled;
  const closed = !!p && (!p.allow_enrollment) && !p.enrolled;

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <Link to="/portal/programs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> All programs
        </Link>

        {detailQ.isLoading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
        ) : !p ? (
          <Glass className="p-8 text-center text-sm text-foreground/60">This program isn’t available.</Glass>
        ) : (
          <div className="space-y-6">
            {/* Hero */}
            <motion.div variants={fadeUp}>
              <AIGlow intensity="soft" animated>
                <Glass variant="heavy" className="overflow-hidden">
                  <div className={cn('relative h-36 bg-gradient-to-br', accentGradient(p.accent_color))}>
                    {p.cover_image_url
                      ? <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" />
                      : <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(255,255,255,0.25),transparent_60%)]" />}
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
                      <span className="rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] capitalize text-foreground/55">{p.difficulty}</span>
                    </div>
                    {p.tagline && <p className="mt-1 text-sm text-foreground/70">{p.tagline}</p>}
                    <div className="mt-1 text-xs capitalize text-foreground/55">
                      {p.category.replace('_', ' ')} · {p.duration_weeks} {p.duration_unit === 'days' ? 'days' : 'weeks'} · {p.task_count} task{p.task_count === 1 ? '' : 's'}
                    </div>
                    {p.description && <p className="mt-3 text-sm leading-relaxed text-foreground/75">{p.description}</p>}
                    {p.goals?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.goals.map((g) => (
                          <span key={g} className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs text-foreground/75">
                            <Target className="h-3 w-3 text-foreground/40" />{g}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-4">
                      <JoinButton p={p} busy={busy} full={full} closed={closed} onJoin={() => enrollMut.mutate()} onLeave={() => leaveMut.mutate()} />
                    </div>
                  </div>
                </Glass>
              </AIGlow>
            </motion.div>

            {/* Overview */}
            {(c.overview?.purpose || c.overview?.achieve || (c.overview?.benefits?.length ?? 0) > 0 || c.overview?.transformation) && (
              <Section icon={Sparkles} title="Overview">
                {c.overview?.purpose && <Para label="Purpose">{c.overview.purpose}</Para>}
                {c.overview?.achieve && <Para label="What you'll achieve">{c.overview.achieve}</Para>}
                {(c.overview?.benefits?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    {c.overview!.benefits!.map((b) => (
                      <div key={b} className="flex items-start gap-2 text-sm text-foreground/75"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />{b}</div>
                    ))}
                  </div>
                )}
                {c.overview?.transformation && <Para label="Transformation">{c.overview.transformation}</Para>}
              </Section>
            )}

            {/* Roadmap */}
            {(c.roadmap?.length ?? 0) > 0 && (
              <Section icon={Map} title="Program roadmap">
                <div className="space-y-3">
                  {c.roadmap!.map((ph, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-xs font-semibold">{i + 1}</span>
                        {i < c.roadmap!.length - 1 && <span className="my-1 w-px flex-1 bg-foreground/10" />}
                      </div>
                      <div className="pb-2">
                        <div className="flex items-center gap-2"><span className="text-sm font-medium">{ph.title || `Phase ${i + 1}`}</span>
                          {ph.duration && <span className="text-[11px] text-foreground/50">· {ph.duration}</span>}</div>
                        {ph.description && <p className="mt-0.5 text-sm text-foreground/65">{ph.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Outcomes */}
            {(c.outcomes?.weight_loss || c.outcomes?.waist || c.outcomes?.body_fat || c.outcomes?.energy || c.outcomes?.sleep || c.outcomes?.habits) && (
              <Section icon={TrendingUp} title="Expected outcomes">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {c.outcomes?.weight_loss && <Stat label="Weight loss" value={c.outcomes.weight_loss} />}
                  {c.outcomes?.waist && <Stat label="Waist" value={c.outcomes.waist} />}
                  {c.outcomes?.body_fat && <Stat label="Body fat" value={c.outcomes.body_fat} />}
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.outcomes?.energy && <Pill>Improved energy</Pill>}
                  {c.outcomes?.sleep && <Pill>Better sleep</Pill>}
                  {c.outcomes?.habits && <Pill>Better eating habits</Pill>}
                </div>
                <p className="text-[11px] italic text-foreground/45">{c.outcomes?.disclaimer || 'Results vary by individual.'}</p>
              </Section>
            )}

            {/* Deliverables */}
            {(c.deliverables?.length ?? 0) > 0 && (
              <Section icon={Gift} title="What you get">
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {c.deliverables!.map((d) => (
                    <div key={d} className="flex items-start gap-2 text-sm text-foreground/75"><Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />{d}</div>
                  ))}
                </div>
              </Section>
            )}

            {/* Support */}
            {(c.support?.length ?? 0) > 0 && (
              <Section icon={LifeBuoy} title="Support included">
                <div className="flex flex-wrap gap-2">{c.support!.map((s) => <Pill key={s}>{s}</Pill>)}</div>
              </Section>
            )}

            {/* Audience */}
            {((c.audience?.tags?.length ?? 0) > 0 || c.audience?.min_age != null || c.audience?.max_age != null) && (
              <Section icon={Users} title="Who it's for">
                {(c.audience?.tags?.length ?? 0) > 0 && <div className="flex flex-wrap gap-2">{c.audience!.tags!.map((t) => <Pill key={t}>{t}</Pill>)}</div>}
                {(c.audience?.min_age != null || c.audience?.max_age != null) && (
                  <p className="text-sm text-foreground/65">Age: {c.audience?.min_age ?? '—'}–{c.audience?.max_age ?? '—'}
                    {(c.audience?.bmi_min != null || c.audience?.bmi_max != null) && <> · BMI: {c.audience?.bmi_min ?? '—'}–{c.audience?.bmi_max ?? '—'}</>}</p>
                )}
              </Section>
            )}

            {/* Eligibility */}
            {((c.eligibility?.conditions_allowed?.length ?? 0) > 0 || (c.eligibility?.conditions_not_suitable?.length ?? 0) > 0
              || (c.eligibility?.prerequisites?.length ?? 0) > 0 || c.eligibility?.pregnancy_restriction || c.eligibility?.doctor_approval) && (
              <Section icon={ShieldCheck} title="Eligibility & requirements">
                {(c.eligibility?.conditions_allowed?.length ?? 0) > 0 && <Para label="Suitable with">{c.eligibility!.conditions_allowed!.join(', ')}</Para>}
                {(c.eligibility?.conditions_not_suitable?.length ?? 0) > 0 && <Para label="Not suitable for">{c.eligibility!.conditions_not_suitable!.join(', ')}</Para>}
                {(c.eligibility?.prerequisites?.length ?? 0) > 0 && <Para label="Prerequisites">{c.eligibility!.prerequisites!.join(', ')}</Para>}
                {(c.eligibility?.pregnancy_restriction || c.eligibility?.doctor_approval) && (
                  <div className="flex flex-wrap gap-2">
                    {c.eligibility?.pregnancy_restriction && <Pill>Pregnancy restriction applies</Pill>}
                    {c.eligibility?.doctor_approval && <Pill>Doctor approval required</Pill>}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}
      </motion.div>
    </ClientLayout>
  );
}

function JoinButton({ p, busy, full, closed, onJoin, onLeave }: { p: Detail; busy: boolean; full: boolean; closed: boolean; onJoin: () => void; onLeave: () => void }) {
  if (p.enrolled) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> You’re enrolled</span>
        <button type="button" onClick={onLeave} disabled={busy} className="rounded-full border border-foreground/10 px-3 py-2 text-sm text-foreground/60 hover:bg-foreground/[0.04] disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Leave'}
        </button>
      </div>
    );
  }
  if (full || closed) {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-4 py-2 text-sm text-foreground/50">{full ? 'Program full' : 'Enrollment closed'}</span>;
  }
  return (
    <button type="button" onClick={onJoin} disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Join this program
    </button>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof ListChecks; title: string; children: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp}>
      <Glass className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-teal-500" /> {title}</div>
        {children}
      </Glass>
    </motion.div>
  );
}
function Para({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">{label}</div><p className="mt-0.5 text-sm leading-relaxed text-foreground/75">{children}</p></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3"><div className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">{label}</div><div className="mt-0.5 text-sm font-semibold">{value}</div></div>;
}
function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs text-foreground/70">{children}</span>;
}
