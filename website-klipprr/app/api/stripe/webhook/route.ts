import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { sign, hashes as ed25519Hashes } from "@noble/ed25519";
import { createHash } from "crypto";

// Force Node runtime so `crypto`/`Buffer` and noble hashing work reliably.
export const runtime = "nodejs";

// Ensure @noble/ed25519 hashing is configured in Node.
ed25519Hashes.sha512 = (m: Uint8Array) => createHash("sha512").update(m).digest();

/**
 * POST /api/stripe/webhook
 * Stripe webhook: subscription created/updated/deleted → update public.licenses.
 * Pay subscription → Pro active. Cancel or payment fails → active=false, plan free.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  const json = (obj: unknown, status = 200) => {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };

  if (!sig || !secret) {
    console.error("[Stripe Webhook] Missing signature or STRIPE_WEBHOOK_SECRET");
    return json({ error: "Webhook config error" }, 500);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe Webhook] Signature verification failed:", msg);
    return json({ error: "Invalid signature" }, 400);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const licensePrivB64 = process.env.KLIPPRR_LICENSE_ED25519_PRIV_B64;
  const proMonthly = process.env.STRIPE_PRO_PRICE_ID_MONTHLY ?? process.env.STRIPE_PRO_PRICE_ID;
  const proYearly = process.env.STRIPE_PRO_PRICE_ID_YEARLY;
  const maxMonthly = process.env.STRIPE_MAX_PRICE_ID_MONTHLY;
  const maxYearly = process.env.STRIPE_MAX_PRICE_ID_YEARLY;
  if (!supabaseUrl || !supabaseService) {
    console.error("[Stripe Webhook] Missing Supabase env");
    return json({ error: "Server config error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseService);

  function base64UrlEncodeUtf8(s: string) {
    // Rust's `base64::engine::general_purpose::URL_SAFE` uses URL-safe alphabet and keeps '=' padding.
    return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  }

  function base64ToBytes(b64: string) {
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  function resolvePlanFromPriceId(priceId: string | null | undefined): "pro" | "max" {
    if (priceId && (priceId === maxMonthly || priceId === maxYearly)) {
      return "max";
    }
    if (priceId && (priceId === proMonthly || priceId === proYearly)) {
      return "pro";
    }
    return "pro";
  }

  function resolvePlanFromMetadataPlan(plan: unknown): "pro" | "max" | null {
    const v = (plan ?? "").toString().trim().toLowerCase();
    if (v === "max") return "max";
    if (v === "pro") return "pro";
    return null;
  }

  async function signDesktopLicensePayload(opts: {
    email: string;
    planLower: "pro" | "free";
    expUnix: number | null;
  }) {
    if (!licensePrivB64) {
      throw new Error("Missing KLIPPRR_LICENSE_ED25519_PRIV_B64");
    }

    const privKeyBytes = base64ToBytes(licensePrivB64.trim());
    if (privKeyBytes.length !== 32) {
      throw new Error(`Bad KLIPPRR_LICENSE_ED25519_PRIV_B64 decode length=${privKeyBytes.length} (expected 32)`);
    }
    const iat = Math.floor(Date.now() / 1000);
    const planClaim = opts.planLower === "pro" ? "Pro" : "Free";

    // Field order must match Rust `LicenseClaims` struct: email, plan, iat, exp, lic, aud
    const claims: Record<string, unknown> = {
      email: opts.email,
      plan: planClaim,
      iat,
      exp: opts.expUnix,
      lic: "supabase",
      aud: null,
    };

    const claimsJson = JSON.stringify(claims);
    const payload = base64UrlEncodeUtf8(claimsJson);
    const msg = new TextEncoder().encode(payload);

    const sigBytes = await sign(msg, privKeyBytes);
    const desktop_license_sig = Buffer.from(sigBytes).toString("base64");
    return { desktop_license_payload: payload, desktop_license_sig };
  }

  async function upsertLicenseFromSubscription(sub: Stripe.Subscription, userId: string) {
    const status = sub.status;
    const active = status === "active" || status === "trialing";
    const currentPriceId = sub.items.data[0]?.price?.id ?? null;

    const planFromPrice = resolvePlanFromPriceId(currentPriceId);
    const planFromMeta =
      resolvePlanFromMetadataPlan((sub.metadata as any)?.klipprr_plan) ??
      resolvePlanFromMetadataPlan((sub.metadata as any)?.plan) ??
      null;
    const paidPlan = planFromMeta ?? planFromPrice;

    // Period: on newer Stripe API it's on the first item; on older it's on the subscription
    const firstItem = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
    const subWithPeriod = sub as Stripe.Subscription & { current_period_end?: number };
    const periodEndTs = firstItem?.current_period_end ?? subWithPeriod.current_period_end;
    const periodEnd = periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null;

    let desktop_license_payload: string | null = null;
    let desktop_license_sig: string | null = null;

    // Only required when `active=true` because the desktop only syncs active licenses.
    if (active) {
      if (!licensePrivB64) {
        console.error("[Stripe Webhook] Missing KLIPPRR_LICENSE_ED25519_PRIV_B64");
        throw new Error("Missing KLIPPRR_LICENSE_ED25519_PRIV_B64");
      }

      const expUnix = periodEnd ? Math.floor(new Date(periodEnd).getTime() / 1000) : null;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();

      let emailForSigning = (profile?.email ?? "").toString();
      if (profileError || !emailForSigning) {
        // Fall back to Stripe customer email (avoids failing the whole webhook when profiles row/email is missing).
        try {
          const customerId = sub.customer as string;
          const customer = await stripe.customers.retrieve(customerId);
          if ("email" in customer) {
            emailForSigning = (customer.email ?? "").toString();
          } else {
            emailForSigning = "";
          }
        } catch (e) {
          console.warn("[Stripe Webhook] Could not load customer email for signing; signing with empty email.", {
            userId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const signed = await signDesktopLicensePayload({
        email: emailForSigning,
        // Desktop license currently understands "Pro"/"Free"; both Pro and Max map to paid unlock.
        planLower: active ? "pro" : "free",
        expUnix,
      });

      desktop_license_payload = signed.desktop_license_payload;
      desktop_license_sig = signed.desktop_license_sig;
    }

    const { data: existing } = await supabase
      .from("licenses")
      .select("id")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();

    const payload = {
      plan: active ? paidPlan : "free",
      active,
      expires_at: periodEnd,
      desktop_license_payload,
      desktop_license_sig,
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer as string,
      stripe_price_id: currentPriceId,
    };

    if (existing) {
      await supabase.from("licenses").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("licenses").insert({
        user_id: userId,
        ...payload,
      });
    }
  }

  // Ensure we never throw an unhandled exception (Stripe will treat it as 500).
  try {
    switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) {
        console.warn("[Stripe Webhook] subscription missing supabase_user_id in metadata");
        break;
      }
      await upsertLicenseFromSubscription(sub, userId);
      break;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const subId = (session.subscription ?? "").toString();
      const userId = (session.client_reference_id ?? "").toString();
      if (!subId || !userId) {
        console.warn("[Stripe Webhook] checkout.session.completed missing subscription or client_reference_id", {
          subId,
          userId,
        });
        break;
      }
      const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
      await upsertLicenseFromSubscription(sub as any, userId);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) break;

      await supabase
        .from("licenses")
        .update({
          plan: "free",
          active: false,
        })
        .eq("user_id", userId)
        .eq("active", true);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const subId = invoice.subscription ?? null;
      if (!subId) break;

      const sub = await stripe.subscriptions.retrieve(subId);
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) break;

      await supabase
        .from("licenses")
        .update({
          plan: "free",
          active: false,
        })
        .eq("user_id", userId)
        .eq("active", true);
      break;
    }

    default:
      // Ignore other events
      break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "stripe_webhook_processing_error";
    console.error("[Stripe Webhook] Processing failed:", msg, e);
    return json({ error: "Webhook processing failed", message: msg }, 500);
  }

  return json({ received: true }, 200);
}
