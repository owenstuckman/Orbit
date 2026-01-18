# ML Model Hosting Guide

Complete guide to deploy your QC confidence model as an API endpoint.

---

## Quick Start

```bash
# 1. Create project
mkdir qc-ml-api && cd qc-ml-api

# 2. Copy your model
cp /path/to/qc-model.joblib ./model/qc-model.joblib

# 3. Install dependencies
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install fastapi uvicorn joblib scikit-learn numpy pydantic

# 4. Create main.py (see below)

# 5. Run locally
uvicorn main:app --reload --port 8000

# 6. Test
curl -X POST http://localhost:8000/api/v1/review/confidence \
  -H "Content-Type: application/json" \
  -d '{"task_id":"test","submission_data":{"notes":"test","artifacts":[]},"task_context":{"title":"Test","description":"Test task"}}'
```

---

## Project Structure

```
qc-ml-api/
├── main.py              # FastAPI application
├── model/
│   └── qc-model.joblib  # Your trained model
├── requirements.txt     # Python dependencies
├── Dockerfile           # Container config
├── .env                 # Local environment variables
└── README.md
```

---

## Code Files

### main.py

```python
"""
QC Confidence Model API

Endpoint for Orbit's QC AI review system.
Receives task submission data, returns confidence score (p0).
"""

import os
from typing import Optional
from contextlib import asynccontextmanager

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# =============================================================================
# Configuration
# =============================================================================

MODEL_PATH = os.getenv("MODEL_PATH", "model/qc-model.joblib")
API_KEY = os.getenv("API_KEY", "")  # Empty = no auth required

# =============================================================================
# Request/Response Models
# =============================================================================

class Artifact(BaseModel):
    type: str  # "file" | "github_pr" | "url"
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


class ConfidenceBreakdown(BaseModel):
    completeness: float = Field(ge=0.0, le=1.0)
    quality: float = Field(ge=0.0, le=1.0)
    requirements_met: float = Field(ge=0.0, le=1.0)


class ConfidenceResponse(BaseModel):
    pass_probability: float = Field(ge=0.0, le=1.0)
    confidence_breakdown: ConfidenceBreakdown
    summary: str
    issues: list[str]
    recommendations: list[str]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


# =============================================================================
# Model Loading
# =============================================================================

model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    global model
    try:
        model = joblib.load(MODEL_PATH)
        print(f"Model loaded from {MODEL_PATH}")
    except Exception as e:
        print(f"Warning: Could not load model: {e}")
        model = None
    yield


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="QC Confidence API",
    description="ML model for task submission confidence scoring",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - adjust origins for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Authentication
# =============================================================================

async def verify_api_key(authorization: Optional[str] = Header(None)):
    """Verify API key if configured."""
    if not API_KEY:
        return True  # No auth required

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    # Expect: "Bearer <key>"
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0] != "Bearer" or parts[1] != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return True


# =============================================================================
# Feature Extraction
# =============================================================================

def extract_features(request: ConfidenceRequest) -> np.ndarray:
    """
    Convert request to feature vector for model.

    CUSTOMIZE THIS based on your model's expected input.
    This is a placeholder implementation.
    """
    features = []

    # Text length features
    notes_length = len(request.submission_data.notes)
    title_length = len(request.task_context.title)
    desc_length = len(request.task_context.description)

    features.append(min(notes_length / 500, 1.0))  # Normalized note length
    features.append(min(title_length / 100, 1.0))  # Normalized title length
    features.append(min(desc_length / 1000, 1.0))  # Normalized desc length

    # Artifact features
    num_artifacts = len(request.submission_data.artifacts)
    has_file = any(a.type == "file" for a in request.submission_data.artifacts)
    has_pr = any(a.type == "github_pr" for a in request.submission_data.artifacts)
    has_url = any(a.type == "url" for a in request.submission_data.artifacts)

    features.append(min(num_artifacts / 5, 1.0))  # Normalized artifact count
    features.append(1.0 if has_file else 0.0)
    features.append(1.0 if has_pr else 0.0)
    features.append(1.0 if has_url else 0.0)

    # Story points (complexity indicator)
    story_points = request.task_context.story_points or 5
    features.append(min(story_points / 13, 1.0))  # Normalized (13 is typical max)

    return np.array(features).reshape(1, -1)


def generate_summary(request: ConfidenceRequest, confidence: float) -> str:
    """Generate human-readable summary."""
    notes_len = len(request.submission_data.notes)
    num_artifacts = len(request.submission_data.artifacts)

    if confidence >= 0.8:
        quality = "high"
    elif confidence >= 0.5:
        quality = "moderate"
    else:
        quality = "low"

    return (
        f"Submission shows {quality} confidence ({confidence:.0%}). "
        f"Contains {notes_len} chars of notes and {num_artifacts} artifact(s)."
    )


def identify_issues(request: ConfidenceRequest) -> list[str]:
    """Identify potential issues with submission."""
    issues = []

    if len(request.submission_data.notes) < 20:
        issues.append("Notes are very brief - consider adding more detail")

    if len(request.submission_data.artifacts) == 0:
        issues.append("No artifacts attached - include files or links")

    if not request.task_context.description:
        issues.append("Task has no description - harder to verify completeness")

    return issues


def get_recommendations(request: ConfidenceRequest, confidence: float) -> list[str]:
    """Generate improvement recommendations."""
    recs = []

    if confidence < 0.7:
        recs.append("Consider adding more documentation")

    has_pr = any(a.type == "github_pr" for a in request.submission_data.artifacts)
    if not has_pr:
        recs.append("Link a GitHub PR if code changes were made")

    return recs


# =============================================================================
# Endpoints
# =============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        model_loaded=model is not None
    )


@app.post(
    "/api/v1/review/confidence",
    response_model=ConfidenceResponse,
    dependencies=[Depends(verify_api_key)]
)
async def get_confidence(request: ConfidenceRequest):
    """
    Get confidence score for a task submission.

    Returns pass_probability (p0) used in Shapley payout calculations.
    """
    # Extract features
    features = extract_features(request)

    # Get prediction
    if model is not None:
        try:
            # If classifier with predict_proba
            if hasattr(model, "predict_proba"):
                proba = model.predict_proba(features)[0]
                confidence = float(proba[1]) if len(proba) > 1 else float(proba[0])
            # If regressor
            elif hasattr(model, "predict"):
                pred = model.predict(features)[0]
                confidence = float(np.clip(pred, 0.0, 1.0))
            else:
                confidence = 0.8  # Fallback
        except Exception as e:
            print(f"Prediction error: {e}")
            confidence = 0.8
    else:
        # No model loaded - use heuristic
        confidence = heuristic_confidence(request)

    # Build response
    return ConfidenceResponse(
        pass_probability=round(confidence, 4),
        confidence_breakdown=ConfidenceBreakdown(
            completeness=round(min(confidence + 0.05, 1.0), 4),
            quality=round(confidence, 4),
            requirements_met=round(max(confidence - 0.05, 0.0), 4),
        ),
        summary=generate_summary(request, confidence),
        issues=identify_issues(request),
        recommendations=get_recommendations(request, confidence),
    )


def heuristic_confidence(request: ConfidenceRequest) -> float:
    """Fallback confidence when model unavailable."""
    score = 0.5

    # Reward detailed notes
    notes_len = len(request.submission_data.notes)
    if notes_len > 200:
        score += 0.2
    elif notes_len > 50:
        score += 0.1

    # Reward artifacts
    num_artifacts = len(request.submission_data.artifacts)
    score += min(num_artifacts * 0.1, 0.2)

    return min(score, 0.95)


# =============================================================================
# Run
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### requirements.txt

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
joblib==1.3.2
scikit-learn==1.4.0
numpy==1.26.3
pydantic==2.5.3
python-multipart==0.0.6
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app and model
COPY main.py .
COPY model/ ./model/

# Expose port
EXPOSE 8000

# Run
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### .env (local development)

```env
MODEL_PATH=model/qc-model.joblib
API_KEY=your-secret-key-here
```

---

## Deployment Options

### Option 1: Railway (Easiest)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. New Project > Deploy from GitHub repo
4. Add environment variables:
   - `MODEL_PATH=model/qc-model.joblib`
   - `API_KEY=your-secret-key`
5. Railway auto-detects Dockerfile and deploys
6. Get URL: `https://your-app.up.railway.app`

