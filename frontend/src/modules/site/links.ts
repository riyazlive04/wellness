/**
 * Off-site links that appear in more than one place.
 *
 * Here rather than inline so the Play URL and the Instagram handle have one
 * home: they are the kind of thing that gets pasted into a second component
 * six months later and then only half-updated.
 */

/** The client app on Google Play. Package id, not a short link, so it survives. */
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=in.sirahdigital.life';

/**
 * Instagram. The handle was shared as a QR link carrying ?vrfl= and
 * ?utm_source=qr; those are share-session tracking and do not belong in a
 * permanent link, so only the profile path is kept.
 */
export const INSTAGRAM_URL = 'https://www.instagram.com/nusi._.official';
export const INSTAGRAM_HANDLE = '@nusi._.official';
