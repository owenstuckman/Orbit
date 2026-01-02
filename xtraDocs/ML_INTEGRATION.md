# ML Model Integration Guide

This document details where external ML model calls should be made for QC review confidence scoring and payout calculations.

## Overview

The Orbit platform uses a Shapley value-based payout system that relies on AI confidence scores (`p0`) to calculate fair compensation for QC reviewers. The ML model is maintained in a **separate repository** and accessed via API calls.

## Integration Points

### 1. Task Submission - Auto AI Review

**Location:** `src/lib/services/api.ts` - `tasksApi.submit()`

**When:** After a task is submitted (status changes to `completed`)

**What to do:**
```typescript
// In tasksApi.submit() after successful submission:
async submit(taskId: string, submissionData: TaskSubmissionData, files?: File[]): Promise<Task | null> {
  // ... existing submission logic ...

  // INTEGRATION POINT: Call ML model for initial confidence scoring
  // This creates an 'ai' type QC review with confidence (p0)
  const aiConfidence = await mlApi.getSubmissionConfidence({
    task_id: taskId,
    submission_data: submissionData,
    artifacts: submissionData.artifacts
  });

  // Create AI review record
  await qcApi.create({
    task_id: taskId,
    review_type: 'ai',
    passed: aiConfidence.pass_probability > 0.5,
    confidence: aiConfidence.pass_probability,
    feedback: aiConfidence.summary,
    pass_number: 1
  });

  return updatedTask;
}
```

**ML API Request Schema:**
```typescript
interface MLSubmissionRequest {
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
```

**ML API Response Schema:**
```typescript
interface MLSubmissionResponse {
  pass_probability: number;  // 0.0 to 1.0 - becomes p0 in Shapley calculations
  confidence_breakdown: {
    completeness: number;    // How complete is the submission
    quality: number;         // Quality of artifacts
    requirements_met: number; // How well requirements are met
  };
  summary: string;           // Human-readable assessment
  issues: string[];          // List of potential issues found
  recommendations: string[]; // Suggestions for improvement
}
```

---

### 2. QC Payout Calculation

**Location:** `src/lib/utils/payout.ts` - `calculateQCPayout()` and `computeQCMarginals()`

**When:** When calculating QC reviewer payouts

**Current Implementation (uses placeholder p0):**
```typescript
// In qc/+page.svelte - calculatePotentialPayout()
const aiReview = task.qc_reviews?.find(r => r.review_type === 'ai');
const p0 = aiReview?.confidence ?? 0.8; // Falls back to 0.8 if no AI review
```

**Required Flow:**
1. When task is submitted, AI review is created with `confidence` field (p0)
2. QC page fetches task with `qc_reviews` relationship
3. Shapley calculations use the AI review's `confidence` as p0

**Shapley Formulas Using p0:**
```
d_1 = β × p0 × V        (First pass marginal, confidence-scaled)
d_k = d_1 × γ^(k-1)     (Successive passes with geometric decay)

Where:
- V = task.dollar_value
- β = org.qc_beta (default: 0.25)
- γ = org.qc_gamma (default: 0.4)
- p0 = AI confidence from ML model (0.0 to 1.0)
- k = pass number (1, 2, 3, ...)
```

---

### 3. Suggested ML Service Implementation

**Create:** `src/lib/services/ml.ts`

```typescript
import { env } from '$env/dynamic/public';

const ML_API_BASE = env.PUBLIC_ML_API_URL || 'http://localhost:8000';

export interface MLConfig {
  apiKey?: string;
  timeout?: number;
}

export const mlApi = {
  /**
   * Get AI confidence score for a task submission
   * This is called when a task is submitted for review
   */
  async getSubmissionConfidence(request: MLSubmissionRequest): Promise<MLSubmissionResponse> {
    const response = await fetch(`${ML_API_BASE}/api/v1/review/confidence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.PUBLIC_ML_API_KEY || ''}`
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      console.error('ML API error:', response.status);
      // Return fallback confidence on error
      return {
        pass_probability: 0.8,
        confidence_breakdown: { completeness: 0.8, quality: 0.8, requirements_met: 0.8 },
        summary: 'AI review unavailable - using default confidence',
        issues: [],
        recommendations: []
      };
    }

    return response.json();
  },

  /**
   * Analyze task requirements for complexity scoring
   * Used when creating tasks to suggest story points
   */
  async analyzeTaskComplexity(task: { title: string; description: string }): Promise<{
    suggested_story_points: number;
    complexity_score: number;
    reasoning: string;
  }> {
    const response = await fetch(`${ML_API_BASE}/api/v1/task/complexity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.PUBLIC_ML_API_KEY || ''}`
      },
      body: JSON.stringify(task)
    });

    if (!response.ok) {
      return { suggested_story_points: 5, complexity_score: 0.5, reasoning: 'Default estimate' };
    }

    return response.json();
  },

  /**
   * Get quality assessment for QC decision support
   * Called when QC reviewer views a task for additional context
   */
  async getQualityAssessment(taskId: string): Promise<{
    overall_quality: number;
    areas_of_concern: string[];
    strengths: string[];
    comparison_to_similar: number;
  }> {
    const response = await fetch(`${ML_API_BASE}/api/v1/review/quality/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${env.PUBLIC_ML_API_KEY || ''}`
      }
    });

    if (!response.ok) {
      return {
        overall_quality: 0.8,
        areas_of_concern: [],
        strengths: [],
        comparison_to_similar: 0.5
      };
    }

    return response.json();
  }
};
```

