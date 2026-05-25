import { useState } from 'react';
import { Smartphone, Laptop, LogOut, ShieldCheck, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { SESSIONS } from '../data/mockSettings';
import { FooterBar, Field, SectionHeader } from './GeneralSection';
import { cn } from '@/lib/utils';

export function SecuritySection() {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [twofa, setTwofa] = useState(true);
  const [sessions, setSessions] = useState(SESSIONS);

  return (
    <SectionHeader
      title="Security"
      subtitle="Password, two-factor authentication, and active sessions."
    >
      {/* Password */}
      <Glass className="p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-200">
            <KeyRound className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-white">Change password</div>
            <div className="text-[11px] text-white/45">
              Used only for the email + password login path. Google sign-in doesn't need a password.
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Current password"  value={currentPw} onChange={setCurrentPw} type="password" />
          <Field label="New password"      value={newPw}     onChange={setNewPw}     type="password" hint="Min 12 characters" />
          <Field label="Confirm new"       value={confirmPw} onChange={setConfirmPw} type="password" />
        </div>
      </Glass>

      {/* 2FA */}
      <Glass className={cn('p-5', twofa && 'ring-1 ring-emerald-400/30')}>
        <div className="flex items-start gap-4">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-400/20 to-emerald-400/[0.05] text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white">Two-factor authentication</h3>
              {twofa && (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-emerald-200">
                  On
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-white/55">
              {twofa
                ? 'Authenticator app linked. Backup codes available below.'
                : 'Use an authenticator app (1Password / Authy / Google Authenticator) — strongly recommended for clinical workspaces.'}
            </p>
            {twofa && (
              <button
                type="button"
                onClick={() => toast.success('Backup codes regenerated — saved to your downloads.')}
                className="mt-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/85 hover:bg-white/[0.06]"
              >
                Regenerate backup codes
              </button>
            )}
          </div>
          <Switch
            checked={twofa}
            onChange={(v) => {
              setTwofa(v);
              toast.success(v ? '2FA enabled — scan the QR code in the dialog.' : '2FA disabled.');
            }}
          />
        </div>
      </Glass>

      {/* Sessions */}
      <Glass className="overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <div className="text-sm font-medium text-white">Active sessions</div>
          <div className="text-[11px] text-white/45">Where you're signed in right now</div>
        </div>
        <ul className="divide-y divide-white/[0.04]">
          {sessions.map((s) => {
            const Icon = s.device.toLowerCase().includes('iphone') || s.device.toLowerCase().includes('ipad')
              ? Smartphone
              : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white/[0.04] text-white/65">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{s.device}</span>
                    {s.current && (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-emerald-200">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-white/45">
                    {s.browser} · {s.location} · {relativeTime(s.lastActiveAt)}
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    onClick={() => {
                      setSessions((ss) => ss.filter((x) => x.id !== s.id));
                      toast.success(`${s.device} signed out.`);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/85 hover:bg-rose-400/[0.06] hover:text-rose-200"
                  >
                    <LogOut className="h-3 w-3" />
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Glass>

      <FooterBar
        onSave={() => toast.success('Security settings saved.')}
        onCancel={() => toast('Changes discarded.')}
      />
    </SectionHeader>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'mt-1 grid h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-emerald-400' : 'bg-white/15',
      )}
    >
      <span className={cn('block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
    </button>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
