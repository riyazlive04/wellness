import sharp from 'sharp';

/**
 * Shrink an uploaded photo to a JPEG data URL small enough to store inline.
 *
 * Phones upload 3-12 MP originals; stored as-is they would bloat every list
 * that shows them. EXIF orientation is applied first so portrait photos stay
 * upright.
 *   - 'square': centre-cropped to size x size (profile pictures)
 *   - 'fit':    longest side at most `size`, aspect kept (meal photos)
 */
export async function toJpegDataUrl(
  input: Buffer,
  opts: { size: number; mode: 'square' | 'fit'; quality?: number },
): Promise<string> {
  const img = sharp(input, { failOn: 'error' }).rotate();
  const resized = opts.mode === 'square'
    ? img.resize(opts.size, opts.size, { fit: 'cover', position: 'attention' })
    : img.resize(opts.size, opts.size, { fit: 'inside', withoutEnlargement: true });
  const jpeg = await resized.jpeg({ quality: opts.quality ?? 80, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/** A small square thumbnail (~5 KB) for lists. */
export function toThumbDataUrl(input: Buffer): Promise<string> {
  return toJpegDataUrl(input, { size: 128, mode: 'square', quality: 70 });
}

/** Thumbnail of an inline data: URL photo; null for links or anything unreadable. */
export async function thumbFromDataUrl(dataUrl: string | null | undefined): Promise<string | null> {
  const m = /^data:image\/[a-z+.-]+;base64,(.+)$/i.exec(dataUrl ?? '');
  if (!m) return null;
  try {
    return await toThumbDataUrl(Buffer.from(m[1], 'base64'));
  } catch {
    return null;
  }
}

/** Image types phones and browsers send for photos. */
export const PHOTO_MIME = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;
