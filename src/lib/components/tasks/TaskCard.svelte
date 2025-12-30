<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Clock, DollarSign, User, Sparkles, TrendingUp, Trophy, Zap } from 'lucide-svelte';
  import { user } from '$lib/stores/auth';
  import { formatCurrency, calculateTaskPayout } from '$lib/utils/payout';
  import type { Task } from '$lib/types';

  export let task: Task;
  export let showAcceptButton = false;
  export let compact = false;

  const dispatch = createEventDispatcher<{ accept: Task; click: Task }>();

  function handleClick() {
    dispatch('click', task);
  }

  function handleAccept(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    dispatch('accept', task);
  }

  function formatDeadline(deadline: string | null): string {
    if (!deadline) return 'No deadline';
    const date = new Date(deadline);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return 'Overdue';
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days <= 7) return `${days} days left`;
    return date.toLocaleDateString();
  }

  $: isOverdue = task.deadline && new Date(task.deadline) < new Date();
  $: isUrgent = task.urgency_multiplier > 1.2;
  $: isHighPriority = task.urgency_multiplier > 1.1;
  $: estimatedPayout = $user?.r != null
    ? calculateTaskPayout(task.dollar_value, $user.r, task.urgency_multiplier)
    : task.dollar_value * task.urgency_multiplier;

  // Gamification badges
  $: badges = getBadges(task);

  function getBadges(task: Task): { icon: typeof Trophy; label: string; color: string }[] {
    const badges = [];

    if (task.urgency_multiplier >= 1.5) {
      badges.push({ icon: Zap, label: 'Hot', color: 'text-red-500 bg-red-100' });
    } else if (task.urgency_multiplier >= 1.2) {
      badges.push({ icon: TrendingUp, label: 'Bonus', color: 'text-amber-500 bg-amber-100' });
    }

    if (task.required_level >= 4) {
      badges.push({ icon: Trophy, label: 'Expert', color: 'text-purple-500 bg-purple-100' });
    }

    if (task.dollar_value >= 200) {
      badges.push({ icon: DollarSign, label: 'High Value', color: 'text-green-500 bg-green-100' });
    }

    return badges;
  }
</script>

<button
  on:click={handleClick}
  class="w-full text-left bg-white rounded-lg border shadow-sm transition-all hover:shadow-md hover:border-indigo-200 group
    {isUrgent ? 'border-l-4 border-l-red-500' : isHighPriority ? 'border-l-4 border-l-amber-500' : ''}
    {compact ? 'p-3' : 'p-4'}"
>
  <!-- Header -->
  <div class="flex items-start justify-between gap-2 {compact ? 'mb-1' : 'mb-2'}">
    <h4 class="font-medium text-slate-900 line-clamp-2 group-hover:text-indigo-600 transition-colors {compact ? 'text-sm' : ''}">
      {task.title}
    </h4>
    {#if task.urgency_multiplier > 1}
      <span class="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded
        {isUrgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}">
        +{((task.urgency_multiplier - 1) * 100).toFixed(0)}%
      </span>
    {/if}
  </div>

  <!-- Badges -->
  {#if badges.length > 0 && !compact}
    <div class="flex flex-wrap gap-1 mb-2">
      {#each badges as badge}
        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium {badge.color}">
          <svelte:component this={badge.icon} size={10} />
          {badge.label}
        </span>
      {/each}
    </div>
  {/if}

  <!-- Meta info -->
  <div class="flex items-center gap-4 text-sm text-slate-500 {compact ? 'text-xs' : ''}">
    <div class="flex items-center gap-1">
      <DollarSign size={compact ? 12 : 14} />
      <span class="font-medium text-green-600">
        {formatCurrency(estimatedPayout)}
      </span>
    </div>
    {#if task.deadline}
      <div class="flex items-center gap-1 {isOverdue ? 'text-red-500' : ''}">
        <Clock size={compact ? 12 : 14} />
        <span>{formatDeadline(task.deadline)}</span>
      </div>
    {/if}
    {#if task.story_points}
      <span class="px-1.5 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
        {task.story_points} SP
      </span>
    {/if}
  </div>

  <!-- Level requirement -->
  {#if task.required_level > 1 && !compact}
    <div class="mt-2 flex items-center gap-1 text-xs text-slate-400">
      <Sparkles size={12} />
      Level {task.required_level}+ required
    </div>
  {/if}

  <!-- Assignee -->
  {#if task.assignee && task.status !== 'open' && !compact}
    <div class="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
      <div class="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
        <span class="text-xs font-medium text-indigo-700">
          {task.assignee.full_name?.charAt(0) || '?'}
        </span>
      </div>
      <span class="text-sm text-slate-600">{task.assignee.full_name || 'Unassigned'}</span>
    </div>
  {/if}

  <!-- Project link -->
  {#if task.project && !compact}
    <div class="mt-2 text-xs text-slate-400">
      {task.project.name}
    </div>
  {/if}

  <!-- Accept button -->
  {#if showAcceptButton}
    <button
      on:click={handleAccept}
      class="mt-3 w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
    >
      Accept Task
    </button>
  {/if}
</button>
