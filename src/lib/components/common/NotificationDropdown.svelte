<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { user } from '$lib/stores/auth';
  import { notifications, unreadCount, recentNotifications, type Notification } from '$lib/stores/notifications';
  import {
    Bell,
    Check,
    CheckCheck,
    Trash2,
    X,
    Target,
    CheckCircle,
    XCircle,
    DollarSign,
    FileText,
    Trophy,
    TrendingUp,
    AlertCircle
  } from 'lucide-svelte';

  let isOpen = false;

  onMount(() => {
    if ($user) {
      notifications.load($user.id);
      notifications.subscribeToUpdates($user.id);
    }
  });

  onDestroy(() => {
    notifications.unsubscribe();
  });

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function closeDropdown() {
    isOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.notification-dropdown')) {
      closeDropdown();
    }
  }

  function getNotificationIcon(type: Notification['type']) {
    switch (type) {
      case 'task_assigned': return Target;
      case 'task_completed': return CheckCircle;
      case 'qc_review': return AlertCircle;
      case 'qc_approved': return CheckCircle;
      case 'qc_rejected': return XCircle;
      case 'payout_ready': return DollarSign;
      case 'contract_signed': return FileText;
      case 'achievement_earned': return Trophy;
      case 'level_up': return TrendingUp;
      default: return Bell;
    }
  }

  function getNotificationColor(type: Notification['type']): string {
    switch (type) {
      case 'task_assigned': return 'bg-blue-100 text-blue-600';
      case 'task_completed': return 'bg-green-100 text-green-600';
      case 'qc_approved': return 'bg-green-100 text-green-600';
      case 'qc_rejected': return 'bg-red-100 text-red-600';
      case 'payout_ready': return 'bg-emerald-100 text-emerald-600';
      case 'achievement_earned': return 'bg-amber-100 text-amber-600';
      case 'level_up': return 'bg-purple-100 text-purple-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  function formatTime(date: string): string {
    const now = new Date();
    const notifDate = new Date(date);
    const diffMs = now.getTime() - notifDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return notifDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function markAsRead(notification: Notification) {
    if (!notification.read) {
      await notifications.markAsRead(notification.id);
    }
  }

  async function markAllAsRead() {
    if ($user) {
      await notifications.markAllAsRead($user.id);
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="notification-dropdown relative">
  <button
    on:click={toggleDropdown}
    class="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
    aria-label="Notifications"
  >
    <Bell size={20} />
    {#if $unreadCount > 0}
      <span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
        {$unreadCount > 9 ? '9+' : $unreadCount}
      </span>
    {/if}
  </button>

  {#if isOpen}
    <div class="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
      <!-- Header -->
      <div class="p-4 border-b border-slate-200 flex items-center justify-between">
        <h3 class="font-semibold text-slate-900">Notifications</h3>
        {#if $unreadCount > 0}
          <button
            on:click={markAllAsRead}
            class="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        {/if}
      </div>

      <!-- Notifications List -->
      <div class="max-h-96 overflow-y-auto">
        {#if $recentNotifications.length === 0}
          <div class="p-8 text-center">
            <Bell class="mx-auto text-slate-300 mb-2" size={32} />
            <p class="text-slate-500">No notifications yet</p>
          </div>
        {:else}
          {#each $recentNotifications as notification}
            <div
              class="p-4 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 last:border-0 {notification.read ? '' : 'bg-indigo-50/50'}"
              on:click={() => markAsRead(notification)}
              on:keypress={() => markAsRead(notification)}
              role="button"
              tabindex="0"
            >
              <div class="flex gap-3">
                <div class="w-10 h-10 rounded-lg {getNotificationColor(notification.type)} flex items-center justify-center flex-shrink-0">
                  <svelte:component this={getNotificationIcon(notification.type)} size={18} />
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <p class="font-medium text-slate-900 text-sm">{notification.title}</p>
                    {#if !notification.read}
                      <span class="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-1.5"></span>
                    {/if}
                  </div>
                  <p class="text-sm text-slate-600 line-clamp-2">{notification.message}</p>
                  <p class="text-xs text-slate-400 mt-1">{formatTime(notification.created_at)}</p>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Footer -->
      {#if $recentNotifications.length > 0}
        <div class="p-3 border-t border-slate-200">
          <a
            href="/notifications"
            class="block text-center text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            View all notifications
          </a>
        </div>
      {/if}
    </div>
  {/if}
</div>
