import type { PrismaService } from '../database/prisma.service';

/**
 * The picture that stands for a practice: its uploaded logo, else the owner's
 * account photo (e.g. their Google profile picture).
 *
 * Solo practitioners often never upload a logo but do have a photo on their
 * account; without this their clients, portal and PDFs showed the NUSI mark
 * while the owner's own sign-out card showed their photo.
 */
export async function practiceLogo(
  prisma: PrismaService,
  workspaceId: string,
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (logoUrl) return logoUrl;
  try {
    const [row] = await prisma.$queryRawUnsafe<Array<{ photo: string | null }>>(
      `SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'avatar_url', ''), NULLIF(u.raw_user_meta_data->>'picture', '')) AS photo
         FROM public.workspaces w
         JOIN auth.users u ON u.id = w.owner_id
        WHERE w.id = $1::uuid
        LIMIT 1`,
      workspaceId,
    );
    const photo = row?.photo?.trim();
    return photo && /^(https:\/\/|data:image\/)/.test(photo) ? photo : null;
  } catch {
    return null; // a lookup failure must not break branding
  }
}
