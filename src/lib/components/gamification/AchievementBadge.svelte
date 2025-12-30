<script lang="ts">
  import { Trophy, Star, Flame, Target, Zap, Award, Crown, Medal, Rocket, Heart } from 'lucide-svelte';

  export let badge: {
    id: string;
    name: string;
    description: string;
    icon: string;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    earned: boolean;
    earned_at?: string;
    progress?: number;
    requirement?: number;
  };

  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let showProgress = false;

  const tierColors = {
    bronze: 'from-amber-600 to-amber-800 border-amber-500',
    silver: 'from-slate-300 to-slate-500 border-slate-400',
    gold: 'from-yellow-400 to-yellow-600 border-yellow-500',
    platinum: 'from-cyan-300 to-blue-500 border-cyan-400'
  };

  const tierBgColors = {
    bronze: 'bg-amber-50',
    silver: 'bg-slate-50',
    gold: 'bg-yellow-50',
    platinum: 'bg-cyan-50'
  };

  const sizeClasses = {
    sm: { container: 'w-16 h-16', icon: 16, text: 'text-xs' },
    md: { container: 'w-20 h-20', icon: 24, text: 'text-sm' },
    lg: { container: 'w-28 h-28', icon: 32, text: 'text-base' }
  };

  function getIconComponent(iconName: string) {
    const icons: Record<string, typeof Trophy> = {
      trophy: Trophy,
      star: Star,
      flame: Flame,
      target: Target,
      zap: Zap,
      award: Award,
      crown: Crown,
      medal: Medal,
      rocket: Rocket,
      heart: Heart
    };
    return icons[iconName] || Award;
  }

  $: IconComponent = getIconComponent(badge.icon);
  $: progressPercent = badge.progress && badge.requirement
    ? Math.min((badge.progress / badge.requirement) * 100, 100)
    : 0;
</script>

<div
  class="relative group cursor-pointer"
  title={badge.description}
>
  <!-- Badge container -->
  <div
    class="{sizeClasses[size].container} rounded-full flex items-center justify-center transition-all duration-300
           {badge.earned
             ? `bg-gradient-to-br ${tierColors[badge.tier]} border-2 shadow-lg hover:shadow-xl hover:scale-105`
             : 'bg-slate-100 border-2 border-slate-200 opacity-50 grayscale'}"
  >
    <svelte:component
      this={IconComponent}
      size={sizeClasses[size].icon}
      class={badge.earned ? 'text-white' : 'text-slate-400'}
    />
  </div>

  <!-- Progress ring for unearned badges -->
  {#if showProgress && !badge.earned && badge.progress !== undefined}
    <svg
      class="absolute inset-0 -rotate-90"
      viewBox="0 0 100 100"
    >
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        class="text-slate-200"
      />
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-dasharray={`${progressPercent * 2.89} 289`}
        class="text-indigo-500 transition-all duration-500"
      />
    </svg>
  {/if}

  <!-- Badge name -->
  <p class="mt-2 text-center font-medium {sizeClasses[size].text} {badge.earned ? 'text-slate-900' : 'text-slate-400'} truncate max-w-full">
    {badge.name}
  </p>

  <!-- Tooltip on hover -->
  <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
    <p class="font-medium">{badge.name}</p>
    <p class="text-slate-300">{badge.description}</p>
    {#if !badge.earned && badge.progress !== undefined && badge.requirement}
      <p class="text-indigo-300 mt-1">{badge.progress} / {badge.requirement}</p>
    {/if}
    {#if badge.earned && badge.earned_at}
      <p class="text-green-300 mt-1">
        Earned {new Date(badge.earned_at).toLocaleDateString()}
      </p>
    {/if}
    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
  </div>
</div>
