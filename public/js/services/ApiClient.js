import { Capacitor } from '@capacitor/core';

const API_ORIGIN = Capacitor.isNativePlatform() ? 'http://localhost:8000' : window.location.origin;

export function apiUrl(path) {
  return new URL(path, API_ORIGIN).toString();
}
