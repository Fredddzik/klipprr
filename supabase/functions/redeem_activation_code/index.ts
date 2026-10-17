import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sign } from "https://esm.sh/@noble/ed25519";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CODE_RE = /^[A-Z0-9-]{6,64}$/;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64UrlEncodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const stdB64 = btoa(bin);
  return stdB64.replace(/\+/g, "-").replace(/\//g, "_");
}

async function signDesktopLicensePayload(payload: string, privKeyBytes: Uint8Array) {
  const msg = new TextEncoder().encode(payload);
  const sigBytes = await sign(msg, privKeyBytes);
  return bytesToBase64(sigBytes);
}

// Map internal plan slug → display name used in desktop license claims.
// Previously only checked for 'pro', so 'max' fell through to 'Free'.
function planToClaim(plan: string): string {
  switch (plan.toLowerCase()) {
    case "max": return "Max";
    case "pro": return "Pro";
    default:    return "Free";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const privB64 = Deno.env.get("KLIPPRR_LICENSE_ED25519_PRIV_B64");
    if (!privB64 || privB64.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Missing license signing key" }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    const privKeyBytes = base64ToBytes(privB64.trim());

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const jwt = authHeader.slice("Bearer ".length).trim();

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user session" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => null);
    const rawCode = typeof body?.code === "string" ? body.code : "";
    const code = rawCode.trim().toUpperCase();

    if (!CODE_RE.test(code)) {
      return new Response(JSON.stringify({ error: "Invalid activation code format" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Atomically redeem code (prevents race/double-redeem).
    const { data: redeemed, error: redeemError } = await adminClient
      .from("activation_codes")
      .update({
        redeemed_by: user.id,
        redeemed_at: new Date().toISOString(),
      })
      .eq("code", code)
      .is("redeemed_at", null)
      .select("plan, license_duration_days")
      .single();

    if (redeemError || !redeemed) {
      return new Response(JSON.stringify({ error: "Invalid or already used code" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const planLower = String(redeemed.plan ?? "pro").toLowerCase();
    const days = redeemed.license_duration_days as number | null;

    let expires_at: string | null = null;
    if (typeof days === "number" && days > 0) {
      const expires = new Date();
      expires.setUTCDate(expires.getUTCDate() + days);
      expires_at = expires.toISOString();
    }

    const expUnix = expires_at ? Math.floor(new Date(expires_at).getTime() / 1000) : null;
    const iatUnix = Math.floor(Date.now() / 1000);

    // Build claims — planToClaim handles free/pro/max correctly.
    const claims = {
      email: user.email ?? "",
      plan: planToClaim(planLower),
      iat: iatUnix,
      exp: expUnix,
      lic: "supabase",
      aud: null,
    };

    const claimsJson = JSON.stringify(claims);
    const payload = base64UrlEncodeUtf8(claimsJson);
    const desktop_license_sig = await signDesktopLicensePayload(payload, privKeyBytes);

    const { error: licenseError } = await adminClient
      .from("licenses")
      .upsert(
        {
          user_id: user.id,
          plan: planLower,
          active: true,
          expires_at,
          desktop_license_payload: payload,
          desktop_license_sig,
        },
        { onConflict: "user_id" },
      );

    if (licenseError) {
      console.error("LICENSE_UPSERT_FAILED", {
        message: licenseError.message,
        code: licenseError.code,
        user_id: user.id,
      });
      return new Response(JSON.stringify({ error: "License update failed" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true, plan: planLower }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("REDEEM_ACTIVATION_CODE_UNHANDLED", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
