# ML Model Integration Design Document

## ML Model File Storage (joblib)

**Supabase Storage Location:**
```
Bucket:  ml-models (create as PRIVATE bucket)
Path:    ml-models/qc-model.joblib
```

**Setup Steps:**
1. Go to Supabase Dashboard > Storage
2. Create bucket named `ml-models` with **private** access
3. Upload your `qc-model.joblib` file
4. Access via service role key only (never expose to client)

**Alternative: External ML API (Recommended)**
- Host model as separate service (FastAPI, Flask, etc.)
- Set `ML_API_URL` and `ML_API_KEY` as Supabase secrets
- Edge function calls your API, doesn't load joblib directly

---

## Executive Summary

This document outlines the integration of the external QC ML model with the Orbit frontend. The ML model provides confidence scoring (`p0`) for task submissions, which feeds into Shapley value-based payout calculations for QC reviewers.

**Current State**: The frontend has the ML service client (`src/lib/services/ml.ts`) fully implemented with types and fallback handling. The integration points are identified but not wired up.

**Goal**: Connect the ML model API to the task submission flow, creating AI reviews that power real-time payout calculations.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ORBIT FRONTEND                              │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ Task Submit  │───▶│  tasksApi    │───▶│  Edge Function       │  │
│  │ (Employee)   │    │  .submit()   │    │  qc-ai-review        │  │
│  └──────────────┘    └──────────────┘    └──────────┬───────────┘  │
│                                                      │              │
│                                          ┌───────────▼───────────┐  │
│                                          │   ML API Client       │  │
│                                          │   (ml.ts)             │  │
│                                          └───────────┬───────────┘  │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │
                                                       ▼
                                          ┌────────────────────────┐
                                          │  YOUR ML MODEL         │
                                          │  /api/v1/review/       │
                                          │       confidence       │
                                          │                        │
                                          │  Returns: p0, summary, │
                                          │  issues, breakdown     │
                                          └────────────────────────┘
                                                       │
                                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         ORBIT FRONTEND                               │
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐ │
│  │  qc_reviews      │◀───│  qcApi.create()  │◀───│ AI Review      │ │
│  │  (Supabase)      │    │  review_type:ai  │    │ Record Created │ │
│  └────────┬─────────┘    └──────────────────┘    └────────────────┘ │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐ │
│  │  QC Page         │───▶│  Shapley Calc    │───▶│ Payout Preview │ │
│  │  (Reviewer)      │    │  uses p0 value   │    │ Real Numbers   │ │
│  └──────────────────┘    └──────────────────┘    └────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## What's Already Implemented

### ✅ ML Service Client (`src/lib/services/ml.ts`)
- Type definitions: `MLSubmissionRequest`, `MLSubmissionResponse`
- API methods: `getSubmissionConfidence()`, `analyzeTaskComplexity()`, `getQualityAssessment()`
- Fallback handling: Returns `p0 = 0.8` when ML service unavailable
- Configuration: `VITE_ML_API_URL`, `VITE_ML_API_KEY` env vars

### ✅ Shapley Value Calculations (`src/lib/utils/payout.ts`)
- `computeQCMarginals()` - Calculates d_k values using p0
- `calculateQCPayout()` - Sums marginals for total payout
- Formulas: `d_1 = β × p0 × V`, `d_k = d_1 × γ^(k-1)`

### ✅ QC Page UI (`src/routes/(app)/qc/+page.svelte`)
- Displays AI confidence badges (color-coded by score)
- Shows payout previews using Shapley calculations
- Falls back to `p0 = 0.8` when no AI review exists

### ✅ Feature Flag (`ai_qc_review`)
- Defined in `src/lib/config/featureFlags.ts`
- Disabled by default

---

## What Needs Implementation

### 1. Edge Function: `qc-ai-review`

**Location**: `supabase/functions/qc-ai-review/index.ts`

This edge function is invoked after task submission but doesn't exist yet.