---

### 4. Environment Variables Required

Add to `.env`:
```env
# ML Model API Configuration
PUBLIC_ML_API_URL=https://ml.your-domain.com
PUBLIC_ML_API_KEY=your-api-key-here
```

---

### 5. Integration Checklist

#### Phase 1: Basic Integration
- [ ] Create `src/lib/services/ml.ts` with API client
- [ ] Add environment variables for ML service URL
- [ ] Modify `tasksApi.submit()` to call ML API on submission
- [ ] Store AI confidence in `qc_reviews` table with `review_type: 'ai'`

#### Phase 2: QC Enhancement
- [ ] Display AI confidence prominently in QC review queue
- [ ] Show confidence breakdown (completeness, quality, requirements)
- [ ] Add "AI suggested decision" indicator (but keep human final decision)
- [ ] Update payout preview to use real p0 values

#### Phase 3: Advanced Features
- [ ] Add ML-suggested story points during task creation
- [ ] Implement quality trend analysis for workers
- [ ] Add automated flagging of suspicious submissions
- [ ] Create ML model performance dashboard for admins

---

### 6. Database Fields for ML Data

The following fields in `qc_reviews` table store ML-related data:

```sql
-- Existing fields that store ML output:
review_type TEXT          -- 'ai' | 'peer' | 'independent'
confidence DECIMAL        -- p0 value (0.0 to 1.0) from ML model
feedback TEXT             -- ML-generated summary/feedback
passed BOOLEAN            -- ML recommendation (confidence > 0.5)

-- Shapley calculation fields:
v0 DECIMAL               -- Worker baseline (V × 0.7)
d_k DECIMAL              -- Marginal contribution for this pass
weight DECIMAL           -- Review weight (ai=0, peer=1, independent=2)
pass_number INTEGER      -- Which QC pass this is (1, 2, 3...)
```

---

### 7. Fallback Behavior

When ML service is unavailable:
1. Log warning but don't block submission
2. Use default `p0 = 0.8` for Shapley calculations
3. Skip AI review creation (or create with `confidence: null`)
4. Display "AI review unavailable" in QC queue
5. QC reviewers proceed with manual review only

---

### 8. API Endpoints Summary

| Endpoint | Method | Purpose | Called From |
|----------|--------|---------|-------------|
| `/api/v1/review/confidence` | POST | Get submission confidence | `tasksApi.submit()` |
| `/api/v1/task/complexity` | POST | Analyze task complexity | `TaskCreateModal` |
| `/api/v1/review/quality/:taskId` | GET | Get quality assessment | QC page |

---

### 9. Testing the Integration

```typescript
// Test ML integration in browser console:
import { mlApi } from '$lib/services/ml';

// Test confidence scoring
const result = await mlApi.getSubmissionConfidence({
  task_id: 'test-123',
  submission_data: {
    notes: 'Implemented the feature as requested',
    artifacts: [
      { type: 'github_pr', data: { url: 'https://github.com/...' } }
    ]
  },
  task_context: {
    title: 'Add login button',
    description: 'Add a login button to the header'
  }
});

console.log('Confidence:', result.pass_probability);
console.log('Issues:', result.issues);
```

---

## Related Documentation

- See `FORMULAS.md` for complete Shapley value formulas
- See `TECHNICAL_ARCHITECTURE.md` for system overview
- See CLAUDE.md for ML model status note (external repo, completed)
