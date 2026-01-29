/**
 * @fileoverview Notification State Management
 *
 * This module provides stores for managing notifications and toast messages.
 * Supports real-time updates via Supabase subscriptions.
 *
 * @module stores/notifications
 *
 * Exported Stores:
 * - notifications - Persistent notifications from database
 * - unreadCount - Count of unread notifications
 * - unreadNotifications - Filtered unread items
 * - recentNotifications - Last 5 notifications
 * - toasts - Ephemeral toast messages
 *
 * Features:
 * - Real-time notification delivery
 * - Mark as read (single/all)
 * - Toast auto-dismissal with configurable duration
 *
 * @example
 * ```svelte
 * <script>
 *   import { notifications, toasts, unreadCount } from '$lib/stores/notifications';
 *
 *   onMount(() => {
 *     notifications.load(userId);
 *     notifications.subscribeToUpdates(userId);
 *   });
 *
 *   function showSuccess() {
 *     toasts.success('Operation completed!');
 *   }
 * </script>
 *
 * <Badge count={$unreadCount} />
 * ```
 */

import { writable, derived } from 'svelte/store';
import { supabase, subscribeToTable } from '$lib/services/supabase';

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Database notification record.
 */
export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

/**
 * All possible notification types in the system.
 */
export type NotificationType =
  | 'task_assigned'
  | 'task_completed'
  | 'qc_review'
  | 'qc_approved'
  | 'qc_rejected'
  | 'payout_ready'
  | 'project_assigned'
  | 'contract_signed'
  | 'achievement_earned'
  | 'level_up'
  | 'system';

// ============================================================================
// Notifications Store - Persistent Notifications
// ============================================================================

/**
 * Notifications store state.
 */
interface NotificationsState {
  items: Notification[];
  loading: boolean;
  error: string | null;
}

function createNotificationsStore() {
  const { subscribe, set, update } = writable<NotificationsState>({
    items: [],
    loading: false,
    error: null
  });

  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,

    async load(userId: string) {
      update(state => ({ ...state, loading: true, error: null }));

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        update(state => ({
          ...state,
          items: data || [],
          loading: false
        }));
      } catch (error) {
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load notifications'
        }));
      }
    },

    subscribeToUpdates(userId: string) {
      if (unsubscribe) {
        unsubscribe();
      }

      const channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            update(state => ({
              ...state,
              items: [payload.new as Notification, ...state.items]
            }));
          }
        )
        .subscribe();

      unsubscribe = () => supabase.removeChannel(channel);
    },

    async markAsRead(notificationId: string) {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', notificationId);

        if (error) throw error;

        update(state => ({
          ...state,
          items: state.items.map(n =>
            n.id === notificationId ? { ...n, read: true } : n
          )
        }));
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    },

    async markAllAsRead(userId: string) {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('user_id', userId)
          .eq('read', false);

        if (error) throw error;

        update(state => ({
          ...state,
          items: state.items.map(n => ({ ...n, read: true }))
        }));
      } catch (error) {
        console.error('Failed to mark all notifications as read:', error);
      }
    },

    async delete(notificationId: string) {
      try {
        const { error } = await supabase
          .from('notifications')
          .delete()
          .eq('id', notificationId);

        if (error) throw error;

        update(state => ({
          ...state,
          items: state.items.filter(n => n.id !== notificationId)
        }));
      } catch (error) {
        console.error('Failed to delete notification:', error);
      }
    },

    unsubscribe() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },

    clear() {
      this.unsubscribe();
      set({ items: [], loading: false, error: null });
    },

    // Add a local notification (for immediate feedback)
    addLocal(notification: Omit<Notification, 'id' | 'created_at'>) {
      const newNotification: Notification = {
        ...notification,
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString()
      };

      update(state => ({
        ...state,
        items: [newNotification, ...state.items]
      }));
    }
  };
}

export const notifications = createNotificationsStore();

// ============================================================================
// Derived Stores
// ============================================================================

export const unreadCount = derived(notifications, ($notifications) =>
  $notifications.items.filter(n => !n.read).length
);

export const unreadNotifications = derived(notifications, ($notifications) =>
  $notifications.items.filter(n => !n.read)
);

export const recentNotifications = derived(notifications, ($notifications) =>
  $notifications.items.slice(0, 5)
);

// ============================================================================
// Toast Notifications - Ephemeral UI Messages
// ============================================================================

/**
 * Toast notification for immediate user feedback.
 * Auto-dismisses after specified duration.
 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  /** Duration in ms before auto-dismiss (default: 5000) */
  duration?: number;
}

/**
 * Creates the toast store for ephemeral UI messages.
 * Provides convenience methods for different message types.
 *
 * @returns Toast store with add, remove, success, error, warning, info methods
 */
function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  return {
    subscribe,

    add(toast: Omit<Toast, 'id'>) {
      const id = `toast-${Date.now()}`;
      const newToast: Toast = { ...toast, id };

      update(toasts => [...toasts, newToast]);

      // Auto-remove after duration
      setTimeout(() => {
        this.remove(id);
      }, toast.duration || 5000);

      return id;
    },

    remove(id: string) {
      update(toasts => toasts.filter(t => t.id !== id));
    },

    success(message: string, duration?: number) {
      return this.add({ type: 'success', message, duration });
    },

    error(message: string, duration?: number) {
      return this.add({ type: 'error', message, duration });
    },

    warning(message: string, duration?: number) {
      return this.add({ type: 'warning', message, duration });
    },

    info(message: string, duration?: number) {
      return this.add({ type: 'info', message, duration });
    }
  };
}

export const toasts = createToastStore();