**Cost**: ~$5/month for hobby tier

### Option 2: Render

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. New > Web Service > Connect repo
4. Settings:
   - Runtime: Docker
   - Instance: Starter ($7/month) or higher
5. Add environment variables
6. Deploy

**Cost**: $7/month starter, $25/month for always-on

### Option 3: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (from project directory)
fly launch

# Set secrets
fly secrets set API_KEY=your-secret-key

# Deploy
fly deploy
```

**Cost**: Free tier available, ~$5/month for small VM

### Option 4: Google Cloud Run

```bash
# Build and push
gcloud builds submit --tag gcr.io/PROJECT_ID/qc-ml-api

# Deploy
gcloud run deploy qc-ml-api \
  --image gcr.io/PROJECT_ID/qc-ml-api \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="API_KEY=your-key"
```

**Cost**: Pay per request, very cheap for low traffic

### Option 5: Self-hosted (VPS)

```bash
# On your VPS (Ubuntu)
sudo apt update && sudo apt install docker.io -y

# Clone your repo
git clone https://github.com/you/qc-ml-api.git
cd qc-ml-api

# Build and run
docker build -t qc-ml-api .
docker run -d -p 8000:8000 \
  -e API_KEY=your-key \
  --name qc-ml-api \
  qc-ml-api

