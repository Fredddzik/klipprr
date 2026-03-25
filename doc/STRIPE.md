# Stripe subscriptions (Pro + Max)

Paying the subscription fee turns the user’s account to **Pro** or **Max** (based on Stripe price ID). If they cancel or payment fails, the license is set to **active = false** and the app shows **Free** after the next sync.

## Where to put the variables

**Do not put secret values in this file or in the repo.** Use environment variables:

- **Production (e.g. Vercel):** Project → Settings → Environment variables. Add each name and value there.
- **Local dev:** In **website-klipprr** create a `.env.local` (or use Vercel’s env and run locally with `vercel env pull`). Add the same variable names and values. `.env.local` is gitignored.

Use the **exact** variable names below so the API routes can read them.

---

## Flow

1. **Subscribe:** User goes to **klipprr.com/upgrade**, logs in, clicks **Subscribe to Pro (Stripe)**. Frontend calls `POST /api/stripe/checkout` with `Authorization: Bearer <supabase_access_token>`. The API creates or reuses a Stripe Customer, creates a Checkout Session (subscription), and returns `{ url }`. User is redirected to Stripe Checkout.
2. **After payment:** Stripe redirects to `/upgrade?success=1`. Stripe also sends events to **POST /api/stripe/webhook**.
3. **Webhook:** Handles `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. It updates `public.licenses` (plan, active, expires_at, stripe_* ids) using the **Supabase service role**.
4. **App:** The app already syncs license from Supabase (`sync_license_from_supabase`). So after the webhook updates the row, the next sync in the app (or on next open) gives Pro. If the subscription is canceled or payment fails, the webhook sets `active = false`; sync then returns no active license and the app downgrades to Free.

---

## 1. Where to find each variable (Stripe & Supabase)

### Stripe Dashboard (sidebar: **Developers**)


| Variable                  | Where to find it                                                                                                                                                                                                                                                                          | Where to put it           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **STRIPE_SECRET_KEY**     | Developers → **API keys** → “Secret key” (starts with `sk_live`_ or `sk_test_`). Click “Reveal” and copy.                                                                                                                                                                                 | Vercel env / `.env.local` |
| **STRIPE_WEBHOOK_SECRET** | After creating the webhook (step 2 below): Developers → **Webhooks** → your endpoint → “Signing secret” (starts with `whsec`_).                                                                                                                                                           | Vercel env / `.env.local` |
| **STRIPE_PRO_PRICE_ID_MONTHLY** | Product catalog → **Products** → “Klipprr Pro” → click the **monthly** price ($12/month). Copy the **Price ID** (e.g. `price_1T7iBsCzlydVHH9DR3qYAXsc`). | Vercel env / `.env.local` |
| **STRIPE_PRO_PRICE_ID_YEARLY** | Same product → click the **yearly** price ($120/year). Copy its **Price ID** (e.g. `price_1T7iBrCzlydVHH9DpnWXrbMv`). | Vercel env / `.env.local` |
| **STRIPE_MAX_PRICE_ID_MONTHLY** | Product catalog → **Products** → “Klipprr Max” → click the **monthly** price ($39/month). Copy the **Price ID** (e.g. `price_1TEVlbCzlydVHH9DC7kNAipD`). | Vercel env / `.env.local` |
| **STRIPE_MAX_PRICE_ID_YEARLY** | Same product → click the **yearly** price ($396/year). Copy its **Price ID** (e.g. `price_1TEVlbCzlydVHH9DgqBxCXih`). | Vercel env / `.env.local` |
| **STRIPE_PRO_PRICE_ID** (optional) | If you only set this (and not the two above), it is used as the monthly price. Prefer the two vars above for both plans. | Vercel env / `.env.local` |


### Supabase


| Variable                      | Where to find it                                                                                                                         | Where to put it                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **SUPABASE_SERVICE_ROLE_KEY** | Supabase project → **Settings** → **API** → “Project API keys” → **service_role** (secret). Use only on the server (checkout + webhook). | Vercel env / `.env.local` (never expose in client) |


### Optional


| Variable                | Description                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NEXT_PUBLIC_APP_URL** | Your site’s public URL (e.g. `https://klipprr.com`). Used as fallback for Stripe success/cancel redirects if the request has no `Origin` header. |


---

## 2. Create the webhook endpoint (Stripe)

1. In Stripe, open the **Developers** section (left sidebar, bottom).
2. Go to **Webhooks**.
3. Click **Add endpoint**.
4. **Endpoint URL:**
  - Production: `https://klipprr.com/api/stripe/webhook`  
  - (Replace with your real domain if different.)
5. **Events to send:** Click “Select events” and add:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
6. Click **Add endpoint**.
7. On the new endpoint’s page, under **Signing secret**, click **Reveal** and copy the value (starts with `whsec`_). Put it in **STRIPE_WEBHOOK_SECRET** in Vercel / `.env.local`.

---

## 3. Env var checklist (website / Vercel)


| Variable                        | Description                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`             | Stripe secret key (Developers → API keys).                                                     |
| `STRIPE_WEBHOOK_SECRET`         | Webhook signing secret (after creating the endpoint above).                                    |
| `STRIPE_PRO_PRICE_ID_MONTHLY`   | Pro **monthly** Price ID from Product catalog ($12/month). |
| `STRIPE_PRO_PRICE_ID_YEARLY`   | Pro **yearly** Price ID from Product catalog ($120/year). |
| `STRIPE_MAX_PRICE_ID_MONTHLY`   | Max **monthly** Price ID from Product catalog ($39/month). |
| `STRIPE_MAX_PRICE_ID_YEARLY`   | Max **yearly** Price ID from Product catalog ($396/year). |
| `STRIPE_PRO_PRICE_ID`          | Optional fallback: used as monthly if the two above are not set. |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role key (Settings → API).                                                    |
| `NEXT_PUBLIC_SUPABASE_URL`      | Already used by the site.                                                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Already used by the site.                                                                      |
| `NEXT_PUBLIC_APP_URL`           | Optional; e.g. `https://klipprr.com`.                                                          |


## Monthly vs yearly

Set all four price vars in Vercel:

- **STRIPE_PRO_PRICE_ID_MONTHLY** / **STRIPE_PRO_PRICE_ID_YEARLY**
- **STRIPE_MAX_PRICE_ID_MONTHLY** / **STRIPE_MAX_PRICE_ID_YEARLY**

The upgrade page lets users choose tier (Pro/Max) and billing (monthly/yearly). The checkout API uses the matching price var. If Max vars are missing, Max checkout will fail with server configuration error.

---

## Activation codes

The upgrade page still supports **activation code** redemption (Supabase function `redeem_activation_code`). Stripe and activation codes both write to `public.licenses`; the app only cares that there is an active row with `plan = 'pro'` (and optional `expires_at`).

## Testing

- Use Stripe test keys and test mode.
- For webhooks locally, use [Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe listen --forward-to localhost:3000/api/stripe/webhook` and set `STRIPE_WEBHOOK_SECRET` to the CLI’s signing secret.

