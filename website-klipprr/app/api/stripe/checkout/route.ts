import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for a Pro subscription.
 * Requires Authorization: Bearer <supabase_access_token>.
 * Body: { plan?: "monthly" | "yearly" } (default: "monthly").
 * Returns { url } to redirect the user to Stripe Checkout.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  let plan: "monthly" | "yearly" = "monthly";
  try {
    const body = await req.json();
    if (body?.plan === "yearly") plan = "yearly";
  } catch {
    // no body or invalid JSON: use default monthly
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const priceIdMonthly = process.env.STRIPE_PRO_PRICE_ID_MONTHLY ?? process.env.STRIPE_PRO_PRICE_ID;
  const priceIdYearly = process.env.STRIPE_PRO_PRICE_ID_YEARLY;
  const priceId = plan === "yearly" ? priceIdYearly : priceIdMonthly;

  if (!supabaseUrl || !supabaseAnon || !supabaseService || !stripeSecret || !priceId) {
    console.error("[Stripe Checkout] Missing env: SUPABASE_*, STRIPE_SECRET_KEY, or price ID for plan:", plan);
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
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    if (licenseRow?.id) {
      await serviceClient.from("licenses").update({
        stripe_customer_id: customerId,
      }).eq("id", licenseRow.id);
    } else {
      await serviceClient.from("licenses").insert({
        user_id: user.id,
        plan: "free",
        active: true,
        stripe_customer_id: customerId,
      });
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/upgrade?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/upgrade?canceled=1`,
    client_reference_id: user.id,
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
  }).catch((err) => {
    // Prevent Next.js from returning an HTML 500 page; frontend expects JSON.
    const message = err instanceof Error ? err.message : "stripe_error";
    console.error("[Stripe Checkout] sessions.create failed:", message);
    return null;
  });

  if (!session?.url) {
    return NextResponse.json(
      { error: "Failed to create checkout session (check Stripe env + price IDs).", debug: { priceId } },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: session.url });
}
