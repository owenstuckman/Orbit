# ML Integration

Connect your QC confidence model to Orbit's task submission flow.

---

## Storage Options

**Option A: External API (Recommended)**
```
Host model as FastAPI service → Edge function calls API
See: ML_MODEL_HOSTING.md for complete setup guide
```

**Option B: Supabase Storage**
```
Bucket:  ml-models (PRIVATE)
Path:    ml-models/qc-model.joblib
```

---

## Architecture

```
Task Submit → tasksApi.submit() → Edge Function → ML API → AI Review Created
                                       ↓
                                  qc_reviews table
                                  (review_type='ai')
                                       ↓
                              QC Page uses p0 for
                              Shapley payout calc
```

---

## Files

| File | Purpose |
|------|---------|
| `supabase/functions/qc-ai-review/index.ts` | Edge function (calls ML API) |
| `src/lib/services/ml.ts` | Frontend ML client (fallback calls) |
| `src/lib/utils/payout.ts` | Shapley calculations using p0 |
| `src/lib/config/featureFlags.ts` | `ai_qc_review` flag |

---

## API Contract

**Endpoint**: `POST /api/v1/review/confidence`

**Request**:
```json
{
  "task_id": "uuid",
  "submission_data": {
    "notes": "Employee notes",
    "artifacts": [{"type": "file|github_pr|url", "data": {...}}]
  },
  "task_context": {
    "title": "Task title",
    "description": "Task description",
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
    "quality": 0.85,
    "requirements_met": 0.8
  },
  "summary": "Human-readable assessment",
  "issues": ["List of concerns"],
  "recommendations": ["Suggestions"]
}
```

---

## Setup Steps

### 1. Deploy ML API
See `ML_MODEL_HOSTING.md` for FastAPI setup and deployment options.

### 2. Set Secrets
```bash
supabase secrets set ML_API_URL=https://your-ml-api.com
supabase secrets set ML_API_KEY=your-api-key
```

### 3. Deploy Edge Function
```bash
supabase functions deploy qc-ai-review
```

### 4. Enable Feature Flag
Set `ai_qc_review: true` in organization settings.

### 5. Test
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/qc-ai-review \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task_id": "existing-task-uuid"}'
```

---

## Fallback Behavior

When ML service is unavailable:
- Edge function uses default `p0 = 0.8`
- AI review still created with fallback confidence
- Task submission never blocked
- QC page shows "AI unavailable" indicator

---

## Database

AI reviews stored in `qc_reviews`:

| Field | Value |
|-------|-------|
| `review_type` | `'ai'` |
| `confidence` | p0 from ML (0.0-1.0) |
| `passed` | `confidence > 0.5` |
| `feedback` | ML summary |
| `weight` | `0` (informational only) |
| `pass_number` | `1` |

---

## Shapley Integration

QC page uses AI confidence for payout calculations:

```
d_1 = β × p0 × V        (First pass marginal)
d_k = d_1 × γ^(k-1)     (Decay for passes 2, 3, ...)

β = 0.25 (org.qc_beta)
γ = 0.4  (org.qc_gamma)
V = task.dollar_value
```

See `FORMULAS.md` for complete formulas.

---

## Checklist

- [ ] Deploy ML API (see `ML_MODEL_HOSTING.md`)
- [ ] Set `ML_API_URL` and `ML_API_KEY` secrets
- [ ] Deploy edge function: `supabase functions deploy qc-ai-review`
- [ ] Enable `ai_qc_review` feature flag
- [ ] Submit test task
- [ ] Verify AI review in QC page
