# Component API Reference

Comprehensive documentation for all reusable Svelte components in the Orbit codebase. Each entry includes props, dispatched events, slots, and usage examples.

---

## Table of Contents

- [Task Components](#task-components)
- [Submission Components](#submission-components)
- [Common Components](#common-components)
- [Admin Components](#admin-components)
- [Auth Components](#auth-components)
- [Gamification Components](#gamification-components)

---

## Task Components

Import: `import { TaskCard, TaskCreateModal, TaskEditModal, TaskFilters, QCReviewForm, ExternalAssignmentModal, DraggableTaskList } from '$lib/components/tasks';`

Barrel export: `src/lib/components/tasks/index.ts`

---

### TaskCard

**File:** `src/lib/components/tasks/TaskCard.svelte`

**Purpose:** Displays a task as an interactive card with gamification badges, urgency indicators, payout calculations, and optional accept button. Renders task title, dollar value, deadline countdown, story points, tags, level requirements, assignee info, and project name.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `task` | `Task` | *(required)* | The task object to display |
| `showAcceptButton` | `boolean` | `false` | Show "Pick Up Task" button at the bottom of the card |
| `compact` | `boolean` | `false` | Use compact layout with fewer details (hides badges, tags, level, assignee, project) |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `click` | `Task` | Fired when the card is clicked |
| `accept` | `Task` | Fired when the accept/pickup button is clicked (event propagation is stopped) |

**Slots:** None

**Example:**
```svelte
<TaskCard
  {task}
  showAcceptButton={task.status === 'open'}
  on:click={() => openTaskDetail(task)}
  on:accept={() => acceptTask(task)}
/>
```

---

### TaskCreateModal

**File:** `src/lib/components/tasks/TaskCreateModal.svelte`

**Purpose:** Full-featured modal form for creating new tasks within a project. Includes all gamification fields: story points (T-shirt sizing XS-XXL), urgency bonus presets (+10%, +20%, +50%), required level slider (1-5), tag input with suggestions, deadline picker, and a live task preview card.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `show` | `boolean` | `false` | Controls modal visibility (supports `bind:show`) |
| `projectId` | `string \| null` | `null` | Pre-select a project by ID |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `close` | `void` | Fired when the modal is closed |
| `created` | `Task` | Fired when a task is successfully created, returns the new Task |

**Slots:** None

**Example:**
```svelte
<TaskCreateModal
  bind:show={showCreateModal}
  projectId={currentProject?.id}
  on:created={(e) => handleTaskCreated(e.detail)}
/>
```

---

### TaskEditModal

**File:** `src/lib/components/tasks/TaskEditModal.svelte`

**Purpose:** Modal for editing existing tasks with status management and delete functionality. Pre-populates form fields from the provided task. Supports all the same fields as TaskCreateModal plus status selection. Tasks in final states (`approved`, `paid`) are read-only. Includes a delete confirmation flow.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `show` | `boolean` | `false` | Controls modal visibility (supports `bind:show`) |
| `task` | `Task \| null` | `null` | The task to edit; form initializes from this object |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `close` | `void` | Fired when the modal is closed |
| `updated` | `Task` | Fired when the task is successfully updated |
| `deleted` | `string` | Fired when the task is deleted, returns the task ID |

**Slots:** None

**Example:**
```svelte
<TaskEditModal
  bind:show={showEditModal}
  task={selectedTask}
  on:updated={(e) => handleTaskUpdated(e.detail)}
  on:deleted={(e) => handleTaskDeleted(e.detail)}
/>
```

---

### TaskFilters

**File:** `src/lib/components/tasks/TaskFilters.svelte`

**Purpose:** Advanced filtering slide-over panel for tasks. Supports filtering by status (multi-select), project, urgency multiplier range, required level range, and deadline range. Includes quick filter presets for common scenarios ("High Priority Open Tasks", "Pending QC Review", "Due This Week"). Displays count of active filters.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `show` | `boolean` | `false` | Controls panel visibility (supports `bind:show`) |
| `selectedStatuses` | `TaskStatus[]` | `[]` | Currently selected status filters (supports `bind:`) |
| `selectedProjectId` | `string \| null` | `null` | Selected project filter (supports `bind:`) |
| `urgencyMin` | `number` | `1.0` | Minimum urgency multiplier filter (supports `bind:`) |
| `urgencyMax` | `number` | `2.0` | Maximum urgency multiplier filter (supports `bind:`) |
| `levelMin` | `number` | `1` | Minimum required level filter (supports `bind:`) |
| `levelMax` | `number` | `5` | Maximum required level filter (supports `bind:`) |
| `deadlineFrom` | `string` | `''` | Deadline range start (date string, supports `bind:`) |
| `deadlineTo` | `string` | `''` | Deadline range end (date string, supports `bind:`) |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `close` | `void` | Fired when the panel is closed |
| `apply` | `{ statuses: TaskStatus[]; projectId: string \| null; urgencyRange: [number, number]; levelRange: [number, number]; deadlineRange: [string, string] }` | Fired when "Apply Filters" is clicked |
| `reset` | `void` | Fired when "Reset All" is clicked |

**Slots:** None

**Example:**
```svelte
<TaskFilters
  bind:show={showFilters}
  bind:selectedStatuses
  bind:selectedProjectId
  on:apply={(e) => applyFilters(e.detail)}
  on:reset={() => clearAllFilters()}
/>
```

---

### QCReviewForm

**File:** `src/lib/components/tasks/QCReviewForm.svelte`

**Purpose:** Quality control review interface for approving or rejecting task submissions. Displays submission notes, artifacts (using ArtifactList), legacy file attachments with download, previous review history with pass/fail indicators and confidence scores. Provides review type selection (peer at 1x weight vs independent at 2x weight), feedback textarea, and approve/reject buttons. Shows a Shapley value-based payout preview.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `task` | `Task` | *(required)* | Task with submission data (`submission_data`, `submission_files`) and QC reviews (`qc_reviews`) |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `reviewed` | `QCReview` | Fired when a review is successfully submitted |

**Slots:** None

**Example:**
```svelte
<QCReviewForm
  {task}
  on:reviewed={(e) => handleReviewComplete(e.detail)}
/>
```

---

### DraggableTaskList

**File:** `src/lib/components/tasks/DraggableTaskList.svelte`

**Purpose:** Renders a list of task cards with HTML5 drag-and-drop reordering support. Used in Kanban board columns for task organization. Each task is rendered via TaskCard. Includes FLIP animations for smooth reordering transitions. Displays a "No tasks" placeholder when the list is empty.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tasks` | `Task[]` | `[]` | Array of tasks to display |
| `status` | `TaskStatus` | *(required)* | Current status column identifier, included in reorder events |
| `showAcceptButton` | `boolean` | `false` | Show accept button on each task card |
| `canReorder` | `boolean` | `true` | Enable drag-and-drop reordering |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `click` | `Task` | Fired when a task card is clicked |
| `accept` | `Task` | Fired when a task's accept button is clicked |
| `reorder` | `{ taskIds: string[]; status: TaskStatus }` | Fired when tasks are reordered via drag-and-drop, returns new ID order |
| `move` | `{ task: Task; newStatus: TaskStatus }` | Fired when a task is moved to a new status column |

**Slots:** None

**Example:**
```svelte
<DraggableTaskList
  tasks={$tasksByStatus.open}
  status="open"
  showAcceptButton
  on:click={(e) => openTask(e.detail)}
  on:reorder={(e) => saveTaskOrder(e.detail)}
/>
```

---

### ExternalAssignmentModal

**File:** `src/lib/components/tasks/ExternalAssignmentModal.svelte`

**Purpose:** Modal for assigning tasks to external contractors. Provides a form for contractor name and email, submission method selection (guest link vs org invite), and auto-generates a PDF contract. On success, displays the guest submission link, contract review link, copy-to-clipboard functionality, and email composition link. Supports downloading the generated contract PDF.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `task` | `Task` | *(required)* | The task to assign externally |
| `show` | `boolean` | `false` | Controls modal visibility |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `close` | `void` | Fired when the modal is closed |
| `assigned` | `ExternalAssignmentResult` | Fired when the task is successfully assigned (dispatched on "Done" click) |

**Slots:** None

**Example:**
```svelte
<ExternalAssignmentModal
  {task}
  bind:show={showExternalAssign}
  on:assigned={(e) => handleExternalAssignment(e.detail)}
/>
```

---

## Submission Components

Import: `import { FileUploadZone, ArtifactItem, ArtifactList, GitHubPRInput, URLInput, ArtifactAddModal, SubmissionDraftBanner } from '$lib/components/submissions';`

Barrel export: `src/lib/components/submissions/index.ts`

---

### FileUploadZone

**File:** `src/lib/components/submissions/FileUploadZone.svelte`

**Purpose:** Drag-and-drop file upload zone with click-to-browse support. Validates file size against a configurable maximum. Accepts images, PDFs, documents, text files, archives, and JSON. Shows uploading state with spinner. Supports multiple file selection.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `uploading` | `boolean` | `false` | Show uploading state (spinner, disabled interaction) |
| `error` | `string \| null` | `null` | Error message to display below the zone |
| `maxSize` | `number` | `10485760` (10 MB) | Maximum file size in bytes |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `upload` | `File` | Fired for each valid file selected or dropped |
| `error` | `string` | Fired when a file fails validation (e.g., exceeds size limit) |

**Slots:** None

**Example:**
```svelte
<FileUploadZone
  {uploading}
  error={uploadError}
  maxSize={5 * 1024 * 1024}
  on:upload={(e) => handleFileUpload(e.detail)}
  on:error={(e) => showError(e.detail)}
/>
```

---

### ArtifactItem

**File:** `src/lib/components/submissions/ArtifactItem.svelte`

**Purpose:** Renders a single submission artifact (file, GitHub PR, or URL) as a row with an appropriate icon, name/details, and action buttons. File artifacts show file name and size with a download button. GitHub PR artifacts show owner/repo and PR number with an external link. URL artifacts show title and URL with an external link. In editable mode, a remove button is shown.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `artifact` | `Artifact` | *(required)* | The artifact to display (union type: `FileArtifact \| GitHubPRArtifact \| URLArtifact`) |
| `editable` | `boolean` | `false` | Show the remove button for editing |
| `downloading` | `boolean` | `false` | Show downloading state on the download button |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `remove` | `string` | Fired when remove button is clicked, returns artifact ID |
| `download` | `string` | Fired when download button is clicked, returns artifact ID |

**Slots:** None

**Example:**
```svelte
<ArtifactItem
  {artifact}
  editable={isEditing}
  on:remove={(e) => removeArtifact(e.detail)}
/>
```

---

### ArtifactList

**File:** `src/lib/components/submissions/ArtifactList.svelte`

**Purpose:** Renders a collection of artifacts, optionally grouped by type (files, GitHub PRs, URLs). Each group shows a header with icon and count. When ungrouped, artifacts are rendered in a flat list. Displays an empty state with icon when no artifacts exist.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `artifacts` | `Artifact[]` | `[]` | Array of artifacts to display |
| `editable` | `boolean` | `false` | Enable remove buttons on artifact items |
| `grouped` | `boolean` | `false` | Group artifacts by type (file, github_pr, url) with section headers |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `remove` | `string` | Fired when an artifact's remove button is clicked, returns artifact ID |

**Slots:** None

**Example:**
```svelte
<ArtifactList
  artifacts={submissionArtifacts}
  grouped={true}
  editable={canEdit}
  on:remove={(e) => removeArtifact(e.detail)}
/>
```

---

### ArtifactAddModal

**File:** `src/lib/components/submissions/ArtifactAddModal.svelte`

**Purpose:** Tabbed modal for adding submission artifacts. Three tabs: Files (via FileUploadZone), GitHub PR (via GitHubPRInput), and URL (via URLInput). Coordinates between the sub-components and dispatches appropriate events for each artifact type.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `show` | `boolean` | `false` | Controls modal visibility |
| `uploading` | `boolean` | `false` | Pass-through uploading state to FileUploadZone |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `close` | `void` | Fired when the modal is closed |
| `uploadFile` | `File` | Fired when a file is selected for upload |
| `addGitHubPR` | `string` | Fired when a GitHub PR URL is added |
| `addURL` | `{ url: string; title?: string }` | Fired when a URL is added |

**Slots:** None

**Example:**
```svelte
<ArtifactAddModal
  bind:show={showArtifactModal}
  {uploading}
  on:uploadFile={(e) => uploadFile(e.detail)}
  on:addGitHubPR={(e) => addPRArtifact(e.detail)}
  on:addURL={(e) => addURLArtifact(e.detail)}
/>
```

---

### GitHubPRInput

**File:** `src/lib/components/submissions/GitHubPRInput.svelte`

**Purpose:** Input component for adding GitHub Pull Request URLs as artifacts. Validates the URL format in real-time using `artifactsService.parseGitHubPRUrl()`, showing a parsed preview (owner/repo and PR number) when valid, or an error message when invalid. Supports Enter key to submit.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Disable the input and button |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `add` | `string` | Fired when a valid PR URL is submitted, returns the URL string |
| `error` | `string` | Fired on validation error |

**Slots:** None

**Example:**
```svelte
<GitHubPRInput
  disabled={uploading}
  on:add={(e) => handleAddPR(e.detail)}
/>
```

---

### URLInput

**File:** `src/lib/components/submissions/URLInput.svelte`

**Purpose:** Input component for adding external URLs as artifacts. Provides fields for URL (required) and optional title. Validates URL format using `artifactsService.isValidUrl()`. Supports Enter key to submit.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Disable the inputs and button |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `add` | `{ url: string; title?: string }` | Fired when a valid URL is submitted |
| `error` | `string` | Fired on validation error |

**Slots:** None

**Example:**
```svelte
<URLInput
  disabled={uploading}
  on:add={(e) => handleAddURL(e.detail)}
/>
```

---

### SubmissionDraftBanner

**File:** `src/lib/components/submissions/SubmissionDraftBanner.svelte`

**Purpose:** Status banner for submission drafts. Shows artifact count, save status (saving spinner, last saved timestamp, "not saved yet"), and error messages. Purely presentational -- does not dispatch any events.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `artifactCount` | `number` | `0` | Number of artifacts in the draft |
| `saving` | `boolean` | `false` | Whether the draft is currently saving |
| `lastSaved` | `string \| null` | `null` | ISO timestamp of the last successful save |
| `error` | `string \| null` | `null` | Error message to display |

**Events:** None

**Slots:** None

**Example:**
```svelte
<SubmissionDraftBanner
  artifactCount={artifacts.length}
  {saving}
  {lastSaved}
  {error}
/>
```

---

## Common Components

Import: Components in `src/lib/components/common/` are imported individually (no barrel export).

```typescript
import NotificationDropdown from '$lib/components/common/NotificationDropdown.svelte';
import OrganizationSwitcher from '$lib/components/common/OrganizationSwitcher.svelte';
import Toast from '$lib/components/common/Toast.svelte';
import TagInput from '$lib/components/common/TagInput.svelte';
import RoleBadge from '$lib/components/common/RoleBadge.svelte';
import ExportButton from '$lib/components/common/ExportButton.svelte';
```

---

### NotificationDropdown

**File:** `src/lib/components/common/NotificationDropdown.svelte`

**Purpose:** Bell icon button with dropdown that displays real-time notifications. Loads and subscribes to notification updates for the current user on mount, and unsubscribes on destroy. Shows unread count badge, notification list with type-specific icons and colors, relative timestamps, mark-as-read on click, and "Mark all read" button. Links to a full `/notifications` page.

**Props:** None

**Events:** None

**Slots:** None

**Notes:** This component is self-contained. It reads from the `user` auth store and the `notifications`, `unreadCount`, and `recentNotifications` stores internally.

**Example:**
```svelte
<NotificationDropdown />
```

---

### OrganizationSwitcher

**File:** `src/lib/components/common/OrganizationSwitcher.svelte`

**Purpose:** Dropdown for switching between organizations in multi-org setups. Shows the current organization name and, if the user belongs to multiple organizations, a dropdown with other organizations and their roles. Switching navigates to `/dashboard` to refresh context. For single-org users, displays the org name without a dropdown.

**Props:** None

**Events:** None

**Slots:** None

**Notes:** Self-contained. Reads from `organization` and `userOrganizations` auth stores. Loads organization memberships on mount.

**Example:**
```svelte
<OrganizationSwitcher />
```

---

### Toast

**File:** `src/lib/components/common/Toast.svelte`

**Purpose:** Fixed-position toast notification container rendered in the bottom-right corner. Renders all active toasts from the `toasts` store with type-specific styling (success/green, error/red, warning/amber, info/blue), appropriate icons, and dismiss buttons. Uses fly transitions for smooth entry/exit.

**Props:** None

**Events:** None

**Slots:** None

**Notes:** Self-contained. Reads from the `toasts` store. Typically placed once in the root layout.

**Example:**
```svelte
<!-- In root layout -->
<Toast />
```

---

### TagInput

**File:** `src/lib/components/common/TagInput.svelte`

**Purpose:** Multi-tag input component with autocomplete suggestions. Tags are added by pressing Enter, comma, or clicking a suggestion. Tags are removed by clicking the X button on each tag or pressing Backspace when the input is empty. Tags are automatically lowercased and deduplicated. Shows a max-tags warning when the limit is reached. Each tag is color-coded based on a deterministic hash.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tags` | `string[]` | `[]` | Current tags (supports `bind:tags` for two-way binding) |
| `placeholder` | `string` | `'Add tag...'` | Input placeholder text |
| `maxTags` | `number` | `10` | Maximum number of tags allowed |
| `suggestions` | `string[]` | `[]` | Autocomplete suggestion list |
| `disabled` | `boolean` | `false` | Disable tag input and removal |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `change` | `string[]` | Fired when the tags array changes (tag added or removed) |

**Slots:** None

**Example:**
```svelte
<TagInput
  bind:tags
  suggestions={['bug', 'feature', 'urgent', 'design']}
  placeholder="Add tags (press Enter or comma)..."
  maxTags={5}
  on:change={(e) => console.log('Tags:', e.detail)}
/>
```

---

### RoleBadge

**File:** `src/lib/components/common/RoleBadge.svelte`

**Purpose:** Displays a user role as a styled badge pill with role-specific colors and icons. Supports three sizes and optional icon display. Role mappings: admin (purple/Shield), sales (green/Briefcase), pm (blue/UserCog), qc (orange/CheckCircle), employee (slate/Users), contractor (amber/Wrench).

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `role` | `UserRole` | *(required)* | The user role to display (`'admin' \| 'sales' \| 'pm' \| 'qc' \| 'employee' \| 'contractor'`) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Badge size variant |
| `showIcon` | `boolean` | `true` | Whether to show the role icon |

**Events:** None

**Slots:** None

**Example:**
```svelte
<RoleBadge role="pm" size="lg" />
<RoleBadge role={user.role} showIcon={false} size="sm" />
```

---

### ExportButton

**File:** `src/lib/components/common/ExportButton.svelte`

**Purpose:** Dropdown button for exporting data in CSV, PDF, or JSON formats. Shows a dropdown with format options on click. The JSON option is hidden by default and must be explicitly enabled. The actual export logic is handled by the parent via the `onExport` callback prop.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onExport` | `(format: 'csv' \| 'pdf' \| 'json') => void` | *(required)* | Callback function invoked with the selected export format |
| `disabled` | `boolean` | `false` | Disable the button |
| `showJson` | `boolean` | `false` | Show the "Export as JSON" option |
| `size` | `'sm' \| 'md'` | `'md'` | Button size variant |

**Events:** None (uses callback prop instead of Svelte dispatch)

**Slots:** None

**Example:**
```svelte
<ExportButton
  onExport={(format) => exportData(format)}
  showJson={true}
  size="sm"
/>
```

---

## Admin Components

Import: `import { InviteConfirmationModal, FeatureFlagsPanel } from '$lib/components/admin';`

Barrel export: `src/lib/components/admin/index.ts`

---

### FeatureFlagsPanel

**File:** `src/lib/components/admin/FeatureFlagsPanel.svelte`

**Purpose:** Admin panel for enabling/disabling organization feature flags. Shows features organized by category (Core, Gamification, Advanced, Integrations) with toggle switches. Includes quick preset buttons (All Features, Standard, Minimal, None), enabled feature counter, unsaved changes detection with reset/save buttons, and error handling. Saves flag changes via `organizationsApi.updateFeatureFlags()`.

**Props:** None

**Events:** None

**Slots:** None

**Notes:** Self-contained. Reads from `organization` auth store and `featureFlags` store. Uses `organizationsApi` to persist changes.

**Example:**
```svelte
<FeatureFlagsPanel />
```

---

### InviteConfirmationModal

**File:** `src/lib/components/admin/InviteConfirmationModal.svelte`

**Purpose:** Modal displayed after successfully creating a user invitation. Shows the invite code in large monospaced text with copy-to-clipboard, invitation details (email, role with color-coded badge, expiration date), and instructions for sharing. Provides "Send Another" and "Done" action buttons.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `invitation` | `UserInvitation` | *(required)* | The invitation object containing `token`, `email`, `role`, `expires_at` |
| `open` | `boolean` | `false` | Controls modal visibility |

**Events:**

| Event | Detail Type | Description |
|-------|-------------|-------------|
| `close` | `void` | Fired when the modal is closed (X button or "Done") |
| `sendAnother` | `void` | Fired when "Send Another" button is clicked |

**Slots:** None

**Example:**
```svelte
<InviteConfirmationModal
  {invitation}
  open={showInviteConfirmation}
  on:close={() => showInviteConfirmation = false}
  on:sendAnother={() => resetInviteForm()}
/>
```

---

## Auth Components

Components in `src/lib/components/auth/` are imported individually (no barrel export).

---

### FeaturePresetSelector

**File:** `src/lib/components/auth/FeaturePresetSelector.svelte`

**Purpose:** Feature flag preset selection card grid used during organization registration. Displays four preset options (Standard, All Features, Minimal, Custom/None) as selectable cards with descriptions, enabled feature counts, and a "Recommended" badge on Standard. Includes a toggleable detail panel showing which features are included in the selected preset.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `selectedPreset` | `FeatureFlagPreset` | `'standard'` | The currently selected preset (`'all_features' \| 'standard' \| 'minimal' \| 'none'`). Supports `bind:selectedPreset` |

**Events:** None (uses two-way binding via `bind:selectedPreset`)

**Slots:** None

**Example:**
```svelte
<FeaturePresetSelector bind:selectedPreset />

<!-- Later, pass to registration RPC -->
<script>
  let selectedPreset: FeatureFlagPreset = 'standard';
</script>
```

---

## Gamification Components

Components in `src/lib/components/gamification/` are imported individually (no barrel export).

```typescript
import AchievementBadge from '$lib/components/gamification/AchievementBadge.svelte';
import AchievementsGrid from '$lib/components/gamification/AchievementsGrid.svelte';
```

---

### AchievementBadge

**File:** `src/lib/components/gamification/AchievementBadge.svelte`

**Purpose:** Renders a single achievement badge with tier-specific gradient coloring (bronze, silver, gold, platinum). Earned badges are fully colored with shadows; unearned badges are greyed out. Shows a progress ring overlay for unearned badges when `showProgress` is enabled. Includes a hover tooltip with badge name, description, progress, and earned date. Icon is selected dynamically from a preset map (trophy, star, flame, target, zap, award, crown, medal, rocket, heart).

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `badge` | `{ id: string; name: string; description: string; icon: string; tier: 'bronze' \| 'silver' \| 'gold' \| 'platinum'; earned: boolean; earned_at?: string; progress?: number; requirement?: number }` | *(required)* | Badge data object |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Badge size: sm (64px), md (80px), lg (112px) |
| `showProgress` | `boolean` | `false` | Show SVG progress ring on unearned badges |

**Events:** None

**Slots:** None

**Example:**
```svelte
<AchievementBadge
  badge={{
    id: '1',
    name: 'First Task',
    description: 'Complete your first task',
    icon: 'trophy',
    tier: 'bronze',
    earned: true,
    earned_at: '2024-01-15T00:00:00Z'
  }}
  size="lg"
  showProgress
/>
```

---

### AchievementsGrid

**File:** `src/lib/components/gamification/AchievementsGrid.svelte`

**Purpose:** Grid display of all achievement badges grouped by category. Shows a summary header with total earned count and progress bar. Includes a "Show locked achievements" toggle to show/hide unearned badges. Each category section shows its own earned/total count. Renders each badge via AchievementBadge. Displays an empty state when no badges are earned and locked badges are hidden.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `badges` | `Array<{ id: string; name: string; description: string; icon: string; tier: 'bronze' \| 'silver' \| 'gold' \| 'platinum'; category: string; earned: boolean; earned_at?: string; progress?: number; requirement?: number }>` | `[]` | Array of all badge data, including a `category` field for grouping |
| `showAllInitial` | `boolean` | `true` | Initial state for "show locked achievements" toggle |
| `showProgress` | `boolean` | `true` | Pass-through to AchievementBadge for progress rings |

**Events:** None

**Slots:** None

**Example:**
```svelte
<AchievementsGrid
  badges={userBadges}
  showAllInitial={false}
  showProgress
/>
```

---

## Type Reference

Key types used across components (defined in `src/lib/types/index.ts`):

- **`Task`** -- Core task object with `id`, `title`, `description`, `dollar_value`, `story_points`, `urgency_multiplier`, `required_level`, `deadline`, `status`, `tags`, `submission_data`, `submission_files`, `assignee`, `project`, `qc_reviews`
- **`TaskStatus`** -- `'open' | 'assigned' | 'in_progress' | 'completed' | 'under_review' | 'approved' | 'rejected' | 'paid'`
- **`UserRole`** -- `'admin' | 'sales' | 'pm' | 'qc' | 'employee' | 'contractor'`
- **`QCReview`** -- QC review with `passed`, `feedback`, `review_type`, `pass_number`, `confidence`, `weight`
- **`Artifact`** -- Union type: `FileArtifact | GitHubPRArtifact | URLArtifact`
- **`FeatureFlags`** -- Object with boolean flags for all 17 features
- **`FeatureFlagPreset`** -- `'all_features' | 'standard' | 'minimal' | 'none'`
- **`UserInvitation`** -- Invitation with `token`, `email`, `role`, `expires_at`
- **`ExternalAssignmentResult`** -- Result of external task assignment with `submission_token`, `contract_id`