```typescript
// supabase/functions/qc-ai-review/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ML_API_URL = Deno.env.get("ML_API_URL") || "http://localhost:8000";
const ML_API_KEY = Deno.env.get("ML_API_KEY") || "";

interface MLSubmissionRequest {
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

Deno.serve(async (req: Request) => {
  try {
    const { task_id } = await req.json();

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch task with submission data
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, title, description, story_points, submission_data")
      .eq("id", task_id)
      .single();

    if (taskError || !task) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404,
      });
    }

    // Call ML model
    const mlRequest: MLSubmissionRequest = {
      task_id: task.id,
      submission_data: task.submission_data || { notes: "", artifacts: [] },
      task_context: {
        title: task.title,
        description: task.description || "",
        story_points: task.story_points,
      },
    };

    const mlResponse = await fetch(`${ML_API_URL}/api/v1/review/confidence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ML_API_KEY ? `Bearer ${ML_API_KEY}` : "",
      },
      body: JSON.stringify(mlRequest),
    });

    let confidence = 0.8;
    let summary = "AI review unavailable";
    let passed = true;

    if (mlResponse.ok) {
      const mlData = await mlResponse.json();
      confidence = mlData.pass_probability;
      summary = mlData.summary;
      passed = confidence > 0.5;
    }

    // Create AI review record
    const { error: reviewError } = await supabase.from("qc_reviews").insert({
      task_id: task_id,
      review_type: "ai",
      passed: passed,
      confidence: confidence,
      feedback: summary,
      pass_number: 1,
      weight: 0, // AI reviews are informational only
    });

    if (reviewError) {
      console.error("Failed to create AI review:", reviewError);
      return new Response(JSON.stringify({ error: "Failed to create review" }), {
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        confidence,
        passed,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("QC AI Review error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
});
```

### 2. Environment Configuration

**Supabase Edge Function Secrets**:
```bash
supabase secrets set ML_API_URL=https://your-ml-model-endpoint.com
supabase secrets set ML_API_KEY=your-secret-api-key
```

**Frontend `.env`**:
```env
VITE_ML_API_URL=https://your-ml-model-endpoint.com
VITE_ML_API_KEY=your-publishable-api-key  # if needed for direct calls
```

### 3. ML Model API Contract

Your ML model must implement this endpoint:

**Endpoint**: `POST /api/v1/review/confidence`

**Request**:
```json
{
  "task_id": "uuid-string",
  "submission_data": {
    "notes": "string - employee's submission notes",
    "artifacts": [
      {
        "type": "file | github_pr | url",
        "data": {
          "filename": "report.pdf",
          "url": "storage-url",
          "...": "artifact-specific fields"
        }
      }
    ]
  },
  "task_context": {
    "title": "Task title",
    "description": "Full task description",
    "requirements": "Optional specific requirements",
    "story_points": 5
  }
}
```

**Response**:
```json
{
  "pass_probability": 0.85,
  "confidence_breakdown": {
    "completeness": 0.9,
    "quality": 0.8,
    "requirements_met": 0.85
  },
  "summary": "Submission appears complete with all required artifacts...",
  "issues": ["Minor: Missing unit tests"],
  "recommendations": ["Consider adding documentation"]
}
```

---

## Integration Options

### Option A: Edge Function Only (Recommended)

All ML calls go through the Supabase edge function. This is the cleanest approach.

**Pros**:
- Single integration point
- API keys stay server-side
- Consistent error handling
- Easy to add retry logic

**Cons**:
- Slight latency overhead
- Edge function cold starts

**Flow**:
```
Task Submit → tasksApi.submit() → Edge Function → ML Model → Create AI Review
```

### Option B: Hybrid (Frontend + Edge)

Edge function for submission, frontend for on-demand quality assessments.

**Pros**:
- Real-time quality insights in QC page
- Richer reviewer experience

**Cons**:
- API key exposed to frontend (needs separate publishable key)
- More complexity

**Flow**:
```
Submit: Task → Edge Function → ML Model → AI Review
QC View: QC Page → ml.ts → ML Model (quality assessment)
```

### Option C: Frontend Only

All ML calls from browser via `ml.ts`.

**Pros**:
- Simpler deployment
- No edge functions needed

**Cons**:
- API key in browser (security risk)
- CORS configuration needed
- User could inspect/manipulate

**Not recommended for production.**

---

## Implementation Phases

### Phase 1: Core Integration (MVP)

| Task | Location | Description |
|------|----------|-------------|
| Deploy edge function | `supabase/functions/qc-ai-review/` | Create and deploy the function |
| Set ML secrets | Supabase Dashboard | Configure `ML_API_URL`, `ML_API_KEY` |
| Test submission flow | Manual testing | Submit task, verify AI review created |
| Enable feature flag | Org settings | Set `ai_qc_review: true` |

### Phase 2: Enhanced QC Experience

| Task | Location | Description |
|------|----------|-------------|
| Display confidence breakdown | `qc/+page.svelte` | Show completeness/quality/requirements scores |
| Add AI summary panel | `QCReviewForm.svelte` | Display ML-generated summary and issues |
| Conditional UI | Components | Only show AI features when flag enabled |

### Phase 3: Advanced Features

| Task | Location | Description |
|------|----------|-------------|
| Task complexity suggestions | `TaskCreateModal.svelte` | Call ML for story point suggestions |
| Quality trends | Dashboard | Track worker quality over time |
| ML model monitoring | Admin page | View model performance metrics |

---

## Testing Strategy

### 1. Mock ML Server for Development

Create a simple mock server that returns predictable responses:

```typescript
// mock-ml-server.ts (run with Deno/Node for local testing)
const handler = async (req: Request): Promise<Response> => {
  if (req.url.includes("/api/v1/review/confidence")) {
    const body = await req.json();

    // Deterministic mock based on notes length
    const notesLength = body.submission_data?.notes?.length || 0;
    const confidence = Math.min(0.5 + notesLength * 0.01, 0.95);

    return new Response(JSON.stringify({
      pass_probability: confidence,
      confidence_breakdown: {
        completeness: confidence,
        quality: confidence - 0.1,
        requirements_met: confidence + 0.05
      },
      summary: `Mock review: ${notesLength} chars in notes`,
      issues: notesLength < 50 ? ["Notes too short"] : [],
      recommendations: []
    }));
  }

  return new Response("Not found", { status: 404 });
};

Deno.serve({ port: 8000 }, handler);
```

### 2. Integration Tests

```typescript
// Test that submission creates AI review
test("task submission triggers AI review", async () => {
  const task = await tasksApi.submit(taskId, {
    notes: "Completed the feature",
    artifacts: [{ type: "github_pr", data: { url: "..." } }]
  });

  // Wait for edge function
  await new Promise(r => setTimeout(r, 2000));

  // Verify AI review created
  const reviews = await qcApi.getByTaskId(taskId);
  const aiReview = reviews.find(r => r.review_type === "ai");

  expect(aiReview).toBeDefined();
  expect(aiReview.confidence).toBeGreaterThan(0);
  expect(aiReview.confidence).toBeLessThanOrEqual(1);
});
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| ML service timeout | Use fallback `p0 = 0.8`, create review with null confidence |
| ML service down | Log warning, skip AI review creation, continue flow |
| Invalid ML response | Parse what's available, use defaults for missing fields |
| Edge function error | Return 500, frontend shows "AI review pending" |

The system must never block task submission due to ML failures.

---

## Monitoring & Observability

### Metrics to Track

1. **ML API latency** - p50, p95, p99 response times
2. **AI review creation rate** - % of submissions with AI reviews
3. **Confidence distribution** - Histogram of p0 values
4. **Fallback rate** - How often default confidence is used
5. **Agreement rate** - AI passed vs human passed correlation

### Logging

```typescript
// Edge function logging
console.log(JSON.stringify({
  event: "ai_review_created",
  task_id: task_id,
  confidence: confidence,
  ml_latency_ms: Date.now() - startTime,
  used_fallback: !mlResponse.ok
}));
```

---

## Security Considerations

1. **API Key Storage**: ML API key stored as Supabase secret, never in frontend code
2. **Input Validation**: Validate task_id format before querying database
3. **Rate Limiting**: Consider rate limiting the edge function per user
4. **Output Sanitization**: Don't trust ML summary content for XSS vectors

---

## Rollback Plan

If issues arise after deployment:

1. **Disable feature flag**: Set `ai_qc_review: false` in organization settings
2. **System continues**: QC page uses fallback `p0 = 0.8`
3. **No data loss**: AI reviews created but ignored in calculations
4. **Debug at leisure**: Fix issues without user impact

---

## Next Steps Checklist

### Immediate (You do these)

- [ ] **Confirm ML model endpoint URL** - What's the deployed URL?
- [ ] **Confirm API authentication** - API key? OAuth? None?
- [ ] **Test ML endpoint** - `curl` the `/api/v1/review/confidence` endpoint
- [ ] **Verify response format** - Match the contract above or adjust

### Implementation (Can be done together)

- [ ] Create `supabase/functions/qc-ai-review/index.ts` with the code above
- [ ] Deploy: `supabase functions deploy qc-ai-review`
- [ ] Set secrets: `supabase secrets set ML_API_URL=... ML_API_KEY=...`
- [ ] Test locally: `supabase functions serve` with mock ML server
- [ ] Enable feature flag for test organization
- [ ] Submit test task and verify AI review creation
- [ ] Check QC page displays real confidence values

### Follow-up

- [ ] Add confidence breakdown display to QC page
- [ ] Show ML issues/recommendations in review panel
- [ ] Add monitoring/alerting for ML service health
- [ ] Document the deployed ML model's specific capabilities

---

## Questions to Answer

1. **What's your ML model endpoint URL?**
2. **What authentication does it require?**
3. **Does it need CORS headers for browser calls?** (Only if using Option B/C)
4. **What's the expected latency?** (For timeout configuration)
5. **Any rate limits?** (For retry/backoff logic)
