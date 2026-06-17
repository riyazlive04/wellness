import { useAuth } from '@/contexts/AuthContext';

export interface OwnerIdentity {
  /** Display name of the signed-in user (their real name, not the practice). */
  ownerName: string;
  /** First word of the name — used for the dashboard greeting. */
  firstName: string;
  /** Two-letter initials derived from the name. */
  initials: string;
  email: string;
}

/**
 * Resolve the signed-in user's display identity from the Supabase session.
 *
 * Name precedence: user_metadata.name (collected at sign-up) → full_name →
 * the email's local part (title-cased) → "there". Keeps the owner's real name
 * flowing into the greeting and sidebar without a separate profile fetch.
 */
export function useOwnerIdentity(): OwnerIdentity {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as { name?: string; full_name?: string };
  const email = user?.email ?? '';

  const fromMeta = (meta.name || meta.full_name || '').trim();
  const fromEmail = email ? titleCase(email.split('@')[0].replace(/[._-]+/g, ' ')) : '';
  const ownerName = fromMeta || fromEmail || 'there';

  const firstName = ownerName.split(' ').filter(Boolean)[0] ?? ownerName;

  const initials =
    ownerName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'U';

  return { ownerName, firstName, initials, email };
}

function titleCase(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
