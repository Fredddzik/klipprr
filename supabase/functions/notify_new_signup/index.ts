import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // Authenticate via shared webhook secret
  const authHeader = req.headers.get("Authorization") ?? "";
  const webhookSecret = Deno.env.get("NOTIFY_WEBHOOK_SECRET") ?? "";

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { id?: string; email?: string; created_at?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { email, created_at } = body;
  if (!email) {
    return new Response("Missing email", { status: 400 });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not set");
    return new Response("Missing Resend API key", { status: 500 });
  }

  const signupTime = created_at
    ? new Date(created_at).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC"
    : "just now";

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@klipprr.com",
      to: "hello@klipprr.com",
      subject: `New Klipprr signup: ${email}`,
      html: `
        <p>A new user just signed up for Klipprr.</p>
        <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:4px 12px 4px 0;color:#888">Email</td><td><strong>${email}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888">Signed up</td><td>${signupTime}</td></tr>
        </table>
      `,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error("Resend error", emailRes.status, errText);
    return new Response("Failed to send notification", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});
