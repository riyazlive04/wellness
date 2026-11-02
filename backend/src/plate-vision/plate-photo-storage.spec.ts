/**
 * Meal photo storage: decoding, uploading and signing.
 *
 * These are the three steps between a client taking a photo and a
 * practitioner seeing it, and each one fails silently by design - a broken
 * photo must never cost someone their logged meal. Silent failure is exactly
 * why this needs tests: without them, "no picture" looks identical whether
 * the upload 500s, the data URI is malformed, or the config is missing.
 */
import type { ConfigService } from '@nestjs/config';

import {
  buildPhotoKey,
  decodeDataUrl,
  signPhotoKeys,
  uploadPhotoDataUrl,
} from './plate-photo-storage';

/** A real 1x1 JPEG, base64 - small but genuinely decodable. */
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL'
  + 'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QA'
  + 'FAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

const GOOD_CONFIG = fakeConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
});

describe('decodeDataUrl', () => {
  it('decodes a JPEG data URI to bytes', () => {
    const out = decodeDataUrl(TINY_JPEG);
    expect(out).not.toBeNull();
    expect(out!.contentType).toBe('image/jpeg');
    // JPEGs start FF D8 FF. If this passes, we decoded a real image rather
    // than storing a string that happens to be base64-shaped.
    expect([...out!.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('maps jpeg to a .jpg extension', () => {
    expect(decodeDataUrl(TINY_JPEG)!.extension).toBe('jpg');
  });

  it('keeps png as png', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(decodeDataUrl(png)!.extension).toBe('png');
  });

  it('refuses an https URL, which is already uploaded', () => {
    expect(decodeDataUrl('https://cdn.example.com/a.jpg')).toBeNull();
  });

  it('refuses a non-image data URI', () => {
    expect(decodeDataUrl('data:application/pdf;base64,JVBERi0=')).toBeNull();
  });

  it('refuses an empty payload rather than storing a zero-byte object', () => {
    expect(decodeDataUrl('data:image/jpeg;base64,')).toBeNull();
  });
});

describe('buildPhotoKey', () => {
  it('groups by client and stays unguessable', () => {
    const a = buildPhotoKey('client-1', 'jpg');
    const b = buildPhotoKey('client-1', 'jpg');
    expect(a.startsWith('client-1/')).toBe(true);
    expect(a.endsWith('.jpg')).toBe(true);
    // Two photos in the same millisecond must not collide and overwrite.
    expect(a).not.toBe(b);
  });
});

describe('uploadPhotoDataUrl', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('PUTs the bytes and returns the key', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => '' };
    }) as unknown as typeof fetch;

    const key = await uploadPhotoDataUrl(GOOD_CONFIG, 'client-9', TINY_JPEG);

    expect(key).toMatch(/^client-9\/\d+-[0-9a-f]{12}\.jpg$/);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/storage/v1/object/meal-photos/');
    // The bucket must receive the image's own type, not octet-stream, or the
    // browser will download it instead of rendering it.
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
  });

  it('returns null, not a throw, when storage rejects the upload', async () => {
    global.fetch = (async () => ({ ok: false, status: 507, text: async () => 'full' })) as unknown as typeof fetch;
    await expect(uploadPhotoDataUrl(GOOD_CONFIG, 'c', TINY_JPEG)).resolves.toBeNull();
  });

  it('returns null, not a throw, when the network dies', async () => {
    global.fetch = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    await expect(uploadPhotoDataUrl(GOOD_CONFIG, 'c', TINY_JPEG)).resolves.toBeNull();
  });

  it('returns null when storage is not configured, without calling fetch', async () => {
    let called = false;
    global.fetch = (async () => { called = true; return { ok: true, status: 200, text: async () => '' }; }) as unknown as typeof fetch;
    const key = await uploadPhotoDataUrl(fakeConfig({}), 'c', TINY_JPEG);
    expect(key).toBeNull();
    expect(called).toBe(false);
  });

  it('refuses a photo that is not a data URI', async () => {
    global.fetch = (async () => ({ ok: true, status: 200, text: async () => '' })) as unknown as typeof fetch;
    await expect(uploadPhotoDataUrl(GOOD_CONFIG, 'c', 'https://x/y.jpg')).resolves.toBeNull();
  });
});

describe('signPhotoKeys', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('signs a whole page in ONE request, not one per row', async () => {
    let requests = 0;
    let sentPaths: string[] = [];
    global.fetch = (async (_url: string, init: RequestInit) => {
      requests += 1;
      sentPaths = JSON.parse(init.body as string).paths;
      return {
        ok: true,
        status: 200,
        json: async () => sentPaths.map((p) => ({ path: p, signedURL: `/object/sign/meal-photos/${p}?token=t` })),
        text: async () => '',
      };
    }) as unknown as typeof fetch;

    const out = await signPhotoKeys(GOOD_CONFIG, ['a.jpg', 'b.jpg', 'c.jpg']);

    expect(requests).toBe(1);
    expect(Object.keys(out)).toHaveLength(3);
    // A relative signedURL must come back absolute, or the <img> resolves it
    // against nusi.in and 404s.
    expect(out['a.jpg']).toBe('https://example.supabase.co/storage/v1/object/sign/meal-photos/a.jpg?token=t');
  });

  it('de-duplicates keys so one shared photo is signed once', async () => {
    let sentPaths: string[] = [];
    global.fetch = (async (_url: string, init: RequestInit) => {
      sentPaths = JSON.parse(init.body as string).paths;
      return { ok: true, status: 200, json: async () => [], text: async () => '' };
    }) as unknown as typeof fetch;

    await signPhotoKeys(GOOD_CONFIG, ['a.jpg', 'a.jpg', 'b.jpg']);
    expect(sentPaths).toEqual(['a.jpg', 'b.jpg']);
  });

  it('makes no request at all for an empty page', async () => {
    let called = false;
    global.fetch = (async () => { called = true; return { ok: true, status: 200, json: async () => [], text: async () => '' }; }) as unknown as typeof fetch;
    await expect(signPhotoKeys(GOOD_CONFIG, [])).resolves.toEqual({});
    expect(called).toBe(false);
  });

  it('drops nulls and blanks rather than asking storage to sign them', async () => {
    let called = false;
    global.fetch = (async () => { called = true; return { ok: true, status: 200, json: async () => [], text: async () => '' }; }) as unknown as typeof fetch;
    await expect(signPhotoKeys(GOOD_CONFIG, ['', ''])).resolves.toEqual({});
    expect(called).toBe(false);
  });

  it('returns {} on a storage error so the caller keeps its thumbnail', async () => {
    global.fetch = (async () => ({ ok: false, status: 500, text: async () => 'boom' })) as unknown as typeof fetch;
    await expect(signPhotoKeys(GOOD_CONFIG, ['a.jpg'])).resolves.toEqual({});
  });

  it('survives a malformed response body', async () => {
    global.fetch = (async () => ({
      ok: true, status: 200, json: async () => [{ path: 'a.jpg' }, { signedURL: '/x' }], text: async () => '',
    })) as unknown as typeof fetch;
    await expect(signPhotoKeys(GOOD_CONFIG, ['a.jpg'])).resolves.toEqual({});
  });
});
