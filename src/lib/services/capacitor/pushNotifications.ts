/**
 * Push Notifications service.
 *
 * Flow:
 *   1. initializePushNotifications(userId) — called after login on native
 *   2. Requests permission, registers with FCM/APNs
 *   3. On token, stores in users.metadata.push_token via usersApi
 *   4. Listens for foreground notifications → shows toast
 *
 * notifyDevice(userId, title, body, data?) — called from anywhere to send a push
 * via the `send-push` Supabase edge function.
 */

import { isNative } from './platform';
import { supabase } from '$lib/services/supabase';

export type PushNotificationType =
  | 'task_assigned'
  | 'qc_approved'
  | 'qc_rejected'
  | 'payout_ready';

/**
 * Initialize push notifications for the signed-in user.
 * No-ops on web. Call this once after the user profile is loaded.
 */
export async function initializePushNotifications(userId: string): Promise<void> {
  if (!isNative()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Check / request permission
    const permStatus = await PushNotifications.checkPermissions();
    let finalStatus = permStatus.receive;

    if (finalStatus === 'prompt') {
      const result = await PushNotifications.requestPermissions();
      finalStatus = result.receive;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Push] Permission not granted:', finalStatus);
      return;
    }

    // Register with FCM / APNs
    await PushNotifications.register();

    // Remove old listeners before adding new ones (prevents duplicates on re-login)
    await PushNotifications.removeAllListeners();

    // Store token in DB
    PushNotifications.addListener('registration', async (token) => {
      await storePushToken(userId, token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] Registration error:', err);
    });

    // Foreground notification received — show in-app toast
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // Import toast dynamically to avoid circular dep
      import('$lib/stores/notifications').then(({ toasts }) => {
        toasts.info(notification.body || notification.title || 'New notification');
      });
    });

    // Notification tapped — navigate to the relevant route
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data as Record<string, string> | undefined;
      if (!data) return;

      const { goto } = window as any;
      if (data.route) {
        import('$app/navigation').then(({ goto }) => goto(data.route));
      }
    });
  } catch (err) {
    console.error('[Push] Initialization failed:', err);
  }
}

async function storePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ metadata: supabase.rpc('jsonb_set_key', { }) } as any)
    .eq('id', userId);

  // Use a plain update — merge push_token into existing metadata
  const { data: existing } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();

  await supabase
    .from('users')
    .update({ metadata: { ...(existing?.metadata ?? {}), push_token: token } })
    .eq('id', userId);
}

/**
 * Send a push notification to a user via the `send-push` edge function.
 * Requires the `send-push` edge function to be deployed.
 *
 * @param userId - Target user's UUID
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional key/value payload for deep linking
 */
export async function notifyDevice(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { user_id: userId, title, body, data: data ?? {} }
    });
    if (error) console.error('[Push] notifyDevice error:', error);
  } catch (err) {
    console.error('[Push] notifyDevice failed:', err);
  }
}
