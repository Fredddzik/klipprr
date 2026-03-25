import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * GET /api/stripe/subscription
 * Returns subscription summary (next billing date, amount) for the current user.
 * Requires Authorization: Bearer <supabase_access_token>.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!supabaseUrl || !supabaseAnon || !supabaseService || !stripeSecret) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnon);
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const serviceClient = createClient(supabaseUrl, supabaseService);
  const { data: license, error: licError } = await serviceClient
    .from("licenses")
    .select("stripe_subscription_id, stripe_price_id, plan, active")
    .eq("user_id", user.id)
    .order("active", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (licError) {
    console.error("[Stripe Subscription] license lookup failed", licError);
    return NextResponse.json({ error: "Could not load subscription" }, { status: 500 });
  }

  const subId = (license?.stripe_subscription_id ?? "").toString();
  if (!subId) {
    return NextResponse.json({ active: false, plan: license?.plan ?? "free" });
  }

  const stripe = new Stripe(stripeSecret);
  try {
    const subResp = await stripe.subscriptions.retrieve(subId, {
      expand: ["items.data.price"],
    });
    const sub = subResp as unknown as Stripe.Subscription;

    const item = sub.items.data[0];
    const price = item?.price;
    const unitAmount = typeof price?.unit_amount === "number" ? price.unit_amount : null;
    const currency = (price?.currency ?? "").toString() || null;
    const interval =
      (price && "recurring" in price && price.recurring?.interval) ? price.recurring.interval : null;

    // Stripe types vary by SDK version; access via safe fallbacks.
    const periodEndTs =
      (sub as any).current_period_end ??
      (item as any)?.current_period_end ??
      null;
    const periodEnd = periodEndTs ? new Date(Number(periodEndTs) * 1000).toISOString() : null;

    return NextResponse.json({
      active: sub.status === "active" || sub.status === "trialing",
      status: sub.status,
      plan: license?.plan ?? "free",
      next_billing_at: periodEnd,
      amount_minor: unitAmount,
      currency,
      interval,
      cancel_at_period_end: !!sub.cancel_at_period_end,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Stripe Subscription] retrieve failed:", msg);
    return NextResponse.json({ error: "Failed to load subscription", message: msg }, { status: 500 });
  }
}

