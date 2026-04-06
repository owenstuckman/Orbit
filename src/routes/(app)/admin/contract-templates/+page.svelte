<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, currentOrgRole } from '$lib/stores/auth';
  import { contractTemplatesApi } from '$lib/services/api';
  import { toasts } from '$lib/stores/notifications';
  import type { ContractTemplate } from '$lib/types';
  import ContractTemplateEditor from '$lib/components/admin/ContractTemplateEditor.svelte';
  import { Plus, Edit2, Trash2, Star, ArrowLeft, FileText } from 'lucide-svelte';

  let templates: ContractTemplate[] = [];
  let loading = true;
  let showEditor = false;
  let editingTemplate: ContractTemplate | null = null;

  onMount(async () => {
    if ($currentOrgRole !== 'admin') {
      goto('/dashboard');
      return;
    }
    await loadTemplates();
  });

  async function loadTemplates() {
    loading = true;
    if (!$user?.org_id) { loading = false; return; }
    templates = await contractTemplatesApi.list($user.org_id);
    loading = false;
  }

  function openNew() {
    editingTemplate = null;
    showEditor = true;
  }

  function openEdit(t: ContractTemplate) {
    editingTemplate = t;
    showEditor = true;
  }

  async function handleSave(event: CustomEvent<ContractTemplate>) {
    const saved = event.detail;
    showEditor = false;
    editingTemplate = null;
    await loadTemplates();
    toasts.success(`Template "${saved.name}" saved.`);
  }

  function handleCancel() {
    showEditor = false;
    editingTemplate = null;
  }

  async function handleDelete(t: ContractTemplate) {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    const ok = await contractTemplatesApi.delete(t.id);
    if (ok) {
      toasts.success('Template deleted.');
      await loadTemplates();
    } else {
      toasts.error('Failed to delete template.');
    }
  }

  async function handleSetDefault(t: ContractTemplate) {
    if (!$user?.org_id) return;
    const ok = await contractTemplatesApi.setDefault(t.id, $user.org_id, t.template_type);
    if (ok) {
      toasts.success(`"${t.name}" is now the default for ${t.template_type}.`);
      await loadTemplates();
    } else {
      toasts.error('Failed to set default.');
    }
  }

  const typeLabel: Record<string, string> = {
    contractor: 'Contractor',
    task_assignment: 'Task Assignment',
    project_pm: 'Project PM',
  };
</script>

<svelte:head>
  <title>Contract Templates - Admin - Orbit</title>
</svelte:head>

{#if showEditor}
  <ContractTemplateEditor
    template={editingTemplate}
    orgId={$user?.org_id ?? ''}
    on:save={handleSave}
    on:cancel={handleCancel}
  />
{:else}
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <a href="/admin" class="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
        <ArrowLeft size={20} />
      </a>
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Contract Templates</h1>
        <p class="mt-1 text-slate-600 dark:text-slate-300">Define reusable contract templates with variable slots</p>
      </div>
      <button
        on:click={openNew}
        class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
      >
        <Plus size={16} />
        New Template
      </button>
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if templates.length === 0}
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
        <FileText class="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
        <h3 class="text-lg font-medium text-slate-900 dark:text-white mb-2">No templates yet</h3>
        <p class="text-slate-500 dark:text-slate-400 mb-6">Create your first contract template to get started.</p>
        <button
          on:click={openNew}
          class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
        >
          <Plus size={16} />
          Create Template
        </button>
      </div>
    {:else}
      <div class="grid gap-4">
        {#each templates as template (template.id)}
          <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-semibold text-slate-900 dark:text-white">{template.name}</h3>
                  {#if template.is_default}
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium rounded-full">
                      <Star size={11} />
                      Default
                    </span>
                  {/if}
                  <span class="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs rounded-full">
                    {typeLabel[template.template_type] ?? template.template_type}
                  </span>
                </div>
                {#if template.description}
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{template.description}</p>
                {/if}
                <div class="mt-2 flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                  <span>{template.sections.length} section{template.sections.length !== 1 ? 's' : ''}</span>
                  <span>{template.variables.length} variable{template.variables.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                {#if !template.is_default}
                  <button
                    on:click={() => handleSetDefault(template)}
                    title="Set as default"
                    class="p-2 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                  >
                    <Star size={16} />
                  </button>
                {/if}
                <button
                  on:click={() => openEdit(template)}
                  class="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  on:click={() => handleDelete(template)}
                  class="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
