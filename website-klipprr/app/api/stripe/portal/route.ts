import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * POST /api/stripe/portal
 * Creates a Stripe Billing Portal session for the current user.
 * Requires Authorization: Bearer <supabase_access_token>.
 * Returns { url } to redirect the user to Stripe.
 */
export async function POST(req: Request) {
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
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .order("active", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (licError) {
    console.error("[Stripe Portal] license lookup failed", licError);
    return NextResponse.json({ error: "Could not load customer" }, { status: 500 });
  }

  const customerId = (license?.stripe_customer_id ?? "").toString();
  if (!customerId) {
    return NextResponse.json({ error: "No Stripe customer found for user" }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecret);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://klipprr.com";

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Stripe Portal] sessions.create failed:", msg);
    return NextResponse.json(
      { error: "Failed to create billing portal session", message: msg },
      { status: 500 }
    );
  }
}

