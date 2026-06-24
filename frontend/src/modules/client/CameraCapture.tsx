import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, X, Loader2, RotateCcw, Check, AlertTriangle, Upload } from 'lucide-react';

import { Glass } from '@/design-system';

interface Props {
  /** Called with the captured photo as a File once the user confirms the shot. */
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Optional escape hatch — lets the user fall back to picking a file. */
  onPickFile?: () => void;
}

/**
 * Live webcam capture modal. Uses getUserMedia so it works on desktop too
 * (a plain <input capture> only opens a live camera on mobile — on desktop it
 * silently falls back to the file picker). Shows the stream, snaps a frame to
 * a canvas, and hands back a JPEG File. Falls back gracefully when camera
 * access is denied or unavailable.
 */
export function CameraCapture({ onCapture, onClose, onPickFile }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'live' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const [shot, setShot] = useState<string | null>(null); // preview data URL
  const shotBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setErrorMsg('Your browser doesn’t support camera access. Use “Upload photo” instead.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus('live');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        const name = err instanceof DOMException ? err.name : '';
        setErrorMsg(
          name === 'NotAllowedError'
            ? 'Camera permission was blocked. Allow camera access in your browser, or use “Upload photo”.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device. Use “Upload photo” instead.'
              : 'Couldn’t start the camera. Use “Upload photo” instead.',
        );
      }
    })();

    return () => { cancelled = true; stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        shotBlobRef.current = blob;
        setShot(URL.createObjectURL(blob));
        stopCamera(); // freeze on the captured frame
      },
      'image/jpeg',
      0.92,
    );
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot);
    setShot(null);
    shotBlobRef.current = null;
    // Restart the stream.
    setStatus('starting');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); }
        setStatus('live');
      })
      .catch(() => { setStatus('error'); setErrorMsg('Couldn’t restart the camera. Use “Upload photo”.'); });
  }

  function confirm() {
    const blob = shotBlobRef.current;
    if (!blob) return;
    const file = new File([blob], `plate-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
    handleClose();
  }

  function handleClose() {
    if (shot) URL.revokeObjectURL(shot);
    stopCamera();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full sm:max-w-lg">
        <Glass variant="heavy" className="overflow-hidden p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.08] px-5 py-4">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-semibold">Take a photo of your meal</span>
            </div>
            <button type="button" onClick={handleClose} className="rounded p-1 text-foreground/50 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5">
            <div className="relative overflow-hidden rounded-2xl bg-black">
              {/* Live preview (hidden once a shot is frozen) */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={shot ? 'hidden' : 'aspect-[4/3] w-full object-cover'}
              />
              {shot && <img src={shot} alt="Captured meal" className="aspect-[4/3] w-full object-cover" />}

              {status === 'starting' && (
                <div className="absolute inset-0 grid place-items-center bg-black/50">
                  <div className="flex flex-col items-center gap-2 text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">Starting camera…</span>
                  </div>
                </div>
              )}
            </div>

            {status === 'error' ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mx-auto mb-1.5 h-4 w-4" />
                {errorMsg}
                {onPickFile && (
                  <button
                    type="button"
                    onClick={() => { handleClose(); onPickFile(); }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Upload className="h-4 w-4" /> Upload photo
                  </button>
                )}
              </div>
            ) : shot ? (
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={retake}
                  className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-5 py-2.5 text-sm font-medium hover:bg-foreground/[0.04]"
                >
                  <RotateCcw className="h-4 w-4" /> Retake
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 px-5 py-2.5 text-sm font-medium text-white"
                >
                  <Check className="h-4 w-4" /> Use this photo
                </button>
              </div>
            ) : (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={status !== 'live'}
                  onClick={snap}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-7 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)] transition-all hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
                >
                  <Camera className="h-4 w-4" /> Capture
                </button>
              </div>
            )}
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}
