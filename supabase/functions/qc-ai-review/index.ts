/**
 * QC AI Review Edge Function
 *
 * Called after task submission to get ML confidence score (p0).
 * Creates an AI review record used in Shapley payout calculations.
 *
 * FLOW:
 *   Task Submit → This Function → ML API → qc_reviews table
 *
 * SECRETS:
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

// Environment config
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

/**
 * Call the ML model API for confidence scoring
 * Returns default response on failure (never blocks submission)
 */
async function getMLConfidence(request: MLRequest): Promise<MLResponse> {
  try {
    const response = await fetch(`${ML_API_URL}/api/v1/review/confidence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ML_API_KEY && { Authorization: `Bearer ${ML_API_KEY}` }),
      },
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

// Main handler
Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { task_id } = await req.json();

    // Validate input
    if (!task_id || typeof task_id !== "string") {
      return new Response(JSON.stringify({ error: "task_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Init Supabase client with service role (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch task with submission data
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, title, description, story_points, submission_data")
      .eq("id", task_id)
      .single();

    if (taskError || !task) {
      console.error("Task fetch failed:", taskError);
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
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
      task_id: task_id,
      review_type: "ai",
      passed: passed,
      confidence: confidence,
      feedback: mlResponse.summary,
      pass_number: 1,
      weight: 0,
    });

    if (reviewError) {
      console.error("Review insert failed:", reviewError);
      return new Response(JSON.stringify({ error: "Failed to create review" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Success response
    console.log(`AI review created: task=${task_id} confidence=${confidence}`);
    return new Response(
      JSON.stringify({
        success: true,
        task_id: task_id,
        confidence: confidence,
        passed: passed,
        summary: mlResponse.summary,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
