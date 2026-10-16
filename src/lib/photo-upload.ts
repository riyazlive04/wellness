import * as ImagePicker from 'expo-image-picker';

/**
 * Picking and uploading a photo, in one place.
 *
 * Deliberately uses ONLY expo-image-picker, which is already in the installed
 * app. A resize library such as expo-image-manipulator is a native module: it
 * cannot be added over the air, and importing one that the installed build
 * does not contain crashes the screen to a blank page. Anything added here
 * must either already be in the app or wait for a new store build.
 *
 * So the size cap comes from the picker's own `quality` re-encode rather than
 * a true downscale. It is weaker than resizing — a 12 MP photo keeps its
 * dimensions — but it is honest about what it does, and the bucket now caps
 * uploads at 15 MB, so nothing unbounded reaches storage.
 */

/** Re-encode quality. 0.5 keeps a phone photo around 0.8-1.5 MB. */
const QUALITY = 0.5;

export interface PickedPhoto {
  uri: string;
  name: string;
  mime: string;
}

/** Ask for the camera or the gallery. Returns null if they decline or cancel. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: QUALITY, mediaTypes: 'images' })
      : await ImagePicker.launchImageLibraryAsync({ quality: QUALITY, mediaTypes: 'images' });
  if (res.canceled || !res.assets?.[0]) return null;

  const asset = res.assets[0];
  const mime = asset.mimeType ?? 'image/jpeg';
  // Keep the real extension: the bucket only accepts image types, and a name
  // that lies about the contents would be rejected there.
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  return { uri: asset.uri, name: `${Date.now()}.${ext}`, mime };
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
