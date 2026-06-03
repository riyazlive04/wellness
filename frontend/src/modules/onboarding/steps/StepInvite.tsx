import { MessageCircle, Mail } from 'lucide-react';
import { Glass } from '@/design-system';
import { useOnboarding } from '../OnboardingContext';

export function StepInvite() {
  const { draft, set } = useOnboarding();

  return (
    <div className="space-y-6">
      <Glass className="p-6">
        {/* Channel toggle */}
        <div className="mb-5 flex rounded-full bg-foreground/[0.04] p-1">
          {(['whatsapp', 'email'] as const).map((ch) => {
            const active = draft.inviteChannel === ch;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => set('inviteChannel', ch)}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-foreground'
                    : 'text-foreground/50 hover:text-foreground/80'
                }`}
              >
                {ch === 'whatsapp' ? (
                  <>
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                  </>
                ) : (
                  <>
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <label className="block">
            <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">Client's name</div>
            <input
              value={draft.inviteName}
              onChange={(e) => set('inviteName', e.target.value)}
              placeholder="Priya Sharma"
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm placeholder:text-foreground/75 dark:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
            />
          </label>

          <label className="block">
            <div className="mb-1.5 text-xs font-medium text-foreground/75 dark:text-foreground/60">
              {draft.inviteChannel === 'whatsapp' ? 'Phone (with country code)' : 'Email'}
            </div>
            <input
              value={draft.inviteContact}
              onChange={(e) => set('inviteContact', e.target.value)}
              placeholder={
                draft.inviteChannel === 'whatsapp' ? '+91 98 76 54 32 10' : 'priya@example.com'
              }
              type={draft.inviteChannel === 'whatsapp' ? 'tel' : 'email'}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm placeholder:text-foreground/75 dark:text-foreground/60 focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-5 text-xs text-foreground/75 dark:text-foreground/60">
          Your client will receive a personalized link to set up their wellness profile and begin
          their journey under your guidance. You can invite more clients from your dashboard.
        </div>
      </Glass>

      <Glass variant="subtle" className="flex items-start gap-3 p-4 text-xs text-foreground/75 dark:text-foreground/55">
        <div className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300">
          💡
        </div>
        <div>
          Not ready to invite anyone yet? <span className="text-foreground/80">Skip this step</span>.
          You'll land in your dashboard where you can invite clients in bulk via CSV upload.
        </div>
      </Glass>
    </div>
  );
}
