<script lang="ts">
  import type { PageData } from './$types';
  import { tasksApi } from '$lib/services/api';
  import type { Artifact, URLArtifact, GitHubPRArtifact } from '$lib/types';
  import {
    FileText,
    Calendar,
    DollarSign,
    Upload,
    Link,
    Github,
    Globe,
    Plus,
    X,
    Send,
    CheckCircle,
    AlertTriangle,
    Loader,
    ExternalLink
  } from 'lucide-svelte';

  export let data: PageData;
  $: task = data.task;
  $: token = data.token;

  let notes = '';
  let submitting = false;
  let submitted = false;
  let error = '';

  // Simple artifact management for guest submission
  let artifacts: Artifact[] = [];
  let showAddArtifact = false;
  let artifactType: 'url' | 'github_pr' = 'url';
  let urlInput = '';
  let urlTitle = '';

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  function getDaysLeft(deadline: string | null): number | null {
    if (!deadline) return null;
    return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  function addURLArtifact() {
    if (!urlInput.trim()) {
      error = 'Please enter a URL';
      return;
    }

    try {
      const url = new URL(urlInput);
      const artifact: URLArtifact = {
        id: crypto.randomUUID(),
        type: 'url',
        url: url.toString(),
        title: urlTitle.trim() || undefined,
        added_at: new Date().toISOString()
      };
      artifacts = [...artifacts, artifact];
      urlInput = '';
      urlTitle = '';
      showAddArtifact = false;
      error = '';
    } catch {
      error = 'Please enter a valid URL';
    }
  }

  function addGitHubPRArtifact() {
    if (!urlInput.trim()) {
      error = 'Please enter a GitHub PR URL';
      return;
    }

    // Parse GitHub PR URL
    const match = urlInput.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
    if (!match) {
      error = 'Please enter a valid GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)';
      return;
    }

    const [, owner, repo, prNumber] = match;
    const artifact: GitHubPRArtifact = {
      id: crypto.randomUUID(),
      type: 'github_pr',
      url: urlInput,
      owner,
      repo,
      pr_number: parseInt(prNumber),
      added_at: new Date().toISOString()
    };
    artifacts = [...artifacts, artifact];
    urlInput = '';
    showAddArtifact = false;
    error = '';
  }

  function removeArtifact(id: string) {
    artifacts = artifacts.filter(a => a.id !== id);
  }

  async function handleSubmit() {
    if (artifacts.length === 0 && !notes.trim()) {
      error = 'Please add at least one artifact or notes before submitting';
      return;
    }

    submitting = true;
    error = '';

    try {
      const submissionData = {
        notes: notes.trim() || undefined,
        artifacts,
        submitted_at: new Date().toISOString(),
        is_draft: false
      };

      const result = await tasksApi.submitExternal(token, submissionData);

      if (result.success) {
        submitted = true;
      } else {
        error = result.error || 'Failed to submit work';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      submitting = false;
    }
  }

  $: daysLeft = getDaysLeft(task.deadline);
</script>

<svelte:head>
  <title>Submit Work - {task.title}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
  <!-- Header -->
  <header class="bg-white border-b border-slate-200">
    <div class="max-w-4xl mx-auto px-4 py-6">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <ExternalLink class="text-indigo-600" size={20} />
        </div>
        <div>
          <h1 class="text-xl font-bold text-slate-900">External Submission Portal</h1>
          <p class="text-sm text-slate-500">Submit your completed work</p>
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-4 py-8">
    {#if submitted}
      <!-- Success State -->
      <div class="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle class="text-green-600" size={40} />
        </div>
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Work Submitted Successfully!</h2>
        <p class="text-slate-600 mb-6">
          Your submission has been received and is now pending review. You will be notified via email once it has been reviewed.
        </p>
        <div class="bg-slate-50 rounded-lg p-4 inline-block">
          <p class="text-sm text-slate-500">Task</p>
          <p class="font-medium text-slate-900">{task.title}</p>
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Content -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Task Info -->
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h2 class="text-lg font-semibold text-slate-900 mb-4">Task Details</h2>
            <h3 class="text-xl font-bold text-slate-900 mb-2">{task.title}</h3>
            {#if task.description}
              <p class="text-slate-600 whitespace-pre-wrap">{task.description}</p>
            {:else}
              <p class="text-slate-400 italic">No description provided</p>
            {/if}
          </div>

          <!-- Submission Form -->
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h2 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Upload class="text-indigo-500" size={20} />
              Your Submission
            </h2>

            {#if error}
              <div class="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle size={16} />
                {error}
              </div>
            {/if}

            <!-- Notes -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-slate-700 mb-2" for="notes">
                Submission Notes
              </label>
              <textarea
                id="notes"
                bind:value={notes}
                rows="4"
                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Describe what you've completed, any challenges encountered, and notes for the reviewer..."
                disabled={submitting}
              ></textarea>
            </div>

            <!-- Artifacts -->
            <div class="mb-6">
              <div class="flex items-center justify-between mb-3">
                <label class="block text-sm font-medium text-slate-700">
                  Artifacts ({artifacts.length})
                </label>
                <button
                  type="button"
                  on:click={() => showAddArtifact = true}
                  class="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                  disabled={submitting}
                >
                  <Plus size={16} />
                  Add Artifact
                </button>
              </div>

              {#if artifacts.length > 0}
                <div class="space-y-2">
                  {#each artifacts as artifact}
                    <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      {#if artifact.type === 'github_pr'}
                        <Github class="text-slate-500 flex-shrink-0" size={18} />
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-slate-900 truncate">
                            {artifact.owner}/{artifact.repo} #{artifact.pr_number}
                          </p>
                          <p class="text-xs text-slate-500">GitHub Pull Request</p>
                        </div>
                      {:else if artifact.type === 'url'}
                        <Globe class="text-slate-500 flex-shrink-0" size={18} />
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-slate-900 truncate">
                            {artifact.title || artifact.url}
                          </p>
                          <p class="text-xs text-slate-500 truncate">{artifact.url}</p>
                        </div>
                      {/if}
                      <button
                        type="button"
                        on:click={() => removeArtifact(artifact.id)}
                        class="p-1 text-slate-400 hover:text-red-500"
                        disabled={submitting}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
                  <Link class="mx-auto text-slate-400 mb-2" size={32} />
                  <p class="text-slate-500">No artifacts added yet</p>
                  <p class="text-sm text-slate-400">Add links to your work, GitHub PRs, or other deliverables</p>
                </div>
              {/if}
            </div>

            <!-- Submit Button -->
            <div class="pt-4 border-t border-slate-200">
              <button
                type="button"
                on:click={handleSubmit}
                disabled={submitting}
                class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {#if submitting}
                  <Loader size={20} class="animate-spin" />
                  Submitting...
                {:else}
                  <Send size={20} />
                  Submit Work
                {/if}
              </button>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <!-- Value Card -->
          <div class="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white">
            <div class="flex items-center gap-2 text-green-100 text-sm mb-2">
              <DollarSign size={16} />
              Task Value
            </div>
            <p class="text-3xl font-bold">{formatCurrency(task.dollar_value)}</p>
          </div>

          <!-- Details Card -->
          <div class="bg-white rounded-xl border border-slate-200 p-6">
            <h3 class="font-semibold text-slate-900 mb-4">Details</h3>
            <div class="space-y-4">
              {#if task.deadline}
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 text-slate-500">
                    <Calendar size={16} />
                    <span>Deadline</span>
                  </div>
                  <div class="text-right">
                    <p class="text-slate-900 font-medium">
                      {new Date(task.deadline).toLocaleDateString()}
                    </p>
                    {#if daysLeft !== null}
                      <p class="text-sm {daysLeft <= 0 ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-slate-500'}">
                        {daysLeft <= 0 ? 'Overdue!' : `${daysLeft} days left`}
                      </p>
                    {/if}
                  </div>
                </div>
              {/if}

              {#if task.story_points}
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 text-slate-500">
                    <FileText size={16} />
                    <span>Story Points</span>
                  </div>
                  <span class="text-slate-900 font-medium">{task.story_points}</span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Help Card -->
          <div class="bg-amber-50 border border-amber-100 rounded-xl p-6">
            <h3 class="font-semibold text-amber-900 mb-2">Need Help?</h3>
            <p class="text-sm text-amber-800 mb-3">
              If you have questions about this task or need clarification, contact the person who assigned it to you.
            </p>
            {#if task.external_contractor_email}
              <p class="text-xs text-amber-700">
                Submitted to: {task.external_contractor_email}
              </p>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </main>

  <!-- Add Artifact Modal -->
  {#if showAddArtifact}
    <div class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex min-h-full items-center justify-center p-4">
        <button
          class="fixed inset-0 bg-black/50"
          on:click={() => { showAddArtifact = false; error = ''; }}
          aria-label="Close"
        />

        <div class="relative w-full max-w-md bg-white rounded-xl shadow-xl">
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h2 class="text-lg font-semibold text-slate-900">Add Artifact</h2>
            <button
              on:click={() => { showAddArtifact = false; error = ''; }}
              class="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>

          <div class="p-6 space-y-4">
            <!-- Type Toggle -->
            <div class="flex gap-2">
              <button
                type="button"
                on:click={() => artifactType = 'url'}
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors {artifactType === 'url' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}"
              >
                <Globe size={18} />
                URL
              </button>
              <button
                type="button"
                on:click={() => artifactType = 'github_pr'}
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors {artifactType === 'github_pr' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}"
              >
                <Github size={18} />
                GitHub PR
              </button>
            </div>

            <!-- URL Input -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1" for="url">
                {artifactType === 'github_pr' ? 'GitHub PR URL' : 'URL'}
              </label>
              <input
                id="url"
                type="url"
                bind:value={urlInput}
                placeholder={artifactType === 'github_pr' ? 'https://github.com/owner/repo/pull/123' : 'https://...'}
                class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {#if artifactType === 'url'}
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1" for="title">
                  Title (optional)
                </label>
                <input
                  id="title"
                  type="text"
                  bind:value={urlTitle}
                  placeholder="e.g., Design mockup, API documentation"
                  class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            {/if}
          </div>

          <div class="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <button
              type="button"
              on:click={() => { showAddArtifact = false; error = ''; }}
              class="px-4 py-2 text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              on:click={artifactType === 'github_pr' ? addGitHubPRArtifact : addURLArtifact}
              class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus size={18} />
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
