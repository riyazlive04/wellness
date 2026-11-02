/**
 * Meal photos in the storage bucket, rather than inlined on the row.
 *
 * A plate photo used to be stored as a base64 data: URI on
 * `plate_vision_meals.photo_url` — ~100 kB per meal, up to 170 kB. The
 * practitioner's meal list refuses to return those, because 300 meals at
 * 100 kB each is tens of megabytes on one request, so it falls back to a small
 * thumbnail. When thumbnail generation had failed, the row resolved to no
 * image at all and the practice saw a meal with its calories but no picture.
 *
 * So: the bytes go to the `meal-photos` bucket, the row keeps a key, and a
 * signed URL is minted when a list is read. Same shape as the chat-media fix
 * in clients.service.ts; kept separate here because plate photos are written
 * from a different module and importing ClientsService would be a cycle.
 *
 * Every function fails soft. A photo that cannot be uploaded or signed must
 * never cost the client their logged meal — the nutrition data is the point,
 * and the picture is supporting evidence.
 */
import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';

export const MEAL_PHOTO_BUCKET = 'meal-photos';

const logger = new Logger('PlatePhotoStorage');

/** How long a signed read URL lasts. Long enough for a list to render and be scrolled. */
const SIGN_TTL_SECONDS = 3600;

interface DecodedImage {
  bytes: Buffer;
  contentType: string;
  extension: string;
}

/** Split a `data:image/jpeg;base64,...` URI into bytes and its type. */
export function decodeDataUrl(dataUrl: string): DecodedImage | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  const [, contentType, b64] = match;
  try {
    const bytes = Buffer.from(b64, 'base64');
    if (!bytes.length) return null;
    const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    return { bytes, contentType, extension };
  } catch {
    return null;
  }
}

/** `<clientId>/<timestamp>-<random>.jpg` — unguessable, and grouped per client. */
export function buildPhotoKey(clientId: string, extension: string): string {
  return `${clientId}/${Date.now()}-${randomBytes(6).toString('hex')}.${extension}`;
}

/**
 * Upload a data: URI to the bucket and return its key.
 *
 * Returns null on any failure, and the caller then keeps the inline photo —
 * degraded, but never lost.
 */
export async function uploadPhotoDataUrl(
  config: ConfigService,
  clientId: string,
  dataUrl: string,
): Promise<string | null> {
  const image = decodeDataUrl(dataUrl);
  if (!image) return null;

  const supabaseUrl = config.get<string>('SUPABASE_URL')?.trim();
  const serviceKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceKey) return null;

  const key = buildPhotoKey(clientId, image.extension);
  try {
    const resp = await fetch(
      `${supabaseUrl}/storage/v1/object/${MEAL_PHOTO_BUCKET}/${encodeURI(key)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': image.contentType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(image.bytes),
      },
    );
    if (!resp.ok) {
      logger.warn(`Meal photo upload failed: ${resp.status} ${await resp.text()}`);
      return null;
    }
    return key;
  } catch (err) {
    logger.warn(`Meal photo upload threw: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Sign a batch of keys in one request.
 *
 * Batched deliberately: a list of 300 meals must not become 300 round trips
 * to the storage API before it can answer.
 */
export async function signPhotoKeys(
  config: ConfigService,
  keys: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return {};

  const supabaseUrl = config.get<string>('SUPABASE_URL')?.trim();
  const serviceKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceKey) return {};

  try {
    const resp = await fetch(`${supabaseUrl}/storage/v1/object/sign/${MEAL_PHOTO_BUCKET}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGN_TTL_SECONDS, paths: unique }),
    });
    if (!resp.ok) {
      logger.warn(`Sign meal photos failed: ${resp.status} ${await resp.text()}`);
      return {};
    }
    const list = (await resp.json()) as Array<{ path?: string; signedURL?: string }>;
    const out: Record<string, string> = {};
    for (const item of list) {
      if (!item.path || !item.signedURL) continue;
      out[item.path] = item.signedURL.startsWith('http')
        ? item.signedURL
        : `${supabaseUrl}/storage/v1${item.signedURL.startsWith('/') ? '' : '/'}${item.signedURL}`;
    }
    return out;
  } catch (err) {
    logger.warn(`Sign meal photos threw: ${(err as Error).message}`);
    return {};
  }
}
