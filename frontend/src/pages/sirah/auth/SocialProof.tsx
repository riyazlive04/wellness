import { CalendarClock, Camera, LayoutTemplate, MessageCircle } from 'lucide-react';

import { Glass } from '@/design-system';

/**
 * Left column reassurance on the auth page.
 *
 * This used to be an avatar strip ("Join 1,247 wellness practitioners") and a
 * quote from "Dr. Priya M." with an Unsplash portrait — both invented. Neither
 * the count nor the person existed, and paid traffic now lands here, so it is
 * replaced with what NUSI actually does. When real, attributable testimonials
 * exist (Dt. Aysha Nasreen's video is the first), this is where they belong.
 */

const POINTS = [
  { icon: LayoutTemplate, label: 'Programs', body: 'Build a protocol once, assign it to every client.' },
  { icon: Camera, label: 'Food diary', body: 'Photo, barcode or voice logging that knows Indian food.' },
  { icon: MessageCircle, label: 'Client chat', body: 'Coaching off your personal WhatsApp, kept with each record.' },
  { icon: CalendarClock, label: 'Consultations', body: 'Booking, reminders and video built in.' },
];

export function SocialProof() {
  return (
    <Glass className="max-w-[340px] p-5">
      <div className="text-xs uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
        Everything in one place
      </div>
      <ul className="mt-4 space-y-3.5">
        {POINTS.map((p) => (
          <li key={p.label} className="flex items-start gap-3">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300">
              <p.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{p.label}</div>
              <div className="text-[13px] leading-snug text-foreground/65">{p.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </Glass>
  );
}
