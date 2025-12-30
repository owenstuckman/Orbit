<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FileText, GitPullRequest, Link, Package } from 'lucide-svelte';
  import type { Artifact } from '$lib/types';
  import ArtifactItem from './ArtifactItem.svelte';

  export let artifacts: Artifact[] = [];
  export let editable = false;
  export let grouped = false;

  const dispatch = createEventDispatcher<{ remove: string }>();

  // Group artifacts by type
  $: fileArtifacts = artifacts.filter(a => a.type === 'file');
  $: prArtifacts = artifacts.filter(a => a.type === 'github_pr');
  $: urlArtifacts = artifacts.filter(a => a.type === 'url');

  function handleRemove(e: CustomEvent<string>) {
    dispatch('remove', e.detail);
  }
</script>

{#if artifacts.length === 0}
  <div class="text-center py-8 text-slate-400">
    <Package class="mx-auto mb-2" size={32} />
    <p class="text-sm">No artifacts added yet</p>
  </div>
{:else if grouped}
  <div class="space-y-4">
    {#if fileArtifacts.length > 0}
      <div>
        <div class="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
          <FileText size={16} />
          <span>Files ({fileArtifacts.length})</span>
        </div>
        <div class="space-y-2">
          {#each fileArtifacts as artifact (artifact.id)}
            <ArtifactItem {artifact} {editable} on:remove={handleRemove} />
          {/each}
        </div>
      </div>
    {/if}

    {#if prArtifacts.length > 0}
      <div>
        <div class="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
          <GitPullRequest size={16} />
          <span>GitHub PRs ({prArtifacts.length})</span>
        </div>
        <div class="space-y-2">
          {#each prArtifacts as artifact (artifact.id)}
            <ArtifactItem {artifact} {editable} on:remove={handleRemove} />
          {/each}
        </div>
      </div>
    {/if}

    {#if urlArtifacts.length > 0}
      <div>
        <div class="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
          <Link size={16} />
          <span>Links ({urlArtifacts.length})</span>
        </div>
        <div class="space-y-2">
          {#each urlArtifacts as artifact (artifact.id)}
            <ArtifactItem {artifact} {editable} on:remove={handleRemove} />
          {/each}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="space-y-2">
    {#each artifacts as artifact (artifact.id)}
      <ArtifactItem {artifact} {editable} on:remove={handleRemove} />
    {/each}
  </div>
{/if}
