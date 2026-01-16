<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, capabilities, currentOrgRole } from '$lib/stores/auth';
  import { usersApi, organizationsApi } from '$lib/services/api';
  import type { User, Organization } from '$lib/types';
  import {
    Users,
    Settings,
    Shield,
    Activity,
    TrendingUp,
    DollarSign,
    FileText,
    AlertTriangle,
    ChevronRight
  } from 'lucide-svelte';

  let stats = {
    totalUsers: 0,
    activeUsers: 0,
    totalProjects: 0,
    totalTasks: 0,
    pendingPayouts: 0,
    monthlySpend: 0
  };
  let recentUsers: User[] = [];
  let org: Organization | null = null;
  let loading = true;

  onMount(async () => {
    // Redirect non-admins (using org-specific role)
    if ($currentOrgRole !== 'admin') {
      goto('/dashboard');
      return;
    }

    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const [users, organization] = await Promise.all([
        usersApi.list(),
        organizationsApi.getCurrent()
      ]);

      recentUsers = users.slice(0, 5);
      org = organization;

      stats = {
        totalUsers: users.length,
        activeUsers: users.filter(u => u.level > 0).length,
        totalProjects: 0, // Would come from projects API
        totalTasks: 0, // Would come from tasks API
        pendingPayouts: 0,
        monthlySpend: 0
      };
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      loading = false;
    }
  }

  const adminSections = [
    {
      title: 'User Management',
      description: 'Manage users, roles, and permissions',
      href: '/admin/users',
      icon: Users,
      color: 'bg-blue-500'
    },
    {
      title: 'Organization Settings',
      description: 'Configure payout rates and org preferences',
      href: '/admin/settings',
      icon: Settings,
      color: 'bg-purple-500'
    },
    {
      title: 'Audit Log',
      description: 'View system activity and changes',
      href: '/admin/audit',
      icon: Activity,
      color: 'bg-amber-500'
    }
  ];
</script>

<svelte:head>
  <title>Admin Panel - Orbit</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Admin Panel</h1>
    <p class="mt-1 text-slate-600 dark:text-slate-300">Manage your organization and users</p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- Stats Overview -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <Users class="text-blue-600 dark:text-blue-400" size={20} />
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Users</p>
            <p class="text-xl font-bold text-slate-900 dark:text-white">{stats.totalUsers}</p>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
            <TrendingUp class="text-green-600 dark:text-green-400" size={20} />
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Users</p>
            <p class="text-xl font-bold text-slate-900 dark:text-white">{stats.activeUsers}</p>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
            <FileText class="text-purple-600 dark:text-purple-400" size={20} />
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Projects</p>
            <p class="text-xl font-bold text-slate-900 dark:text-white">{stats.totalProjects}</p>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
            <DollarSign class="text-amber-600 dark:text-amber-400" size={20} />
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending Payouts</p>
            <p class="text-xl font-bold text-slate-900 dark:text-white">${stats.pendingPayouts}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Admin Sections -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {#each adminSections as section}
        <a
          href={section.href}
          class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 transition-all group"
        >
          <div class="flex items-start justify-between">
            <div class="w-12 h-12 {section.color} rounded-lg flex items-center justify-center">
              <svelte:component this={section.icon} class="text-white" size={24} />
            </div>
            <ChevronRight class="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" size={20} />
          </div>
          <h3 class="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{section.title}</h3>
          <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{section.description}</p>
        </a>
      {/each}
    </div>

    <!-- Organization Info -->
    {#if org}
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Organization Settings</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Default R Value</p>
            <p class="text-lg font-semibold text-slate-900 dark:text-white">{org.default_r}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">QC Beta</p>
            <p class="text-lg font-semibold text-slate-900 dark:text-white">{org.qc_beta}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">QC Gamma</p>
            <p class="text-lg font-semibold text-slate-900 dark:text-white">{org.qc_gamma}</p>
          </div>
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">PM Profit Share (X)</p>
            <p class="text-lg font-semibold text-slate-900 dark:text-white">{org.pm_x}</p>
          </div>
        </div>
        <a
          href="/admin/settings"
          class="mt-4 inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
        >
          Edit Settings
          <ChevronRight size={16} />
        </a>
      </div>
    {/if}

    <!-- Recent Users -->
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Recent Users</h2>
        <a href="/admin/users" class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-sm font-medium">
          View all
        </a>
      </div>
      <div class="divide-y divide-slate-100 dark:divide-slate-700">
        {#each recentUsers as user}
          <div class="p-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                <span class="text-sm font-medium text-white">
                  {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p class="font-medium text-slate-900 dark:text-white">{user.full_name || user.email}</p>
                <p class="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
              </div>
            </div>
            <div class="text-right">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 capitalize">
                {user.role}
              </span>
              <p class="text-xs text-slate-400 mt-1">Level {user.level}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
