import { writable, derived } from 'svelte/store';
import type { Artifact, FileArtifact, TaskSubmissionData } from '$lib/types';
import { artifactsService } from '$lib/services/artifacts';

// ============================================================================
// Artifact Store for Task Submissions
// ============================================================================

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

function createArtifactStore() {
  const { subscribe, set, update } = writable<ArtifactStoreState>({
    artifacts: [],
    notes: '',
    isDraft: true,
    saving: false,
    uploading: false,
    error: null,
    lastSaved: null,
    taskId: null
  });

  let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Helper to get current state
  function getState(): ArtifactStoreState {
    let currentState: ArtifactStoreState;
    const unsubscribe = subscribe(s => { currentState = s; });
    unsubscribe();
    return currentState!;
  }

  return {
    subscribe,

    /**
     * Initialize store from existing task submission data
     */
    initialize(taskId: string, submissionData: TaskSubmissionData | Record<string, unknown> | null) {
      // Handle both new TaskSubmissionData format and legacy format
      const data = submissionData as TaskSubmissionData | null;

      set({
        artifacts: data?.artifacts || [],
        notes: (data?.notes as string) || '',
        isDraft: data?.is_draft ?? true,
        saving: false,
        uploading: false,
        error: null,
        lastSaved: data?.draft_saved_at || null,
        taskId
      });
    },

    /**
     * Add an artifact to the list
     */
    addArtifact(artifact: Artifact) {
      update(state => ({
        ...state,
        artifacts: [...state.artifacts, artifact],
        error: null
      }));
      this.scheduleDraftSave();
    },

    /**
     * Remove an artifact by ID
     */
    async removeArtifact(artifactId: string) {
      const state = getState();
      const artifact = state.artifacts.find(a => a.id === artifactId);

      // Delete file from storage if it's a file artifact
      if (artifact?.type === 'file') {
        await artifactsService.deleteFileArtifact(artifact as FileArtifact);
      }

      update(state => ({
        ...state,
        artifacts: state.artifacts.filter(a => a.id !== artifactId)
      }));

      this.scheduleDraftSave();
    },

    /**
     * Update submission notes
     */
    setNotes(notes: string) {
      update(state => ({ ...state, notes }));
      this.scheduleDraftSave();
    },

    /**
     * Set uploading state
     */
    setUploading(uploading: boolean) {
      update(state => ({ ...state, uploading }));
    },

    /**
     * Set error message
     */
    setError(error: string | null) {
      update(state => ({ ...state, error }));
    },

    /**
     * Schedule auto-save with debouncing (2 second delay)
     */
    scheduleDraftSave() {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
      autoSaveTimeout = setTimeout(() => this.saveDraft(), 2000);
    },

    /**
     * Save draft to database immediately
     */
    async saveDraft() {
      const state = getState();
      if (!state.taskId) return;

      update(s => ({ ...s, saving: true }));

      try {
        const success = await artifactsService.saveDraft(
          state.taskId,
          state.artifacts,
          state.notes
        );

        update(s => ({
          ...s,
          saving: false,
          lastSaved: success ? new Date().toISOString() : s.lastSaved,
          error: success ? null : 'Failed to save draft'
        }));
      } catch (error) {
        update(s => ({
          ...s,
          saving: false,
          error: error instanceof Error ? error.message : 'Failed to save draft'
        }));
      }
    },

    /**
     * Upload a file and add as artifact
     */
    async uploadFile(file: File, orgId: string, userId: string) {
      const state = getState();
      if (!state.taskId) {
        throw new Error('No task ID set');
      }

      this.setUploading(true);
      this.setError(null);

      try {
        const artifact = await artifactsService.uploadFileArtifact(
          file,
          orgId,
          userId,
          state.taskId
        );
        this.addArtifact(artifact);
        return artifact;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        this.setError(message);
        throw error;
      } finally {
        this.setUploading(false);
      }
    },

    /**
     * Add a GitHub PR artifact
     */
    addGitHubPR(url: string) {
      const artifact = artifactsService.createGitHubPRArtifact(url);
      if (!artifact) {
        this.setError('Invalid GitHub PR URL');
        return null;
      }
      this.addArtifact(artifact);
      return artifact;
    },

    /**
     * Add a URL artifact
     */
    addURL(url: string, title?: string) {
      const artifact = artifactsService.createURLArtifact(url, title);
      if (!artifact) {
        this.setError('Invalid URL');
        return null;
      }
      this.addArtifact(artifact);
      return artifact;
    },

    /**
     * Get submission data for final submission
     */
    getSubmissionData(): TaskSubmissionData {
      const state = getState();
      return {
        notes: state.notes,
        artifacts: state.artifacts,
        submitted_at: new Date().toISOString(),
        is_draft: false
      };
    },

    /**
     * Get file paths for backward compatibility
     */
    getFilePaths(): string[] {
      const state = getState();
      return artifactsService.extractFilePaths(state.artifacts);
    },

    /**
     * Clear the store and cancel any pending saves
     */
    clear() {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
      }
      set({
        artifacts: [],
        notes: '',
        isDraft: true,
        saving: false,
        uploading: false,
        error: null,
        lastSaved: null,
        taskId: null
      });
    }
  };
}

export const artifactStore = createArtifactStore();

// ============================================================================
// Derived Stores
// ============================================================================

// File artifacts only
export const fileArtifacts = derived(artifactStore, $store =>
  $store.artifacts.filter((a): a is FileArtifact => a.type === 'file')
);

// GitHub PR artifacts only
export const githubPRArtifacts = derived(artifactStore, $store =>
  $store.artifacts.filter(a => a.type === 'github_pr')
);

// URL artifacts only
export const urlArtifacts = derived(artifactStore, $store =>
  $store.artifacts.filter(a => a.type === 'url')
);

// Total artifact count
export const artifactCount = derived(artifactStore, $store =>
  $store.artifacts.length
);

// Has any artifacts
export const hasArtifacts = derived(artifactStore, $store =>
  $store.artifacts.length > 0
);
