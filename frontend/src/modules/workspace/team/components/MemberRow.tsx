import { useState } from 'react';
import { MoreVertical, Mail, RotateCw, Trash2, Crown } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import type { TeamMember, MemberRole } from '../types';
import { ROLE_META, STATUS_META, initialsOf, joinDate, relativeTime } from '../helpers';

interface MemberRowProps {
  member: TeamMember;
  onRoleChange: (id: string, role: MemberRole) => void;
  onRemove: (id: string) => void;
}

export function MemberRow({ member, onRoleChange, onRemove }: MemberRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = STATUS_META[member.status];
  const isOwner = member.role === 'owner';

  return (
    <li className="relative border-b border-white/[0.04] last:border-0">
      <div className="grid grid-cols-[auto_1fr_140px_120px_120px_36px] items-center gap-4 px-5 py-3.5">
        {/* Avatar */}
        <div className="relative">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
            {initialsOf(member.name)}
          </div>
          {member.status === 'active' && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0A0C10] bg-emerald-400" />
          )}
        </div>

        {/* Name + email */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{member.name}</span>
            {isOwner && <Crown className="h-3 w-3 flex-shrink-0 text-violet-300" />}
          </div>
          <div className="truncate text-[11px] text-white/45">{member.email}</div>
          {member.specializations.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-white/55">
              {member.specializations.slice(0, 3).map((s) => (
                <span key={s} className="rounded-full border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Role */}
        <div>
          {isOwner ? (
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]', ROLE_META.owner.chip)}>
              {ROLE_META.owner.label}
            </span>
          ) : (
            <select
              value={member.role}
              onChange={(e) => onRoleChange(member.id, e.target.value as MemberRole)}
              disabled={member.status === 'invited'}
              className={cn(
                'rounded-full border bg-[#0F1115] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
                ROLE_META[member.role].chip,
              )}
            >
              <option value="manager" className="bg-[#1B1E25]">Manager</option>
              <option value="coach" className="bg-[#1B1E25]">Coach</option>
            </select>
          )}
        </div>

        {/* Clients */}
        <div className="text-xs">
          {member.status === 'invited' ? (
            <span className="text-white/35">—</span>
          ) : (
            <>
              <span className="font-medium text-white">{member.assignedClients}</span>
              <span className="ml-1 text-white/45">{member.assignedClients === 1 ? 'client' : 'clients'}</span>
            </>
          )}
        </div>

        {/* Status + last active */}
        <div className="text-right">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', status.chip)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
            {status.label}
          </span>
          <div className="mt-1 text-[10px] text-white/40">
            {member.status === 'invited'
              ? `Invited ${relativeTime(member.joinedAt)}`
              : member.lastActiveAt
                ? `${relativeTime(member.lastActiveAt)}`
                : `Joined ${joinDate(member.joinedAt)}`}
          </div>
        </div>

        {/* Menu */}
        <div className="relative">
          {!isOwner && (
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="grid h-8 w-8 place-items-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white"
              aria-label="More"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}

          {menuOpen && !isOwner && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#15171C] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]">
                {member.status === 'invited' ? (
                  <>
                    <MenuItem
                      icon={Mail}
                      label="Resend invite email"
                      onClick={() => {
                        setMenuOpen(false);
                        toast.success(`Invite re-sent to ${member.email}.`);
                      }}
                    />
                    <MenuItem
                      icon={RotateCw}
                      label="Regenerate invite link"
                      onClick={() => {
                        setMenuOpen(false);
                        toast.success('New invite link generated.');
                      }}
                    />
                    <MenuItem
                      icon={Trash2}
                      label="Revoke invite"
                      destructive
                      onClick={() => {
                        setMenuOpen(false);
                        onRemove(member.id);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <MenuItem
                      icon={Mail}
                      label="Send a message"
                      onClick={() => {
                        setMenuOpen(false);
                        toast('Internal team messaging ships with the Notifications module.');
                      }}
                    />
                    <MenuItem
                      icon={Trash2}
                      label="Remove from workspace"
                      destructive
                      onClick={() => {
                        setMenuOpen(false);
                        onRemove(member.id);
                      }}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors',
        destructive ? 'text-rose-300 hover:bg-rose-500/[0.1]' : 'text-white/80 hover:bg-white/[0.05]',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
