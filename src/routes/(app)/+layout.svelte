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
    capabilities,
    currentOrgRole
  } from '$lib/stores/auth';
  import { featureFlags } from '$lib/stores/featureFlags';
  import { theme } from '$lib/stores/theme';
  import { storage } from '$lib/services/supabase';
  import NotificationDropdown from '$lib/components/common/NotificationDropdown.svelte';
  import OrganizationSwitcher from '$lib/components/common/OrganizationSwitcher.svelte';
  import Toast from '$lib/components/common/Toast.svelte';
  import GlobalSearch from '$lib/components/common/GlobalSearch.svelte';
  import OnboardingGuide from '$lib/components/common/OnboardingGuide.svelte';
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
    User,
    Moon,
    Sun,
    Bell,
    Search,
    Monitor,
    Palette
  } from 'lucide-svelte';
  import { THEMES, resolveTheme } from '$lib/stores/theme';
  import { initializeLocale } from '$lib/stores/locale';

  let sidebarOpen = false;
  let userMenuOpen = false;
  let loading = true;
  let loadError = '';
  let errorDetails = '';
  let showGlobalSearch = false;
  let showOnboarding = false;
  let showThemeMenu = false;

  // Redirect loop prevention
  const REDIRECT_KEY = 'orbit_auth_redirect_count';
  const MAX_REDIRECTS = 3;

  // Role display names and descriptions
  const ROLE_DISPLAY: Record<string, { label: string; description: string }> = {
    admin: { label: 'Admin', description: 'Organization Administrator' },
    sales: { label: 'Sales', description: 'Sales Representative' },
    pm: { label: 'Project Manager', description: 'Project Manager' },
    qc: { label: 'QC Reviewer', description: 'Quality Control' },
    employee: { label: 'Employee', description: 'Team Member' },
    contractor: { label: 'Contractor', description: 'External Contractor' }
  };

  function getRoleDisplay(role: string): { label: string; description: string } {
    return ROLE_DISPLAY[role] || { label: role, description: role };
  }

  // Current path segment for active nav detection
  $: currentPath = $page.url.pathname;

  // Navigation items - role-based access combined with feature flags
  $: navItems = buildNavItems($featureFlags, $currentOrgRole);

  function buildNavItems(flags: typeof $featureFlags, role: string) {
    const items: { href: string; label: string; icon: typeof LayoutDashboard }[] = [];

    items.push({ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard });

    if (flags.tasks && ['employee', 'contractor', 'pm', 'admin', 'qc'].includes(role)) {
      items.push({
        href: '/tasks',
        label: role === 'employee' || role === 'contractor' ? 'Pick Up Tasks' : 'Tasks',
        icon: CheckSquare
      });
    }

    if (flags.projects && ['pm', 'sales', 'admin'].includes(role)) {
      items.push({ href: '/projects', label: 'Projects', icon: FolderKanban });
    }

    if (flags.qc_reviews && ['qc', 'admin'].includes(role)) {
      items.push({ href: '/qc', label: 'QC Reviews', icon: Shield });
    }

    if (flags.contracts && ['pm', 'sales', 'admin'].includes(role)) {
      items.push({ href: '/contracts', label: 'Contracts', icon: FileText });
    }

    if (flags.payouts) {
      items.push({ href: '/payouts', label: 'My Payouts', icon: DollarSign });
    }

    if (flags.achievements && ['employee', 'contractor'].includes(role)) {
      items.push({ href: '/achievements', label: 'Achievements', icon: Trophy });
    }

    if (flags.leaderboard && ['employee', 'contractor'].includes(role)) {
      items.push({ href: '/leaderboard', label: 'Leaderboard', icon: Trophy });
    }

    if (flags.analytics && ['admin', 'pm'].includes(role)) {
      items.push({ href: '/analytics', label: 'Analytics', icon: BarChart3 });
    }

    if (role === 'admin') {
      items.push({ href: '/admin', label: 'Admin Panel', icon: Users });
    }

    if (flags.notifications_page) {
      items.push({ href: '/notifications', label: 'Notifications', icon: Bell });
    }

    items.push({ href: '/settings', label: 'Settings', icon: Settings });

    return items;
  }

  // Check if a nav item is active (exact match for dashboard, prefix match for others)
  function isActive(href: string, path: string): boolean {
    if (href === '/dashboard') return path === '/dashboard' || path === '/';
    return path === href || path.startsWith(href + '/');
  }

  function getNavClass(href: string, path: string): string {
    return isActive(href, path)
      ? 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-slate-800 text-white'
      : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors';
  }

  function handleNavClick() {
    // Close sidebar on mobile after navigation
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      sidebarOpen = false;
    }
  }

  onMount(() => {
    initializeApp();
  });

  function getRedirectCount(): number {
    try {
      return parseInt(sessionStorage.getItem(REDIRECT_KEY) || '0', 10);
    } catch {
      return 0;
    }
  }

  function incrementRedirectCount(): number {
    const count = getRedirectCount() + 1;
    try {
      sessionStorage.setItem(REDIRECT_KEY, count.toString());
    } catch {
      // Ignore storage errors
    }
    return count;
  }

  function clearRedirectCount(): void {
    try {
      sessionStorage.removeItem(REDIRECT_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  async function initializeApp() {
    loading = true;
    loadError = '';
    errorDetails = '';

    try {
      // Auth is guaranteed to be initialized by the root layout
      const authState = get(auth);

      if (!authState.session) {
        clearRedirectCount();
        goto('/auth/login', { replaceState: true });
        return;
      }

      // Load user data
      const loadedUser = await user.load();

      if (!loadedUser) {
        // Check for redirect loop
        const redirectCount = incrementRedirectCount();

        if (redirectCount >= MAX_REDIRECTS) {
          console.error('[Layout] Redirect loop detected! Stopping redirect and showing error.');
          clearRedirectCount();
          loadError = 'Authentication loop detected';
          errorDetails = 'There was a problem loading your profile. Please sign out and try again, or contact support if the issue persists.';
          loading = false;
          return;
        }

        // User is authenticated but has no profile - redirect to complete registration
        goto('/auth/complete-registration', { replaceState: true });
        return;
      }

      // User loaded successfully - clear redirect count
      clearRedirectCount();

      // Load organization
      const loadedOrg = await organization.load();

      if (!loadedOrg) {
        loadError = 'Organization not found';
        errorDetails = 'Could not load your organization data. Please try joining or creating an organization.';
        loading = false;
        return;
      }

      // Load user organization memberships (for org-specific roles)
      await userOrganizations.load();

      // Initialize locale (user pref → org default → browser → 'en')
      const orgLocale = (loadedOrg.settings as Record<string, unknown>)?.default_locale as string | null;
      initializeLocale(loadedUser.locale, orgLocale);

      loading = false;

      // Initialize native plugins (no-op on web)
      const loadedUserVal = get(user);
      if (loadedUserVal) {
        import('$lib/services/capacitor').then(({ initializePushNotifications, initializeDeepLinks }) => {
          initializePushNotifications(loadedUserVal.id);
          initializeDeepLinks();
        });
      }

      // Check if onboarding should be shown
      checkOnboarding();

    } catch (err) {
      console.error('[Layout] Initialization error:', err);
      loadError = 'Failed to load application';
      errorDetails = err instanceof Error ? err.message : 'An unexpected error occurred';
      loading = false;
    }
  }

  async function handleSignOut() {
    // Clear biometric tokens so next login requires password (then re-enroll)
    import('$lib/services/capacitor').then(({ clearBiometricSession }) => clearBiometricSession());
    await auth.signOut();
    user.clear();
    organization.clear();
    userOrganizations.clear();
    goto('/auth/login');
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Ctrl/Cmd+K for global search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      showGlobalSearch = !showGlobalSearch;
      return;
    }

    if (isInput) return;

    // 'g' prefix shortcuts for navigation
    if (e.key === 'g') {
      const handleNext = (ev: KeyboardEvent) => {
        window.removeEventListener('keydown', handleNext);
        switch (ev.key) {
          case 'd': goto('/dashboard'); ev.preventDefault(); break;
          case 't': goto('/tasks'); ev.preventDefault(); break;
          case 'p': goto('/projects'); ev.preventDefault(); break;
          case 's': goto('/settings'); ev.preventDefault(); break;
        }
      };
      window.addEventListener('keydown', handleNext, { once: true });
      setTimeout(() => window.removeEventListener('keydown', handleNext), 1000);
    }
  }

  function checkOnboarding() {
    if (!$user) return;
    try {
      const key = `orbit_onboarding_${$user.id}`;
      if (!localStorage.getItem(key)) {
        showOnboarding = true;
      }
    } catch {}
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
  <div class="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors">
    <div class="flex flex-col items-center gap-4">
      <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-slate-600 dark:text-slate-300 font-medium">Loading...</p>
      <p class="text-xs text-slate-400">Initializing application</p>
    </div>
  </div>
{:else if loadError}
  <div class="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 transition-colors">
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-8 max-w-md w-full">
      <div class="text-center">
        <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle class="text-red-600 dark:text-red-400" size={32} />
        </div>
        <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-2">{loadError}</h2>
        <p class="text-slate-600 dark:text-slate-300 mb-4">{errorDetails}</p>

        <!-- Debug info -->
        <details class="text-left mb-6 bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
          <summary class="text-xs text-slate-500 dark:text-slate-400 cursor-pointer">Debug Information</summary>
          <pre class="text-xs text-slate-600 dark:text-slate-400 mt-2 overflow-auto max-h-32">User loaded: {$user ? 'Yes' : 'No'}
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
            class="px-6 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Sign Out & Re-register
          </button>
        </div>
      </div>
    </div>
  </div>
{:else if $user}
  <div class="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col"
      class:translate-x-0={sidebarOpen}
      class:-translate-x-full={!sidebarOpen}
    >
      <!-- Logo -->
      <div class="flex items-center justify-between h-16 px-6 border-b border-slate-800 flex-shrink-0">
        <a href="/dashboard" on:click={handleNavClick} class="flex items-center gap-3">
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
        {#each navItems as item (item.href)}
          <a
            href={item.href}
            on:click={handleNavClick}
            class={getNavClass(item.href, currentPath)}
          >
            <svelte:component this={item.icon} size={18} />
            {item.label}
          </a>
        {/each}
      </nav>

      <!-- User section at bottom -->
      <div class="p-4 border-t border-slate-800 flex-shrink-0">
        <div class="flex items-center gap-3">
          {#if $user.metadata?.avatar_path}
            <img
              src={storage.getPublicUrl('avatars', String($user.metadata.avatar_path))}
              alt="Avatar"
              class="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          {:else}
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <span class="text-white font-semibold">
                {$user.full_name?.charAt(0) || $user.email.charAt(0).toUpperCase()}
              </span>
            </div>
          {/if}
          <div class="flex-1 min-w-0">
            <p class="text-white text-sm font-medium truncate">
              {$user.full_name || $user.email}
            </p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {getRoleBadgeColor($currentOrgRole)}">
                {getRoleDisplay($currentOrgRole).label}
              </span>
              {#if ($currentOrgRole === 'employee' || $currentOrgRole === 'contractor') && $user.training_level}
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

    <!-- Mobile sidebar overlay (only visible on mobile when sidebar is open) -->
    <button
      class="fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity"
      class:pointer-events-none={!sidebarOpen}
      class:opacity-0={!sidebarOpen}
      on:click={toggleSidebar}
      aria-label="Close sidebar"
      tabindex={sidebarOpen ? 0 : -1}
    />

    <!-- Main content -->
    <div class="lg:pl-64">
      <!-- Top bar -->
      <header class="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 transition-colors">
        <div class="flex items-center justify-between h-16 px-4 lg:px-8">
          <!-- Mobile menu button -->
          <button
            class="lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            on:click={toggleSidebar}
          >
            <Menu size={20} />
          </button>

          <!-- Global search -->
          <button
            on:click={() => showGlobalSearch = true}
            class="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <Search size={14} />
            <span>Search...</span>
            <kbd class="hidden md:inline px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono">
              {navigator?.platform?.includes('Mac') ? '⌘' : 'Ctrl'}K
            </kbd>
          </button>

          <div class="flex-1" />

          <!-- Right side actions -->
          <div class="flex items-center gap-2">
            <!-- Theme selector -->
            <div class="relative">
              <button
                on:click|stopPropagation={() => showThemeMenu = !showThemeMenu}
                class="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Change theme"
              >
                {#if resolveTheme($theme) === 'dracula'}
                  <Moon size={20} />
                {:else}
                  <Sun size={20} />
                {/if}
              </button>

              {#if showThemeMenu}
                <div class="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl py-2 z-50 animate-fade-in">
                  <div class="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Theme
                  </div>
                  {#each THEMES as t}
                    <button
                      class="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors
                        {$theme === t.name
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}"
                      on:click|stopPropagation={() => { theme.setTheme(t.name); showThemeMenu = false; }}
                    >
                      <span class="w-8 h-8 flex items-center justify-center rounded-lg
                        {$theme === t.name ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'bg-slate-100 dark:bg-slate-700'}">
                        {#if t.icon === 'sun'}
                          <Sun size={16} />
                        {:else if t.icon === 'moon'}
                          <Moon size={16} />
                        {:else}
                          <Monitor size={16} />
                        {/if}
                      </span>
                      <div>
                        <div class="font-medium">{t.label}</div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">{t.description}</div>
                      </div>
                      {#if $theme === t.name}
                        <span class="ml-auto w-2 h-2 rounded-full bg-indigo-500" />
                      {/if}
                    </button>
                  {/each}
                  <div class="border-t border-slate-200 dark:border-slate-700 mt-2 pt-2 px-3 py-2">
                    <p class="text-xs text-slate-400 dark:text-slate-500">More themes coming soon</p>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Notifications -->
            <NotificationDropdown />

            <!-- User menu -->
            <div class="relative">
              <button
                class="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                on:click|stopPropagation={() => userMenuOpen = !userMenuOpen}
              >
                {#if $user.metadata?.avatar_path}
                    <img
                      src={storage.getPublicUrl('avatars', String($user.metadata.avatar_path))}
                      alt="Avatar"
                      class="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                  {:else}
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <span class="text-white text-sm font-semibold">
                        {$user.full_name?.charAt(0) || $user.email.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  {/if}
                <ChevronDown size={16} class="text-slate-400" />
              </button>

              {#if userMenuOpen}
                <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1">
                  <a
                    href="/profile"
                    class="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                    on:click={() => userMenuOpen = false}
                  >
                    <User size={16} />
                    Profile
                  </a>
                  <a
                    href="/settings"
                    class="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                    on:click={() => userMenuOpen = false}
                  >
                    <Settings size={16} />
                    Settings
                  </a>
                  <div class="border-t border-slate-100 dark:border-slate-700 my-1"></div>
                  <button
                    class="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
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
      <main class="p-4 lg:p-8 bg-slate-50 dark:bg-slate-900 min-h-screen transition-colors">
        <slot />
      </main>
    </div>
  </div>
{/if}

<!-- Toast notifications -->
<Toast />

<!-- Global Search -->
<GlobalSearch bind:show={showGlobalSearch} />

<!-- Onboarding Guide -->
<OnboardingGuide bind:show={showOnboarding} />

<!-- Global handlers -->
<svelte:window
  on:keydown={handleGlobalKeydown}
  on:click={() => {
    if (userMenuOpen) userMenuOpen = false;
    if (showThemeMenu) showThemeMenu = false;
  }}
/>