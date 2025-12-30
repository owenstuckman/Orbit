<script lang="ts">
  import AchievementBadge from './AchievementBadge.svelte';
  import { Trophy, Lock, CheckCircle } from 'lucide-svelte';

  export let badges: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    category: string;
    earned: boolean;
    earned_at?: string;
    progress?: number;
    requirement?: number;
  }> = [];

  export let showAllInitial = true;
  export let showProgress = true;

  // Local state for showing all badges
  let showAll = showAllInitial;

  // Group badges by category
  $: groupedBadges = badges.reduce((acc, badge) => {
    if (!acc[badge.category]) {
      acc[badge.category] = [];
    }
    acc[badge.category].push(badge);
    return acc;
  }, {} as Record<string, typeof badges>);

  $: earnedCount = badges.filter(b => b.earned).length;
  $: totalCount = badges.length;

  $: filteredBadges = showAll ? badges : badges.filter(b => b.earned);
</script>

<div class="space-y-6">
  <!-- Summary header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
        <Trophy class="text-white" size={24} />
      </div>
      <div>
        <h3 class="text-lg font-semibold text-slate-900">Achievements</h3>
        <p class="text-sm text-slate-500">
          {earnedCount} of {totalCount} badges earned
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <span class="text-2xl font-bold text-amber-600">{earnedCount}</span>
      <span class="text-slate-400">/</span>
      <span class="text-lg text-slate-500">{totalCount}</span>
    </div>
  </div>

  <!-- Progress bar -->
  <div class="w-full bg-slate-100 rounded-full h-2.5">
    <div
      class="bg-gradient-to-r from-amber-400 to-orange-500 h-2.5 rounded-full transition-all duration-500"
      style="width: {totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%"
    ></div>
  </div>

  <!-- Toggle show all -->
  {#if badges.some(b => !b.earned)}
    <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={showAll}
        class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      Show locked achievements
    </label>
  {/if}

  <!-- Badges by category -->
  {#each Object.entries(groupedBadges) as [category, categoryBadges]}
    {@const filteredCategoryBadges = showAll ? categoryBadges : categoryBadges.filter(b => b.earned)}
    {#if filteredCategoryBadges.length > 0}
      <div class="space-y-4">
        <div class="flex items-center gap-2">
          <h4 class="text-sm font-semibold text-slate-700 uppercase tracking-wider">{category}</h4>
          <span class="text-xs text-slate-400">
            ({categoryBadges.filter(b => b.earned).length}/{categoryBadges.length})
          </span>
        </div>

        <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
          {#each filteredCategoryBadges as badge (badge.id)}
            <AchievementBadge {badge} size="md" {showProgress} />
          {/each}
        </div>
      </div>
    {/if}
  {/each}

  <!-- Empty state -->
  {#if filteredBadges.length === 0}
    <div class="text-center py-12">
      <Lock class="mx-auto text-slate-300 mb-4" size={48} />
      <p class="text-slate-500">No achievements earned yet</p>
      <p class="text-sm text-slate-400 mt-1">Complete tasks to unlock badges!</p>
    </div>
  {/if}
</div>
