# Supabase schema overview

You have four main pieces: **auth.users** (built-in), **profiles**, **licenses**, **activation_codes**, and a view **v_user_licenses**. Here’s how they fit together.

---

## 1. `auth.users` (Supabase built-in, not “your” tables)

- **Every** sign-in (magic link, Google, email/password) creates a row here.
- Columns include: `id` (UUID), `email`, `created_at`, etc.
- You don’t see this in the Table Editor by default; it’s under **Authentication → Users** (or in the `auth` schema in SQL).
- **Your account exists here** as soon as you signed up; that’s why your beta license can be tied to you even if you don’t see your email elsewhere.

---

## 2. `public.profiles`

- Optional **app-level** table: id, email, created_at, etc.
- Often used to mirror or extend `auth.users` for your app’s own queries and RLS.
- **How rows get here** depends on your setup:
  - **Trigger on sign-up:** e.g. “on insert into auth.users, insert into profiles” (only runs for *new* sign-ups after the trigger existed).
  - **App/website:** e.g. “on first login or visit to the website, upsert into profiles.”
- If your friend’s email is in `profiles` and yours isn’t, it usually means:
  - They hit a flow that writes to `profiles` (e.g. website login or a page that upserts profile).
  - You only ever used a flow that doesn’t (e.g. old magic link from the app, or you signed up before the trigger existed).
- **Dev emails are not treated differently**; they’re just users. If the flow that creates profile rows wasn’t used for your account, you won’t have a row.

---

## 3. `public.licenses`

- One row per user (or per active license, depending on design).
- **`user_id`** = `auth.users.id` (UUID), **not** email.
- When someone redeems a beta code, the Edge Function (or backend) does something like: “get `auth.uid()`, insert/update `licenses` for that `user_id`.”
- So the **beta license is tied to your account by `auth.users.id`**. Your email doesn’t need to be in `profiles` for the license to work; the app and backend use the JWT’s `sub` (user id) to look up the license.

---

## 4. `public.activation_codes`

- List of codes (e.g. `BETA-CLIP-001`); columns like `code`, `plan`, `redeemed_by`, `redeemed_at`.
- **`redeemed_by`** = `auth.users.id` of the user who redeemed the code.
- When a code is redeemed, a row is written to **licenses** for that user and the code is marked as redeemed.

---

## 5. `v_user_licenses` (view)

- A **view** that joins user info (often from **profiles**) with **licenses** so you can see “email + license state” in one place.
- If the view is defined as something like `SELECT p.email, l.* FROM profiles p LEFT JOIN licenses l ON p.id = l.user_id`, then **only users who have a row in `profiles`** show up. So:
  - Your friend has a profile row → they appear in `v_user_licenses`.
  - You have a license (in `licenses` with your `auth.users.id`) but no row in `profiles` → you don’t appear in the view, but your license still works in the app.

---

## Summary

| Table / view           | Purpose |
|------------------------|--------|
| **auth.users**         | All signed-up users (Supabase Auth). Your account is here. |
| **profiles**           | Optional app table; only populated by trigger or app logic. You may not have a row if that flow wasn’t used. |
| **licenses**           | License per user by `user_id` (= `auth.users.id`). Beta redemption writes here. |
| **activation_codes**   | Redeemable codes; `redeemed_by` = `auth.users.id`. |
| **v_user_licenses**    | View joining profiles + licenses; only shows users that exist in `profiles`. |

To see your own user id (and confirm your license is tied to it), run in SQL Editor:

```sql
SELECT id, email FROM auth.users WHERE email = 'your@email.com';
SELECT * FROM public.licenses WHERE user_id = '<that-id>';
```

To have your email show up in `profiles` and thus in `v_user_licenses`, you can either add a trigger that creates a profile on `auth.users` insert, or ensure your app/website upserts a profile when you log in (e.g. on the login or upgrade page).
