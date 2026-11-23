import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeGallery = registerPlugin('GallerySaver');

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not prepare the photo for your gallery.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

export async function saveToGallery(blob, fileName, location, createdAt) {
  if (!Capacitor.isNativePlatform()) return false;
  await NativeGallery.savePhoto({
    data: await toBase64(blob),
    fileName,
    latitude: location?.latitude,
    longitude: location?.longitude,
    place: location?.place || '',
    createdAt
  });
  return true;
}
