import sharp from 'sharp';
import { thumbFromDataUrl } from './image-resize';

describe('thumbFromDataUrl', () => {
  it('turns an inline photo into a small square JPEG thumbnail', async () => {
    const big = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#88aa55' } }).jpeg().toBuffer();
    const thumb = await thumbFromDataUrl(`data:image/jpeg;base64,${big.toString('base64')}`);
    expect(thumb).toMatch(/^data:image\/jpeg;base64,/);
    const buf = Buffer.from(thumb!.split(',')[1], 'base64');
    const meta = await sharp(buf).metadata();
    expect([meta.width, meta.height]).toEqual([128, 128]);
    expect(thumb!.length).toBeLessThan(12_000);
  });

  it('returns null for links, empty values and unreadable data', async () => {
    expect(await thumbFromDataUrl('https://example.com/p.jpg')).toBeNull();
    expect(await thumbFromDataUrl(null)).toBeNull();
    expect(await thumbFromDataUrl('data:image/jpeg;base64,bm90IGFuIGltYWdl')).toBeNull();
  });
});
