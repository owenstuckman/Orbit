/**
 * ML Model API Service
 *
 * Handles communication with the external ML model server for:
 * - Submission confidence scoring (p0 for Shapley calculations)
 * - Task complexity analysis
 * - Quality assessments
 *
 * See xtraDocs/ML_INTEGRATION.md for full integration guide.
 */

// Environment variables - these should be set in .env
const ML_API_BASE = import.meta.env.VITE_ML_API_URL || 'http://localhost:8000';
const ML_API_KEY = import.meta.env.VITE_ML_API_KEY || '';

// ============================================================================
// Types
// ============================================================================

export interface MLSubmissionRequest {
  task_id: string;
  submission_data: {
    notes: string;
    artifacts: Array<{
      type: 'file' | 'github_pr' | 'url';
      data: Record<string, unknown>;
    }>;
  };
  task_context: {
    title: string;
    description: string;
    requirements?: string;
    story_points?: number;
  };
}

export interface MLSubmissionResponse {
  /** Pass probability (0.0 to 1.0) - becomes p0 in Shapley calculations */
  pass_probability: number;
  confidence_breakdown: {
    completeness: number;
    quality: number;
    requirements_met: number;
  };
  summary: string;
  issues: string[];
  recommendations: string[];
}

export interface MLTaskComplexityResponse {
  suggested_story_points: number;
  complexity_score: number;
  reasoning: string;
}

export interface MLQualityAssessmentResponse {
  overall_quality: number;
  areas_of_concern: string[];
  strengths: string[];
  comparison_to_similar: number;
}

// ============================================================================
// Default/Fallback Responses
// ============================================================================

const DEFAULT_SUBMISSION_RESPONSE: MLSubmissionResponse = {
  pass_probability: 0.8,
  confidence_breakdown: { completeness: 0.8, quality: 0.8, requirements_met: 0.8 },
  summary: 'AI review unavailable - using default confidence',
  issues: [],
  recommendations: []
};

const DEFAULT_COMPLEXITY_RESPONSE: MLTaskComplexityResponse = {
  suggested_story_points: 5,
  complexity_score: 0.5,
  reasoning: 'Default estimate - ML service unavailable'
};

const DEFAULT_QUALITY_RESPONSE: MLQualityAssessmentResponse = {
  overall_quality: 0.8,
  areas_of_concern: [],
  strengths: [],
  comparison_to_similar: 0.5
};

// ============================================================================
// API Client
// ============================================================================

async function mlFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  fallback: T
): Promise<T> {
  try {
    const response = await fetch(`${ML_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': ML_API_KEY ? `Bearer ${ML_API_KEY}` : '',
        ...options.headers
      }
    });

    if (!response.ok) {
      console.warn(`[ML API] Request failed: ${response.status} ${response.statusText}`);
      return fallback;
    }

    return await response.json();
  } catch (error) {
    console.warn('[ML API] Service unavailable:', error);
    return fallback;
  }
}

// ============================================================================
// ML API Methods
// ============================================================================

export const mlApi = {
  /**
   * Check if ML service is configured and available
   */
  isConfigured(): boolean {
    return !!ML_API_BASE && ML_API_BASE !== 'http://localhost:8000';
  },

  /**
   * Get AI confidence score for a task submission
   *
   * Called when a task is submitted for review.
   * The returned pass_probability becomes p0 in Shapley calculations.
   *
   * @param request - Submission data and task context
   * @returns Confidence score and analysis
   */
  async getSubmissionConfidence(request: MLSubmissionRequest): Promise<MLSubmissionResponse> {
    return mlFetch<MLSubmissionResponse>(
      '/api/v1/review/confidence',
      {
        method: 'POST',
        body: JSON.stringify(request)
      },
      DEFAULT_SUBMISSION_RESPONSE
    );
  },

  /**
   * Analyze task requirements for complexity scoring
   *
   * Used when creating tasks to suggest story points.
   *
   * @param task - Task title and description
   * @returns Suggested story points and complexity analysis
   */
  async analyzeTaskComplexity(task: { title: string; description: string }): Promise<MLTaskComplexityResponse> {
    return mlFetch<MLTaskComplexityResponse>(
      '/api/v1/task/complexity',
      {
        method: 'POST',
        body: JSON.stringify(task)
      },
      DEFAULT_COMPLEXITY_RESPONSE
    );
  },

  /**
   * Get quality assessment for QC decision support
   *
   * Called when QC reviewer views a task for additional context.
   *
   * @param taskId - The task ID to assess
   * @returns Quality assessment and comparison data
   */
  async getQualityAssessment(taskId: string): Promise<MLQualityAssessmentResponse> {
    return mlFetch<MLQualityAssessmentResponse>(
      `/api/v1/review/quality/${taskId}`,
      { method: 'GET' },
      DEFAULT_QUALITY_RESPONSE
    );
  },

  /**
   * Get default p0 value when ML is unavailable
   * Used as fallback in Shapley calculations
   */
  getDefaultConfidence(): number {
    return 0.8;
  }
};

export default mlApi;
