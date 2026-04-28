<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { contractTemplatesApi } from '$lib/services/api';
  import { toasts } from '$lib/stores/notifications';
  import type { ContractTemplate, ContractTemplateSection, ContractTemplateVariable } from '$lib/types';
  import { Plus, Trash2, ArrowUp, ArrowDown, Save, X, Eye, Edit2 } from 'lucide-svelte';

  export let template: ContractTemplate | null = null;
  export let orgId: string;

  const dispatch = createEventDispatcher<{ save: ContractTemplate; cancel: void }>();

  // ── Form state ──
  let name = template?.name ?? '';
  let description = template?.description ?? '';
  let templateType = template?.template_type ?? 'contractor';
  let isDefault = template?.is_default ?? false;
  let saving = false;
  let activeTab: 'editor' | 'preview' = 'editor';

  // Deep-copy sections / variables so we don't mutate the prop
  let sections: ContractTemplateSection[] = template?.sections
    ? template.sections.map(s => ({ ...s })).sort((a, b) => a.order - b.order)
    : [];

  let variables: ContractTemplateVariable[] = template?.variables
    ? template.variables.map(v => ({ ...v }))
    : [];

  // Preview sample values — seeded from variable defaults
  let previewValues: Record<string, string> = {};
  $: {
    const next: Record<string, string> = {};
    for (const v of variables) {
      next[v.key] = previewValues[v.key] ?? v.default ?? '';
    }
    previewValues = next;
  }

  // Built-in tokens always available in preview
  const builtinPreview: Record<string, string> = {
    org_name: 'Archimedes Society',
    party_a_name: 'Archimedes Society',
    party_b_name: 'Jane Contractor',
    contractor_name: 'Jane Contractor',
    contractor_email: 'jane@example.com',
  };

  function substitutePreview(text: string): string {
    const merged = { ...builtinPreview, ...previewValues };
    return text.replace(/\{\{(\w+)\}\}/g, (_m, key) => merged[key] ?? `{{${key}}}`);
  }

  $: previewDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const templateTypes = [
    { value: 'contractor', label: 'Contractor Agreement' },
    { value: 'task_assignment', label: 'Task Assignment' },
    { value: 'project_pm', label: 'Project PM' },
  ];

  // ── Section helpers ──
  function addSection() {
    sections = [...sections, { title: '', body: '', order: sections.length + 1 }];
  }

  function removeSection(i: number) {
    sections = sections.filter((_, idx) => idx !== i);
    reorderSections();
  }

  function moveSection(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const arr = [...sections];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    sections = arr;
    reorderSections();
  }

  function reorderSections() {
    sections = sections.map((s, idx) => ({ ...s, order: idx + 1 }));
  }

  // Insert {{variable}} token at cursor
  function insertToken(sectionIdx: number, key: string) {
    const textarea = document.getElementById(`section-body-${sectionIdx}`) as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const token = `{{${key}}}`;
    sections[sectionIdx].body =
      sections[sectionIdx].body.slice(0, start) + token + sections[sectionIdx].body.slice(end);
    sections = sections; // trigger reactivity
    // Restore cursor
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
      textarea.focus();
    });
  }

  // ── Variable helpers ──
  function addVariable() {
    variables = [...variables, { key: '', label: '', required: false, default: null }];
  }

  function removeVariable(i: number) {
    variables = variables.filter((_, idx) => idx !== i);
  }

  // ── Save ──
  async function handleSave() {
    if (!name.trim()) { toasts.error('Template name is required.'); return; }
    if (sections.length === 0) { toasts.error('Add at least one section.'); return; }
    for (const v of variables) {
      if (!v.key.trim()) { toasts.error('All variables must have a key.'); return; }
      if (!/^\w+$/.test(v.key.trim())) {
        toasts.error(`Variable key "${v.key}" must be alphanumeric/underscore only.`);
        return;
      }
    }

    saving = true;
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      template_type: templateType,
      sections: sections.map((s, i) => ({ ...s, order: i + 1 })),
      variables,
      is_default: isDefault,
    };

    let result: ContractTemplate | null;
    if (template?.id) {
      result = await contractTemplatesApi.update(template.id, payload);
    } else {
      result = await contractTemplatesApi.create(orgId, payload);
    }

    saving = false;
    if (!result) { toasts.error('Failed to save template.'); return; }

    // If marked as default, set it (clears old default)
    if (isDefault) {
      await contractTemplatesApi.setDefault(result.id, orgId, templateType);
    }

    dispatch('save', result);
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-4">
    <div class="flex-1">
      <h2 class="text-xl font-bold text-slate-900 dark:text-white">
        {template ? 'Edit Template' : 'New Contract Template'}
      </h2>
    </div>

    <!-- Tab switcher -->
    <div class="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
      <button
        on:click={() => activeTab = 'editor'}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
          {activeTab === 'editor' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}"
      >
        <Edit2 size={14} />
        Editor
      </button>
      <button
        on:click={() => activeTab = 'preview'}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
          {activeTab === 'preview' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}"
      >
        <Eye size={14} />
        Preview
      </button>
    </div>

    <button on:click={() => dispatch('cancel')} class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
      <X size={20} />
    </button>
  </div>

  {#if activeTab === 'editor'}
  <!-- Basic info -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
    <h3 class="font-medium text-slate-900 dark:text-white">Basic Info</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name <span class="text-red-500">*</span></label>
        <input
          bind:value={name}
          type="text"
          placeholder="e.g. Standard Contractor Agreement"
          class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
        <select
          bind:value={templateType}
          class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          {#each templateTypes as t}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
      </div>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
      <input
        bind:value={description}
        type="text"
        placeholder="Optional description"
        class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
      />
    </div>
    <label class="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" bind:checked={isDefault} class="w-4 h-4 text-indigo-600 rounded" />
      <span class="text-sm text-slate-700 dark:text-slate-300">Set as default for this template type</span>
    </label>
  </div>

  <!-- Variables -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-medium text-slate-900 dark:text-white">Variables</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Use <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">&#123;&#123;key&#125;&#125;</code> in section bodies to insert values.</p>
      </div>
      <button
        on:click={addVariable}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
      >
        <Plus size={14} />
        Add Variable
      </button>
    </div>

    {#if variables.length === 0}
      <p class="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No variables defined. Sections can still use built-in tokens like <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">&#123;&#123;org_name&#125;&#125;</code>, <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">&#123;&#123;party_b_name&#125;&#125;</code>.</p>
    {:else}
      <div class="space-y-3">
        {#each variables as variable, i (i)}
          <div class="grid grid-cols-12 gap-2 items-center">
            <div class="col-span-3">
              <input
                bind:value={variable.key}
                type="text"
                placeholder="key_name"
                class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div class="col-span-3">
              <input
                bind:value={variable.label}
                type="text"
                placeholder="Display label"
                class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div class="col-span-3">
              <input
                bind:value={variable.default}
                type="text"
                placeholder="Default (optional)"
                class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div class="col-span-2 flex items-center gap-2">
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" bind:checked={variable.required} class="w-3.5 h-3.5 text-indigo-600 rounded" />
                <span class="text-xs text-slate-600 dark:text-slate-400">Required</span>
              </label>
            </div>
            <div class="col-span-1 flex justify-end">
              <button
                on:click={() => removeVariable(i)}
                class="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Sections -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-medium text-slate-900 dark:text-white">Sections</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Each section becomes a numbered clause in the PDF.</p>
      </div>
      <button
        on:click={addSection}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
      >
        <Plus size={14} />
        Add Section
      </button>
    </div>

    {#if sections.length === 0}
      <p class="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No sections yet. Add at least one section.</p>
    {:else}
      <div class="space-y-4">
        {#each sections as section, i (i)}
          <div class="border border-slate-200 dark:border-slate-600 rounded-lg p-4 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <input
                bind:value={section.title}
                type="text"
                placeholder="Section title"
                class="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div class="flex items-center gap-1">
                <button
                  on:click={() => moveSection(i, -1)}
                  disabled={i === 0}
                  class="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 transition-colors"
                ><ArrowUp size={14} /></button>
                <button
                  on:click={() => moveSection(i, 1)}
                  disabled={i === sections.length - 1}
                  class="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 transition-colors"
                ><ArrowDown size={14} /></button>
                <button
                  on:click={() => removeSection(i)}
                  class="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                ><Trash2 size={14} /></button>
              </div>
            </div>

            <textarea
              id="section-body-{i}"
              bind:value={section.body}
              rows={5}
              placeholder="Section body. Use &#123;&#123;variable_key&#125;&#125; for variable substitution."
              class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
            ></textarea>

            {#if variables.length > 0}
              <div class="flex flex-wrap gap-1.5">
                <span class="text-xs text-slate-400 dark:text-slate-500 self-center">Insert:</span>
                {#each variables as v}
                  {#if v.key.trim()}
                    <button
                      on:click={() => insertToken(i, v.key.trim())}
                      class="px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded font-mono hover:bg-indigo-200 dark:hover:bg-indigo-800/40 transition-colors"
                    >&#123;&#123;{v.key.trim()}&#125;&#125;</button>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {:else}
  <!-- ── Preview Tab ── -->
  <div class="space-y-4">
    <!-- Variable inputs -->
    {#if variables.length > 0}
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 class="font-medium text-slate-900 dark:text-white mb-3 text-sm">Sample Variable Values</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each variables as v}
            {#if v.key.trim()}
              <div>
                <label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  {v.label || v.key}
                  {#if v.required}<span class="text-red-400 ml-0.5">*</span>{/if}
                </label>
                <input
                  bind:value={previewValues[v.key]}
                  type="text"
                  placeholder={v.default ?? `{{${v.key}}}`}
                  class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            {/if}
          {/each}
        </div>
        <p class="mt-3 text-xs text-slate-400 dark:text-slate-500">Built-in tokens (org_name, party_b_name, etc.) are filled with sample values automatically.</p>
      </div>
    {/if}

    <!-- Document preview -->
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Document Preview</span>
        <span class="text-xs text-slate-400 dark:text-slate-500">Updates live as you type</span>
      </div>

      <!-- Simulated A4 document -->
      <div class="p-6 bg-slate-50 dark:bg-slate-900/50">
        <div class="max-w-2xl mx-auto bg-white dark:bg-slate-800 shadow-sm rounded border border-slate-200 dark:border-slate-700">
          <!-- PDF header band -->
          <div class="bg-indigo-600 rounded-t px-8 py-6 text-white">
            <p class="text-xs uppercase tracking-widest opacity-70 mb-1">{builtinPreview.org_name}</p>
            <h1 class="text-xl font-bold">{name || 'Untitled Template'}</h1>
            <p class="text-indigo-200 text-sm mt-1">{previewDate}</p>
          </div>

          <!-- Parties block -->
          <div class="px-8 py-5 border-b border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-6 text-sm">
            <div>
              <p class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Party A</p>
              <p class="font-semibold text-slate-900 dark:text-white">{builtinPreview.org_name}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Party B</p>
              <p class="font-semibold text-slate-900 dark:text-white">{builtinPreview.party_b_name}</p>
              <p class="text-slate-500 dark:text-slate-400">{builtinPreview.contractor_email}</p>
            </div>
          </div>

          <!-- Sections -->
          <div class="px-8 py-6 space-y-6">
            {#if sections.length === 0}
              <p class="text-slate-400 dark:text-slate-500 text-sm text-center py-6 italic">No sections defined yet. Add sections in the Editor tab.</p>
            {:else}
              {#each sections as section, i}
                <div>
                  <h2 class="text-sm font-bold text-slate-900 dark:text-white mb-2">
                    {i + 1}. {substitutePreview(section.title || 'Untitled Section')}
                  </h2>
                  <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {substitutePreview(section.body || '')}
                  </p>
                  {#if !section.body}
                    <p class="text-xs text-slate-400 dark:text-slate-500 italic">(empty body)</p>
                  {/if}
                </div>
                {#if i < sections.length - 1}
                  <hr class="border-slate-100 dark:border-slate-700" />
                {/if}
              {/each}
            {/if}
          </div>

          <!-- Signatures block -->
          <div class="px-8 py-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 rounded-b">
            <div class="grid grid-cols-2 gap-8 text-sm">
              <div>
                <p class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Party A Signature</p>
                <div class="h-10 border-b-2 border-slate-300 dark:border-slate-600 mb-1"></div>
                <p class="text-slate-500 dark:text-slate-400">{builtinPreview.org_name}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Party B Signature</p>
                <div class="h-10 border-b-2 border-slate-300 dark:border-slate-600 mb-1"></div>
                <p class="text-slate-500 dark:text-slate-400">{builtinPreview.party_b_name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  {/if}

  <!-- Actions -->
  <div class="flex items-center justify-end gap-3">
    <button
      on:click={() => dispatch('cancel')}
      class="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
    >
      Cancel
    </button>
    <button
      on:click={handleSave}
      disabled={saving}
      class="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg font-medium text-sm transition-colors"
    >
      <Save size={16} />
      {saving ? 'Saving…' : 'Save Template'}
    </button>
  </div>
</div>
