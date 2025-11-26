<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { 
    auth, 
    user, 
    organization, 
    isAuthenticated, 
    capabilities 
  } from '$lib/stores/auth';
  import { 
    LayoutDashboard, 
    CheckSquare, 
    FolderKanban, 
    Shield, 
    FileText, 
    DollarSign, 
    Settings, 
    LogOut,
    Menu,
    X,
    Bell,
    ChevronDown
  } from 'lucide-svelte';

  let sidebarOpen = true;
  let userMenuOpen = false;
  let notificationsOpen = false;
  let loading = true;
  let loadError = '';
  let loadAttempted = false;

  // Navigation items based on role
  $: navItems = [
    { 
      href: '/dashboard', 
      label: 'Dashboard', 
      icon: LayoutDashboard, 
      show: true 
    },
    { 
      href: '/tasks', 
      label: 'Tasks', 
      icon: CheckSquare, 
      show: $capabilities.canViewTasks || $capabilities.canAcceptTasks 
    },
    { 
      href: '/projects', 
      label: 'Projects', 
      icon: FolderKanban, 
      show: $capabilities.canManageProjects || $capabilities.canCreateProjects 
    },
    { 
      href: '/qc', 
      label: 'Quality Control', 
      icon: Shield, 
      show: $capabilities.canReviewQC 
    },
    { 
      href: '/contracts', 
      label: 'Contracts', 
      icon: FileText, 
      show: $capabilities.canSignContracts 
    },
    { 
      href: '/payouts', 
      label: 'Payouts', 
      icon: DollarSign, 
      show: true 
    },
    { 
      href: '/settings', 
      label: 'Settings', 
      icon: Settings, 
      show: true 
    }
  ].filter(item => item.show);

  onMount(async () => {
    // Initialize auth if not already done
    let authState = await new Promise<{ initialized: boolean; session: unknown | null }>((resolve) => {
      const unsub = auth.subscribe(state => {
        if (state.initialized) {
          unsub();
          resolve(state);
        }
      });
    });

    // If no session, redirect to login
    if (!authState.session) {
      goto('/auth/login');
      return;
    }

    // Only attempt to load user data once
    if (!loadAttempted) {
      loadAttempted = true;
      try {
        const loadedUser = await user.load();
        if (loadedUser) {
          await organization.load();
        } else {
          // User authenticated but no user record exists
          loadError = 'User profile not found. Please contact support or re-register.';
        }
      } catch (err) {
        console.error('Failed to load user data:', err);
        loadError = 'Failed to load user data. Please try logging in again.';
      }
    }

    loading = false;

    // Listen for auth state changes (logout, etc.)
    const unsubscribe = auth.subscribe((state) => {
      if (state.initialized && !state.session) {
        goto('/auth/login');
      }
    });

    return unsubscribe;
  });

  async function handleSignOut() {
    await auth.signOut();
    user.clear();
    organization.clear();
    goto('/auth/login');
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
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

<svelte:head>
  <title>Orbit - {$page.url.pathname.split('/')[1] || 'Dashboard'}</title>
</svelte:head>

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <div class="flex flex-col items-center gap-4">
      <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-slate-600 font-medium">Loading...</p>
    </div>
  </div>
{:else if loadError}
  <div class="min-h-screen flex items-center justify-center bg-slate-50 p-4">
    <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-8 max-w-md text-center">
      <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <X class="text-red-600" size={32} />
      </div>
      <h2 class="text-xl font-semibold text-slate-900 mb-2">Unable to Load</h2>
      <p class="text-slate-600 mb-6">{loadError}</p>
      <div class="flex flex-col gap-3">
        <button
          on:click={() => window.location.reload()}
          class="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Try Again
        </button>
        <button
          on:click={handleSignOut}
          class="px-6 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  </div>
{:else if $isAuthenticated && $user}
  <div class="min-h-screen bg-slate-50">
    <!-- Sidebar -->
    <aside 
      class="fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0"
      class:translate-x-0={sidebarOpen}
      class:-translate-x-full={!sidebarOpen}
    >
      <!-- Logo -->
      <div class="flex items-center justify-between h-16 px-6 border-b border-slate-800">
        <a href="/dashboard" class="flex items-center gap-3">
          <div class="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-lg">O</span>
          </div>
          <span class="text-white font-semibold text-xl tracking-tight">Orbit</span>
        </a>
        <button 
          class="lg:hidden text-slate-400 hover:text-white"
          on:click={toggleSidebar}
        >
          <X size={20} />
        </button>
      </div>

      <!-- Organization -->
      {#if $organization}
        <div class="px-6 py-4 border-b border-slate-800">
          <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Organization</p>
          <p class="text-white font-medium truncate">{$organization.name}</p>
        </div>
      {/if}

      <!-- Navigation -->
      <nav class="px-3 py-4 space-y-1">
        {#each navItems as item}
          <a
            href={item.href}
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            class:bg-slate-800={$page.url.pathname.startsWith(item.href)}
            class:text-white={$page.url.pathname.startsWith(item.href)}
            class:text-slate-400={!$page.url.pathname.startsWith(item.href)}
            class:hover:bg-slate-800={!$page.url.pathname.startsWith(item.href)}
            class:hover:text-white={!$page.url.pathname.startsWith(item.href)}
          >
            <svelte:component this={item.icon} size={18} />
            {item.label}
          </a>
        {/each}
      </nav>

      <!-- User section at bottom -->
      <div class="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span class="text-white font-semibold">
              {$user.full_name?.charAt(0) || $user.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-white text-sm font-medium truncate">
              {$user.full_name || $user.email}
            </p>
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getRoleBadgeColor($user.role)}">
              {$user.role}
            </span>
          </div>
          <button
            on:click={handleSignOut}
            class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>

    <!-- Mobile sidebar overlay -->
    {#if sidebarOpen}
      <button
        class="fixed inset-0 z-40 bg-black/50 lg:hidden"
        on:click={toggleSidebar}
        aria-label="Close sidebar"
      />
    {/if}

    <!-- Main content -->
    <div class="lg:pl-64">
      <!-- Top bar -->
      <header class="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div class="flex items-center justify-between h-16 px-4 lg:px-8">
          <!-- Mobile menu button -->
          <button
            class="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            on:click={toggleSidebar}
          >
            <Menu size={20} />
          </button>

          <!-- Page title (optional, can be set by child pages) -->
          <div class="flex-1" />

          <!-- Right side actions -->
          <div class="flex items-center gap-2">
            <!-- Notifications -->
            <div class="relative">
              <button
                class="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg relative"
                on:click={() => notificationsOpen = !notificationsOpen}
              >
                <Bell size={20} />
                <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              
              {#if notificationsOpen}
                <div class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-slate-200 py-2">
                  <div class="px-4 py-2 border-b border-slate-100">
                    <h3 class="font-semibold text-slate-900">Notifications</h3>
                  </div>
                  <div class="max-h-64 overflow-y-auto">
                    <p class="px-4 py-8 text-center text-slate-500 text-sm">
                      No new notifications
                    </p>
                  </div>
                </div>
              {/if}
            </div>

            <!-- User menu -->
            <div class="relative">
              <button
                class="flex items-center gap-2 p-2 hover:bg-slate-100 rounded-lg"
                on:click={() => userMenuOpen = !userMenuOpen}
              >
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <span class="text-white text-sm font-semibold">
                    {$user.full_name?.charAt(0) || $user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <ChevronDown size={16} class="text-slate-400" />
              </button>

              {#if userMenuOpen}
                <div class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1">
                  <a
                    href="/settings"
                    class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    on:click={() => userMenuOpen = false}
                  >
                    Settings
                  </a>
                  <button
                    class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    on:click={handleSignOut}
                  >
                    Sign out
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="p-4 lg:p-8">
        <slot />
      </main>
    </div>
  </div>
{/if}

<!-- Click outside handlers -->
<svelte:window 
  on:click={(e) => {
    if (userMenuOpen || notificationsOpen) {
      userMenuOpen = false;
      notificationsOpen = false;
    }
  }}
/>