# Set up nginx reverse proxy with SSL (optional)
```

---

## Connect to Orbit

### 1. Set Supabase Secrets

```bash
# Replace with your deployed URL
supabase secrets set ML_API_URL=https://your-app.up.railway.app
supabase secrets set ML_API_KEY=your-secret-key
```

### 2. Deploy Edge Function

```bash
supabase functions deploy qc-ai-review
```

### 3. Test End-to-End

```bash
# Call edge function directly
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/qc-ai-review \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task_id": "some-task-uuid"}'
```

---

## Customizing for Your Model

The `extract_features()` function needs to match your model's training data. Update it based on what features your joblib model expects:

```python
def extract_features(request: ConfidenceRequest) -> np.ndarray:
    """
    CUSTOMIZE THIS to match your model's expected input.

    Your model was trained on specific features - replicate that here.
    Common approaches:

    1. Text embeddings (if using NLP):
       from sentence_transformers import SentenceTransformer
       embedder = SentenceTransformer('all-MiniLM-L6-v2')
       text = request.submission_data.notes + " " + request.task_context.description
       return embedder.encode([text])

    2. Numeric features (if using tabular model):
       return np.array([[
           len(request.submission_data.notes),
           len(request.submission_data.artifacts),
           request.task_context.story_points or 5,
           # ... other numeric features
       ]])

    3. TF-IDF (if using text classifier):
       # Load your trained vectorizer
       vectorizer = joblib.load("model/vectorizer.joblib")
       text = request.submission_data.notes
       return vectorizer.transform([text])
    """
    # Current placeholder implementation
    ...
```

---

## Testing

### Local Test

```bash
# Start server
uvicorn main:app --reload

# Test health
curl http://localhost:8000/health

# Test prediction
curl -X POST http://localhost:8000/api/v1/review/confidence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{
    "task_id": "test-123",
    "submission_data": {
      "notes": "Implemented the login feature with OAuth integration. Added unit tests and updated documentation.",
      "artifacts": [
        {"type": "github_pr", "data": {"url": "https://github.com/org/repo/pull/42"}},
        {"type": "file", "data": {"name": "screenshot.png"}}
      ]
    },
    "task_context": {
      "title": "Add OAuth Login",
      "description": "Implement OAuth2 login flow with Google provider",
      "story_points": 5
    }
  }'
```

### Expected Response

```json
{
  "pass_probability": 0.85,
  "confidence_breakdown": {
    "completeness": 0.90,
    "quality": 0.85,
    "requirements_met": 0.80
  },
  "summary": "Submission shows high confidence (85%). Contains 147 chars of notes and 2 artifact(s).",
  "issues": [],
  "recommendations": []
}
```

---

## Monitoring

### Add Logging

```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.post("/api/v1/review/confidence")
async def get_confidence(request: ConfidenceRequest):
    logger.info(f"Request for task {request.task_id}")
    # ... rest of handler
    logger.info(f"Returning confidence {confidence} for {request.task_id}")
```

### Health Check for Uptime Monitoring

Use the `/health` endpoint with services like:
- UptimeRobot (free)
- Pingdom
- Better Uptime

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Model won't load | Check `MODEL_PATH` env var, verify file exists |
| 401 Unauthorized | Check `API_KEY` matches in both API and Supabase secret |
| CORS errors | Edge function handles this, but check `allow_origins` if calling from browser |
| Slow responses | Increase instance size, or use async model loading |
| Memory errors | Model too large - use smaller model or bigger instance |

---

## Checklist

- [ ] Create project directory with structure above
- [ ] Copy `main.py` and customize `extract_features()` for your model
- [ ] Copy your `qc-model.joblib` to `model/` directory
- [ ] Create `requirements.txt` and `Dockerfile`
- [ ] Test locally with `uvicorn main:app --reload`
- [ ] Deploy to chosen platform (Railway, Render, etc.)
- [ ] Set `ML_API_URL` and `ML_API_KEY` in Supabase secrets
- [ ] Deploy edge function: `supabase functions deploy qc-ai-review`
- [ ] Test end-to-end by submitting a task in Orbit
- [ ] Verify AI review appears in QC page
