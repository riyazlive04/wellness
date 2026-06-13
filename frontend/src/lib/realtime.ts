/**
 * Realtime client — Socket.IO singleton + React hooks.
 *
 * Pulls the Supabase JWT from the auth session and passes it via Socket.IO's
 * `auth.token` handshake field. The backend RealtimeGateway verifies the
 * signature and joins us into the correct workspace room.
 *
 * Three exports:
 *   - getRealtimeSocket()    — lazily creates + returns the singleton socket
 *   - useRealtime(event, h)  — subscribe to a server event for a component
 *   - disconnectRealtime()   — close the socket (sign-out path)
 */
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { supabase } from '@/integrations/supabase/client';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001';

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;

async function authToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export async function getRealtimeSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  if (connecting) return connecting;

  connecting = (async () => {
    const token = await authToken();
    const s = io(API_BASE, {
      path: '/api/realtime',
      transports: ['websocket'],
      auth: { token },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
    });
    socket = s;
    return s;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export function disconnectRealtime(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Subscribe to a Realtime event for the component's lifetime. Handler is
 * called every time the server emits the named event. Listener is
 * automatically removed on unmount.
 */
export function useRealtime<T>(event: string, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let attached: Socket | null = null;
    const wrapped = (payload: T) => handlerRef.current(payload);

    void getRealtimeSocket().then((s) => {
      if (cancelled) return;
      attached = s;
      s.on(event, wrapped);
    });

    return () => {
      cancelled = true;
      if (attached) attached.off(event, wrapped);
    };
  }, [event]);
}
