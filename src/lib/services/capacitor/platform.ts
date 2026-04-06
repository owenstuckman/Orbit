import { Capacitor } from '@capacitor/core';

/** Returns true when running inside a Capacitor native shell (iOS/Android). */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Returns 'ios' | 'android' | 'web' */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}
