<!--
  @component TaskCard

  Displays a task as an interactive card with gamification badges,
  urgency indicators, payout calculations, and optional accept button.

  @prop {Task} task - The task object to display
  @prop {boolean} [showAcceptButton=false] - Show "Pick Up Task" button
  @prop {boolean} [compact=false] - Use compact layout with less detail

  @event click - Fired when card is clicked, returns task
  @event accept - Fired when accept button clicked, returns task

  @example
  ```svelte
  <TaskCard
    {task}
    showAcceptButton={task.status === 'open'}
    on:click={() => openTaskDetail(task)}
    on:accept={() => acceptTask(task)}
  />
  ```
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Clock, DollarSign, User, Sparkles, TrendingUp, Trophy, Zap, Hand } from 'lucide-svelte';
  import { user } from '$lib/stores/auth';
  import { formatCurrency, calculateTaskPayout } from '$lib/utils/payout';
  import type { Task } from '$lib/types';

  /** The task to display */
  export let task: Task;
  /** Whether to show the accept/pickup button */
  export let showAcceptButton = false;
  /** Use compact layout with fewer details */
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

  // Tag colors
  const tagColors = [
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  ];

  function getTagColor(tag: string): string {
    const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return tagColors[hash % tagColors.length];
  }

  function getBadges(task: Task): { icon: typeof Trophy; label: string; color: string }[] {
    const badges = [];

    if (task.urgency_multiplier >= 1.5) {
      badges.push({ icon: Zap, label: 'Hot', color: 'text-red-500 bg-red-100 dark:text-red-400 dark:bg-red-900/30' });
    } else if (task.urgency_multiplier >= 1.2) {
      badges.push({ icon: TrendingUp, label: 'Bonus', color: 'text-amber-500 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30' });
    }

    if (task.required_level >= 4) {
      badges.push({ icon: Trophy, label: 'Expert', color: 'text-purple-500 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30' });
    }

    if (task.dollar_value >= 200) {
      badges.push({ icon: DollarSign, label: 'High Value', color: 'text-green-500 bg-green-100 dark:text-green-400 dark:bg-green-900/30' });
    }

    return badges;
  }
</script>

<button
  on:click={handleClick}
  class="w-full text-left bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-600 group
    {isUrgent ? 'border-l-4 border-l-red-500' : isHighPriority ? 'border-l-4 border-l-amber-500' : ''}
    {compact ? 'p-3' : 'p-4'}"
>
  <!-- Header -->
  <div class="flex items-start justify-between gap-2 {compact ? 'mb-1' : 'mb-2'}">
    <h4 class="font-medium text-slate-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors {compact ? 'text-sm' : ''}">
      {task.title}
    </h4>
    {#if task.urgency_multiplier > 1}
      <span class="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded
        {isUrgent ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}">
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

  <!-- Tags -->
  {#if task.tags && task.tags.length > 0 && !compact}
    <div class="flex flex-wrap gap-1 mb-2">
      {#each task.tags.slice(0, 3) as tag}
        <span class="px-1.5 py-0.5 rounded text-xs font-medium {getTagColor(tag)}">
          {tag}
        </span>
      {/each}
      {#if task.tags.length > 3}
        <span class="px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
          +{task.tags.length - 3}
        </span>
      {/if}
    </div>
  {/if}

  <!-- Meta info -->
  <div class="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 {compact ? 'text-xs' : ''}">
    <div class="flex items-center gap-1">
      <DollarSign size={compact ? 12 : 14} />
      <span class="font-medium text-green-600 dark:text-green-400">
        {formatCurrency(estimatedPayout)}
      </span>
    </div>
    {#if task.deadline}
      <div class="flex items-center gap-1 {isOverdue ? 'text-red-500 dark:text-red-400' : ''}">
        <Clock size={compact ? 12 : 14} />
        <span>{formatDeadline(task.deadline)}</span>
      </div>
    {/if}
    {#if task.story_points}
      <span class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400">
        {task.story_points} SP
      </span>
    {/if}
  </div>

  <!-- Level requirement -->
  {#if task.required_level > 1 && !compact}
    <div class="mt-2 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
      <Sparkles size={12} />
      Level {task.required_level}+ required
    </div>
  {/if}

  <!-- Assignee -->
  {#if task.assignee && task.status !== 'open' && !compact}
    <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
      <div class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
        <span class="text-xs font-medium text-indigo-700 dark:text-indigo-400">
          {task.assignee.full_name?.charAt(0) || '?'}
        </span>
      </div>
      <span class="text-sm text-slate-600 dark:text-slate-300">{task.assignee.full_name || 'Unassigned'}</span>
    </div>
  {/if}

  <!-- Project link -->
  {#if task.project && !compact}
    <div class="mt-2 text-xs text-slate-400 dark:text-slate-500">
      {task.project.name}
    </div>
  {/if}

  <!-- Accept button -->
  {#if showAcceptButton}
    <button
      on:click={handleAccept}
      class="mt-3 w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
    >
      <Hand size={16} />
      Pick Up Task
    </button>
  {/if}
</button>
