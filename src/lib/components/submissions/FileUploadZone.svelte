<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Upload, AlertCircle, Loader2 } from 'lucide-svelte';
  import type { FileArtifact } from '$lib/types';

  export let uploading = false;
  export let error: string | null = null;
  export let maxSize = 10 * 1024 * 1024; // 10 MB default

  const dispatch = createEventDispatcher<{ upload: File; error: string }>();

  let dragOver = false;
  let fileInput: HTMLInputElement;

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function validateFile(file: File): string | null {
    if (file.size > maxSize) {
      return `File exceeds ${formatSize(maxSize)} limit (${formatSize(file.size)})`;
    }
    return null;
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        dispatch('error', error);
        continue;
      }
      dispatch('upload', file);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    handleFiles(e.dataTransfer?.files || null);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }

  function handleClick() {
    fileInput?.click();
  }

  function handleInputChange(e: Event) {
    const input = e.target as HTMLInputElement;
    handleFiles(input.files);
    input.value = ''; // Reset so same file can be uploaded again
  }
</script>

<div
  role="button"
  tabindex="0"
  class="relative border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer
    {dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}
    {uploading ? 'opacity-50 cursor-wait' : ''}"
  on:drop={handleDrop}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
>
  <input
    type="file"
    bind:this={fileInput}
    on:change={handleInputChange}
    class="hidden"
    multiple
    accept="image/*,.pdf,.doc,.docx,.txt,.md,.zip,.json"
  />

  {#if uploading}
    <Loader2 class="mx-auto text-indigo-500 mb-2 animate-spin" size={24} />
    <p class="text-sm text-indigo-600 font-medium">Uploading...</p>
  {:else}
    <Upload class="mx-auto text-slate-400 mb-2" size={24} />
    <p class="text-sm text-slate-600">
      {#if dragOver}
        <span class="text-indigo-600 font-medium">Drop files here</span>
      {:else}
        Drag files here or <span class="text-indigo-600 font-medium">click to upload</span>
      {/if}
    </p>
    <p class="text-xs text-slate-400 mt-1">
      Max {formatSize(maxSize)} per file
    </p>
  {/if}
</div>

{#if error}
  <div class="mt-2 flex items-center gap-2 text-sm text-red-600">
    <AlertCircle size={14} />
    <span>{error}</span>
  </div>
{/if}
