# ML Model Hosting

Deploy your QC confidence model as an API endpoint.

---

## Quick Start

```bash
mkdir qc-ml-api && cd qc-ml-api
mkdir model
cp /path/to/qc-model.joblib model/

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install fastapi uvicorn joblib scikit-learn numpy pydantic

# Create main.py (below), then:
uvicorn main:app --reload --port 8000
```

---

## Project Structure

```
qc-ml-api/
├── main.py
├── model/
│   └── qc-model.joblib
├── requirements.txt
└── Dockerfile
```

---

## main.py

```python
"""QC Confidence Model API for Orbit"""

import os
from typing import Optional
from contextlib import asynccontextmanager

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_PATH = os.getenv("MODEL_PATH", "model/qc-model.joblib")
API_KEY = os.getenv("API_KEY", "")

# --- Models ---

class Artifact(BaseModel):
    type: str
    data: dict

class SubmissionData(BaseModel):
    notes: str = ""
    artifacts: list[Artifact] = []

class TaskContext(BaseModel):
    title: str
    description: str = ""
    requirements: Optional[str] = None
    story_points: Optional[int] = None

class ConfidenceRequest(BaseModel):
    task_id: str
    submission_data: SubmissionData
    task_context: TaskContext

class ConfidenceResponse(BaseModel):
    pass_probability: float = Field(ge=0.0, le=1.0)
    confidence_breakdown: dict
    summary: str
    issues: list[str]
    recommendations: list[str]

# --- App ---

model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    try:
        model = joblib.load(MODEL_PATH)
        print(f"Model loaded: {MODEL_PATH}")
    except Exception as e:
        print(f"Model load failed: {e}")
    yield

app = FastAPI(title="QC Confidence API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- Auth ---

async def verify_api_key(authorization: Optional[str] = Header(None)):
    if not API_KEY:
        return True
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing/invalid Authorization")
    if authorization.split(" ")[1] != API_KEY:
        raise HTTPException(401, "Invalid API key")
    return True

# --- Feature Extraction (CUSTOMIZE FOR YOUR MODEL) ---

def extract_features(req: ConfidenceRequest) -> np.ndarray:
    """
    Convert request to feature vector.
    CUSTOMIZE THIS to match your model's training features.
    """
    return np.array([[
        min(len(req.submission_data.notes) / 500, 1.0),
        min(len(req.submission_data.artifacts) / 5, 1.0),
        1.0 if any(a.type == "github_pr" for a in req.submission_data.artifacts) else 0.0,
        1.0 if any(a.type == "file" for a in req.submission_data.artifacts) else 0.0,
        min((req.task_context.story_points or 5) / 13, 1.0),
    ]])

# --- Endpoints ---

@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": model is not None}

@app.post("/api/v1/review/confidence", dependencies=[Depends(verify_api_key)])
async def get_confidence(req: ConfidenceRequest) -> ConfidenceResponse:
    features = extract_features(req)

    # Get prediction
    if model is not None:
        try:
            if hasattr(model, "predict_proba"):
                proba = model.predict_proba(features)[0]
                conf = float(proba[1]) if len(proba) > 1 else float(proba[0])
            else:
                conf = float(np.clip(model.predict(features)[0], 0.0, 1.0))
        except:
            conf = 0.8
    else:
        # Heuristic fallback
        conf = min(0.5 + len(req.submission_data.notes)/1000 + len(req.submission_data.artifacts)*0.1, 0.95)

    # Build response
    issues = []
    if len(req.submission_data.notes) < 20:
        issues.append("Notes too brief")
    if not req.submission_data.artifacts:
        issues.append("No artifacts attached")

    return ConfidenceResponse(
        pass_probability=round(conf, 4),
        confidence_breakdown={
            "completeness": round(min(conf + 0.05, 1.0), 4),
            "quality": round(conf, 4),
            "requirements_met": round(max(conf - 0.05, 0.0), 4),
        },
        summary=f"Confidence: {conf:.0%}. {len(req.submission_data.notes)} chars, {len(req.submission_data.artifacts)} artifacts.",
        issues=issues,
        recommendations=["Link GitHub PR if code changes"] if not any(a.type == "github_pr" for a in req.submission_data.artifacts) else [],
    )

# --- Optional Endpoints (used by Orbit frontend via edge function) ---

class ComplexityRequest(BaseModel):
    title: str
    description: str = ""

@app.post("/api/v1/task/complexity", dependencies=[Depends(verify_api_key)])
async def get_complexity(req: ComplexityRequest):
    """Suggest story points based on task description. Customize with your model."""
    word_count = len(f"{req.title} {req.description}".split())
    score = min(word_count / 200, 1.0)
    points = max(1, min(13, round(score * 13)))
    return {
        "suggested_story_points": points,
        "complexity_score": round(score, 4),
        "reasoning": f"Based on {word_count} words in title/description",
    }

@app.get("/api/v1/review/quality/{task_id}", dependencies=[Depends(verify_api_key)])
async def get_quality(task_id: str):
    """Quality assessment for QC reviewers. Customize with your model."""
    return {
        "overall_quality": 0.8,
        "areas_of_concern": [],
        "strengths": [],
        "comparison_to_similar": 0.5,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## requirements.txt

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
joblib==1.3.2
scikit-learn==1.4.0
numpy==1.26.3
pydantic==2.5.3
```

