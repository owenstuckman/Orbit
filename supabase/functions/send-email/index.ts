/**
 * Send Email Edge Function
 *
 * Generic email-sending edge function for Orbit.
 * Supports Resend (default) or generic SMTP via fetch-based API.
 *
 * SECRETS:
 *   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
 *   supabase secrets set EMAIL_FROM="Orbit <noreply@yourdomain.com>"
 *
 * DEPLOY:
 *   supabase functions deploy send-email
 *
 * DOCS:
 *   docs/SMTP_SETUP.md
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Orbit <noreply@orbit.app>";

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { to, subject, html, text }: EmailRequest = await req.json();

    if (!to || !subject || !html) {
      return jsonResponse(
        { error: "to, subject, and html are required" },
        400
      );
    }

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not set — email not sent");
      return jsonResponse({
        success: false,
        skipped: true,
        reason: "RESEND_API_KEY not configured",
      });
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
      const errorText = await response.text();
      console.error("Resend API error:", response.status, errorText);
      return jsonResponse({ error: "Failed to send email" }, 502);
    }

    const result = await response.json();
    console.log(`Email sent to ${to}: ${result.id}`);
    return jsonResponse({ success: true, id: result.id });
  } catch (error) {
    console.error("Send email error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
