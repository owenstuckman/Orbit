<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Upload, AlertCircle, Loader2, Camera, Image, FolderOpen } from 'lucide-svelte';
  import type { FileArtifact } from '$lib/types';

  export let uploading = false;
  export let error: string | null = null;
  export let maxSize = 10 * 1024 * 1024; // 10 MB default

  const dispatch = createEventDispatcher<{ upload: File; error: string }>();

  let dragOver = false;
  let fileInput: HTMLInputElement;
  let native = false;

  onMount(async () => {
    const { isNative } = await import('$lib/services/capacitor');
    native = isNative();
  });

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

  async function handleNativePick(source: 'camera' | 'gallery' | 'files') {
    if (uploading) return;
    const { pickFromCamera, pickFileNative } = await import('$lib/services/capacitor');

    if (source === 'files') {
      const files = await pickFileNative();
      for (const f of files) {
        const err = validateFile(f);
        if (err) { dispatch('error', err); continue; }
        dispatch('upload', f);
      }
    } else {
      const file = await pickFromCamera(source === 'camera' ? 'camera' : 'photos');
      if (!file) return;
      const err = validateFile(file);
      if (err) { dispatch('error', err); return; }
      dispatch('upload', file);
    }
  }
</script>

{#if native}
  <!-- Native mobile picker: camera / gallery / files buttons -->
  <div class="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg p-4">
    {#if uploading}
      <div class="flex justify-center py-2">
        <Loader2 class="text-indigo-500 animate-spin" size={24} />
        <p class="text-sm text-indigo-600 font-medium ml-2">Uploading...</p>
      </div>
    {:else}
      <p class="text-xs text-slate-500 dark:text-slate-400 text-center mb-3">
        Add files from your device
      </p>
      <div class="grid grid-cols-3 gap-2">
        <button
          on:click={() => handleNativePick('camera')}
          class="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          <Camera class="text-slate-600 dark:text-slate-300" size={22} />
          <span class="text-xs text-slate-600 dark:text-slate-300 font-medium">Camera</span>
        </button>
        <button
          on:click={() => handleNativePick('gallery')}
          class="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          <Image class="text-slate-600 dark:text-slate-300" size={22} />
          <span class="text-xs text-slate-600 dark:text-slate-300 font-medium">Gallery</span>
        </button>
        <button
          on:click={() => handleNativePick('files')}
          class="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          <FolderOpen class="text-slate-600 dark:text-slate-300" size={22} />
          <span class="text-xs text-slate-600 dark:text-slate-300 font-medium">Files</span>
        </button>
      </div>
      <p class="text-xs text-slate-400 dark:text-slate-500 text-center mt-2">
        Max {formatSize(maxSize)} per file
      </p>
    {/if}
  </div>
{:else}
  <!-- Web drag-and-drop / click to upload -->
  <div
    role="button"
    tabindex="0"
    class="relative border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer
      {dragOver ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/10' : 'border-slate-200 dark:border-slate-600 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800'}
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
      <p class="text-sm text-slate-600 dark:text-slate-400">
        {#if dragOver}
          <span class="text-indigo-600 dark:text-indigo-400 font-medium">Drop files here</span>
        {:else}
          Drag files here or <span class="text-indigo-600 dark:text-indigo-400 font-medium">click to upload</span>
        {/if}
      </p>
      <p class="text-xs text-slate-400 mt-1">
        Max {formatSize(maxSize)} per file
      </p>
    {/if}
  </div>
{/if}

{#if error}
  <div class="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
    <AlertCircle size={14} />
    <span>{error}</span>
  </div>
{/if}
