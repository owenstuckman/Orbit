<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    FileText,
    Image,
    FileArchive,
    File,
    GitPullRequest,
    Link,
    Download,
    Trash2,
    ExternalLink
  } from 'lucide-svelte';
  import type { Artifact, FileArtifact, GitHubPRArtifact, URLArtifact } from '$lib/types';
  import { artifactsService } from '$lib/services/artifacts';
  import { storage } from '$lib/services/supabase';

  export let artifact: Artifact;
  export let editable = false;
  export let downloading = false;

  const dispatch = createEventDispatcher<{ remove: string; download: string }>();

  // Determine icon based on artifact type and file type
  function getFileIcon(artifact: FileArtifact) {
    if (artifactsService.isImage(artifact)) return Image;
    const ext = artifactsService.getFileExtension(artifact.file_name);
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return FileText;
    return File;
  }

  async function handleDownload() {
    if (artifact.type !== 'file') return;

    dispatch('download', artifact.id);

    try {
      const { data, error } = await storage.downloadFile('submissions', artifact.file_path);
      if (error || !data) throw error || new Error('No data');

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = artifact.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }

  function handleRemove() {
    dispatch('remove', artifact.id);
  }

  function openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
</script>

<div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg group hover:bg-slate-100 transition-colors">
  <!-- Icon -->
  <div class="flex-shrink-0">
    {#if artifact.type === 'file'}
      {@const Icon = getFileIcon(artifact)}
      <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
        <Icon class="text-blue-600" size={20} />
      </div>
    {:else if artifact.type === 'github_pr'}
      <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
        <GitPullRequest class="text-purple-600" size={20} />
      </div>
    {:else}
      <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
        <Link class="text-green-600" size={20} />
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 min-w-0">
    {#if artifact.type === 'file'}
      <p class="text-sm font-medium text-slate-900 truncate">{artifact.file_name}</p>
      <p class="text-xs text-slate-500">{artifactsService.formatFileSize(artifact.file_size)}</p>
    {:else if artifact.type === 'github_pr'}
      <p class="text-sm font-medium text-slate-900 truncate">
        {artifact.owner}/{artifact.repo} #{artifact.pr_number}
      </p>
      {#if artifact.metadata?.title}
        <p class="text-xs text-slate-500 truncate">{artifact.metadata.title}</p>
      {:else}
        <p class="text-xs text-slate-500">Pull Request</p>
      {/if}
    {:else}
      <p class="text-sm font-medium text-slate-900 truncate">
        {artifact.title || artifact.url}
      </p>
      <p class="text-xs text-slate-500 truncate">{artifact.url}</p>
    {/if}
  </div>

  <!-- Actions -->
  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
    {#if artifact.type === 'file'}
      <button
        type="button"
        on:click={handleDownload}
        disabled={downloading}
        class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors"
        title="Download"
      >
        <Download size={16} />
      </button>
    {:else}
      <button
        type="button"
        on:click={() => openExternal(artifact.url)}
        class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors"
        title="Open in new tab"
      >
        <ExternalLink size={16} />
      </button>
    {/if}

    {#if editable}
      <button
        type="button"
        on:click={handleRemove}
        class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
        title="Remove"
      >
        <Trash2 size={16} />
      </button>
    {/if}
  </div>
</div>
