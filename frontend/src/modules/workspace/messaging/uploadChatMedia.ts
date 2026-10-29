import { clientsApi } from '@/modules/workspace/api/clients';

/**
 * The bucket's own ceiling (25 MB). Checked in the browser too so an oversized
 * file fails before it is uploaded rather than after.
 */
export const CHAT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Put one chat attachment in storage and return its key.
 *
 * Replaces inlining the bytes as a base64 `data:` URI on the message row.
 * That inlining was measurably expensive: one real thread held 962 kB across
 * 70 messages, and an open conversation refetches every 4 seconds, so those
 * same bytes were re-downloaded roughly 15 times a minute. It also capped
 * images at 1280px and other files at 1.4 MB, purely to survive the JSON body.
 *
 * Uploading first and sending the key means the message row stays ~60 bytes,
 * the browser caches the media like any other URL, and full-resolution photos
 * go through.
 *
 * `who` picks the endpoint: a staff member uploads against a client id, a
 * client uploads against their own account.
 */
export async function uploadChatMedia(
  clientId: string,
  blob: Blob,
  fileName?: string,
): Promise<string> {
  const name = fileName ?? (blob instanceof File ? blob.name : 'attachment');
  const ticket = await clientsApi.chatMediaTicket(clientId, name);
  await put(ticket.uploadUrl, blob);
  return ticket.storageKey;
}

/** The same, for a client sending from their own portal. */
export async function uploadMyChatMedia(blob: Blob, fileName?: string): Promise<string> {
  const name = fileName ?? (blob instanceof File ? blob.name : 'attachment');
  const ticket = await clientsApi.myChatMediaTicket(name);
  await put(ticket.uploadUrl, blob);
  return ticket.storageKey;
}

async function put(uploadUrl: string, blob: Blob): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    // Storage stores whatever Content-Type it is given, and that is what comes
    // back on download - without it an image is served as a generic blob and
    // the browser offers to save it instead of showing it.
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}
