/**
 * ML Model API Service
 *
 * Handles communication with the external ML model server for:
 * - Submission confidence scoring (p0 for Shapley calculations)
 * - Task complexity analysis
 * - Quality assessments
 *
 * All requests are routed through the Supabase `qc-ai-review` edge function,
 * which reads the ML endpoint from the `ML_API_URL` secret. This avoids
 * exposing ML credentials to the browser.
 *
 * Setup:
 *   supabase secrets set ML_API_URL=https://your-ml-api.com
 *   supabase secrets set ML_API_KEY=your-api-key
 *   supabase functions deploy qc-ai-review
 *
 * See xtraDocs/ML_INTEGRATION.md for full integration guide.
 */

import { functions } from '$lib/services/supabase';

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
// Edge Function Client
// ============================================================================

/**
 * Invoke the qc-ai-review edge function with the given action and payload.
 * All ML requests are routed through this single edge function, which holds
 * the ML_API_URL and ML_API_KEY secrets server-side.
 */
async function invokeML<T>(
  action: string,
  payload: Record<string, unknown>,
  fallback: T
): Promise<T> {
  try {
    const { data, error } = await functions.invoke<T>('qc-ai-review', {
      body: { action, ...payload }
    });

    if (error || !data) {
      console.warn(`[ML API] Edge function error (${action}):`, error);
      return fallback;
    }

    return data;
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
   * Get AI confidence score for a task submission
   *
   * Called when a task is submitted for review.
   * The returned pass_probability becomes p0 in Shapley calculations.
   *
   * @param request - Submission data and task context
   * @returns Confidence score and analysis
   */
  async getSubmissionConfidence(request: MLSubmissionRequest): Promise<MLSubmissionResponse> {
    return invokeML<MLSubmissionResponse>(
      'confidence',
      { task_id: request.task_id, submission_data: request.submission_data, task_context: request.task_context },
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
    return invokeML<MLTaskComplexityResponse>(
      'complexity',
      { task_context: task },
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
    return invokeML<MLQualityAssessmentResponse>(
      'quality',
      { task_id: taskId },
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
