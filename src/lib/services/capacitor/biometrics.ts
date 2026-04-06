/**
 * Biometric Authentication service.
 *
 * Flow:
 *   Enroll:  after successful password login, call enrollBiometrics(session)
 *            → stores session token in @capacitor/preferences (secure storage)
 *   Restore: on app open, call authenticateWithBiometrics()
 *            → prompts Face ID / Fingerprint
 *            → if approved, reads stored session and restores it via supabase.auth.setSession()
 *
 * No-ops silently on web.
 */

import { isNative } from './platform';
import { supabase } from '$lib/services/supabase';
import type { Session } from '@supabase/supabase-js';

const PREF_KEY_ACCESS = 'orbit_biometric_access_token';
const PREF_KEY_REFRESH = 'orbit_biometric_refresh_token';

/** True if biometric enrollment exists on this device. */
export async function isBiometricEnrolled(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: PREF_KEY_ACCESS });
    return !!value;
  } catch {
    return false;
  }
}

/**
 * Checks whether the device supports biometrics and what type is available.
 * Returns null on web or when biometrics are not available.
 */
export async function checkBiometricAvailability(): Promise<'available' | 'unavailable' | 'none'> {
  if (!isNative()) return 'none';
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    const result = await BiometricAuth.checkBiometry();
    if (result.isAvailable) return 'available';
    if (result.strongBiometryIsAvailable) return 'available';
    return 'unavailable';
  } catch {
    return 'none';
  }
}

/**
 * Enrolls biometrics by storing the current session tokens in secure storage.
 * Call this after a successful password login when the user opts in.
 */
export async function enrollBiometrics(session: Session): Promise<boolean> {
  if (!isNative()) return false;
  try {
    // Verify biometrics work before enrolling
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    await BiometricAuth.authenticate({
      reason: 'Confirm your identity to enable biometric login',
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
    });

    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREF_KEY_ACCESS, value: session.access_token });
    await Preferences.set({ key: PREF_KEY_REFRESH, value: session.refresh_token });
    return true;
  } catch (err: any) {
    // User cancelled or biometrics failed — not an error, just don't enroll
    if (err?.code !== 'biometryNotAvailable') {
      console.warn('[Biometrics] Enrollment failed:', err);
    }
    return false;
  }
}

/**
 * Attempts to restore a session via biometric authentication.
 * Returns the restored Session if successful, null otherwise.
 * Call this on app open before showing the login form.
 */
export async function authenticateWithBiometrics(): Promise<Session | null> {
  if (!isNative()) return null;

  const enrolled = await isBiometricEnrolled();
  if (!enrolled) return null;

  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    await BiometricAuth.authenticate({
      reason: 'Sign in to Orbit',
      cancelTitle: 'Use password instead',
      allowDeviceCredential: true,
    });

    const { Preferences } = await import('@capacitor/preferences');
    const { value: accessToken } = await Preferences.get({ key: PREF_KEY_ACCESS });
    const { value: refreshToken } = await Preferences.get({ key: PREF_KEY_REFRESH });

    if (!accessToken || !refreshToken) {
      await clearBiometricSession();
      return null;
    }

    // Restore the Supabase session
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      // Tokens expired — clear enrollment so user falls back to password
      await clearBiometricSession();
      return null;
    }

    return data.session;
  } catch (err: any) {
    // User cancelled — return null to show password form
    console.warn('[Biometrics] Auth cancelled or failed:', err?.message);
    return null;
  }
}

/**
 * Removes stored biometric tokens (e.g. on sign out or token expiry).
 */
export async function clearBiometricSession(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: PREF_KEY_ACCESS });
    await Preferences.remove({ key: PREF_KEY_REFRESH });
  } catch {
    // ignore
  }
}

/**
 * Initializes biometrics — updates stored tokens with the freshest session
 * if already enrolled. Call this after every successful login.
 */
export async function initializeBiometrics(session: Session): Promise<void> {
  if (!isNative()) return;
  const enrolled = await isBiometricEnrolled();
  if (!enrolled) return;
  // Refresh stored tokens silently
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREF_KEY_ACCESS, value: session.access_token });
    await Preferences.set({ key: PREF_KEY_REFRESH, value: session.refresh_token });
  } catch {
    // ignore
  }
}
