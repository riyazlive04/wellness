import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, Utensils, Droplet, Calendar, Sparkles, BellRing } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

const PREFS = [
  { key: 'meal',      icon: Utensils, label: 'Meal reminders',         desc: 'Nudge me at meal times'      },
  { key: 'water',     icon: Droplet,  label: 'Water reminders',        desc: 'Hydration ping every 2 hours' },
  { key: 'appt',      icon: Calendar, label: 'Appointment reminders',  desc: '24 hours and 1 hour before'   },
  { key: 'program',   icon: BellRing, label: 'Program reminders',      desc: 'Daily task summary at 8am'    },
  { key: 'ai_nudge',  icon: Sparkles, label: 'AI nudges',              desc: 'Smart suggestions from SIRAH' },
];

export default function ClientNotifications() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const messagesQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(30),
    retry: 1,
  });
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    meal: true, water: true, appt: true, program: true, ai_nudge: true,
  });

  const messages = messagesQ.data ?? [];

  function toggle(key: string) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    toast.success('Saved');
  }

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Care · Notifications</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">When SIRAH talks to you.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">Choose what you want pinged. Quiet by default.</p>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Preferences</h2>
          <Glass className="divide-y divide-foreground/[0.05]">
            {PREFS.map((p) => (
              <PrefRow
                key={p.key}
                icon={<p.icon className="h-4 w-4 text-foreground/65" />}
                label={p.label}
                desc={p.desc}
                on={prefs[p.key]}
                onToggle={() => toggle(p.key)}
              />
            ))}
          </Glass>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <h2 className="mb-3 text-base font-semibold">History</h2>
          {messages.length === 0 ? (
            <Glass className="flex flex-col items-center gap-3 p-8 text-center">
              <Bell className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/55">No notifications yet.</div>
            </Glass>
          ) : (
            <Glass className="divide-y divide-foreground/[0.05]">
              {messages.map((m) => (
                <div key={m.id} className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-foreground/[0.05]">
                    {m.sender_type === 'system'
                      ? <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                      : <Bell className="h-3.5 w-3.5 text-foreground/65" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{m.content}</p>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                      {new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </Glass>
          )}
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}

function PrefRow({ icon, label, desc, on, onToggle }: { icon: ReactNode; label: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-foreground/[0.04]">{icon}</div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-foreground/55">{desc}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        className={cn(
          'relative h-6 w-10 rounded-full transition-colors',
          on ? 'bg-gradient-to-r from-blue-500 to-fuchsia-500' : 'bg-foreground/15',
        )}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}