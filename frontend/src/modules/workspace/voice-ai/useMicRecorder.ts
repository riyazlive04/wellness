import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'requesting' | 'recording' | 'stopped' | 'denied' | 'unsupported';

export interface MicRecorderOptions {
  /**
   * Auto-stop when audio level stays below `silenceThreshold` for this many ms.
   * Set to null to disable VAD (manual stop only).
   * Default: 1500ms.
   */
  silenceMs?: number | null;
  /** RMS amplitude (0..1) below which we count as "silence". Default: 0.02. */
  silenceThreshold?: number;
  /** Don't auto-stop before this many ms of recording — guard against premature trigger. Default: 800ms. */
  minRecordMs?: number;
  /** Called once when VAD decides to stop. Receives the final blob. */
  onAutoStop?: (blob: Blob) => void;
}

export interface MicRecorder {
  status: Status;
  /** Last recorded clip, available after stop(). */
  clip: Blob | null;
  /** Live audio amplitude 0..1 (only meaningful while recording). */
  level: number;
  /** ms elapsed since recording started. 0 when not recording. */
  elapsedMs: number;
  /** Begin recording. Resolves once the stream is acquired and MediaRecorder started. */
  start: () => Promise<void>;
  /** Manual stop. Resolves with the final blob. */
  stop: () => Promise<Blob | null>;
  /** Reset to idle (releases mic, clears clip). */
  reset: () => void;
  /** Peak audio amplitude (0..1) seen during the last recording — near 0 means
   *  the mic captured no sound (muted / wrong device). */
  getPeak: () => number;
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function useMicRecorder(opts: MicRecorderOptions = {}): MicRecorder {
  const {
    silenceMs        = 1500,
    silenceThreshold = 0.02,
    minRecordMs      = 800,
    onAutoStop,
  } = opts;

  const [status, setStatus]       = useState<Status>('idle');
  const [clip, setClip]           = useState<Blob | null>(null);
  const [level, setLevel]         = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recRef       = useRef<MediaRecorder | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const ctxRef       = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const rafRef       = useRef<number | null>(null);
  const chunksRef    = useRef<BlobPart[]>([]);
  const stopResolveRef = useRef<((b: Blob | null) => void) | null>(null);
  const startedAtRef = useRef<number>(0);
  const lastVoiceAtRef = useRef<number>(0);
  const peakRef = useRef<number>(0);
  // Refs for callback identity stability without re-creating start/stop.
  const onAutoStopRef = useRef(onAutoStop);
  onAutoStopRef.current = onAutoStop;

  useEffect(() => {
    return () => {
      try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => { /* ignore */ });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const teardownMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    ctxRef.current?.close().catch(() => { /* ignore */ });
    ctxRef.current = null;
    setLevel(0);
    setElapsedMs(0);
  }, []);

  const start = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    setStatus('requesting');
    setClip(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      // Web Audio analyser for live level + silence detection.
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.fftSize);

      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      startedAtRef.current = performance.now();
      lastVoiceAtRef.current = startedAtRef.current;
      peakRef.current = 0;

      rec.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      });
      rec.addEventListener('stop', () => {
        const type = rec.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        setClip(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recRef.current = null;
        setStatus('stopped');
        teardownMeter();
        const resolver = stopResolveRef.current;
        stopResolveRef.current = null;
        if (resolver) {
          resolver(blob);
        } else {
          onAutoStopRef.current?.(blob);
        }
      });
      rec.start();
      setStatus('recording');

      // Meter + VAD loop.
      const tick = () => {
        if (!analyserRef.current || !recRef.current || recRef.current.state !== 'recording') {
          rafRef.current = null;
          return;
        }
        analyserRef.current.getByteTimeDomainData(buf);
        // RMS amplitude. buf values are 0..255 centered at 128.
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buf.length);
        setLevel(rms);
        if (rms > peakRef.current) peakRef.current = rms;

        const now = performance.now();
        setElapsedMs(Math.round(now - startedAtRef.current));
        if (rms >= silenceThreshold) {
          lastVoiceAtRef.current = now;
        }

        // VAD: stop if we've recorded at least minRecordMs and silence has lasted silenceMs.
        if (silenceMs !== null) {
          const elapsed = now - startedAtRef.current;
          const silentFor = now - lastVoiceAtRef.current;
          if (elapsed >= minRecordMs && silentFor >= silenceMs) {
            // Auto-stop — the stop handler picks up onAutoStop.
            try { recRef.current.stop(); } catch { /* ignore */ }
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error('Mic permission error', err);
      setStatus('denied');
      teardownMeter();
    }
  }, [silenceMs, silenceThreshold, minRecordMs, teardownMeter]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const rec = recRef.current;
    if (!rec || rec.state !== 'recording') return clip;
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      rec.stop();
    });
  }, [clip]);

  const reset = useCallback(() => {
    try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
    teardownMeter();
    setClip(null);
    setStatus('idle');
  }, [teardownMeter]);

  return { status, clip, level, elapsedMs, start, stop, reset, getPeak: () => peakRef.current };
}
