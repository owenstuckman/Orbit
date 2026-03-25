# SMTP & Email Setup Guide

Orbit uses two email channels:

1. **Supabase Auth emails** — Confirmation, password reset, magic links (handled by Supabase)
2. **Application emails** — Invitations, contractor notifications, QC results, payout alerts (handled by a Supabase Edge Function + SMTP provider)

---

## 1. Choose an SMTP Provider

Any SMTP-compatible provider works. Recommended options:

| Provider | Free Tier | Setup Complexity |
|----------|-----------|-----------------|
| [Resend](https://resend.com) | 3,000 emails/month | Low (API-first, great DX) |
| [SendGrid](https://sendgrid.com) | 100 emails/day | Medium |
| [Postmark](https://postmarkapp.com) | 100 emails/month | Low |
| [AWS SES](https://aws.amazon.com/ses/) | 62,000/month (from EC2) | High (requires AWS account) |
| [Mailgun](https://www.mailgun.com) | 100 emails/day (trial) | Medium |

**Resend is recommended** for simplicity — it has a clean REST API, free tier is generous, and integrates well with Supabase Edge Functions.

---

## 2. Configure Supabase Auth Emails

Supabase sends auth emails (confirmation, password reset) using its built-in mailer by default. For production, configure a custom SMTP server so emails come from your domain.

### Supabase Dashboard

1. Go to **Project Settings > Authentication > SMTP Settings**
2. Enable **Custom SMTP**
3. Fill in your provider's credentials:

| Field | Example (Resend) | Example (SendGrid) |
|-------|-------------------|---------------------|
| Host | `smtp.resend.com` | `smtp.sendgrid.net` |
| Port | `465` | `587` |
| Username | `resend` | `apikey` |
| Password | `re_xxxxxxxxxxxx` | `SG.xxxxxxxxxxxx` |
| Sender email | `noreply@yourdomain.com` | `noreply@yourdomain.com` |
| Sender name | `Orbit` | `Orbit` |

4. Click **Save**

### Custom Email Templates (Optional)

In **Authentication > Email Templates**, customize the templates for:

- **Confirm signup** — Email verification on registration
- **Magic link** — Passwordless login
- **Change email** — Email change confirmation
- **Reset password** — Password reset link

Templates support these variables:
```
{{ .SiteURL }}           — Your app URL
{{ .ConfirmationURL }}   — One-click confirmation link
{{ .Token }}             — OTP token (6-digit)
{{ .TokenHash }}         — Hashed token for URL
```

Example confirmation template:
```html
<h2>Welcome to Orbit</h2>
<p>Click below to confirm your account:</p>
<a href="{{ .ConfirmationURL }}">Confirm Email</a>
<p>Or enter this code: <strong>{{ .Token }}</strong></p>
```

---

## 3. Deploy the Email Edge Function

Orbit uses a Supabase Edge Function to send application emails (invitations, notifications, etc.).

### Create the edge function

```bash
supabase functions new send-email
```

### Set secrets

For **Resend**:
```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set EMAIL_FROM="Orbit <noreply@yourdomain.com>"
```

For **SendGrid**:
```bash
supabase secrets set SENDGRID_API_KEY=SG.xxxxxxxxxxxx
supabase secrets set EMAIL_FROM="Orbit <noreply@yourdomain.com>"
```

For **generic SMTP**:
```bash
supabase secrets set SMTP_HOST=smtp.example.com
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_USER=your-username
supabase secrets set SMTP_PASS=your-password
supabase secrets set EMAIL_FROM="Orbit <noreply@yourdomain.com>"
```

### Edge function implementation (Resend example)

Create `supabase/functions/send-email/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Orbit <noreply@orbit.app>";

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { to, subject, html, text }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "to, subject, and html are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        text: text || undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send email error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### Deploy

```bash
supabase functions deploy send-email
```

### Test

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/send-email' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "test@example.com",
    "subject": "Test from Orbit",
    "html": "<p>Hello from Orbit!</p>"
  }'
```

---

## 4. Email Triggers

Once the `send-email` edge function is deployed, add email sending to these application events:

### Organization Invitations

In `src/lib/services/api.ts`, after `usersApi.invite()` creates the invitation record, invoke the edge function:

```typescript
const { data: functions } = supabase.functions;
await supabase.functions.invoke('send-email', {
  body: {
    to: email,
    subject: `You've been invited to join ${orgName} on Orbit`,
    html: `
      <h2>You're invited!</h2>
      <p>Use this invite code to join: <strong>${inviteCode}</strong></p>
      <p><a href="${window.location.origin}/auth/register?invite=${inviteCode}">
        Accept Invitation
      </a></p>
    `
  }
});
```

### External Contractor Assignment

After `tasksApi.createExternalAssignment()`, notify the contractor:

```typescript
await supabase.functions.invoke('send-email', {
  body: {
    to: contractorEmail,
    subject: `New task assignment: ${taskTitle}`,
    html: `
      <h2>You have a new task</h2>
      <p><strong>${taskTitle}</strong></p>
      <p><a href="${window.location.origin}/submit/${submissionToken}">
        View & Submit Work
      </a></p>
    `
  }
});
```

### QC Review Results

After `qcApi.submitReview()`, notify the task assignee:

```typescript
await supabase.functions.invoke('send-email', {
  body: {
    to: assigneeEmail,
    subject: `Task ${passed ? 'approved' : 'rejected'}: ${taskTitle}`,
    html: `
      <h2>QC Review Complete</h2>
      <p>Your submission for <strong>${taskTitle}</strong> was
        <strong>${passed ? 'approved' : 'rejected'}</strong>.</p>
      ${feedback ? `<p>Feedback: ${feedback}</p>` : ''}
    `
  }
});
```

### Payout Ready

After payout records are created:

```typescript
await supabase.functions.invoke('send-email', {
  body: {
    to: userEmail,
    subject: `Payout ready: $${netAmount.toFixed(2)}`,
    html: `
      <h2>Your payout is ready</h2>
      <p>Amount: <strong>$${netAmount.toFixed(2)}</strong></p>
      <p>Type: ${payoutType}</p>
      <p><a href="${window.location.origin}/payouts">View Details</a></p>
    `
  }
});
```

---

## 5. Database Trigger Alternative

Instead of sending emails from the frontend, you can use a PostgreSQL trigger + `pg_net` to call the edge function server-side whenever a notification is created. This ensures emails are sent even if the frontend call fails.

### Enable pg_net extension

In the Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### Create the trigger

```sql
CREATE OR REPLACE FUNCTION send_notification_email()
RETURNS trigger AS $$
DECLARE
  user_email text;
  edge_url text;
  service_key text;
BEGIN
  -- Get user's email
  SELECT email INTO user_email
  FROM users WHERE id = NEW.user_id;

  IF user_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get Supabase config
  edge_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/send-email';
  service_key := current_setting('app.settings.service_role_key', true);

  -- Fire-and-forget HTTP call to edge function
  PERFORM net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'to', user_email,
      'subject', NEW.title,
      'html', '<h2>' || NEW.title || '</h2><p>' || NEW.message || '</p>'
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_send_notification_email
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_notification_email();
```

**Note**: The `pg_net` approach is fire-and-forget. If email delivery is critical, add a `email_sent` boolean column to `notifications` and retry failed sends.

---

## 6. DNS Configuration

For emails to be delivered reliably (not marked as spam), configure DNS records for your sending domain:

### SPF Record
```
TXT  @  v=spf1 include:_spf.resend.com ~all
```

### DKIM Record
Your provider will give you a DKIM key to add as a DNS TXT record. Example for Resend:
```
TXT  resend._domainkey  (provided by Resend dashboard)
```

### DMARC Record
```
TXT  _dmarc  v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

Check your provider's documentation for exact values.

---

## 7. Environment Variables Summary

| Variable | Where | Purpose |
|----------|-------|---------|
| `RESEND_API_KEY` | Supabase Secrets | API key for Resend (or equivalent for other providers) |
| `EMAIL_FROM` | Supabase Secrets | Sender address (`Orbit <noreply@yourdomain.com>`) |
| `SMTP_HOST` | Supabase Dashboard | Auth SMTP host |
| `SMTP_PORT` | Supabase Dashboard | Auth SMTP port |
| `SMTP_USER` | Supabase Dashboard | Auth SMTP username |
| `SMTP_PASS` | Supabase Dashboard | Auth SMTP password |

---

## 8. Notification Types That Send Email

| Notification Type | Trigger | Email Sent |
|-------------------|---------|------------|
| `task_assigned` | Task assigned to user | Yes |
| `task_completed` | Assignee submits work | No (internal) |
| `qc_review` | QC review submitted | Yes |
| `qc_approved` | Task approved | Yes |
| `qc_rejected` | Task rejected | Yes |
| `payout_ready` | Payout created | Yes |
| `project_assigned` | PM assigned to project | Yes |
| `contract_signed` | Contract dual-signed | Yes |
| `achievement_earned` | Badge earned | No (gamification) |
| `level_up` | User levels up | No (gamification) |
| `system` | System announcements | Optional |

---

## Troubleshooting

**Emails not arriving**
- Check Supabase Edge Function logs: **Dashboard > Edge Functions > send-email > Logs**
- Verify secrets are set: `supabase secrets list`
- Check spam folder
- Verify DNS records with [MXToolbox](https://mxtoolbox.com)

**Auth emails not arriving**
- Check **Authentication > Logs** in Supabase Dashboard
- Ensure Custom SMTP is enabled and credentials are correct
- Test with a personal email (Gmail/Outlook) before using work domains

**Rate limits**
- Resend free tier: 3,000/month, 100/day
- SendGrid free tier: 100/day
- Add rate limiting to the edge function if needed
