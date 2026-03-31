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
2. Add and verify your sending domain (e.g. `yourdomain.com`) under **Domains**
3. Resend will give you DNS records to add — do this in your domain registrar (see §1.4)
4. Go to **API Keys** → **Create API Key** → copy the `re_xxxxx` key

---

### 1.2 — Set Supabase Secrets for Application Email

Run these from your terminal in the repo root. These power the `send-email` edge function.

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

This prevents emails from landing in spam. Your email provider's dashboard will show the exact values — the below shows the record types and where they go.

Log into your **domain registrar** (Cloudflare, Namecheap, GoDaddy, etc.) and add:

**SPF** — authorizes your provider to send on behalf of your domain:
```
Type: TXT
Name: @  (or your root domain)
Value: v=spf1 include:_spf.resend.com ~all
```
*(Replace `_spf.resend.com` with your provider's SPF include if not using Resend)*

**DKIM** — cryptographic signature proving the email is authentic:
```
Type: TXT
Name: resend._domainkey  (Resend gives you this exact subdomain)
Value: (long key provided by Resend dashboard under Domains → your domain → DNS Records)
```

**DMARC** — policy for handling unauthenticated mail:
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

DNS changes can take up to 24 hours to propagate. Use [MXToolbox](https://mxtoolbox.com/SuperTool.aspx) to verify each record once added.

---

### 1.5 — Customize Auth Email Templates

These are the emails Supabase sends when users sign up or reset their password.

1. Go to **Supabase Dashboard** → **Authentication** → **Email Templates**
2. Update the following templates with Orbit branding:

**Confirm signup** (sent when a new user registers):
```html
<h2>Welcome to Orbit</h2>
<p>Thanks for signing up. Click below to confirm your email address:</p>
<p><a href="{{ .ConfirmationURL }}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Confirm Email</a></p>
<p>Or copy this link: {{ .ConfirmationURL }}</p>
<p>This link expires in 24 hours.</p>
```

**Reset password** (sent when a user requests a password reset):
```html
<h2>Reset your Orbit password</h2>
<p>Click the button below to choose a new password:</p>
<p><a href="{{ .ConfirmationURL }}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Reset Password</a></p>
<p>If you didn't request this, you can ignore this email.</p>
<p>This link expires in 1 hour.</p>
```

Available template variables: `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .SiteURL }}`

3. Click **Save** after each template

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

The `qc-ai-review` edge function currently runs in fallback mode, returning a default confidence score of `p0 = 0.8` for all submissions. To enable real AI scoring, the ML model must be hosted as an external API and connected via Supabase secrets.

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
5. Add environment variable:
   - Key: `API_KEY`
   - Value: generate a strong random string (e.g. `openssl rand -hex 32`)
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
supabase secrets set ML_API_URL=https://your-deployed-ml-api.com
supabase secrets set ML_API_KEY=your-random-key
```

Redeploy the edge function so it picks up the new secrets:
```bash
supabase functions deploy qc-ai-review
```

Verify the secrets are set:
```bash
supabase secrets list
# Should show ML_API_URL and ML_API_KEY
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
- [ ] Created account with Resend (or chosen provider) and verified sending domain
- [ ] Set `RESEND_API_KEY` secret in Supabase
- [ ] Set `EMAIL_FROM` secret in Supabase
- [ ] Enabled custom SMTP in Supabase Auth settings
- [ ] Added SPF, DKIM, and DMARC DNS records
- [ ] Customized signup + reset password email templates
- [ ] Sent test emails (registration, invite, QC result) and confirmed delivery

### ML Model
- [ ] ML API project created and tested locally
- [ ] `extract_features()` customized to match trained model
- [ ] API deployed to hosting provider
- [ ] `ML_API_URL` and `ML_API_KEY` secrets set in Supabase
- [ ] `qc-ai-review` edge function redeployed
- [ ] Submitted a task and confirmed real confidence score appears in QC page (not flat 0.8)
