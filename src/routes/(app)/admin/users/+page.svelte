<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user } from '$lib/stores/auth';
  import { usersApi } from '$lib/services/api';
  import { InviteConfirmationModal } from '$lib/components/admin';
  import type { User, UserRole, UserInvitation } from '$lib/types';
  import {
    Search,
    Plus,
    Edit3,
    Trash2,
    Mail,
    Shield,
    UserPlus,
    Filter,
    ChevronDown,
    X,
    Check,
    AlertTriangle,
    Clock,
    Copy,
    XCircle
  } from 'lucide-svelte';

  let users: User[] = [];
  let filteredUsers: User[] = [];
  let invitations: UserInvitation[] = [];
  let loading = true;
  let loadingInvitations = true;
  let searchQuery = '';
  let roleFilter: UserRole | '' = '';

  // Modal states
  let showInviteModal = false;
  let showEditModal = false;
  let showConfirmationModal = false;
  let selectedUser: User | null = null;
  let lastInvitation: UserInvitation | null = null;

  // Invite form
  let inviteEmail = '';
  let inviteRole: UserRole = 'employee';
  let inviting = false;
  let inviteError = '';

  // Edit form
  let editForm = {
    full_name: '',
    role: 'employee' as UserRole,
    level: 1,
    training_level: 1,
    base_salary: 0
  };
  let saving = false;

  const roles: UserRole[] = ['admin', 'sales', 'pm', 'qc', 'employee', 'contractor'];

  onMount(async () => {
    if ($user?.role !== 'admin') {
      goto('/dashboard');
      return;
    }
    await Promise.all([loadUsers(), loadInvitations()]);
  });

  async function loadUsers() {
    loading = true;
    try {
      users = await usersApi.list();
      applyFilters();
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      loading = false;
    }
  }

  async function loadInvitations() {
    loadingInvitations = true;
    try {
      invitations = await usersApi.listInvitations();
    } catch (error) {
      console.error('Failed to load invitations:', error);
    } finally {
      loadingInvitations = false;
    }
  }

  function applyFilters() {
    filteredUsers = users.filter(u => {
      const matchesSearch = searchQuery === '' ||
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === '' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }

  $: {
    searchQuery;
    roleFilter;
    applyFilters();
  }

  function openEditModal(u: User) {
    selectedUser = u;
    editForm = {
      full_name: u.full_name || '',
      role: u.role,
      level: u.level,
      training_level: u.training_level,
      base_salary: u.base_salary || 0
    };
    showEditModal = true;
  }

  async function saveUser() {
    if (!selectedUser) return;

    saving = true;
    try {
      await usersApi.update(selectedUser.id, editForm);
      await loadUsers();
      showEditModal = false;
      selectedUser = null;
    } catch (error) {
      console.error('Failed to update user:', error);
    } finally {
      saving = false;
    }
  }

  async function inviteUser() {
    if (!inviteEmail) return;

    inviting = true;
    inviteError = '';
    try {
      const invitation = await usersApi.invite(inviteEmail, inviteRole);
      if (invitation) {
        lastInvitation = invitation;
        showInviteModal = false;
        showConfirmationModal = true;
        inviteEmail = '';
        inviteRole = 'employee';
        await loadInvitations();
      } else {
        inviteError = 'Failed to create invitation. Please try again.';
      }
    } catch (error) {
      inviteError = error instanceof Error ? error.message : 'Failed to send invite';
    } finally {
      inviting = false;
    }
  }

  async function cancelInvitation(inviteId: string) {
    try {
      await usersApi.cancelInvitation(inviteId);
      await loadInvitations();
    } catch (error) {
      console.error('Failed to cancel invitation:', error);
    }
  }

  function handleSendAnother() {
    showConfirmationModal = false;
    showInviteModal = true;
    lastInvitation = null;
  }

  function handleConfirmationClose() {
    showConfirmationModal = false;
    lastInvitation = null;
  }

  function getRoleBadgeColor(role: UserRole | string): string {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-700',
      sales: 'bg-green-100 text-green-700',
      pm: 'bg-blue-100 text-blue-700',
      qc: 'bg-purple-100 text-purple-700',
      employee: 'bg-slate-100 text-slate-700',
      contractor: 'bg-amber-100 text-amber-700'
    };
    return colors[role] || 'bg-slate-100 text-slate-700';
  }

  function getStatusBadgeColor(status: string): string {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      accepted: 'bg-green-100 text-green-700',
      expired: 'bg-slate-100 text-slate-500',
      cancelled: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function isExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
  }

  async function copyInviteCode(token: string) {
    try {
      await navigator.clipboard.writeText(token);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  $: pendingInvitations = invitations.filter(i => i.status === 'pending' && !isExpired(i.expires_at));
  $: pastInvitations = invitations.filter(i => i.status !== 'pending' || isExpired(i.expires_at));
</script>

<svelte:head>
  <title>User Management - Orbit Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">User Management</h1>
      <p class="mt-1 text-slate-600">Manage users, roles, and permissions</p>
    </div>

    <button
      on:click={() => showInviteModal = true}
      class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
    >
      <UserPlus size={18} />
      Invite User
    </button>
  </div>

  <!-- Pending Invitations -->
  {#if pendingInvitations.length > 0}
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-6">
      <div class="flex items-center gap-2 mb-4">
        <Clock size={20} class="text-amber-600" />
        <h2 class="text-lg font-semibold text-amber-900">Pending Invitations</h2>
        <span class="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-medium rounded-full">
          {pendingInvitations.length}
        </span>
      </div>
      <div class="space-y-3">
        {#each pendingInvitations as invite}
          <div class="flex items-center justify-between bg-white rounded-lg p-4 border border-amber-100">
            <div class="flex items-center gap-4">
              <div>
                <p class="font-medium text-slate-900">{invite.email}</p>
                <div class="flex items-center gap-2 mt-1">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getRoleBadgeColor(invite.role)}">
                    {invite.role}
                  </span>
                  <span class="text-xs text-slate-500">
                    Expires {formatDate(invite.expires_at)}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5">
                <span class="font-mono font-bold text-slate-900">{invite.token}</span>
                <button
                  on:click={() => copyInviteCode(invite.token)}
                  class="text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Copy code"
                >
                  <Copy size={14} />
                </button>
              </div>
              <button
                on:click={() => cancelInvitation(invite.id)}
                class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Cancel invitation"
              >
                <XCircle size={18} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Filters -->
  <div class="flex flex-col sm:flex-row gap-4">
    <div class="relative flex-1">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search users..."
        class="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
    </div>

    <div class="relative">
      <select
        bind:value={roleFilter}
        class="appearance-none pl-4 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
      >
        <option value="">All Roles</option>
        {#each roles as role}
          <option value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
        {/each}
      </select>
      <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
    </div>
  </div>

  <!-- Users Table -->
  <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if filteredUsers.length === 0}
      <div class="text-center py-12">
        <Shield class="mx-auto text-slate-300 mb-3" size={48} />
        <p class="text-slate-500">No users found</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Role</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Level</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Base Salary</th>
              <th class="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">R Value</th>
              <th class="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each filteredUsers as u}
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                      <span class="text-sm font-medium text-white">
                        {u.full_name?.charAt(0) || u.email.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p class="font-medium text-slate-900">{u.full_name || 'No name'}</p>
                      <p class="text-sm text-slate-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize {getRoleBadgeColor(u.role)}">
                    {u.role}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <span class="text-slate-900">{u.level}</span>
                    <span class="text-xs text-slate-400">(Train: {u.training_level})</span>
                  </div>
                </td>
                <td class="px-6 py-4 text-slate-900">
                  {u.base_salary ? `$${u.base_salary.toLocaleString()}` : '-'}
                </td>
                <td class="px-6 py-4 text-slate-900">
                  {u.r ?? '-'}
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      on:click={() => openEditModal(u)}
                      class="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit user"
                    >
                      <Edit3 size={16} />
                    </button>
                    <a
                      href="mailto:{u.email}"
                      class="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Email user"
                    >
                      <Mail size={16} />
                    </a>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- Past Invitations (collapsed by default) -->
  {#if pastInvitations.length > 0}
    <details class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <summary class="px-6 py-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-medium text-slate-900">Past Invitations</span>
          <span class="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
            {pastInvitations.length}
          </span>
        </div>
        <ChevronDown size={18} class="text-slate-400" />
      </summary>
      <div class="px-6 pb-4 border-t border-slate-100">
        <div class="space-y-2 mt-4">
          {#each pastInvitations as invite}
            <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
              <div class="flex items-center gap-3">
                <span class="text-sm text-slate-900">{invite.email}</span>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getRoleBadgeColor(invite.role)}">
                  {invite.role}
                </span>
              </div>
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getStatusBadgeColor(isExpired(invite.expires_at) ? 'expired' : invite.status)}">
                {isExpired(invite.expires_at) ? 'expired' : invite.status}
              </span>
            </div>
          {/each}
        </div>
      </div>
    </details>
  {/if}
</div>

<!-- Invite Modal -->
{#if showInviteModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button class="absolute inset-0 bg-black/50" on:click={() => showInviteModal = false}></button>

    <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-slate-900">Invite User</h2>
        <button on:click={() => showInviteModal = false} class="text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
      </div>

      {#if inviteError}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertTriangle size={16} />
          {inviteError}
        </div>
      {/if}

      <form on:submit|preventDefault={inviteUser} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="invite-email">
            Email Address
          </label>
          <input
            id="invite-email"
            type="email"
            bind:value={inviteEmail}
            placeholder="user@example.com"
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="invite-role">
            Role
          </label>
          <select
            id="invite-role"
            bind:value={inviteRole}
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {#each roles as role}
              <option value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
            {/each}
          </select>
        </div>

        <div class="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
          <p>An invite code will be generated. Share it with the user so they can join your organization during registration.</p>
        </div>

        <div class="flex justify-end gap-3 pt-4">
          <button
            type="button"
            on:click={() => showInviteModal = false}
            class="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={inviting || !inviteEmail}
            class="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {#if inviting}
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {:else}
              <UserPlus size={16} />
            {/if}
            Create Invitation
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Invite Confirmation Modal -->
{#if lastInvitation}
  <InviteConfirmationModal
    invitation={lastInvitation}
    open={showConfirmationModal}
    on:close={handleConfirmationClose}
    on:sendAnother={handleSendAnother}
  />
{/if}

<!-- Edit Modal -->
{#if showEditModal && selectedUser}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button class="absolute inset-0 bg-black/50" on:click={() => showEditModal = false}></button>

    <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-slate-900">Edit User</h2>
        <button on:click={() => showEditModal = false} class="text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
      </div>

      <form on:submit|preventDefault={saveUser} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="edit-name">
            Full Name
          </label>
          <input
            id="edit-name"
            type="text"
            bind:value={editForm.full_name}
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="edit-role">
            Role
          </label>
          <select
            id="edit-role"
            bind:value={editForm.role}
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {#each roles as role}
              <option value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
            {/each}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1" for="edit-level">
              Level
            </label>
            <input
              id="edit-level"
              type="number"
              bind:value={editForm.level}
              min="1"
              max="10"
              class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1" for="edit-training">
              Training Level
            </label>
            <input
              id="edit-training"
              type="number"
              bind:value={editForm.training_level}
              min="1"
              max="10"
              class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1" for="edit-salary">
            Base Salary (Annual)
          </label>
          <input
            id="edit-salary"
            type="number"
            bind:value={editForm.base_salary}
            min="0"
            step="1000"
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div class="flex justify-end gap-3 pt-4">
          <button
            type="button"
            on:click={() => showEditModal = false}
            class="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            class="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {#if saving}
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {:else}
              <Check size={16} />
            {/if}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
