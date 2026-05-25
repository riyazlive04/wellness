import { Mail, MessageCircle, Bell, BellRing } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import type { Channel, ChannelKey } from '../types';

interface ChannelCardProps {
  channel: Channel;
  onToggle: (enabled: boolean) => void;
  onConnect: () => void;
}

const ICON: Record<ChannelKey, React.ComponentType<{ className?: string }>> = {
  email:    Mail,
  push:     BellRing,
  whatsapp: MessageCircle,
  inapp:    Bell,
};

export function ChannelCard({ channel, onToggle, onConnect }: ChannelCardProps) {
  const Icon = ICON[channel.key];
  const isConnected = channel.status === 'connected';

  function handleConnect() {
    if (channel.key === 'push') {
      // Try to request native push permission (browser-supported only)
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') {
            toast.success('Browser push enabled.');
            new Notification('SIRAH LIFE', {
              body: 'You\'re subscribed to push notifications.',
            });
            onConnect();
          } else {
            toast.error('Push permission was not granted.');
          }
        });
        return;
      }
    }
    onConnect();
  }

  return (
    <Glass className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg',
              isConnected
                ? 'bg-gradient-to-br from-blue-600/25 to-fuchsia-500/15 text-violet-200'
                : 'bg-foreground/[0.04] text-foreground/45',
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{channel.label}</span>
              <StatusPill status={channel.status} />
            </div>
            <div className="mt-0.5 text-[11px] text-foreground/45">{channel.description}</div>
            {channel.meta && (
              <div className="mt-1 text-[11px] text-foreground/65">{channel.meta}</div>
            )}
          </div>
        </div>

        {/* Toggle / connect */}
        {isConnected ? (
          <Switch checked={channel.enabled} onChange={onToggle} />
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            className="rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 py-1 text-xs font-medium text-foreground hover:scale-[1.03]"
          >
            Connect
          </button>
        )}
      </div>
    </Glass>
  );
}

function StatusPill({ status }: { status: Channel['status'] }) {
  const map = {
    connected:          { label: 'Connected',   chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-400' },
    unconfigured:       { label: 'Not set up',  chip: 'border-amber-300/40 bg-amber-300/10 text-amber-200',     dot: 'bg-amber-300' },
    permission_denied:  { label: 'Blocked',     chip: 'border-rose-400/40 bg-rose-400/10 text-rose-200',         dot: 'bg-rose-400' },
  }[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]', map.chip)}>
      <span className={cn('h-1 w-1 rounded-full', map.dot)} />
      {map.label}
    </span>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'grid h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-emerald-400' : 'bg-foreground/15',
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          'block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}
