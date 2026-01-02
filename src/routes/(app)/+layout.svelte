<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import {
    auth,
    user,
    organization,
    userOrganizations,
    isAuthenticated,
    capabilities
  } from '$lib/stores/auth';
  import NotificationDropdown from '$lib/components/common/NotificationDropdown.svelte';
  import OrganizationSwitcher from '$lib/components/common/OrganizationSwitcher.svelte';
  import Toast from '$lib/components/common/Toast.svelte';
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
    ChevronDown,
    AlertTriangle,
    Trophy,
    BarChart3,
    Users,
    User
  } from 'lucide-svelte';

  let sidebarOpen = true;
  let userMenuOpen = false;
  let loading = true;
  let loadError = '';
  let errorDetails = '';

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
      href: '/achievements',
      label: 'Achievements',
      icon: Trophy,
      show: true
    },
    {
      href: '/analytics',
      label: 'Analytics',
      icon: BarChart3,
      show: $user?.role === 'admin' || $user?.role === 'pm'
    },
    {
      href: '/admin',
      label: 'Admin',
      icon: Users,
      show: $user?.role === 'admin'
    },
    {
      href: '/profile',
      label: 'Profile',
      icon: User,
      show: true
    },
    {
      href: '/settings',
      label: 'Settings',
      icon: Settings,
      show: true
    }
  ].filter(item => item.show);

  onMount(() => {
    initializeApp();
  });

  async function initializeApp() {
    loading = true;
    loadError = '';
    errorDetails = '';

    try {
      // Auth is guaranteed to be initialized by the root layout
      const authState = get(auth);
      console.log('[Layout] Auth state:', { initialized: authState.initialized, hasSession: !!authState.session });

      if (!authState.session) {
        console.log('[Layout] No session, redirecting to login');
        goto('/auth/login', { replaceState: true });
        return;
      }

      // Load user data
      console.log('[Layout] Loading user data...');
      const loadedUser = await user.load();
      console.log('[Layout] User loaded:', loadedUser?.id);

      if (!loadedUser) {
        // User is authenticated but has no profile - redirect to complete registration
        console.log('[Layout] No user profile, redirecting to complete registration');
        goto('/auth/complete-registration', { replaceState: true });
        return;
      }

      // Load organization
      console.log('[Layout] Loading organization...');
      const loadedOrg = await organization.load();
      console.log('[Layout] Organization loaded:', loadedOrg?.id);

      if (!loadedOrg) {
        loadError = 'Organization not found';
        errorDetails = 'Could not load your organization data. Please contact support.';
        loading = false;
        return;
      }

      console.log('[Layout] Initialization complete');
      loading = false;

    } catch (err) {
      console.error('[Layout] Initialization error:', err);
      loadError = 'Failed to load application';
      errorDetails = err instanceof Error ? err.message : 'An unexpected error occurred';
      loading = false;
    }
  }

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
      <p class="text-xs text-slate-400">Initializing application</p>
    </div>
  </div>
{:else if loadError}
  <div class="min-h-screen flex items-center justify-center bg-slate-50 p-4">
    <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-8 max-w-md w-full">
      <div class="text-center">
        <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle class="text-red-600" size={32} />
        </div>
        <h2 class="text-xl font-semibold text-slate-900 mb-2">{loadError}</h2>
        <p class="text-slate-600 mb-4">{errorDetails}</p>
        
        <!-- Debug info -->
        <details class="text-left mb-6 bg-slate-50 rounded-lg p-3">
          <summary class="text-xs text-slate-500 cursor-pointer">Debug Information</summary>
          <pre class="text-xs text-slate-600 mt-2 overflow-auto max-h-32">User loaded: {$user ? 'Yes' : 'No'}
Org loaded: {$organization ? 'Yes' : 'No'}
Error: {errorDetails}</pre>
        </details>

        <div class="flex flex-col gap-3">
          <button
            on:click={initializeApp}
            class="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Try Again
          </button>
          <button
            on:click={handleSignOut}
            class="px-6 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Sign Out & Re-register
          </button>
        </div>
      </div>
    </div>
  </div>
{:else if $user}
  <div class="min-h-screen bg-slate-50">
    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col"
      class:translate-x-0={sidebarOpen}
      class:-translate-x-full={!sidebarOpen}
    >
      <!-- Logo -->
      <div class="flex items-center justify-between h-16 px-6 border-b border-slate-800 flex-shrink-0">
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

      <!-- Organization Switcher -->
      <div class="border-b border-slate-800 flex-shrink-0">
        <OrganizationSwitcher />
      </div>

      <!-- Navigation (scrollable) -->
      <nav class="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
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
      <div class="p-4 border-t border-slate-800 flex-shrink-0">
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
            <div class="flex items-center gap-2 mt-0.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getRoleBadgeColor($user.role)}">
                {$user.role}
              </span>
              {#if $user.training_level}
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                  Lv.{$user.training_level}
                </span>
              {/if}
            </div>
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
            <NotificationDropdown />

            <!-- User menu -->
            <div class="relative">
              <button
                class="flex items-center gap-2 p-2 hover:bg-slate-100 rounded-lg"
                on:click|stopPropagation={() => userMenuOpen = !userMenuOpen}
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
                    href="/profile"
                    class="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    on:click={() => userMenuOpen = false}
                  >
                    <User size={16} />
                    Profile
                  </a>
                  <a
                    href="/settings"
                    class="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    on:click={() => userMenuOpen = false}
                  >
                    <Settings size={16} />
                    Settings
                  </a>
                  <div class="border-t border-slate-100 my-1"></div>
                  <button
                    class="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    on:click={handleSignOut}
                  >
                    <LogOut size={16} />
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

<!-- Toast notifications -->
<Toast />

<!-- Click outside handlers -->
<svelte:window
  on:click={() => {
    if (userMenuOpen) {
      userMenuOpen = false;
    }
  }}
/>