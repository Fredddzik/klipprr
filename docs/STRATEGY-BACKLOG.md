# Strategy backlog

Business and product decisions that are **parked, not rejected**. Each one says what would make
it the right move, so nobody has to re-argue it from scratch. Engineering work that is already
decided lives in `FOUNDER-REQUESTS.md`; this file is for the things that still need evidence.

Origin: an LLM-council review of concept, pricing and direction (2026-09-29), checked against
the repos and the database the same day.

## Data snapshot (2026-09-29, Supabase)

Pull this again before deciding anything below. PostHog (downloads, app opens) was not
connected at the time, so the top of the funnel is missing.

| | |
|---|---|
| Accounts | 24 (2 in the last 30 days) |
| Accounts that exported at least one clip | 9 |
| Clips exported, all time | 42 |
| Accounts that ever hit the 10-clip free limit | 1 |
| Licences on Pro/Max | 7: 4 via Stripe, 2 via activation code, 1 founder/test |
| Paying customers | **0**. The 4 Stripe subscriptions are the founder's test accounts (confirmed 2026-09-30) |

### Funnel, April to September 2026 (PostHog project 398123, US, plus Supabase)

| Step | Count | Source |
|---|---|---|
| Visitors who accepted analytics and viewed a page | 113 (14 in the last 30 days) | PostHog |
| Download button clicks | 56 (4 in the last 30 days) | PostHog |
| Accounts | 24 (2 in the last 30 days) | Supabase |
| Exported at least one clip | 9 | Supabase |
| Paid | 0 | Stripe |

PostHog only sees visitors who accept analytics cookies, so its top two rows are floors, not
totals. The app sends PostHog nothing: release builds never had a key, and app analytics are
now switched off by design (no consent prompt in the app). The `app_opened` / `clip_exported`
events in PostHog are the founder's local dev builds; ignore them. **Measure the app from
Supabase**: accounts (`auth.users`) and exporters (`clip_usage_monthly`).

Download clicks before 2026-09-30 are attributed to the web server (US, "Automation") and
have no source. From that date they join the visitor's own session, so "where do
downloaders come from" becomes answerable once a few weeks of data exist.

Reading it: about 4 in 10 accounts export a clip, which is healthy for a free tool. The binding
constraint is volume at the top: two new accounts a month cannot tell any pricing model apart.

Reading it: the 10-clip limit is almost never reached, so it is not what drives upgrades today.
Nobody has paid yet, so no pricing change can hurt an existing customer: the question is only
which model gets the first ones.

---

## Waiting for data

### Pricing model: perpetual licence instead of subscription
**Idea:** about $49 one-time, including 12 months of updates, with an optional ~$25/yr renewal
for continued platform compatibility (the Sketch / JetBrains model).
**Why it might be right:** processing is local, so the only real recurring cost is keeping
yt-dlp working as sites change. A subscriber whose downloads break asks for a refund; a
perpetual buyer waits for the patch.
**Decide when:** we know download → export → paid conversion, and have asked a handful of
buyers what they would have paid. Touches `klipprr-web` (Stripe, pricing pages,
`check-claims.mjs`), `klipprr-local` (plan schema) and `license.rs`.

### Remove clip metering (10 / 120 / 500)
**Why:** it limits something that costs us nothing, and users can tell.
**Counter-point:** the watermark and 720p cap may be enough of a gate on their own.
**Decide when:** we know whether anyone upgrades *because* of the limit. As of the snapshot,
only one account has ever hit it.

### Remove the Max (8K) tier
**Why:** almost no source offers 8K, so the tier mostly sells a number.
**No blocker:** the one active Max licence is a founder test account, so the tier can be
removed whenever the pricing decision is made.

### Longer free trial of full quality
**Idea:** 14 days or 25 clips without the watermark, so people reach the "this is good"
moment before they hit the watermark.
**Decide when:** PostHog shows where free users drop off.

### Change the target customer
**Idea:** stop aiming at people searching "youtube downloader" and aim at people who clip the
same sources every week: stream-clip editors, podcast teams, esports and sports desks, agency
social editors. Reach them in Reddit and Discord rather than through Google Ads.
**Decide when:** we have talked to 10 of them. `PRODUCT.md` still marks the target user as
`[ASSUMPTION]`.

### SEO: stop writing new "downloader" pages
Keep the pages that already exist and rank. Do not delete them. Stop new content and ad spend
aimed at pure "downloader" keywords, since that audience pays least and draws Google policy
reviews. Revisit once `klipprr-web/docs/seo/roadmap.md` Phase 2 results are in.

---

## Not now

### Rebrand (graphite / amber, FR-4)
Do it **after** the preview cache (FR-1, FR-2) ships, together with breaking up
`cliptool/src/app/page.tsx` as `AUDIT-2026-09.md` plans.

### Archive / search / transcripts / teams / API
**Idea:** keep every clip in a searchable local library with Whisper transcripts, then add
subtitles, 9:16 reframing, team seats and a command-line tool.
**Why not now:** it is six products for one person, while the core preview is still slow.
**Legal note:** a long-term store of other people's videos plus transcripts looks much more like
an infringement tool than a clipper does, and a headless API removes the "personal use" framing.
Get legal advice before building any part of it.
**Revisit when:** we can name 10 users who clip every day.

---

## Done from the same review (2026-09-29)

- Website no longer says "no account required"; it says a free account is needed to export.
  Enforced by the `no-account` rule in `klipprr-web/scripts/check-claims.mjs`.
- `klipprr.com/open-source` lists FFmpeg (GPLv3), x264, x265 and yt-dlp, with a source-code offer.
- Fabricated testimonials had already been removed before the review.
- Google Ads account is in good standing (see `klipprr-web/docs/context/product.md` §7).
