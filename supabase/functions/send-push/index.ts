/**
 * send-push — Supabase Edge Function
 *
 * Sends a push notification to a device registered with FCM (Android/iOS via Firebase).
 *
 * Required secrets:
 *   FCM_SERVER_KEY — Firebase Cloud Messaging server key (project settings → Cloud Messaging)
 *
 * Request body:
 *   { user_id: string, title: string, body: string, data?: Record<string,string> }
 *
 * Flow:
 *   1. Look up users.metadata.push_token for the target user
 *   2. If no token, return 200 { skipped: true } (user hasn't enabled push)
 *   3. POST to FCM HTTP v1 API with the notification payload
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface PushRequest {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!FCM_SERVER_KEY) {
    // FCM not configured — skip silently so other notification paths still work
    return new Response(JSON.stringify({ skipped: true, reason: "FCM_SERVER_KEY not set" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, title, body, data = {} }: PushRequest = await req.json();

    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: "user_id, title, and body are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Look up push token using service role (bypasses RLS)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: userData, error: userError } = await admin
      .from("users")
      .select("metadata")
      .eq("id", user_id)
      .single();

    if (userError || !userData?.metadata?.push_token) {
      return new Response(JSON.stringify({ skipped: true, reason: "no push token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token: string = userData.metadata.push_token;

    // Send via FCM HTTP v1 (legacy HTTP API — swap to v1 OAuth2 when needed)
    const fcmResponse = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        notification: { title, body },
        data,
        priority: "high",
      }),
    });

    if (!fcmResponse.ok) {
      const err = await fcmResponse.text();
      console.error("FCM error:", err);
      return new Response(JSON.stringify({ error: "FCM delivery failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await fcmResponse.json();
    return new Response(JSON.stringify({ success: true, fcm: result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
