<!--
  @component GlobalSearch
  Command palette-style search across tasks, projects, users, and contracts.
  Triggered with Ctrl+K / Cmd+K.
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/services/supabase';
  import { user } from '$lib/stores/auth';
  import {
    Search,
    CheckSquare,
    FolderKanban,
    Users,
    FileText,
    ArrowRight,
    Command
  } from 'lucide-svelte';

  export let show = false;

  let query = '';
  let results: SearchResult[] = [];
  let loading = false;
  let selectedIndex = 0;
  let inputRef: HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout>;

  interface SearchResult {
    id: string;
    type: 'task' | 'project' | 'user' | 'contract';
    title: string;
    subtitle: string;
    href: string;
  }

  const typeIcons = {
    task: CheckSquare,
    project: FolderKanban,
    user: Users,
    contract: FileText,
  };

  const typeColors = {
    task: 'text-blue-500',
    project: 'text-purple-500',
    user: 'text-green-500',
    contract: 'text-amber-500',
  };

  $: if (show && inputRef) {
    setTimeout(() => inputRef?.focus(), 50);
  }

  $: if (!show) {
    query = '';
    results = [];
    selectedIndex = 0;
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    if (!query.trim()) {
      results = [];
      return;
    }
    debounceTimer = setTimeout(() => search(query.trim()), 250);
  }

  async function search(q: string) {
    if (!$user) return;
    loading = true;
    selectedIndex = 0;

    const searchPattern = `%${q}%`;
    const allResults: SearchResult[] = [];

    try {
      // Search tasks
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, title, status, project:projects(name)')
        .or(`title.ilike.${searchPattern},description.ilike.${searchPattern}`)
        .limit(5);

      if (taskData) {
        for (const t of taskData) {
          allResults.push({
            id: t.id,
            type: 'task',
            title: t.title,
            subtitle: `${t.status.replace('_', ' ')}${(t as any).project?.name ? ` · ${(t as any).project.name}` : ''}`,
            href: `/tasks/${t.id}`,
          });
        }
      }

      // Search projects
      const { data: projectData } = await supabase
        .from('projects')
        .select('id, name, status')
        .or(`name.ilike.${searchPattern},description.ilike.${searchPattern}`)
        .limit(5);

      if (projectData) {
        for (const p of projectData) {
          allResults.push({
            id: p.id,
            type: 'project',
            title: p.name,
            subtitle: p.status,
            href: `/projects/${p.id}`,
          });
        }
      }

      // Search users
      const { data: userData } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .or(`full_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
        .limit(5);

      if (userData) {
        for (const u of userData) {
          allResults.push({
            id: u.id,
            type: 'user',
            title: u.full_name || u.email,
            subtitle: u.role,
            href: `/admin/users`,
          });
        }
      }

      // Search contracts
      const { data: contractData } = await supabase
        .from('contracts')
        .select('id, title, status')
        .ilike('title', searchPattern)
        .limit(5);

      if (contractData) {
        for (const c of contractData) {
          allResults.push({
            id: c.id,
            type: 'contract',
            title: c.title,
            subtitle: c.status,
            href: `/contracts/${c.id}`,
          });
        }
      }

      results = allResults;
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      navigateTo(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      show = false;
    }
  }

  function navigateTo(result: SearchResult) {
    show = false;
    goto(result.href);
  }
</script>

{#if show}
  <div class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
    <button
      class="absolute inset-0 bg-black/50"
      on:click={() => show = false}
      aria-label="Close search"
      tabindex="-1"
    />
    <div class="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl mx-4 overflow-hidden">
      <!-- Search input -->
      <div class="flex items-center gap-3 px-4 border-b border-slate-200 dark:border-slate-700">
        <Search class="text-slate-400 flex-shrink-0" size={20} />
        <input
          bind:this={inputRef}
          bind:value={query}
          on:input={handleInput}
          on:keydown={handleKeydown}
          type="text"
          placeholder="Search tasks, projects, users, contracts..."
          class="flex-1 py-4 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-base"
        />
        <kbd class="hidden sm:inline-flex px-2 py-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono text-slate-500 dark:text-slate-400">
          Esc
        </kbd>
      </div>

      <!-- Results -->
      {#if query.trim()}
        <div class="max-h-[50vh] overflow-y-auto">
          {#if loading}
            <div class="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              Searching...
            </div>
          {:else if results.length === 0}
            <div class="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              No results for "{query}"
            </div>
          {:else}
            <div class="py-2">
              {#each results as result, i}
                <button
                  class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                    {i === selectedIndex ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}"
                  on:click={() => navigateTo(result)}
                  on:mouseenter={() => selectedIndex = i}
                >
                  <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <svelte:component this={typeIcons[result.type]} size={16} class={typeColors[result.type]} />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-slate-900 dark:text-white truncate">{result.title}</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">{result.subtitle}</p>
                  </div>
                  <span class="text-xs text-slate-400 capitalize">{result.type}</span>
                  {#if i === selectedIndex}
                    <ArrowRight size={14} class="text-indigo-500" />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div class="px-4 py-6 text-center text-slate-400 dark:text-slate-500 text-sm">
          <p>Type to search across all entities</p>
          <div class="flex items-center justify-center gap-4 mt-3 text-xs">
            <span class="flex items-center gap-1"><svelte:component this={CheckSquare} size={12} /> Tasks</span>
            <span class="flex items-center gap-1"><svelte:component this={FolderKanban} size={12} /> Projects</span>
            <span class="flex items-center gap-1"><svelte:component this={Users} size={12} /> Users</span>
            <span class="flex items-center gap-1"><svelte:component this={FileText} size={12} /> Contracts</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
