<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Upload, GitPullRequest, Link } from 'lucide-svelte';
  import FileUploadZone from './FileUploadZone.svelte';
  import GitHubPRInput from './GitHubPRInput.svelte';
  import URLInput from './URLInput.svelte';

  export let show = false;
  export let uploading = false;

  const dispatch = createEventDispatcher<{
    close: void;
    uploadFile: File;
    addGitHubPR: string;
    addURL: { url: string; title?: string };
  }>();

  type Tab = 'file' | 'github' | 'url';
  let activeTab: Tab = 'file';
  let uploadError: string | null = null;

  const tabs: { id: Tab; label: string; icon: typeof Upload }[] = [
    { id: 'file', label: 'Files', icon: Upload },
    { id: 'github', label: 'GitHub PR', icon: GitPullRequest },
    { id: 'url', label: 'URL', icon: Link }
  ];

  function close() {
    show = false;
    uploadError = null;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleFileUpload(e: CustomEvent<File>) {
    dispatch('uploadFile', e.detail);
  }

  function handleUploadError(e: CustomEvent<string>) {
    uploadError = e.detail;
  }

  function handleAddGitHubPR(e: CustomEvent<string>) {
    dispatch('addGitHubPR', e.detail);
    close();
  }

  function handleAddURL(e: CustomEvent<{ url: string; title?: string }>) {
    dispatch('addURL', e.detail);
    close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4">
      <!-- Backdrop -->
      <button
        class="fixed inset-0 bg-black/50"
        on:click={close}
        tabindex="-1"
      />

      <!-- Modal -->
      <div class="relative bg-white rounded-xl shadow-xl w-full max-w-md">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 class="text-lg font-semibold text-slate-900">Add Artifact</h2>
          <button
            type="button"
            on:click={close}
            class="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-slate-200">
          {#each tabs as tab}
            <button
              type="button"
              on:click={() => { activeTab = tab.id; uploadError = null; }}
              class="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                {activeTab === tab.id
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}"
            >
              <svelte:component this={tab.icon} size={16} />
              {tab.label}
            </button>
          {/each}
        </div>

        <!-- Content -->
        <div class="p-4">
          {#if activeTab === 'file'}
            <FileUploadZone
              {uploading}
              error={uploadError}
              on:upload={handleFileUpload}
              on:error={handleUploadError}
            />
            <p class="mt-3 text-xs text-slate-500">
              Supported: Images, PDFs, documents, archives, and text files
            </p>
          {:else if activeTab === 'github'}
            <GitHubPRInput
              disabled={uploading}
              on:add={handleAddGitHubPR}
            />
          {:else}
            <URLInput
              disabled={uploading}
              on:add={handleAddURL}
            />
          {/if}
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-3 p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            on:click={close}
            class="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
