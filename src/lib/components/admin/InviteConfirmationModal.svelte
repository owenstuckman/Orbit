<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Copy, Check, Mail, UserPlus, Clock } from 'lucide-svelte';
  import type { UserInvitation } from '$lib/types';

  export let invitation: UserInvitation;
  export let open = false;

  const dispatch = createEventDispatcher<{ close: void; sendAnother: void }>();

  let copied = false;

  function close() {
    dispatch('close');
  }

  function sendAnother() {
    dispatch('sendAnother');
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(invitation.token);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function getRoleBadgeColor(role: string): string {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      sales: 'bg-green-100 text-green-800',
      pm: 'bg-blue-100 text-blue-800',
      qc: 'bg-orange-100 text-orange-800',
      employee: 'bg-gray-100 text-gray-800',
      contractor: 'bg-yellow-100 text-yellow-800'
    };
    return colors[role] || colors.employee;
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <!-- Backdrop -->
    <button
      class="fixed inset-0 bg-black/50 transition-opacity"
      on:click={close}
      aria-label="Close modal"
    />

    <!-- Modal -->
    <div class="flex min-h-full items-center justify-center p-4">
      <div
        class="relative w-full max-w-md bg-white rounded-xl shadow-xl transform transition-all"
        on:click|stopPropagation
        role="dialog"
        aria-modal="true"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div class="flex items-center gap-2">
            <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check class="text-green-600" size={20} />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-slate-900">Invitation Sent!</h2>
              <p class="text-sm text-slate-500">Share the invite code below</p>
            </div>
          </div>
          <button
            on:click={close}
            class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <!-- Content -->
        <div class="p-6 space-y-6">
          <!-- Invite Code -->
          <div class="bg-slate-50 rounded-xl p-6 text-center">
            <p class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Invite Code</p>
            <div class="flex items-center justify-center gap-3">
              <span class="text-4xl font-mono font-bold text-slate-900 tracking-widest">
                {invitation.token}
              </span>
              <button
                on:click={copyToClipboard}
                class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Copy to clipboard"
              >
                {#if copied}
                  <Check size={20} class="text-green-600" />
                {:else}
                  <Copy size={20} />
                {/if}
              </button>
            </div>
            {#if copied}
              <p class="text-sm text-green-600 mt-2">Copied to clipboard!</p>
            {/if}
          </div>

          <!-- Invitation Details -->
          <div class="space-y-4">
            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Mail size={18} class="text-slate-400" />
              <div>
                <p class="text-xs text-slate-500">Email</p>
                <p class="text-sm font-medium text-slate-900">{invitation.email}</p>
              </div>
            </div>

            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <UserPlus size={18} class="text-slate-400" />
              <div>
                <p class="text-xs text-slate-500">Role</p>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getRoleBadgeColor(invitation.role)}">
                  {invitation.role}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Clock size={18} class="text-slate-400" />
              <div>
                <p class="text-xs text-slate-500">Expires</p>
                <p class="text-sm font-medium text-slate-900">{formatDate(invitation.expires_at)}</p>
              </div>
            </div>
          </div>

          <!-- Instructions -->
          <div class="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
            <p class="text-sm text-indigo-800">
              Share this code with <strong>{invitation.email}</strong>. They can use it during registration to join your organization.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            on:click={sendAnother}
            class="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-white transition-colors"
          >
            Send Another
          </button>
          <button
            on:click={close}
            class="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
