import { Check, Circle, Minus } from 'lucide-react';
import { CAPABILITIES } from '../data/mockTeam';
import { ROLE_META } from '../helpers';
import type { MemberRole } from '../types';

const ROLES: MemberRole[] = ['owner', 'manager', 'coach'];

export function RolePermissionsTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
      {/* Header */}
      <div className="grid grid-cols-[1.5fr_repeat(3,1fr)] border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-white/45">
        <div>Capability</div>
        {ROLES.map((r) => (
          <div key={r} className="text-center">
            {ROLE_META[r].label}
          </div>
        ))}
      </div>

      {/* Rows */}
      <ul className="divide-y divide-white/[0.04]">
        {CAPABILITIES.map((cap) => (
          <li key={cap.id} className="grid grid-cols-[1.5fr_repeat(3,1fr)] items-start gap-3 px-5 py-3">
            <div>
              <div className="text-sm text-white/85">{cap.label}</div>
              <div className="mt-0.5 text-[11px] text-white/45">{cap.description}</div>
            </div>
            {ROLES.map((r) => (
              <div key={r} className="grid place-items-center">
                <CellMark level={cap.matrix[r]} />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CellMark({ level }: { level: 'full' | 'partial' | 'none' }) {
  if (level === 'full') {
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (level === 'partial') {
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-300/15 text-amber-300">
        <Circle className="h-2.5 w-2.5 fill-current" />
      </span>
    );
  }
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-white/[0.04] text-white/30">
      <Minus className="h-3 w-3" />
    </span>
  );
}
