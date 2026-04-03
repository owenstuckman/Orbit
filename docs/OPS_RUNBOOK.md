# Orbit — Ops Runbook

All human steps required to take Orbit from deployed code to a fully working production instance. These are configuration and infrastructure tasks — no code changes required.

**Prerequisites**: Supabase project is live, app is deployed (Vercel/Netlify), and the `send-email` + `qc-ai-review` edge functions are deployed.

---

## Section 1 — Email / SMTP

Orbit sends two types of email:
- **Auth emails** (sign-up confirmation, password reset) — sent by Supabase using your custom SMTP
- **Application emails** (invitations, QC results, payout alerts) — sent by the `send-email` edge function using Resend (or another provider)

Both need to be configured separately.

---

### 1.1 — Choose an Email Provider

**Resend is recommended.** It's the simplest to set up and works for both auth and application emails.

| Provider | Free Tier | Notes |
|----------|-----------|-------|
| [Resend](https://resend.com) | 3,000/month, 100/day | Recommended. API-first. Works great with Supabase. |
| [SendGrid](https://sendgrid.com) | 100/day | More complex setup. |
| [Postmark](https://postmarkapp.com) | 100/month trial | Reliable deliverability. |
| [AWS SES](https://aws.amazon.com/ses/) | 62,000/month (from EC2) | Cheapest at scale. Complex setup. |

**Steps for Resend:**
1. Sign up at [resend.com](https://resend.com)
2. Go to **Domains** → **Add Domain** → enter your sending domain (e.g. `yourdomain.com`)
3. **Verify the domain** — Resend will give you DNS records (see §1.4). Email will not send until this step is complete, even with a valid API key.
4. Go to **API Keys** → **Create API Key** → copy the `re_xxxxx` key
5. Set `EMAIL_FROM` to an address on your verified domain — e.g. `Orbit <noreply@yourdomain.com>`. Using an unverified domain will cause all sends to fail with a 403 error.

---

### 1.2 — Set Supabase Secrets for Application Email

> **Already configured** for this project. Run these if setting up a new deployment.

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
supabase secrets set EMAIL_FROM="Orbit <noreply@yourdomain.com>"
```

Verify they were set:
```bash
supabase secrets list
```

Both `RESEND_API_KEY` and `EMAIL_FROM` should appear. Until these are set, the `send-email` edge function silently skips sending (it is designed to fail gracefully).

---

### 1.3 — Configure Supabase Auth Custom SMTP

> **Already configured** for this project via management API: `smtp.resend.com:465`, user=`resend`. The steps below are for new deployments.

This controls the emails Supabase sends for account confirmation and password reset.

1. Go to your **Supabase Dashboard** → **Project Settings** → **Authentication** → **SMTP Settings**
2. Toggle **Enable Custom SMTP** to ON
3. Fill in the fields:

| Field | Resend value | SendGrid value |
|-------|-------------|----------------|
| **Host** | `smtp.resend.com` | `smtp.sendgrid.net` |
| **Port** | `465` | `587` |
| **Username** | `resend` | `apikey` |
| **Password** | your `re_xxxxx` API key | your SendGrid API key |
| **Sender email** | `noreply@yourdomain.com` | `noreply@yourdomain.com` |
| **Sender name** | `Orbit` | `Orbit` |

4. Click **Save**
5. Test by triggering a password reset from the login page and confirming the email arrives

---

### 1.4 — Configure DNS Records for Your Sending Domain

This prevents emails from landing in spam. Domain is `owenstuckman.lol`, registrar is **Porkbun**.

**Current status:**
- DKIM — **already set** (`resend._domainkey.owenstuckman.lol`)
- SPF — **missing**, needs to be added
- DMARC — **missing**, needs to be added

Log into [porkbun.com](https://porkbun.com) → **Domain Management** → `owenstuckman.lol` → **DNS Records** and add:

**SPF** — authorizes Resend to send on behalf of your domain:
```
Type:  TXT
Host:  (leave blank / @)
Value: v=spf1 include:_spf.resend.com ~all
TTL:   600
```

**DMARC** — policy for handling unauthenticated mail:
```
Type:  TXT
Host:  _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@owenstuckman.lol
TTL:   600
```

DNS changes can take up to 24 hours to propagate. Verify with:
```bash
# SPF
python3 -c "import urllib.request,json; r=urllib.request.urlopen('https://dns.google/resolve?name=owenstuckman.lol&type=TXT'); print([a['data'] for a in json.loads(r.read()).get('Answer',[])])"
# DMARC
python3 -c "import urllib.request,json; r=urllib.request.urlopen('https://dns.google/resolve?name=_dmarc.owenstuckman.lol&type=TXT'); print([a['data'] for a in json.loads(r.read()).get('Answer',[])])"
```

---

### 1.5 — Customize Auth Email Templates

> **Already complete.** All templates are Orbit-branded and were deployed via `supabase config push`.

Template source files live in `supabase/templates/` and are referenced from `supabase/config.toml`. To update a template, edit the HTML file and run:

```bash
npx supabase config push --project-ref iioocrhatrimnsrapphv --yes
```

**Important:** The config.toml only defines the email templates. Do not add other `[auth]` settings to it — they will overwrite production values (site_url, MFA settings, etc.) with local dev defaults.

Available template variables: `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`

---

### 1.6 — Verify Email is Working

After completing 1.2–1.5:

1. Register a new account at `/auth/register` using a real email address
2. Check that the confirmation email arrives (check spam if not)
3. Click the confirmation link — you should land at `/auth/complete-registration`
4. As an admin, invite a user from `/admin/users` → confirm the invitation email arrives
5. Approve a QC review — confirm the payout notification email arrives

If emails are not arriving, check:
- **Supabase Dashboard** → **Edge Functions** → `send-email` → **Logs**
- Run `supabase secrets list` to confirm `RESEND_API_KEY` is set
- **Resend Dashboard** → **Logs** for delivery status
- Spam folder

---

## Section 2 — ML Model Deployment

> **Already complete** for this project. The ML API is live at `https://orbitqcml.onrender.com`, all secrets are set, and the edge function returns real confidence scores. The steps below are for new deployments or re-deployment.

Full technical reference: `docs/ML_MODEL_HOSTING.md`

---

### 2.1 — Prepare the ML API Project

You need the trained model file (`qc-model.joblib`) from the ML repository. Then:

```bash
mkdir qc-ml-api && cd qc-ml-api
mkdir model
cp /path/to/qc-model.joblib model/

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi uvicorn joblib scikit-learn numpy pydantic
```

Create the file structure:
```
qc-ml-api/
├── main.py           (copy from docs/ML_MODEL_HOSTING.md)
├── model/
│   └── qc-model.joblib
├── requirements.txt
└── Dockerfile        (copy from docs/ML_MODEL_HOSTING.md)
```

Copy the `main.py` and `Dockerfile` contents from `docs/ML_MODEL_HOSTING.md`.

**Customize `extract_features()`** in `main.py` to match how your model was trained (TF-IDF, embeddings, numeric features, etc.). See the "Customize extract_features()" section of `docs/ML_MODEL_HOSTING.md`.

Test locally before deploying:
```bash
uvicorn main:app --reload --port 8000

# Verify health
curl http://localhost:8000/health

# Test confidence endpoint
curl -X POST http://localhost:8000/api/v1/review/confidence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{
    "task_id": "test-123",
    "submission_data": {"notes": "Implemented the feature with unit tests", "artifacts": []},
    "task_context": {"title": "Add login page", "description": "Build auth UI", "story_points": 5}
  }'
```

The response should include a `confidence` field between 0.0 and 1.0.

---

### 2.2 — Deploy the ML API

Choose a hosting provider. **Render** is recommended for simplicity.

#### Option A: Render (recommended)

1. Push the `qc-ml-api` project to a new GitHub repository
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect the GitHub repo
4. Settings:
   - **Environment**: Docker
   - **Region**: Choose closest to your Supabase region
   - **Instance type**: Starter ($7/month) for production; Free for development
5. If you want to protect the API with a key, add an environment variable in Render:
   - Key: `API_KEY`
   - Value: generate a strong random string (e.g. `openssl rand -hex 32`)
   - **Important**: this `API_KEY` value is what goes in `ML_API_KEY` in your `.env` and Supabase secrets — it is NOT your Render account API key (which starts with `rnd_`)
6. Click **Create Web Service**
7. Wait for the build to finish (~3–5 minutes)
8. Copy the service URL (e.g. `https://qc-ml-api.onrender.com`)

#### Option B: Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# From the qc-ml-api directory
railway login
railway init
railway up
railway variables set API_KEY=your-random-key
```

Copy the deployment URL from the Railway dashboard.

#### Option C: Fly.io

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly launch
fly secrets set API_KEY=your-random-key
fly deploy
```

#### Option D: Google Cloud Run

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/qc-ml-api
gcloud run deploy qc-ml-api \
  --image gcr.io/YOUR_PROJECT_ID/qc-ml-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars API_KEY=your-random-key
```

---

### 2.3 — Connect the ML API to Orbit

Once deployed and the URL is confirmed working:

```bash
supabase secrets set ML_API_URL=https://your-app.onrender.com
```

`ML_API_KEY` is not required when hosting on Render — Render services are publicly accessible via their URL. Only set it if you add auth middleware to the ML API:

```bash
# Optional — only if you add API key auth to main.py
supabase secrets set ML_API_KEY=your-key
```

Redeploy the edge function so it picks up the new secrets:
```bash
supabase functions deploy qc-ai-review
```

Verify the secrets are set:
```bash
supabase secrets list
# Should show ML_API_URL (and ML_API_KEY if you set it)
```

---

### 2.4 — Verify End-to-End AI Scoring

1. Log in as an employee and accept an open task
2. Submit the task with some notes and at least one artifact
3. Log in as a QC reviewer and open the review queue (`/qc`)
4. The task should appear with an AI confidence % badge
5. Click the task — the confidence breakdown (completeness, quality, requirements met) should show real values, not the flat 80% fallback

To confirm the real model is running (not the fallback), check the `qc_reviews` table for the submitted task:

```sql
SELECT confidence, feedback, created_at
FROM qc_reviews
WHERE task_id = 'your-task-id'
AND review_type = 'ai'
ORDER BY created_at DESC
LIMIT 1;
```

If `confidence` varies from task to task (not always exactly 0.8), the model is live.

If confidence is always 0.8, check:
- **Supabase Dashboard** → **Edge Functions** → `qc-ai-review` → **Logs** for errors
- The ML API logs on your hosting provider for incoming requests
- `supabase secrets list` to confirm secrets are present

---

## Completion Checklist

### Email
- [x] Created Resend account and verified sending domain (`owenstuckman.lol`)
- [x] Set `RESEND_API_KEY` secret in Supabase
- [x] Set `EMAIL_FROM` secret in Supabase (`Orbit <owen@owenstuckman.lol>`)
- [x] Enabled custom SMTP in Supabase Auth — `smtp.resend.com:465`, user=`resend`
- [x] Updated email subjects to Orbit branding
- [x] DKIM record set (`resend._domainkey.owenstuckman.lol`)
- [x] All 4 auth email templates — Orbit-branded HTML set via `supabase config push` (source in `supabase/templates/`)
- [ ] **Add SPF** at Porkbun: `TXT @` → `v=spf1 include:_spf.resend.com ~all`
- [ ] **Add DMARC** at Porkbun: `TXT _dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@owenstuckman.lol`
- [ ] Verify end-to-end: register a new account, confirm email arrives and link works

### ML Model
- [x] ML API deployed and live at `https://orbitqcml.onrender.com`
- [x] `extract_features()` customized to match trained model
- [x] `ML_API_URL` and `ML_API_KEY` secrets set in Supabase
- [x] `qc-ai-review` edge function deployed with real scoring (not flat 0.8)
- [ ] End-to-end verify: submit a task as employee → open QC queue → confirm confidence breakdown shows real values
