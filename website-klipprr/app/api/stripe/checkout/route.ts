import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for a paid subscription tier.
 * Requires Authorization: Bearer <supabase_access_token>.
 * Body: { tier?: "pro" | "max", billing?: "monthly" | "yearly" }.
 * Returns { url } to redirect the user to Stripe Checkout.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  let billing: "monthly" | "yearly" = "yearly";
  let tier: "pro" | "max" = "pro";
  try {
    const body = await req.json();
    if (body?.billing === "monthly") billing = "monthly";
    if (body?.tier === "max") tier = "max";
  } catch {
    // no body or invalid JSON: use defaults
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const proMonthly = process.env.STRIPE_PRO_PRICE_ID_MONTHLY ?? process.env.STRIPE_PRO_PRICE_ID;
  const proYearly = process.env.STRIPE_PRO_PRICE_ID_YEARLY;
  const maxMonthly = process.env.STRIPE_MAX_PRICE_ID_MONTHLY;
  const maxYearly = process.env.STRIPE_MAX_PRICE_ID_YEARLY;

  const priceId =
    tier === "pro"
      ? billing === "yearly"
        ? proYearly
        : proMonthly
      : billing === "yearly"
        ? maxYearly
        : maxMonthly;

  if (!supabaseUrl || !supabaseAnon || !supabaseService || !stripeSecret || !priceId) {
    console.error("[Stripe Checkout] Missing env: SUPABASE_*, STRIPE_SECRET_KEY, or price ID", {
      tier,
      billing,
    });
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnon);
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const stripe = new Stripe(stripeSecret);
  // Do not trust request Origin for redirect URLs; use a fixed allowlisted app URL.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://klipprr.com";

  const serviceClient = createClient(supabaseUrl, supabaseService);
  const { data: licenseRows } = await serviceClient
    .from("licenses")
    .select("id, stripe_customer_id")
    .eq("user_id", user.id)
    .order("active", { ascending: false })
    .limit(1);
  const licenseRow = Array.isArray(licenseRows) ? licenseRows[0] : licenseRows;

  let customerId = licenseRow?.stripe_customer_id ?? null;

  // Stripe live/test are isolated. If we previously stored a live customer_id and now use a
  // test secret (or vice-versa), Stripe will error "No such customer". Validate existence in
  // the current Stripe environment and recreate if needed.
  if (customerId) {
    try {
      await stripe.customers.retrieve(customerId);
    } catch (e) {
      console.warn("[Stripe Checkout] Stored customer_id not found in this Stripe mode; recreating.", {
        customerId,
      });
      customerId = null;
    }
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    if (licenseRow?.id) {
      await serviceClient
        .from("licenses")
        .update({ stripe_customer_id: customerId })
        .eq("id", licenseRow.id);
    } else {
      await serviceClient.from("licenses").insert({
        user_id: user.id,
        plan: "free",
        active: true,
        stripe_customer_id: customerId,
      });
    }
  }

  let stripeSessionError: string | null = null;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/upgrade?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/upgrade?canceled=1`,
    client_reference_id: user.id,
    subscription_data: {
      metadata: { supabase_user_id: user.id, klipprr_plan: tier },
    },
  }).catch((err) => {
    // Prevent Next.js from returning an HTML 500 page; frontend expects JSON.
    const message = err instanceof Error ? err.message : "stripe_error";
    stripeSessionError = message;
    console.error("[Stripe Checkout] sessions.create failed:", message);
    return null;
  });

  if (!session?.url) {
    return NextResponse.json(
      {
        error:
          `Failed to create checkout session (check Stripe env + price IDs).` +
          (stripeSessionError ? ` Stripe: ${stripeSessionError}` : ""),
        debug: { priceId, tier, billing },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: session.url });
}
