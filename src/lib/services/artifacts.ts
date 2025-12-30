import { storage } from './supabase';
import type {
  Artifact,
  FileArtifact,
  GitHubPRArtifact,
  URLArtifact,
  TaskSubmissionData
} from '$lib/types';
import { tasksApi } from './api';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const artifactsService = {
  /**
   * Generate a unique artifact ID
   */
  generateId(): string {
    return crypto.randomUUID();
  },

  /**
   * Validate file before upload
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      return {
        valid: false,
        error: `File exceeds 10 MB limit (${sizeMB} MB)`
      };
    }
    return { valid: true };
  },

  /**
   * Upload file and create a FileArtifact
   */
  async uploadFileArtifact(
    file: File,
    orgId: string,
    userId: string,
    taskId: string
  ): Promise<FileArtifact> {
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Create unique path with timestamp to avoid collisions
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${orgId}/${userId}/${taskId}/${timestamp}-${safeName}`;

    const { error } = await storage.uploadFile('submissions', path, file, {
      contentType: file.type || 'application/octet-stream'
    });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    return {
      id: this.generateId(),
      type: 'file',
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      added_at: new Date().toISOString()
    };
  },

  /**
   * Parse GitHub PR URL and extract components
   */
  parseGitHubPRUrl(url: string): { owner: string; repo: string; pr_number: number } | null {
    // Match patterns like:
    // https://github.com/owner/repo/pull/123
    // http://github.com/owner/repo/pull/123
    // github.com/owner/repo/pull/123
    const match = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
    if (!match) return null;

    return {
      owner: match[1],
      repo: match[2],
      pr_number: parseInt(match[3], 10)
    };
  },

  /**
   * Create a GitHub PR artifact from URL
   */
  createGitHubPRArtifact(
    url: string,
    metadata?: GitHubPRArtifact['metadata']
  ): GitHubPRArtifact | null {
    const parsed = this.parseGitHubPRUrl(url);
    if (!parsed) return null;

    return {
      id: this.generateId(),
      type: 'github_pr',
      url: url.startsWith('http') ? url : `https://${url}`,
      owner: parsed.owner,
      repo: parsed.repo,
      pr_number: parsed.pr_number,
      metadata,
      added_at: new Date().toISOString()
    };
  },

  /**
   * Validate URL format
   */
  isValidUrl(url: string): boolean {
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Create a generic URL artifact
   */
  createURLArtifact(url: string, title?: string): URLArtifact | null {
    if (!this.isValidUrl(url)) return null;

    return {
      id: this.generateId(),
      type: 'url',
      url: url.startsWith('http') ? url : `https://${url}`,
      title,
      added_at: new Date().toISOString()
    };
  },

  /**
   * Save draft artifacts to task (updates task.submission_data)
   */
  async saveDraft(
    taskId: string,
    artifacts: Artifact[],
    notes?: string
  ): Promise<boolean> {
    const submissionData: TaskSubmissionData = {
      notes,
      artifacts,
      draft_saved_at: new Date().toISOString(),
      is_draft: true
    };

    const result = await tasksApi.update(taskId, {
      submission_data: submissionData as unknown as Record<string, unknown>
    });

    return !!result;
  },

  /**
   * Delete file artifact from storage
   */
  async deleteFileArtifact(artifact: FileArtifact): Promise<boolean> {
    const { error } = await storage.deleteFile('submissions', [artifact.file_path]);
    return !error;
  },

  /**
   * Extract file paths from artifacts (for submission_files field)
   */
  extractFilePaths(artifacts: Artifact[]): string[] {
    return artifacts
      .filter((a): a is FileArtifact => a.type === 'file')
      .map(a => a.file_path);
  },

  /**
   * Get file extension from filename
   */
  getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  },

  /**
   * Check if file is an image
   */
  isImage(artifact: FileArtifact): boolean {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    return imageTypes.includes(artifact.mime_type);
  },

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
};
