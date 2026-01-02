// supabase/functions/qc-ai-review/index.ts
// Triggers ML model for AI confidence scoring when a task is submitted

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types
interface QCAIRequest {
  task_id: string
}

interface MLSubmissionRequest {
  task_id: string
  submission_data: {
    notes: string
    artifacts: Array<{
      type: 'file' | 'github_pr' | 'url'
      data: Record<string, unknown>
    }>
  }
  task_context: {
    title: string
    description: string
    requirements?: string
    story_points?: number
  }
}

interface MLSubmissionResponse {
  pass_probability: number
  confidence_breakdown: {
    completeness: number
    quality: number
    requirements_met: number
  }
  summary: string
  issues: string[]
  recommendations: string[]
}

// Default response when ML service is unavailable
const DEFAULT_ML_RESPONSE: MLSubmissionResponse = {
  pass_probability: 0.8,
  confidence_breakdown: {
    completeness: 0.8,
    quality: 0.8,
    requirements_met: 0.8
  },
  summary: 'AI review unavailable - using default confidence',
  issues: [],
  recommendations: []
}

// Call external ML service for confidence scoring
async function getMLConfidence(request: MLSubmissionRequest): Promise<MLSubmissionResponse> {
  const mlApiUrl = Deno.env.get('ML_API_URL')
  const mlApiKey = Deno.env.get('ML_API_KEY')

  // If ML service not configured, return default
  if (!mlApiUrl) {
    console.log('[QC-AI] ML_API_URL not configured, using default confidence')
    return DEFAULT_ML_RESPONSE
  }

  try {
    const response = await fetch(`${mlApiUrl}/api/v1/review/confidence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mlApiKey ? `Bearer ${mlApiKey}` : ''
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      console.warn(`[QC-AI] ML API request failed: ${response.status}`)
      return DEFAULT_ML_RESPONSE
    }

    return await response.json()
  } catch (error) {
    console.warn('[QC-AI] ML service unavailable:', error)
    return DEFAULT_ML_RESPONSE
  }
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body: QCAIRequest = await req.json()
    const { task_id } = body

    if (!task_id) {
      throw new Error('task_id is required')
    }

    console.log(`[QC-AI] Processing task: ${task_id}`)

    // Fetch task with submission data
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(`
        *,
        project:projects(id, name, description)
      `)
      .eq('id', task_id)
      .single()

    if (taskError || !task) {
      throw new Error(`Task not found: ${taskError?.message}`)
    }

    // Check if AI review already exists for this task
    const { data: existingReview } = await supabase
      .from('qc_reviews')
      .select('id')
      .eq('task_id', task_id)
      .eq('review_type', 'ai')
      .maybeSingle()

    if (existingReview) {
      console.log(`[QC-AI] AI review already exists for task: ${task_id}`)
      return new Response(JSON.stringify({
        success: true,
        message: 'AI review already exists',
        review_id: existingReview.id
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Prepare ML request
    const submissionData = task.submission_data || { notes: '', artifacts: [] }
    const artifacts = (submissionData.artifacts || []).map((a: Record<string, unknown>) => ({
      type: a.type,
      data: a
    }))

    const mlRequest: MLSubmissionRequest = {
      task_id,
      submission_data: {
        notes: submissionData.notes || '',
        artifacts
      },
      task_context: {
        title: task.title,
        description: task.description || '',
        requirements: task.requirements || undefined,
        story_points: task.story_points || undefined
      }
    }

    // Call ML service
    console.log(`[QC-AI] Calling ML service for task: ${task_id}`)
    const mlResponse = await getMLConfidence(mlRequest)

    console.log(`[QC-AI] ML confidence: ${mlResponse.pass_probability}`)

    // Create AI review record
    const { data: review, error: reviewError } = await supabase
      .from('qc_reviews')
      .insert({
        org_id: task.org_id,
        task_id,
        reviewer_id: null, // AI review has no human reviewer
        review_type: 'ai',
        passed: mlResponse.pass_probability > 0.5,
        confidence: mlResponse.pass_probability,
        feedback: mlResponse.summary,
        pass_number: 1,
        weight: 0, // AI review has weight 0 in Shapley calculations
        v0: task.dollar_value * 0.7, // Worker baseline
        d_k: 0 // Marginal contribution set when human reviews
      })
      .select()
      .single()

    if (reviewError) {
      throw new Error(`Failed to create AI review: ${reviewError.message}`)
    }

    // Update task status to under_review
    await supabase
      .from('tasks')
      .update({ status: 'under_review' })
      .eq('id', task_id)

    console.log(`[QC-AI] Created AI review: ${review.id}`)

    return new Response(JSON.stringify({
      success: true,
      review_id: review.id,
      confidence: mlResponse.pass_probability,
      passed: mlResponse.pass_probability > 0.5,
      summary: mlResponse.summary,
      confidence_breakdown: mlResponse.confidence_breakdown,
      issues: mlResponse.issues,
      recommendations: mlResponse.recommendations
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('[QC-AI] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
