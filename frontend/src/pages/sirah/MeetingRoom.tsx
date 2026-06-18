import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Loader2, Video, PhoneOff, Calendar } from 'lucide-react';

import { BrandMark } from '@/design-system';
import { supabase } from '@/integrations/supabase/client';
import { clientsApi, type Appointment, type WorkspaceAppointment } from '@/modules/workspace/api/clients';
import { roomOf, meetingState, KIND_LABEL } from '@/modules/workspace/appointments/meeting';

// The Jitsi IFrame API attaches a constructor to window once external_api.js loads.
declare global {
  interface Window { JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => { dispose: () => void; addEventListener: (e: string, cb: () => void) => void } }
}

let jitsiPromise: Promise<void> | null = null;
function loadJitsi(): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (jitsiPromise) return jitsiPromise;
  jitsiPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://meet.jit.si/external_api.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { jitsiPromise = null; reject(new Error('load failed')); };
    document.body.appendChild(s);
  });
  return jitsiPromise;
}

export default function MeetingRoom({ side }: { side: 'owner' | 'client' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ dispose: () => void; addEventListener: (e: string, cb: () => void) => void } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  const apptQ = useQuery({
    queryKey: ['appt', side, id],
    queryFn: () => (side === 'owner' ? clientsApi.getWorkspaceAppointment(id!) : clientsApi.myAppointment(id!)) as Promise<Appointment | WorkspaceAppointment>,
    enabled: !!id, retry: 1,
  });
  const meQ = useQuery({ queryKey: ['auth', 'me'], queryFn: async () => (await supabase.auth.getUser()).data.user, staleTime: 5 * 60_000 });

  const appt = apptQ.data;
  const room = roomOf(appt?.meeting_url);
  const other = appt && 'client_name' in appt ? appt.client_name : 'your nutritionist';
  const displayName = meQ.data?.email?.split('@')[0] ?? (side === 'owner' ? 'Coach' : 'Client');
  const backTo = side === 'owner' ? (id ? `/appointments/${id}` : '/appointments') : '/portal/appointments';
  const state = appt ? meetingState(appt.scheduled_at, appt.duration_minutes, appt.status) : 'upcoming';

  useEffect(() => {
    if (!appt || !room || !containerRef.current) return;
    let disposed = false;
    loadJitsi().then(() => {
      if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) return;
      const api = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName: room,
        parentNode: containerRef.current,
        userInfo: { displayName },
        configOverwrite: { prejoinPageEnabled: false, disableDeepLinking: true, startWithAudioMuted: false },
        interfaceConfigOverwrite: { MOBILE_APP_PROMO: false, SHOW_JITSI_WATERMARK: false, DEFAULT_BACKGROUND: '#0b141a' },
      });
      apiRef.current = api;
      api.addEventListener('readyToClose', () => navigate(backTo));
      setStarting(false);
    }).catch(() => { setErr('Could not start the video call. Check your connection and try again.'); setStarting(false); });
    return () => { disposed = true; try { apiRef.current?.dispose(); } catch { /* */ } apiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.id, room, displayName]);

  // ── Non-video / missing room / loading / error states ──
  const shell = (children: React.ReactNode) => (
    <div className="flex h-[100svh] w-full flex-col bg-[#0b141a] text-white">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={() => navigate(backTo)} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Leave"><ChevronLeft className="h-5 w-5" /></button>
        <BrandMark size={22} animated={false} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{appt ? KIND_LABEL[appt.kind] ?? 'Appointment' : 'Meeting'}</div>
          <div className="truncate text-[11px] text-white/55">{side === 'owner' ? `with ${other}` : 'with your nutritionist'}{appt && ` · ${state}`}</div>
        </div>
        <button type="button" onClick={() => navigate(backTo)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-rose-500/90 px-3 py-1.5 text-xs font-medium hover:bg-rose-500"><PhoneOff className="h-3.5 w-3.5" /> Leave</button>
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );

  if (apptQ.isLoading) return shell(<Centered><Loader2 className="h-6 w-6 animate-spin text-white/60" /></Centered>);
  if (apptQ.isError || !appt) return shell(<Centered><p className="text-sm text-white/70">Appointment not found.</p></Centered>);
  if (appt.mode !== 'video' || !room) {
    return shell(
      <Centered>
        <div className="max-w-sm space-y-2 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/5"><Calendar className="h-6 w-6 text-white/60" /></div>
          <p className="text-sm font-medium">This is a {appt.mode === 'phone' ? 'phone' : 'in-person'} appointment</p>
          <p className="text-xs text-white/55">{appt.mode === 'phone' ? 'No video room — connect by phone at the scheduled time.' : appt.location ? `Location: ${appt.location}` : 'Meet in person at the scheduled time.'}</p>
        </div>
      </Centered>,
    );
  }
  if (err) return shell(<Centered><p className="text-sm text-white/70">{err}</p></Centered>);

  return shell(
    <>
      {starting && <Centered><div className="flex items-center gap-2 text-white/60"><Video className="h-4 w-4" /> <Loader2 className="h-4 w-4 animate-spin" /> Connecting…</div></Centered>}
      <div ref={containerRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
    </>,
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 grid place-items-center p-6">{children}</div>;
}
