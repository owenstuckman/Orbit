/**
 * @fileoverview Capacitor Native Bridge
 *
 * Central entry point for all native device integrations.
 * All Capacitor plugin code is guarded by isNative() so it
 * silently no-ops when running in a browser.
 *
 * Usage:
 *   import { isNative, initializePushNotifications, ... } from '$lib/services/capacitor';
 */

export { isNative, getPlatform } from './platform';
export { initializePushNotifications, notifyDevice } from './pushNotifications';
export { initializeBiometrics, enrollBiometrics, authenticateWithBiometrics, clearBiometricSession } from './biometrics';
export { initializeDeepLinks } from './deepLinks';
export { pickFileNative, pickFromCamera } from './fileAccess';
