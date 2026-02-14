/**
 * QC AI Review Edge Function
 *
 * Called after task submission to get ML confidence score (p0).
 * Creates an AI review record used in Shapley payout calculations.
 * Also handles complexity analysis and quality assessment requests.
 *
 * FLOW:
 *   Task Submit → This Function → ML API → qc_reviews table
 *
 * SECRETS (single configuration point for the ML endpoint):
 *   supabase secrets set ML_API_URL=https://your-ml-api.com
 *   supabase secrets set ML_API_KEY=your-api-key
 *
 * DEPLOY:
 *   supabase functions deploy qc-ai-review
 *
 * DOCS:
 *   xtraDocs/ML_INTEGRATION.md     - Integration overview
 *   xtraDocs/ML_MODEL_HOSTING.md   - How to host the ML model
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Environment config — ML_API_URL is the single env var for the ML endpoint
const ML_API_URL = Deno.env.get("ML_API_URL") || "http://localhost:8000";
const ML_API_KEY = Deno.env.get("ML_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Default confidence when ML unavailable (0.8 = 80% pass probability)
const DEFAULT_CONFIDENCE = 0.8;

// ML request/response types
interface MLRequest {
  task_id: string;
  submission_data: {
    notes: string;
    artifacts: Array<{ type: string; data: Record<string, unknown> }>;
  };
  task_context: {
    title: string;
    description: string;
    requirements?: string;
    story_points?: number;
  };
}

interface MLResponse {
  pass_probability: number; // 0.0-1.0, becomes p0 in Shapley calc
  confidence_breakdown: {
    completeness: number;
    quality: number;
    requirements_met: number;
  };
  summary: string;
  issues: string[];
  recommendations: string[];
}

interface MLComplexityResponse {
  suggested_story_points: number;
  complexity_score: number;
  reasoning: string;
}

interface MLQualityResponse {
  overall_quality: number;
  areas_of_concern: string[];
  strengths: string[];
  comparison_to_similar: number;
}

// ============================================================================
// ML API Helpers
// ============================================================================

/** Common headers for ML API requests */
function mlHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ML_API_KEY) {
    headers["Authorization"] = `Bearer ${ML_API_KEY}`;
  }
  return headers;
}

/**
 * Call the ML model API for confidence scoring
 * Returns default response on failure (never blocks submission)
 */
async function getMLConfidence(request: MLRequest): Promise<MLResponse> {
  try {
    const response = await fetch(`${ML_API_URL}/api/v1/review/confidence`, {
      method: "POST",
      headers: mlHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.warn(`ML API returned ${response.status}`);
      return getDefaultResponse();
    }

    return await response.json();
  } catch (error) {
    console.warn("ML API unreachable:", error);
    return getDefaultResponse();
  }
}

/**
 * Call the ML model API for task complexity analysis
 */
async function getMLComplexity(taskContext: { title: string; description: string }): Promise<MLComplexityResponse> {
  const fallback: MLComplexityResponse = {
    suggested_story_points: 5,
    complexity_score: 0.5,
    reasoning: "Default estimate - ML service unavailable",
  };

  try {
    const response = await fetch(`${ML_API_URL}/api/v1/task/complexity`, {
      method: "POST",
      headers: mlHeaders(),
      body: JSON.stringify(taskContext),
    });

    if (!response.ok) {
      console.warn(`ML API complexity returned ${response.status}`);
      return fallback;
    }

    return await response.json();
  } catch (error) {
    console.warn("ML API unreachable for complexity:", error);
    return fallback;
  }
}

/**
 * Call the ML model API for quality assessment
 */
async function getMLQuality(taskId: string): Promise<MLQualityResponse> {
  const fallback: MLQualityResponse = {
    overall_quality: 0.8,
    areas_of_concern: [],
    strengths: [],
    comparison_to_similar: 0.5,
  };

  try {
    const response = await fetch(`${ML_API_URL}/api/v1/review/quality/${taskId}`, {
      method: "GET",
      headers: mlHeaders(),
    });

    if (!response.ok) {
      console.warn(`ML API quality returned ${response.status}`);
      return fallback;
    }

    return await response.json();
  } catch (error) {
    console.warn("ML API unreachable for quality:", error);
    return fallback;
  }
}

/**
 * Fallback response when ML service unavailable
 */
function getDefaultResponse(): MLResponse {
  return {
    pass_probability: DEFAULT_CONFIDENCE,
    confidence_breakdown: {
      completeness: DEFAULT_CONFIDENCE,
      quality: DEFAULT_CONFIDENCE,
      requirements_met: DEFAULT_CONFIDENCE,
    },
    summary: "AI review unavailable - using default confidence",
    issues: [],
    recommendations: [],
  };
}

// ============================================================================
// Request Handlers
// ============================================================================

/**
 * Handle confidence scoring (default action)
 * Fetches task, calls ML API, creates qc_reviews record
 */
async function handleConfidence(taskId: string): Promise<Response> {
  if (!taskId || typeof taskId !== "string") {
    return jsonResponse({ error: "task_id required" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch task with submission data
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, description, story_points, submission_data")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    console.error("Task fetch failed:", taskError);
    return jsonResponse({ error: "Task not found" }, 404);
  }

  // Build ML request
  const mlRequest: MLRequest = {
    task_id: task.id,
    submission_data: task.submission_data || { notes: "", artifacts: [] },
    task_context: {
      title: task.title,
      description: task.description || "",
      story_points: task.story_points,
    },
  };

  // Get ML confidence score
  const mlResponse = await getMLConfidence(mlRequest);
  const confidence = mlResponse.pass_probability;
  const passed = confidence > 0.5;

  // Create AI review record
  // weight=0 because AI reviews are informational only (human reviews have weight)
  const { error: reviewError } = await supabase.from("qc_reviews").insert({
    task_id: taskId,
    review_type: "ai",
    passed: passed,
    confidence: confidence,
    feedback: mlResponse.summary,
    pass_number: 1,
    weight: 0,
  });

  if (reviewError) {
    console.error("Review insert failed:", reviewError);
    return jsonResponse({ error: "Failed to create review" }, 500);
  }

  console.log(`AI review created: task=${taskId} confidence=${confidence}`);
  return jsonResponse({
    success: true,
    task_id: taskId,
    confidence: confidence,
    passed: passed,
    summary: mlResponse.summary,
    confidence_breakdown: mlResponse.confidence_breakdown,
    issues: mlResponse.issues,
    recommendations: mlResponse.recommendations,
  });
}

/**
 * Handle complexity analysis (no DB write, just proxy to ML)
 */
async function handleComplexity(taskContext: { title: string; description: string }): Promise<Response> {
  const result = await getMLComplexity(taskContext);
  return jsonResponse(result);
}

/**
 * Handle quality assessment (no DB write, just proxy to ML)
 */
async function handleQuality(taskId: string): Promise<Response> {
  if (!taskId || typeof taskId !== "string") {
    return jsonResponse({ error: "task_id required" }, 400);
  }
  const result = await getMLQuality(taskId);
  return jsonResponse(result);
}

// ============================================================================
// Utilities
// ============================================================================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const action = body.action || "confidence";

    switch (action) {
      case "confidence":
        return await handleConfidence(body.task_id);

      case "complexity":
        return await handleComplexity(body.task_context || {});

      case "quality":
        return await handleQuality(body.task_id);

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error("Edge function error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
