/** Extract opaque join token from a bare token or a pasted /join/URL. */
export function extractJoinToken(raw: string): string {
  const s = raw.trim();
  const m = s.match(/\/join\/([^/?#]+)/i);
  if (m?.[1]) return decodeURIComponent(m[1]);
  return s.replace(/^sirahlife:\/\/join\//i, '');
}
