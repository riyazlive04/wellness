import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Loader2, Video, PhoneOff, Calendar } from 'lucide-react';

import { BrandMark } from '@/design-system';
import { clientsApi } from '@/modules/workspace/api/clients';
import { meetingState, KIND_LABEL } from '@/modules/workspace/appointments/meeting';

// The Jitsi IFrame API attaches a constructor to window once external_api.js loads.
declare global {
  interface Window { JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => { dispose: () => void; addEventListener: (e: string, cb: () => void) => void } }
}

const scriptCache: Record<string, Promise<void>> = {};
function loadJitsi(domain: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptCache[domain]) return scriptCache[domain];
  scriptCache[domain] = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://${domain}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { delete scriptCache[domain]; reject(new Error('load failed')); };
    document.body.appendChild(s);
  });
  return scriptCache[domain];
}

export default function MeetingRoom({ side }: { side: 'owner' | 'client' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ dispose: () => void; addEventListener: (e: string, cb: () => void) => void } | null>(null);
  const dailyRef = useRef<{ destroy: () => void } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  const cfgQ = useQuery({
    queryKey: ['meeting', side, id],
    queryFn: () => (side === 'owner' ? clientsApi.workspaceMeetingConfig(id!) : clientsApi.myMeetingConfig(id!)),
    enabled: !!id, retry: 1,
  });
  const cfg = cfgQ.data;
  const backTo = side === 'owner' ? (id ? `/appointments/${id}` : '/appointments') : '/portal/appointments';
  const state = cfg ? meetingState(cfg.scheduled_at, cfg.duration_minutes, cfg.status) : 'upcoming';
  const other = cfg?.other_name ?? (side === 'owner' ? 'your client' : 'your nutritionist');

  useEffect(() => {
    if (!cfg || cfg.mode !== 'video' || !cfg.room || !containerRef.current) return;
    let disposed = false;
    const fail = () => { setErr('Could not start the video call. Check your connection and try again.'); setStarting(false); };

    // ── Daily.co provider ── (lazy-loaded SDK; only when the backend selects it)
    if (cfg.provider === 'daily' && cfg.room_url) {
      import('@daily-co/daily-js').then(({ default: DailyIframe }) => {
        if (disposed || !containerRef.current) return;
        const frame = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: false,
          iframeStyle: { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', border: '0' },
        });
        dailyRef.current = frame;
        frame.on('left-meeting', () => navigate(backTo));
        frame.join({ url: cfg.room_url!, token: cfg.jwt ?? undefined })
          .then(() => setStarting(false))
          .catch(fail);
      }).catch(fail);
      return () => { disposed = true; try { dailyRef.current?.destroy(); } catch { /* */ } dailyRef.current = null; };
    }

    // ── Jitsi provider (public meet.jit.si, or JaaS/8x8) ──
    loadJitsi(cfg.domain).then(() => {
      if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) return;
      const api = new window.JitsiMeetExternalAPI(cfg.domain, {
        roomName: cfg.room,
        ...(cfg.jwt ? { jwt: cfg.jwt } : {}),
        parentNode: containerRef.current,
        configOverwrite: { prejoinPageEnabled: false, disableDeepLinking: true },
        interfaceConfigOverwrite: { MOBILE_APP_PROMO: false, SHOW_JITSI_WATERMARK: false },
      });
      apiRef.current = api;
      api.addEventListener('readyToClose', () => navigate(backTo));
      setStarting(false);
    }).catch(fail);
    return () => { disposed = true; try { apiRef.current?.dispose(); } catch { /* */ } apiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.provider, cfg?.domain, cfg?.room, cfg?.room_url, cfg?.jwt]);

  const shell = (children: React.ReactNode) => (
    <div className="flex h-[100svh] w-full flex-col bg-[#0b141a] text-white">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={() => navigate(backTo)} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Leave"><ChevronLeft className="h-5 w-5" /></button>
        <BrandMark size={22} animated={false} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{cfg ? KIND_LABEL[cfg.kind] ?? 'Appointment' : 'Meeting'}</div>
          <div className="truncate text-[11px] text-white/55">with {other}{cfg && ` · ${state}`}</div>
        </div>
        <button type="button" onClick={() => navigate(backTo)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-rose-500/90 px-3 py-1.5 text-xs font-medium hover:bg-rose-500"><PhoneOff className="h-3.5 w-3.5" /> Leave</button>
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );

  if (cfgQ.isLoading) return shell(<Centered><Loader2 className="h-6 w-6 animate-spin text-white/60" /></Centered>);
  if (cfgQ.isError || !cfg) return shell(<Centered><p className="text-sm text-white/70">Appointment not found.</p></Centered>);
  if (cfg.mode !== 'video' || !cfg.room) {
    return shell(
      <Centered>
        <div className="max-w-sm space-y-2 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/5"><Calendar className="h-6 w-6 text-white/60" /></div>
          <p className="text-sm font-medium">This is a {cfg.mode === 'phone' ? 'phone' : 'in-person'} appointment</p>
          <p className="text-xs text-white/55">{cfg.mode === 'phone' ? 'No video room - connect by phone at the scheduled time.' : 'Meet in person at the scheduled time.'}</p>
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
