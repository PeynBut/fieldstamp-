import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeSettings = registerPlugin('NativeSettings');

export async function openAppSettings() {
  if (!Capacitor.isNativePlatform()) return false;
  await NativeSettings.openAppSettings();
  return true;
}
