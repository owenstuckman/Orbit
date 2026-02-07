# Store API Reference

Svelte stores in `$lib/stores/` manage reactive application state. Each store follows a consistent pattern: a custom writable store created via a factory function, with derived stores for computed views.

All stores are located in `src/lib/stores/`.

---

## Table of Contents

1. [auth.ts](#authts) - Authentication, user profile, organization, role capabilities
2. [tasks.ts](#tasksts) - Task list, filtering, real-time updates, Kanban views
3. [projects.ts](#projectsts) - Project list, budget tracking, PM assignment
4. [notifications.ts](#notificationsts) - Persistent notifications, toasts
5. [gamification.ts](#gamificationts) - XP, levels, badges, leaderboard
6. [featureFlags.ts](#featureflagsts) - Organization feature toggles
7. [artifacts.ts](#artifactsts) - Task submission artifacts and file uploads
8. [theme.ts](#themets) - Light/dark mode theme management

---

## auth.ts

Import: `import { auth, user, organization, userOrganizations, currentOrgRole, capabilities, isAuthenticated, isLoading } from '$lib/stores/auth';`

### `auth` Store

**Type**: Custom store wrapping `AuthState`

```typescript
interface AuthState {
  initialized: boolean;
  session: unknown | null;
  loading: boolean;
}
```

**Initial value**: `{ initialized: false, session: null, loading: true }`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `initialize()` | none | `Promise<void>` | Initializes auth state from Supabase session. Sets up listener for auth state changes (sign in, sign out, token refresh). Should be called once on app startup. |
| `setLoading(loading)` | `loading: boolean` | `void` | Manually sets the loading state. |
| `signOut()` | none | `Promise<void>` | Signs out the user via Supabase Auth and resets state to `{ initialized: true, session: null, loading: false }`. |

**Usage:**

```svelte
<script>
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  onMount(() => {
    auth.initialize();
  });

  $: if ($isAuthenticated) {
    // User is logged in
  }
</script>
```

---

### `user` Store

**Type**: Custom store wrapping `User | null`

**Initial value**: `null`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load()` | none | `Promise<User \| null>` | Loads the current user's profile from the database via `usersApi.getCurrent()`. Called after successful authentication. |
| `set(value)` | `value: User \| null` | `void` | Directly sets the user value. |
| `update(fn)` | `fn: (user: User \| null) => User \| null` | `void` | Updates user via an updater function. |
| `updateR(newR)` | `newR: number` | `Promise<void>` | Updates the user's salary/task ratio (Salary Mixer feature). Typical range: 0.5-0.9. Calls `usersApi.updateSalaryMix()` and updates the store on success. |
| `clear()` | none | `void` | Sets the store to `null` (e.g., on sign out). |

**Usage:**

```svelte
<script>
  import { user } from '$lib/stores/auth';

  $: userName = $user?.full_name || 'Guest';
  $: userRole = $user?.role || 'unknown';
</script>

<p>Welcome, {userName} ({userRole})</p>
```

---

### `organization` Store

**Type**: Custom store wrapping `Organization | null`

**Initial value**: `null`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load()` | none | `Promise<Organization \| null>` | Loads the current user's active organization via `organizationsApi.getCurrent()`. |
| `set(value)` | `value: Organization \| null` | `void` | Directly sets the organization value. |
| `clear()` | none | `void` | Sets the store to `null`. |

**Usage:**

```svelte
<script>
  import { organization } from '$lib/stores/auth';

  $: orgName = $organization?.name || 'No organization';
  $: orgSettings = $organization?.settings;
</script>
```

---

### `userOrganizations` Store

**Type**: Custom store wrapping `UserOrgMembership[]`

```typescript
interface UserOrgMembership {
  id: string;
  user_id: string;
  org_id: string;
  role: UserRole;
  is_primary: boolean;
  // ... organization details
}
```

**Initial value**: `[]`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load()` | none | `Promise<UserOrgMembership[]>` | Loads all organization memberships for the current user via `usersApi.listUserOrganizations()`. |
| `set(value)` | `value: UserOrgMembership[]` | `void` | Directly sets the memberships. |
| `clear()` | none | `void` | Sets the store to `[]`. |
| `switchOrg(orgId)` | `orgId: string` | `Promise<boolean>` | Switches to a different organization. Updates user's active `org_id` and reloads `user`, `organization`, and `userOrganizations` stores in sequence to ensure role and permissions are current. Returns `true` if successful. |

**Usage:**

```svelte
<script>
  import { userOrganizations } from '$lib/stores/auth';

  async function handleOrgSwitch(orgId: string) {
    const success = await userOrganizations.switchOrg(orgId);
    if (success) {
      // Navigate to dashboard
    }
  }
</script>

{#each $userOrganizations as membership}
  <button on:click={() => handleOrgSwitch(membership.org_id)}>
    {membership.org_id} - {membership.role}
  </button>
{/each}
```

---

### Derived Stores

#### `currentOrgRole`

- **Derives from**: `user`, `userOrganizations`
- **Type**: `string`
- **Returns**: The user's role in their current organization. Finds the membership matching `$user.org_id` from `$userOrganizations`. Falls back to `$user.role` or `'employee'` if no membership is found.

#### `capabilities`

- **Derives from**: `user`, `currentOrgRole`
- **Type**: `RoleCapabilities`
- **Returns**: A role-based capability object for the current user. Looks up permissions from the internal `ROLE_CAPABILITIES` matrix using `$currentOrgRole`. Returns a fully restricted default if the user is not authenticated.

```typescript
interface RoleCapabilities {
  canViewTasks: boolean;
  canCreateTasks: boolean;
  canAssignTasks: boolean;
  canAcceptTasks: boolean;
  canReviewQC: boolean;
  canViewPayouts: 'all' | 'team' | 'self';
  canCreateProjects: boolean;
  canManageProjects: boolean;
  canViewContracts: 'all' | 'team' | 'own';
  canSignContracts: boolean;
  canAccessSettings: 'org' | 'own';
}
```

**Supported roles**: `admin`, `sales`, `pm`, `qc`, `employee`, `contractor`

#### `isAuthenticated`

- **Derives from**: `auth`
- **Type**: `boolean`
- **Returns**: `true` when a valid session exists (`!!$auth.session`).

#### `isLoading`

- **Derives from**: `auth`, `user`
- **Type**: `boolean`
- **Returns**: `true` when auth is loading OR when a session exists but the user profile has not yet loaded.

**Derived Stores Usage:**

```svelte
<script>
  import { isAuthenticated, isLoading, capabilities, currentOrgRole } from '$lib/stores/auth';
</script>

{#if $isLoading}
  <Spinner />
{:else if $isAuthenticated}
  <p>Role: {$currentOrgRole}</p>
  {#if $capabilities.canCreateTasks}
    <button>Create Task</button>
  {/if}
{:else}
  <LoginForm />
{/if}
```

---

## tasks.ts

Import: `import { tasks, tasksByStatus, tasksPendingReview, taskCounts, currentTask } from '$lib/stores/tasks';`

### `tasks` Store

**Type**: Custom store wrapping `TasksState`

```typescript
interface TasksState {
  items: Task[];
  loading: boolean;
  error: string | null;
  filter: TaskFilter;
}

interface TaskFilter {
  status?: TaskStatus[];
  projectId?: string;
  assigneeId?: string;
  search?: string;
}
```

**Initial value**: `{ items: [], loading: false, error: null, filter: {} }`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load(filter?)` | `filter?: TaskFilter` | `Promise<void>` | Loads tasks with optional filtering by status, projectId, and/or assigneeId. Replaces current items. |
| `loadByProject(projectId)` | `projectId: string` | `Promise<void>` | Convenience wrapper for `load({ projectId })`. |
| `loadByAssignee(userId)` | `userId: string` | `Promise<void>` | Convenience wrapper for `load({ assigneeId: userId })`. |
| `loadAvailable(userLevel)` | `userLevel: number` | `Promise<void>` | Loads open tasks available for the given user level. Used for the task board showing tasks a user can accept. |
| `subscribeToProject(projectId)` | `projectId: string` | `void` | Subscribes to real-time updates for a project's tasks via Supabase Realtime. Handles INSERT, UPDATE, and DELETE events. Cleans up any previous subscription. |
| `unsubscribe()` | none | `void` | Cleans up the active real-time subscription. |
| `accept(taskId, userId)` | `taskId: string, userId: string` | `Promise<Task \| null>` | Accepts a task for a user. Updates the store optimistically on success. |
| `submit(taskId, data, files?)` | `taskId: string, data: Record<string, unknown>, files?: string[]` | `Promise<Task \| null>` | Submits completed work for a task. Triggers AI QC review automatically. |
| `create(task)` | `task: Partial<Task>` | `Promise<Task \| null>` | Creates a new task and appends it to the store. |
| `updateTask(taskId, updates)` | `taskId: string, updates: Partial<Task>` | `Promise<Task \| null>` | Updates a task's fields and reflects the change in the store. |
| `clear()` | none | `void` | Clears store state, sets items to `[]`, and unsubscribes from real-time. |

**Usage:**

```svelte
<script>
  import { tasks } from '$lib/stores/tasks';
  import { onMount, onDestroy } from 'svelte';

  export let projectId: string;

  onMount(() => {
    tasks.load({ projectId });
    tasks.subscribeToProject(projectId);
  });

  onDestroy(() => tasks.unsubscribe());

  async function handleAccept(taskId: string, userId: string) {
    await tasks.accept(taskId, userId);
  }
</script>

{#if $tasks.loading}
  <Spinner />
{:else if $tasks.error}
  <p class="text-red-500">{$tasks.error}</p>
{:else}
  {#each $tasks.items as task}
    <TaskCard {task} />
  {/each}
{/if}
```

---

### `currentTask` Store

**Type**: Custom store wrapping `CurrentTaskState`

```typescript
interface CurrentTaskState {
  task: Task | null;
  loading: boolean;
  error: string | null;
}
```

**Initial value**: `{ task: null, loading: false, error: null }`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load(taskId)` | `taskId: string` | `Promise<void>` | Loads a single task by ID via `tasksApi.getById()`. |
| `update(updates)` | `updates: Partial<Task>` | `void` | Locally merges partial updates into the current task (does not persist to DB). |
| `clear()` | none | `void` | Resets to `{ task: null, loading: false, error: null }`. |

**Usage:**

```svelte
<script>
  import { currentTask } from '$lib/stores/tasks';
  import { onMount } from 'svelte';

  export let taskId: string;

  onMount(() => currentTask.load(taskId));
</script>

{#if $currentTask.task}
  <h1>{$currentTask.task.title}</h1>
{/if}
```

---

### Derived Stores

#### `tasksByStatus`

- **Derives from**: `tasks`
- **Type**: `Record<TaskStatus, Task[]>`
- **Returns**: Tasks grouped by status. Returns a record with all 8 possible statuses as keys: `open`, `assigned`, `in_progress`, `completed`, `under_review`, `approved`, `rejected`, `paid`. Empty arrays for statuses with no matching tasks.

#### `tasksPendingReview`

- **Derives from**: `tasks`
- **Type**: `Task[]`
- **Returns**: Tasks with status `'completed'` or `'under_review'`, used for the QC review queue.

#### `taskCounts`

- **Derives from**: `tasksByStatus`
- **Type**: `Record<TaskStatus, number>`
- **Returns**: Count of tasks per status. Useful for badges and summary displays.

**Derived Stores Usage:**

```svelte
<script>
  import { tasksByStatus, tasksPendingReview, taskCounts } from '$lib/stores/tasks';
</script>

<!-- Kanban columns -->
{#each Object.entries($tasksByStatus) as [status, items]}
  <KanbanColumn {status} tasks={items} count={$taskCounts[status]} />
{/each}

<!-- QC review badge -->
<Badge count={$tasksPendingReview.length} label="Pending Review" />
```

---

## projects.ts

Import: `import { projects, projectsByStatus, projectsWithBudgetWarning, projectsInOverdraft, currentProject } from '$lib/stores/projects';`

### `projects` Store

**Type**: Custom store wrapping `ProjectsState`

```typescript
interface ProjectsState {
  items: Project[];
  loading: boolean;
  error: string | null;
}
```

**Initial value**: `{ items: [], loading: false, error: null }`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load(filters?)` | `filters?: { status?: ProjectStatus[]; pmId?: string; salesId?: string }` | `Promise<void>` | Loads projects with optional filtering by status array, PM ID, and/or sales rep ID. |
| `loadPendingForPM()` | none | `Promise<void>` | Convenience wrapper for `load({ status: ['pending_pm'] })`. Loads projects waiting for PM assignment. |
| `loadByPM(pmId)` | `pmId: string` | `Promise<void>` | Convenience wrapper for `load({ pmId })`. |
| `loadBySales(salesId)` | `salesId: string` | `Promise<void>` | Convenience wrapper for `load({ salesId })`. |
| `subscribeToChanges()` | none | `void` | Subscribes to real-time project updates for all org projects. Handles INSERT, UPDATE, and DELETE events. Cleans up any previous subscription. |
| `unsubscribe()` | none | `void` | Cleans up the active real-time subscription. |
| `create(project)` | `project: Partial<Project>` | `Promise<Project \| null>` | Creates a new project and appends to store. |
| `assignPM(projectId, pmId)` | `projectId: string, pmId: string` | `Promise<Project \| null>` | Assigns a PM to a project (PM pickup workflow). Sets project to active status. |
| `updateProject(projectId, updates)` | `projectId: string, updates: Partial<Project>` | `Promise<Project \| null>` | Updates project fields and reflects in store. |
| `clear()` | none | `void` | Clears store state, sets items to `[]`, and unsubscribes from real-time. |

**Usage:**

```svelte
<script>
  import { projects } from '$lib/stores/projects';
  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    projects.load({ status: ['active'] });
    projects.subscribeToChanges();
  });

  onDestroy(() => projects.unsubscribe());
</script>

{#each $projects.items as project}
  <ProjectCard {project} />
{/each}
```

---

### `currentProject` Store

**Type**: Custom store wrapping `CurrentProjectState`

```typescript
interface CurrentProjectState {
  project: Project | null;
  loading: boolean;
  error: string | null;
}
```

**Initial value**: `{ project: null, loading: false, error: null }`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load(projectId)` | `projectId: string` | `Promise<void>` | Loads a single project by ID via `projectsApi.getById()`. |
| `update(updates)` | `updates: Partial<Project>` | `void` | Locally merges partial updates into the current project (does not persist to DB). |
| `clear()` | none | `void` | Resets to `{ project: null, loading: false, error: null }`. |

---

### Derived Stores

#### `projectsByStatus`

- **Derives from**: `projects`
- **Type**: `Record<ProjectStatus, Project[]>`
- **Returns**: Projects grouped by status. Returns a record with all 5 possible statuses as keys: `draft`, `pending_pm`, `active`, `completed`, `cancelled`. Empty arrays for statuses with no matching projects.

#### `projectsWithBudgetWarning`

- **Derives from**: `projects`
- **Type**: `Project[]`
- **Returns**: Projects where `spent / total_value >= 0.8` (80% or more of budget spent). Excludes projects with `total_value === 0`. Used for PM dashboard alerts.

#### `projectsInOverdraft`

- **Derives from**: `projects`
- **Type**: `Project[]`
- **Returns**: Projects where `spent > total_value` (budget exceeded). Triggers overdraft penalty calculations.

**Derived Stores Usage:**

```svelte
<script>
  import { projectsByStatus, projectsWithBudgetWarning, projectsInOverdraft } from '$lib/stores/projects';
</script>

{#if $projectsWithBudgetWarning.length > 0}
  <BudgetWarningBanner count={$projectsWithBudgetWarning.length} />
{/if}

{#if $projectsInOverdraft.length > 0}
  <OverdraftAlert projects={$projectsInOverdraft} />
{/if}

<!-- Active projects -->
{#each $projectsByStatus.active as project}
  <ProjectRow {project} />
{/each}
```

---

## notifications.ts

Import: `import { notifications, unreadCount, unreadNotifications, recentNotifications, toasts } from '$lib/stores/notifications';`

### Exported Types

```typescript
interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

type NotificationType =
  | 'task_assigned'
  | 'task_completed'
  | 'qc_review'
  | 'qc_approved'
  | 'qc_rejected'
  | 'payout_ready'
  | 'project_assigned'
  | 'contract_signed'
  | 'achievement_earned'
  | 'level_up'
  | 'system';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number; // ms, default 5000
}
```

### `notifications` Store

**Type**: Custom store wrapping `NotificationsState`

```typescript
interface NotificationsState {
  items: Notification[];
  loading: boolean;
  error: string | null;
}
```

**Initial value**: `{ items: [], loading: false, error: null }`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load(userId)` | `userId: string` | `Promise<void>` | Loads the last 50 notifications for the user, ordered by `created_at` descending. Queries Supabase directly. |
| `subscribeToUpdates(userId)` | `userId: string` | `void` | Subscribes to real-time INSERT events on the `notifications` table filtered by `user_id`. New notifications are prepended to the list. Cleans up any previous subscription. |
| `markAsRead(notificationId)` | `notificationId: string` | `Promise<void>` | Marks a single notification as read in the database and updates local state. |
| `markAllAsRead(userId)` | `userId: string` | `Promise<void>` | Marks all unread notifications as read for the user in the database and updates all local items. |
| `delete(notificationId)` | `notificationId: string` | `Promise<void>` | Deletes a notification from the database and removes it from local state. |
| `addLocal(notification)` | `notification: Omit<Notification, 'id' \| 'created_at'>` | `void` | Adds a local-only notification for immediate feedback. Generates a `local-{timestamp}` ID and sets `created_at` to now. Prepended to the list. |
| `unsubscribe()` | none | `void` | Cleans up the active real-time subscription. |
| `clear()` | none | `void` | Unsubscribes and resets to initial state. |

**Usage:**

```svelte
<script>
  import { notifications, unreadCount } from '$lib/stores/notifications';
  import { user } from '$lib/stores/auth';
  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    if ($user) {
      notifications.load($user.id);
      notifications.subscribeToUpdates($user.id);
    }
  });

  onDestroy(() => notifications.unsubscribe());

  async function handleMarkAllRead() {
    if ($user) await notifications.markAllAsRead($user.id);
  }
</script>

<NotificationBell count={$unreadCount} />

{#each $notifications.items as notification}
  <NotificationItem
    {notification}
    on:read={() => notifications.markAsRead(notification.id)}
    on:delete={() => notifications.delete(notification.id)}
  />
{/each}
```

---

### `toasts` Store

**Type**: Custom store wrapping `Toast[]`

**Initial value**: `[]`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `add(toast)` | `toast: Omit<Toast, 'id'>` | `string` | Adds a toast notification. Auto-removes after `duration` ms (default 5000). Returns the generated toast ID. |
| `remove(id)` | `id: string` | `void` | Manually removes a toast by ID. |
| `success(message, duration?)` | `message: string, duration?: number` | `string` | Convenience: adds a `'success'` type toast. |
| `error(message, duration?)` | `message: string, duration?: number` | `string` | Convenience: adds an `'error'` type toast. |
| `warning(message, duration?)` | `message: string, duration?: number` | `string` | Convenience: adds a `'warning'` type toast. |
| `info(message, duration?)` | `message: string, duration?: number` | `string` | Convenience: adds an `'info'` type toast. |

**Usage:**

```svelte
<script>
  import { toasts } from '$lib/stores/notifications';

  function handleSave() {
    try {
      // ... save logic
      toasts.success('Changes saved successfully!');
    } catch {
      toasts.error('Failed to save changes.', 8000);
    }
  }
</script>

<!-- Toast container (typically in layout) -->
{#each $toasts as toast}
  <Toast {toast} on:dismiss={() => toasts.remove(toast.id)} />
{/each}
```

---

### Derived Stores

#### `unreadCount`

- **Derives from**: `notifications`
- **Type**: `number`
- **Returns**: Count of notifications where `read === false`.

#### `unreadNotifications`

- **Derives from**: `notifications`
- **Type**: `Notification[]`
- **Returns**: Array of notification items where `read === false`.

#### `recentNotifications`

- **Derives from**: `notifications`
- **Type**: `Notification[]`
- **Returns**: The first 5 notifications from the items list (most recent, since items are ordered by `created_at` descending).

---

## gamification.ts

Import: `import { gamification, userLevel, userXp, earnedBadgesCount, calculateLevel, xpForLevel, xpToNextLevel, BADGE_DEFINITIONS } from '$lib/stores/gamification';`

### Exported Types

```typescript
interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  category: string;
  requirement_type: string;
  requirement_value: number;
  xp_reward: number;
}

interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
  badge?: Badge;
}

interface UserProgress {
  user_id: string;
  xp: number;
  level: number;
  tasks_completed: number;
  current_streak: number;
  longest_streak: number;
  first_pass_approvals: number;
  total_earnings: number;
}

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  xp: number;
  level: number;
  tasks_completed: number;
  badges_count: number;
}
```

### Exported Constants

#### `BADGE_DEFINITIONS`

**Type**: `Badge[]`

A constant array of 20 badge definitions across 5 categories:

| Category | Badges | Tiers |
|----------|--------|-------|
| **Tasks** | First Task (1), Task Novice (10), Task Expert (50), Task Master (100), Task Legend (500) | bronze, bronze, silver, gold, platinum |
| **Quality** | Quality Start (1), Quality Pro (25), Perfectionist (100) | bronze, silver, gold |
| **Streaks** | Streak Starter (3d), Streak Keeper (7d), Streak Warrior (30d), Streak Champion (100d) | bronze, bronze, silver, gold |
| **Levels** | Rising Star (5), Seasoned Pro (10), Elite Member (25), Legendary (50) | bronze, silver, gold, platinum |
| **Earnings** | First Payout ($1), $1K Club, $10K Club, $100K Club | bronze, silver, gold, platinum |

### Exported Functions

#### `calculateLevel(xp)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `xp` | `number` | Total XP accumulated |

**Returns**: `number` - Current level (minimum 1).

Uses quadratic formula: XP for level `n` = `50 * n * (n - 1)`. Level thresholds: 1=0, 2=100, 3=300, 4=600, 5=1000, ...

#### `xpForLevel(level)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `level` | `number` | Target level |

**Returns**: `number` - Total XP needed to reach that level. Formula: `50 * level * (level - 1)`.

#### `xpToNextLevel(currentXp)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `currentXp` | `number` | User's current total XP |

**Returns**: `{ current: number; needed: number; progress: number }` - Object with XP earned within current level, XP needed for next level, and percentage progress (0-100).

### `gamification` Store

**Type**: Custom store wrapping `GamificationState`

```typescript
interface GamificationState {
  userProgress: UserProgress | null;
  earnedBadges: UserBadge[];
  loading: boolean;
  error: string | null;
}
```

**Initial value**: `{ userProgress: null, earnedBadges: [], loading: false, error: null }`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `load(userId)` | `userId: string` | `Promise<UserProgress \| null>` | Loads user progress from `users` table metadata and earned badges from `user_badges` table. Constructs a `UserProgress` object from the user's metadata fields. |
| `awardXp(userId, amount, reason)` | `userId: string, amount: number, reason: string` | `Promise<{ leveledUp: boolean; newLevel: number; xpGained: number } \| null>` | Awards XP to a user, recalculates their level, persists to database, and updates local state. Returns level-up information or `null` on error. |
| `checkAndAwardBadges(userId)` | `userId: string` | `Promise<Badge[]>` | Checks all badge definitions against user progress and awards any newly earned badges. Also awards XP for each badge earned. Reloads the store if any badges were awarded. Returns array of newly earned badges. |
| `getBadgesWithProgress(earnedBadges, progress)` | `earnedBadges: UserBadge[], progress: UserProgress \| null` | `Array<Badge & { earned: boolean; earned_at?: string; progress: number; requirement: number }>` | Non-async utility that maps all badge definitions with earned status and current progress. Useful for displaying badge grids with progress bars. |
| `clear()` | none | `void` | Resets to initial state. |

**Usage:**

```svelte
<script>
  import { gamification, userLevel, xpToNextLevel } from '$lib/stores/gamification';
  import { user } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  onMount(() => {
    if ($user) gamification.load($user.id);
  });

  $: progress = xpToNextLevel($gamification.userProgress?.xp || 0);
  $: badges = gamification.getBadgesWithProgress(
    $gamification.earnedBadges,
    $gamification.userProgress
  );
</script>

<p>Level {$userLevel}</p>
<ProgressBar value={progress.progress} label="{progress.current}/{progress.needed} XP" />

{#each badges as badge}
  <BadgeCard {badge} />
{/each}
```

---

### Derived Stores

#### `userLevel`

- **Derives from**: `gamification`
- **Type**: `number`
- **Returns**: `$gamification.userProgress?.level || 1`

#### `userXp`

- **Derives from**: `gamification`
- **Type**: `number`
- **Returns**: `$gamification.userProgress?.xp || 0`

#### `earnedBadgesCount`

- **Derives from**: `gamification`
- **Type**: `number`
- **Returns**: `$gamification.earnedBadges.length`

---

## featureFlags.ts

Import: `import { featureFlags, features, isFeatureEnabled } from '$lib/stores/featureFlags';`

### `featureFlags` Store (Derived)

- **Derives from**: `organization` (from `auth.ts`)
- **Type**: `FeatureFlags`
- **Returns**: The resolved feature flags for the current organization. Merges the organization's saved `settings.feature_flags` with `DEFAULT_FEATURE_FLAGS` so that any missing flags get their default values. Returns `DEFAULT_FEATURE_FLAGS` if no organization is loaded.

```typescript
interface FeatureFlags {
  tasks: boolean;
  projects: boolean;
  qc_reviews: boolean;
  contracts: boolean;
  payouts: boolean;
  achievements: boolean;
  leaderboard: boolean;
  analytics: boolean;
  notifications_page: boolean;
  external_assignments: boolean;
  salary_mixer: boolean;
  file_uploads: boolean;
  realtime_updates: boolean;
  story_points: boolean;
  urgency_multipliers: boolean;
  ai_qc_review: boolean;
  multi_org: boolean;
}
```

**Usage:**

```svelte
<script>
  import { featureFlags } from '$lib/stores/featureFlags';

  $: if ($featureFlags.salary_mixer) {
    // Show salary mixer UI
  }
</script>
```

---

### `features` Object

**Type**: Object of 17 individual derived stores, each of type `Readable<boolean>`

A convenience object that provides a derived store for each individual feature flag. Each store derives from `featureFlags` and returns the boolean value for that specific flag.

**Available feature stores:**

| Store Key | Feature |
|-----------|---------|
| `features.tasks` | Task board and management |
| `features.projects` | Project management |
| `features.qc_reviews` | Quality control workflow |
| `features.contracts` | Contract generation/e-signatures |
| `features.payouts` | Payout tracking |
| `features.achievements` | Badges and achievement tracking |
| `features.leaderboard` | User rankings |
| `features.analytics` | Organization-wide analytics dashboard |
| `features.notifications_page` | Dedicated notifications page |
| `features.external_assignments` | Assign tasks to external contractors |
| `features.salary_mixer` | Employee-configurable salary/task ratio |
| `features.file_uploads` | File attachments for submissions |
| `features.realtime_updates` | WebSocket-based live updates |
| `features.story_points` | Story point estimation |
| `features.urgency_multipliers` | Time-based reward modifiers |
| `features.ai_qc_review` | AI-powered QC scoring |
| `features.multi_org` | Multiple organization support |

**Usage:**

```svelte
<script>
  import { features } from '$lib/stores/featureFlags';
</script>

{#if $features.achievements}
  <AchievementsBadge />
{/if}

{#if $features.salary_mixer}
  <SalaryMixerSlider />
{/if}
```

---

### Exported Functions

#### `isFeatureEnabled(flag)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `flag` | `FeatureFlag` | The feature flag key to check |

**Returns**: `boolean` - Whether the feature is enabled.

Non-reactive helper for use in script logic (not templates). Uses `get(featureFlags)` to read the current value synchronously. Falls back to `DEFAULT_FEATURE_FLAGS` if the flag is not set.

**Usage:**

```typescript
import { isFeatureEnabled } from '$lib/stores/featureFlags';

function handleSubmit() {
  if (isFeatureEnabled('file_uploads')) {
    // Upload files
  }
}
```

---

## artifacts.ts

Import: `import { artifactStore, fileArtifacts, githubPRArtifacts, urlArtifacts, artifactCount, hasArtifacts } from '$lib/stores/artifacts';`

### `artifactStore` Store

**Type**: Custom store wrapping `ArtifactStoreState`

```typescript
interface ArtifactStoreState {
  artifacts: Artifact[];
  notes: string;
  isDraft: boolean;
  saving: boolean;
  uploading: boolean;
  error: string | null;
  lastSaved: string | null;
  taskId: string | null;
}
```

Where `Artifact` is a union type:

```typescript
type Artifact = FileArtifact | GitHubPRArtifact | URLArtifact;
```

**Initial value**: `{ artifacts: [], notes: '', isDraft: true, saving: false, uploading: false, error: null, lastSaved: null, taskId: null }`

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `initialize(taskId, submissionData)` | `taskId: string, submissionData: TaskSubmissionData \| Record<string, unknown> \| null` | `void` | Initializes the store from existing task submission data. Handles both new `TaskSubmissionData` format and legacy format. Resets all transient state (saving, uploading, error). |
| `addArtifact(artifact)` | `artifact: Artifact` | `void` | Adds an artifact to the list and schedules a draft auto-save. |
| `removeArtifact(artifactId)` | `artifactId: string` | `Promise<void>` | Removes an artifact by ID. If it is a file artifact, also deletes the file from Supabase Storage. Schedules a draft auto-save. |
| `setNotes(notes)` | `notes: string` | `void` | Updates the submission notes and schedules a draft auto-save. |
| `setUploading(uploading)` | `uploading: boolean` | `void` | Sets the uploading state flag. |
| `setError(error)` | `error: string \| null` | `void` | Sets or clears the error message. |
| `scheduleDraftSave()` | none | `void` | Schedules an auto-save with 2-second debouncing. Resets the timer if called again before the save fires. |
| `saveDraft()` | none | `Promise<void>` | Immediately saves the current draft to the database via `artifactsService.saveDraft()`. Updates `lastSaved` timestamp on success. |
| `uploadFile(file, orgId, userId)` | `file: File, orgId: string, userId: string` | `Promise<Artifact>` | Uploads a file to Supabase Storage and adds it as a file artifact. Sets uploading state during the operation. Throws on failure. |
| `addGitHubPR(url)` | `url: string` | `Artifact \| null` | Validates and creates a GitHub PR artifact from a URL. Returns `null` and sets error if the URL is invalid. |
| `addURL(url, title?)` | `url: string, title?: string` | `Artifact \| null` | Validates and creates a URL artifact. Returns `null` and sets error if the URL is invalid. |
| `getSubmissionData()` | none | `TaskSubmissionData` | Returns the current state formatted as `TaskSubmissionData` for final submission. Sets `is_draft: false` and `submitted_at` to now. |
| `getFilePaths()` | none | `string[]` | Returns file paths from all file artifacts for backward compatibility. |
| `clear()` | none | `void` | Cancels any pending auto-save timers and resets to initial state. |

**Usage:**

```svelte
<script>
  import { artifactStore, fileArtifacts, artifactCount } from '$lib/stores/artifacts';
  import { user, organization } from '$lib/stores/auth';

  export let taskId: string;
  export let submissionData: TaskSubmissionData | null;

  // Initialize on mount
  artifactStore.initialize(taskId, submissionData);

  async function handleFileUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file && $user && $organization) {
      await artifactStore.uploadFile(file, $organization.id, $user.id);
    }
  }

  function handleAddPR(url: string) {
    artifactStore.addGitHubPR(url);
  }

  function handleSubmit() {
    const data = artifactStore.getSubmissionData();
    const files = artifactStore.getFilePaths();
    // Submit via tasks store...
  }
</script>

<p>{$artifactCount} artifact(s) attached</p>
{#if $artifactStore.saving}
  <span>Saving draft...</span>
{:else if $artifactStore.lastSaved}
  <span>Last saved: {$artifactStore.lastSaved}</span>
{/if}

{#each $fileArtifacts as file}
  <FileCard {file} on:remove={() => artifactStore.removeArtifact(file.id)} />
{/each}
```

---

### Derived Stores

#### `fileArtifacts`

- **Derives from**: `artifactStore`
- **Type**: `FileArtifact[]`
- **Returns**: Only artifacts where `type === 'file'`, type-narrowed to `FileArtifact`.

#### `githubPRArtifacts`

- **Derives from**: `artifactStore`
- **Type**: `Artifact[]`
- **Returns**: Only artifacts where `type === 'github_pr'`.

#### `urlArtifacts`

- **Derives from**: `artifactStore`
- **Type**: `Artifact[]`
- **Returns**: Only artifacts where `type === 'url'`.

#### `artifactCount`

- **Derives from**: `artifactStore`
- **Type**: `number`
- **Returns**: Total number of artifacts (`$store.artifacts.length`).

#### `hasArtifacts`

- **Derives from**: `artifactStore`
- **Type**: `boolean`
- **Returns**: `true` if there is at least one artifact.

---

## theme.ts

Import: `import { theme, getEffectiveTheme } from '$lib/stores/theme';`

### `theme` Store

**Type**: Custom store wrapping `Theme`

```typescript
type Theme = 'light' | 'dark' | 'system';
```

**Initial value**: Read from `localStorage` key `orbit_theme`, or `'system'` if not set or not in browser.

**Behavior on initialization**: Applies the resolved theme to `document.documentElement` by adding/removing the `'dark'` CSS class (for Tailwind dark mode). Also sets up a `matchMedia` listener for `prefers-color-scheme: dark` changes, re-applying the theme when the setting is `'system'`.

**Methods:**

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `setTheme(theme)` | `theme: Theme` | `void` | Sets the theme, persists to `localStorage`, and applies the `'dark'` class to the document. |
| `toggle()` | none | `void` | Toggles between `'light'` and `'dark'` (does not cycle through `'system'`). Persists and applies. |
| `initialize()` | none | `void` | Re-reads theme from `localStorage` and re-applies. Useful for SSR hydration. |

**Usage:**

```svelte
<script>
  import { theme, getEffectiveTheme } from '$lib/stores/theme';

  $: effectiveTheme = getEffectiveTheme($theme);
</script>

<button on:click={() => theme.toggle()}>
  {effectiveTheme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
</button>

<select value={$theme} on:change={(e) => theme.setTheme(e.target.value)}>
  <option value="light">Light</option>
  <option value="dark">Dark</option>
  <option value="system">System</option>
</select>
```

---

### Exported Functions

#### `getEffectiveTheme(themeValue)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `themeValue` | `Theme` | Current theme setting (`'light'`, `'dark'`, or `'system'`) |

**Returns**: `'light' | 'dark'` - The resolved theme. Converts `'system'` to the actual system preference via `window.matchMedia`. Never returns `'system'`.

---

## Quick Reference: All Exports Summary

| File | Stores | Derived Stores | Functions / Constants |
|------|--------|---------------|----------------------|
| `auth.ts` | `auth`, `user`, `organization`, `userOrganizations` | `currentOrgRole`, `capabilities`, `isAuthenticated`, `isLoading` | -- |
| `tasks.ts` | `tasks`, `currentTask` | `tasksByStatus`, `tasksPendingReview`, `taskCounts` | -- |
| `projects.ts` | `projects`, `currentProject` | `projectsByStatus`, `projectsWithBudgetWarning`, `projectsInOverdraft` | -- |
| `notifications.ts` | `notifications`, `toasts` | `unreadCount`, `unreadNotifications`, `recentNotifications` | Types: `Notification`, `NotificationType`, `Toast` |
| `gamification.ts` | `gamification` | `userLevel`, `userXp`, `earnedBadgesCount` | `calculateLevel()`, `xpForLevel()`, `xpToNextLevel()`, `BADGE_DEFINITIONS` |
| `featureFlags.ts` | -- | `featureFlags`, `features.*` (17 stores) | `isFeatureEnabled()` |
| `artifacts.ts` | `artifactStore` | `fileArtifacts`, `githubPRArtifacts`, `urlArtifacts`, `artifactCount`, `hasArtifacts` | -- |
| `theme.ts` | `theme` | -- | `getEffectiveTheme()` |
