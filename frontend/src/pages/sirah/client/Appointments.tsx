import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Plus, Clock, Video } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';

/**
 * Appointments — placeholder list until /api/v1/me/appointments lands.
 * Once that endpoint exists the empty-state replaces with real data.
 */
export default function ClientAppointments() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp} className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Care · Appointments</span>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Appointments</h1>
            <p className="mt-2 max-w-2xl text-sm text-foreground/65">Upcoming sessions, past consultations, and quick rebooking.</p>
          </div>
          <button
            type="button"
            onClick={() => toast.message('Booking opens with the Appointments module — track-2 work.')}
            className="hidden sm:inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]"
          >
            <Plus className="h-4 w-4" /> Book
          </button>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6 grid gap-3 sm:grid-cols-2">
          <Glass className="p-5">
            <Calendar className="h-5 w-5 text-violet-600 dark:text-violet-300" />
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Upcoming</div>
            <div className="mt-1 text-2xl font-semibold">0</div>
            <div className="mt-1 text-xs text-foreground/55">Nothing booked yet</div>
          </Glass>
          <Glass className="p-5">
            <Clock className="h-5 w-5 text-emerald-600" />
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Last consult</div>
            <div className="mt-1 text-2xl font-semibold">—</div>
            <div className="mt-1 text-xs text-foreground/55">No history yet</div>
          </Glass>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <Glass className="flex flex-col items-center gap-3 p-8 text-center">
            <Video className="h-6 w-6 text-foreground/35" />
            <div className="text-sm text-foreground/65">Video + in-person bookings appear here once your nutritionist enables the module.</div>
          </Glass>
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}