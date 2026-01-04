<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { user } from '$lib/stores/auth';
  import { notifications, unreadCount, type Notification, type NotificationType } from '$lib/stores/notifications';
  import {
    Bell,
    CheckCheck,
    Trash2,
    Target,
    CheckCircle,
    XCircle,
    DollarSign,
    FileText,
    Trophy,
    TrendingUp,
    AlertCircle,
    Inbox,
    Filter,
    Search
  } from 'lucide-svelte';

  let loading = true;
  let filter: 'all' | 'unread' | 'read' = 'all';
  let typeFilter: NotificationType | 'all' = 'all';
  let searchQuery = '';

  onMount(async () => {
    if ($user) {
      await notifications.load($user.id);
      notifications.subscribeToUpdates($user.id);
    }
    loading = false;
  });

  onDestroy(() => {
    notifications.unsubscribe();
  });

  // Notification type metadata
  const notificationTypes: { value: NotificationType | 'all'; label: string }[] = [
    { value: 'all', label: 'All Types' },
    { value: 'task_assigned', label: 'Task Assigned' },
    { value: 'task_completed', label: 'Task Completed' },
    { value: 'qc_review', label: 'QC Review' },
    { value: 'qc_approved', label: 'QC Approved' },
    { value: 'qc_rejected', label: 'QC Rejected' },
    { value: 'payout_ready', label: 'Payout Ready' },
    { value: 'project_assigned', label: 'Project Assigned' },
    { value: 'contract_signed', label: 'Contract Signed' },
    { value: 'achievement_earned', label: 'Achievement' },
    { value: 'level_up', label: 'Level Up' },
    { value: 'system', label: 'System' }
  ];

  function getNotificationIcon(type: Notification['type']) {
    switch (type) {
      case 'task_assigned': return Target;
      case 'task_completed': return CheckCircle;
      case 'qc_review': return AlertCircle;
      case 'qc_approved': return CheckCircle;
      case 'qc_rejected': return XCircle;
      case 'payout_ready': return DollarSign;
      case 'project_assigned': return Target;
      case 'contract_signed': return FileText;
      case 'achievement_earned': return Trophy;
      case 'level_up': return TrendingUp;
      default: return Bell;
    }
  }

  function getNotificationColor(type: Notification['type']): string {
    switch (type) {
      case 'task_assigned': return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
      case 'task_completed': return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
      case 'qc_approved': return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
      case 'qc_rejected': return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
      case 'qc_review': return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400';
      case 'payout_ready': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'project_assigned': return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
      case 'contract_signed': return 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400';
      case 'achievement_earned': return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
      case 'level_up': return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
    }
  }

  function getNotificationTypeLabel(type: Notification['type']): string {
    switch (type) {
      case 'task_assigned': return 'Task Assigned';
      case 'task_completed': return 'Task Completed';
      case 'qc_review': return 'QC Review';
      case 'qc_approved': return 'QC Approved';
      case 'qc_rejected': return 'QC Rejected';
      case 'payout_ready': return 'Payout Ready';
      case 'project_assigned': return 'Project Assigned';
      case 'contract_signed': return 'Contract Signed';
      case 'achievement_earned': return 'Achievement';
      case 'level_up': return 'Level Up';
      case 'system': return 'System';
      default: return 'Notification';
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

    return notifDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: notifDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  function formatFullDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  async function deleteNotification(id: string, event: MouseEvent) {
    event.stopPropagation();
    await notifications.delete(id);
  }

  // Filter notifications
  $: filteredNotifications = $notifications.items.filter(n => {
    // Read/unread filter
    if (filter === 'unread' && n.read) return false;
    if (filter === 'read' && !n.read) return false;

    // Type filter
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        n.title.toLowerCase().includes(query) ||
        n.message.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Group notifications by date
  $: groupedNotifications = filteredNotifications.reduce((groups, notification) => {
    const date = new Date(notification.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateKey: string;
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    } else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      dateKey = 'This Week';
    } else if (date > new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      dateKey = 'This Month';
    } else {
      dateKey = 'Older';
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(notification);
    return groups;
  }, {} as Record<string, Notification[]>);

  $: dateGroups = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'].filter(
    key => groupedNotifications[key]?.length > 0
  );

  // Stats
  $: totalCount = $notifications.items.length;
  $: readCount = $notifications.items.filter(n => n.read).length;
</script>

<svelte:head>
  <title>Notifications - Orbit</title>
</svelte:head>

<div class="max-w-4xl mx-auto space-y-6">
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Notifications</h1>
        <p class="text-slate-600 dark:text-slate-400 mt-1">
          {$unreadCount} unread of {totalCount} total
        </p>
      </div>

      {#if $unreadCount > 0}
        <button
          on:click={markAllAsRead}
          class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <CheckCheck size={18} />
          Mark all as read
        </button>
      {/if}
    </div>

    <!-- Filters -->
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div class="flex flex-col lg:flex-row lg:items-center gap-4">
        <!-- Search -->
        <div class="relative flex-1">
          <Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search notifications..."
            class="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <!-- Read/Unread filter -->
        <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            class="px-4 py-2 text-sm font-medium transition-colors {filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}"
            on:click={() => filter = 'all'}
          >
            All
          </button>
          <button
            class="px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 dark:border-slate-700 {filter === 'unread' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}"
            on:click={() => filter = 'unread'}
          >
            Unread ({$unreadCount})
          </button>
          <button
            class="px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 dark:border-slate-700 {filter === 'read' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}"
            on:click={() => filter = 'read'}
          >
            Read ({readCount})
          </button>
        </div>

        <!-- Type filter -->
        <div class="relative">
          <Filter size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            bind:value={typeFilter}
            class="pl-9 pr-8 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {#each notificationTypes as type}
              <option value={type.value}>{type.label}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <!-- Notifications List -->
    {#if filteredNotifications.length === 0}
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
        <div class="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <Inbox class="text-slate-400" size={32} />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white mb-2">
          {#if searchQuery || filter !== 'all' || typeFilter !== 'all'}
            No matching notifications
          {:else}
            No notifications yet
          {/if}
        </h3>
        <p class="text-slate-500 dark:text-slate-400">
          {#if searchQuery || filter !== 'all' || typeFilter !== 'all'}
            Try adjusting your filters or search query
          {:else}
            When you receive notifications, they'll appear here
          {/if}
        </p>
      </div>
    {:else}
      <div class="space-y-6">
        {#each dateGroups as dateGroup}
          <div>
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">
              {dateGroup}
            </h3>

            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 overflow-hidden">
              {#each groupedNotifications[dateGroup] as notification}
                <div
                  class="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group {notification.read ? '' : 'bg-indigo-50/50 dark:bg-indigo-900/10'}"
                  on:click={() => markAsRead(notification)}
                  on:keypress={() => markAsRead(notification)}
                  role="button"
                  tabindex="0"
                >
                  <div class="flex gap-4">
                    <!-- Icon -->
                    <div class="w-12 h-12 rounded-xl {getNotificationColor(notification.type)} flex items-center justify-center flex-shrink-0">
                      <svelte:component this={getNotificationIcon(notification.type)} size={22} />
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-start justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-1">
                            <p class="font-semibold text-slate-900 dark:text-white">
                              {notification.title}
                            </p>
                            {#if !notification.read}
                              <span class="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0"></span>
                            {/if}
                          </div>
                          <p class="text-slate-600 dark:text-slate-300">{notification.message}</p>
                          <div class="flex items-center gap-3 mt-2">
                            <span class="text-xs font-medium px-2 py-0.5 rounded-full {getNotificationColor(notification.type)}">
                              {getNotificationTypeLabel(notification.type)}
                            </span>
                            <span class="text-xs text-slate-400 dark:text-slate-500" title={formatFullDate(notification.created_at)}>
                              {formatTime(notification.created_at)}
                            </span>
                          </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            on:click={(e) => deleteNotification(notification.id, e)}
                            class="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete notification"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Load more hint -->
    {#if totalCount >= 50}
      <p class="text-center text-sm text-slate-500 dark:text-slate-400">
        Showing the most recent 50 notifications
      </p>
    {/if}
  {/if}
</div>
