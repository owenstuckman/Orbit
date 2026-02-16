# ML Feature Usage Guide

How to enable, test, and troubleshoot the AI-powered QC features in Orbit.

## Prerequisites

1. **ML model deployed** — The QC ML model must be running and accessible via HTTP (e.g., on Render). See `ML_MODEL_HOSTING.md`.
2. **Supabase secrets configured**:
   ```bash
   supabase secrets set ML_API_URL=https://your-ml-api.onrender.com
   supabase secrets set ML_API_KEY=your-api-key
   ```
3. **Edge function deployed**:
   ```bash
   supabase functions deploy qc-ai-review
   ```
4. **`ai_qc_review` feature flag enabled** — See below.

## Enabling the Feature Flag

1. Log in as an **admin** user.
2. Navigate to **Settings > Feature Flags** (the `FeatureFlagsPanel` component).
3. Toggle **AI QC Review** to enabled.
4. Save changes.

Alternatively, choose the **all_features** or **standard** preset during organization registration — `standard` enables AI QC by default.

Programmatically:
```typescript
import { organizationsApi } from '$lib/services/api';

await organizationsApi.updateFeatureFlags(orgId, { ai_qc_review: true });
```

## Features

### 1. Confidence Scoring (Automatic on Task Submission)

When a worker submits a task and `ai_qc_review` is enabled, the system automatically:
1. Calls the `qc-ai-review` edge function
2. The edge function sends submission data to the ML API
3. A `qc_reviews` record (type `ai`, weight `0`) is created with the confidence score (`p0`)
4. The confidence badge appears in the QC review queue

**How to test:**
1. As a PM/admin, create a task and assign it to a worker
2. As the worker, accept and submit the task with submission data
3. Navigate to the QC page — the task should show an AI confidence badge (e.g., "87%")

If `ai_qc_review` is disabled, the edge function call is skipped entirely.

### 2. Story Point Suggestions (Task Creation)

When creating a task, PMs and admins see an **"AI Suggest"** button next to the story point presets.

**How to test:**
1. As a PM or admin, open the task creation modal
2. Enter a title and optionally a description
3. Click the **AI Suggest** button (purple, with sparkle icon)
4. The system calls `mlApi.analyzeTaskComplexity()` and auto-selects the suggested story point value
5. The AI's reasoning appears below the presets

The button only appears when `ai_qc_review` is enabled.

### 3. AI Quality Assessment (QC Review Page)

When a QC reviewer selects a task, the system fetches an AI quality assessment showing:
- **Overall quality score** — displayed as a percentage bar
- **Strengths** — what the submission does well
- **Areas of concern** — potential issues flagged by the model
- **Comparison to similar tasks** — percentile ranking

**How to test:**
1. As a QC reviewer or admin, navigate to the QC page
2. Select a task from the review queue
3. The "AI Quality Assessment" card loads below the submission details

### 4. AI Confidence Breakdown (QC Review Page)

When an AI review exists for a task, the QC page shows a detailed breakdown:
- **Completeness** — how complete the submission is
- **Quality** — code/work quality score
- **Requirements Met** — how well requirements are addressed
- **Issues** — specific problems identified by the model
- **Recommendations** — suggested improvements

This appears in the "AI Confidence Breakdown" card above the quality assessment.

## Troubleshooting

### AI features not showing up
- Verify the `ai_qc_review` feature flag is enabled in your organization settings
- Check browser console for errors loading feature flags

### "AI review unavailable - using default confidence"
- The ML API is unreachable. Check that `ML_API_URL` is set correctly:
  ```bash
  supabase secrets list
  ```
- Verify the ML service is running:
  ```bash
  curl https://your-ml-api.onrender.com/health
  ```

### Edge function errors
Check Supabase function logs:
```bash
supabase functions logs qc-ai-review
```

Common issues:
- **`ML_API_URL` not set** — Run `supabase secrets set ML_API_URL=...`
- **`ML_API_KEY` invalid** — Rotate the key and update the secret
- **Timeout** — The ML model may be cold-starting (Render free tier spins down after inactivity). Wait 30s and retry.

### AI Suggest button shows error
- Ensure title is filled in before clicking
- Check browser console for network errors
- The edge function must support the `complexity` action (verify deployment is up to date)

### Quality assessment shows "No AI assessment available"
- The edge function must support the `quality` action
- Verify the task ID is valid and the task has submission data

## Architecture

All ML requests flow through a single Supabase edge function (`qc-ai-review`) to keep API credentials server-side:

```
Browser → mlApi (src/lib/services/ml.ts)
       → functions.invoke('qc-ai-review', { action, ... })
       → Edge Function (supabase/functions/qc-ai-review/)
       → ML API (external, e.g., Render)
```

The edge function dispatches based on the `action` field:
- `confidence` — Score a task submission (creates a `qc_reviews` record)
- `complexity` — Analyze task complexity for story point suggestions
- `quality` — Assess submission quality for QC decision support

Feature flag enforcement:
- **`api.ts`** — `tasksApi.submit()` checks `isFeatureEnabled('ai_qc_review')` before calling the edge function
- **Components** — UI elements use `$features.ai_qc_review` reactive store to conditionally render
