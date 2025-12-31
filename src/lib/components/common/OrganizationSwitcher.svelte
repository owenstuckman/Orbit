<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { organization, userOrganizations } from '$lib/stores/auth';
  import { ChevronDown, Building2, Check, RefreshCw } from 'lucide-svelte';
  import type { UserOrgMembership } from '$lib/types';

  let isOpen = false;
  let switching = false;
  let loaded = false;

  onMount(async () => {
    await userOrganizations.load();
    loaded = true;
  });

  async function switchTo(membership: UserOrgMembership) {
    if (membership.org_id === $organization?.id) {
      isOpen = false;
      return;
    }

    switching = true;
    try {
      const success = await userOrganizations.switchOrg(membership.org_id);
      if (success) {
        isOpen = false;
        // Navigate to dashboard to refresh context
        goto('/dashboard');
      }
    } catch (error) {
      console.error('Failed to switch organization:', error);
    } finally {
      switching = false;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as Element;
    if (!target.closest('.org-switcher')) {
      isOpen = false;
    }
  }

  $: otherOrgs = $userOrganizations.filter(m => m.org_id !== $organization?.id);
  $: hasMultipleOrgs = $userOrganizations.length > 1;
</script>

<svelte:window on:click={handleClickOutside} />

<div class="org-switcher relative">
  {#if hasMultipleOrgs}
    <!-- Dropdown trigger -->
    <button
      on:click|stopPropagation={() => isOpen = !isOpen}
      class="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group"
      disabled={switching}
    >
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Building2 size={16} class="text-white" />
        </div>
        <div class="text-left min-w-0">
          <p class="text-xs text-slate-500 uppercase tracking-wider">Organization</p>
          <p class="text-white font-medium truncate">{$organization?.name || 'Loading...'}</p>
        </div>
      </div>
      {#if switching}
        <RefreshCw size={16} class="text-slate-400 animate-spin flex-shrink-0" />
      {:else}
        <ChevronDown
          size={16}
          class="text-slate-400 group-hover:text-white transition-colors flex-shrink-0 {isOpen ? 'rotate-180' : ''}"
        />
      {/if}
    </button>

    <!-- Dropdown menu -->
    {#if isOpen}
      <div class="absolute left-0 right-0 mt-1 mx-2 bg-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden z-50">
        <div class="py-1">
          <!-- Current org -->
          <div class="px-3 py-2 flex items-center gap-3 bg-indigo-600/20 border-l-2 border-indigo-500">
            <div class="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center flex-shrink-0">
              <Check size={12} class="text-white" />
            </div>
            <div class="min-w-0">
              <p class="text-white text-sm font-medium truncate">{$organization?.name}</p>
              <p class="text-xs text-slate-400">Current</p>
            </div>
          </div>

          {#if otherOrgs.length > 0}
            <div class="border-t border-slate-700 my-1"></div>
            <p class="px-3 py-1 text-xs text-slate-500 uppercase tracking-wider">Switch to</p>

            {#each otherOrgs as membership}
              <button
                on:click={() => switchTo(membership)}
                disabled={switching}
                class="w-full px-3 py-2 flex items-center gap-3 hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <div class="w-6 h-6 bg-slate-600 rounded flex items-center justify-center flex-shrink-0">
                  <Building2 size={12} class="text-slate-300" />
                </div>
                <div class="text-left min-w-0">
                  <p class="text-white text-sm truncate">{membership.organization?.name}</p>
                  <p class="text-xs text-slate-400 capitalize">{membership.role}</p>
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  {:else}
    <!-- Single org - no dropdown -->
    <div class="px-4 py-3">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Building2 size={16} class="text-white" />
        </div>
        <div class="min-w-0">
          <p class="text-xs text-slate-500 uppercase tracking-wider">Organization</p>
          <p class="text-white font-medium truncate">{$organization?.name || 'Loading...'}</p>
        </div>
      </div>
    </div>
  {/if}
</div>
