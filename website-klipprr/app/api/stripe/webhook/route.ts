import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 * Stripe webhook: subscription created/updated/deleted → update public.licenses.
 * Pay subscription → Pro active. Cancel or payment fails → active=false, plan free.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    console.error("[Stripe Webhook] Missing signature or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook config error" }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe Webhook] Signature verification failed:", msg);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseService) {
    console.error("[Stripe Webhook] Missing Supabase env");
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseService);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) {
        console.warn("[Stripe Webhook] subscription missing supabase_user_id in metadata");
        break;
      }
      const status = sub.status;
      const active = status === "active" || status === "trialing";
      // Period: on newer Stripe API it's on the first item; on older it's on the subscription
      const firstItem = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
      const subWithPeriod = sub as Stripe.Subscription & { current_period_end?: number };
      const periodEndTs = firstItem?.current_period_end ?? subWithPeriod.current_period_end;
      const periodEnd = periodEndTs
        ? new Date(periodEndTs * 1000).toISOString()
        : null;

      const { data: existing } = await supabase
        .from("licenses")
        .select("id")
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();

      const payload = {
        plan: active ? "pro" : "free",
        active,
        expires_at: periodEnd,
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer as string,
        stripe_price_id: sub.items.data[0]?.price?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from("licenses").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("licenses").insert({
          user_id: userId,
          ...payload,
        });
      }
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
          updated_at: new Date().toISOString(),
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
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("active", true);
      break;
    }

    default:
      // Ignore other events
      break;
  }

  return NextResponse.json({ received: true });
}
