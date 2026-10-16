import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Picking and uploading a photo, in one place.
 *
 * Every screen used to do this itself with only the picker's `quality` float,
 * which re-encodes but does NOT resize: a 12 MP phone photo still uploaded at
 * ~4000px and several MB. Here the longest side is capped before upload, so a
 * photo lands at roughly 200-400 KB. That matters because a practice's storage
 * is capped by its plan, and daily photos from many clients add up fast.
 */

/** Longest side after resizing. Plenty for viewing on a phone or laptop. */
const MAX_EDGE = 1600;
const QUALITY = 0.7;

export interface PickedPhoto {
  uri: string;
  name: string;
  mime: string;
}

/** Ask for the camera or gallery, then shrink what comes back. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1, mediaTypes: 'images' })
      : await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: 'images' });
  if (res.canceled || !res.assets?.[0]) return null;

  const asset = res.assets[0];
  const shrunk = await shrink(asset.uri, asset.width);
  return {
    uri: shrunk,
    // Always .jpg: the manipulator re-encodes to JPEG, so a HEIC original
    // would otherwise be stored under a name that lies about its contents.
    name: `${Date.now()}.jpg`,
    mime: 'image/jpeg',
  };
}

/**
 * Cap the longest side and re-encode as JPEG. Returns the original uri if
 * the manipulator fails — a slightly large upload beats no upload at all.
 */
async function shrink(uri: string, width?: number): Promise<string> {
  try {
    const needsResize = !width || width > MAX_EDGE;
    const ctx = ImageManipulator.ImageManipulator.manipulate(uri);
    if (needsResize) ctx.resize({ width: MAX_EDGE });
    const image = await ctx.renderAsync();
    const out = await image.saveAsync({
      compress: QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return out.uri;
  } catch {
    return uri;
  }
}

/** PUT the bytes at a signed upload URL. */
export async function putPhoto(uploadUrl: string, photo: PickedPhoto): Promise<void> {
  const blob = await (await fetch(photo.uri)).blob();
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': photo.mime },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
}