---

## Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
COPY model/ ./model/
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Deployment

### Railway (Easiest)
1. Push to GitHub
2. railway.app → New Project → Deploy from repo
3. Set env vars: `API_KEY=your-key`
4. Get URL: `https://your-app.up.railway.app`

### Render (Recommended)

Render offers straightforward Docker deployments with a generous free tier for getting started and affordable paid plans for production.

#### Prerequisites
- GitHub repo containing the `qc-ml-api` project (structure above)
- Render account at [render.com](https://render.com)

#### Step-by-Step Setup

1. **Push your project to GitHub**
   ```bash
   cd qc-ml-api
   git init && git add . && git commit -m "Initial ML API"
   gh repo create qc-ml-api --private --push
   ```

2. **Create a new Web Service on Render**
   - Go to [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
   - Connect your GitHub account if not already connected
   - Select the `qc-ml-api` repository

3. **Configure the service**
   | Setting | Value |
   |---------|-------|
   | **Name** | `orbit-qc-ml-api` |
   | **Region** | Pick closest to your Supabase project region |
   | **Runtime** | **Docker** (auto-detected from Dockerfile) |
   | **Instance Type** | **Starter** ($7/month, 512 MB RAM) — sufficient for scikit-learn models. Use **Standard** ($25/month, 2 GB RAM) if your model file is large or you use sentence-transformers |
   | **Branch** | `main` |

4. **Set environment variables**
   Under **Environment** → **Environment Variables**, add:
   | Key | Value |
   |-----|-------|
   | `API_KEY` | Generate a secure key (e.g., `openssl rand -hex 32`) |
   | `MODEL_PATH` | `model/qc-model.joblib` (default, only change if different) |

5. **Deploy**
   - Click **Create Web Service**
   - Render builds the Docker image and deploys automatically
   - First deploy takes 3-5 minutes
   - Your service URL will be: `https://orbit-qc-ml-api.onrender.com`

#### Health Check Configuration

Render pings your service to verify it's running. Configure under **Settings** → **Health Check Path**:
- **Health Check Path**: `/health`
- This matches the `/health` endpoint in `main.py`

#### Auto-Deploy on Push

Render auto-deploys on every push to your selected branch by default. To disable:
- **Settings** → **Build & Deploy** → toggle off **Auto-Deploy**

#### Custom Domain (Optional)

1. **Settings** → **Custom Domains** → **Add Custom Domain**
2. Enter your domain (e.g., `ml-api.yourdomain.com`)
3. Add the CNAME record Render provides to your DNS
4. SSL is provisioned automatically

#### Render Free Tier Notes

Render's free tier **spins down after 15 minutes of inactivity**. The first request after spin-down takes ~30-60 seconds (cold start) while the container restarts. This is fine for development but not suitable for production.

For production, use the **Starter** plan ($7/month) which keeps the service running continuously.

#### Monitoring & Logs

- **Logs**: Dashboard → your service → **Logs** tab (live streaming)
- **Metrics**: Dashboard → your service → **Metrics** tab (CPU, memory, request count)
- **Alerts**: Set up notifications under **Settings** → **Notifications** for deploy failures or health check failures

#### Scaling

If you need to handle more concurrent QC reviews:
- Upgrade the instance type for vertical scaling (more CPU/RAM)
- Render does not natively support horizontal scaling on web services — if you need multiple instances, consider switching to Google Cloud Run (auto-scales to zero and handles bursts)

#### Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails | Check Dockerfile — ensure `requirements.txt` is copied before `pip install` |
| Health check fails | Verify `/health` endpoint returns 200 and the health check path is set |
| Out of memory | Upgrade instance type or reduce model size (use model compression/quantization) |
| Slow cold starts (free tier) | Upgrade to Starter plan, or accept the delay for dev use |
| Model not found | Ensure `model/qc-model.joblib` is committed to the repo (check `.gitignore`) |

#### Pricing Summary

| Plan | Price | RAM | Always On | Best For |
|------|-------|-----|-----------|----------|
| Free | $0/month | 512 MB | No (spins down) | Development/testing |
| Starter | $7/month | 512 MB | Yes | Small team production |
| Standard | $25/month | 2 GB | Yes | Larger models or higher traffic |

### Fly.io
```bash
fly launch
fly secrets set API_KEY=your-key
fly deploy
```

### Google Cloud Run
```bash
gcloud builds submit --tag gcr.io/PROJECT/qc-ml-api
gcloud run deploy qc-ml-api --image gcr.io/PROJECT/qc-ml-api --allow-unauthenticated
```

---

## Connect to Orbit

```bash
# Set secrets
supabase secrets set ML_API_URL=https://your-deployed-url.com
supabase secrets set ML_API_KEY=your-key

# Deploy edge function
supabase functions deploy qc-ai-review
```

---

## Required Endpoints

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/health` | GET | Required | Health check |
| `/api/v1/review/confidence` | POST | Required | Confidence scoring (p0 for Shapley) |
| `/api/v1/task/complexity` | POST | Optional | Story point suggestions |
| `/api/v1/review/quality/{task_id}` | GET | Optional | Quality assessment for QC reviewers |

All endpoints are called from the Supabase `qc-ai-review` edge function, never directly from the browser.

## Test

```bash
# Health check
curl http://localhost:8000/health

# Confidence check (required endpoint)
curl -X POST http://localhost:8000/api/v1/review/confidence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{
    "task_id": "test",
    "submission_data": {"notes": "Implemented feature with tests", "artifacts": [{"type": "github_pr", "data": {}}]},
    "task_context": {"title": "Add feature", "description": "Add new feature", "story_points": 5}
  }'

# Complexity analysis (optional endpoint)
curl -X POST http://localhost:8000/api/v1/task/complexity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{"title": "Add feature", "description": "Build a new dashboard widget"}'

# Quality assessment (optional endpoint)
curl http://localhost:8000/api/v1/review/quality/test-task-id \
  -H "Authorization: Bearer your-key"
```

---

## Customize extract_features()

Match your model's training data:

```python
# Text embeddings
from sentence_transformers import SentenceTransformer
embedder = SentenceTransformer('all-MiniLM-L6-v2')
return embedder.encode([req.submission_data.notes])

# TF-IDF
vectorizer = joblib.load("model/vectorizer.joblib")
return vectorizer.transform([req.submission_data.notes])

# Numeric only
return np.array([[len(notes), num_artifacts, story_points]])
```

---

## Checklist

- [ ] Create project with structure above
- [ ] Copy model to `model/qc-model.joblib`
- [ ] Customize `extract_features()` for your model
- [ ] Test locally: `uvicorn main:app --reload`
- [ ] Deploy (Railway/Render/Fly/GCP)
- [ ] Set Supabase secrets
- [ ] Deploy edge function
- [ ] Test end-to-end
