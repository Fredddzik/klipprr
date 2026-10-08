# Customer questions

What we do not know about our customers, and the question that would tell us. Every question is
here because its answer changes a decision. If it would not change anything, it does not belong.

Use it for customer emails, interview calls and onboarding surveys. Log answers at the bottom.
Do not store customer names or email addresses in this file: use "Customer #N".

Origin: first paying customer, 2026-10-07. Written against `PRODUCT.md` (target user is still
`[ASSUMPTION]`), `klipprr-web/docs/context/product.md` §4 to §7, and `STRATEGY-BACKLOG.md`.

## How to ask

- Ask about what they **did**, not what they **would** do. "How did you find us?" gets a fact.
  "Would you pay $49 once?" gets politeness.
- Never pitch, defend or explain during an interview. If they got stuck, that is the finding.
- One follow-up beats five new questions: "Why?", "What happened next?", "Can you show me?"

## The big holes

Ordered by how much each answer would change what we do next.

### 1. Who actually pays, and what for?
We have three personas (frequent clipper, professional, occasional extractor) and no evidence for
any of them. Each implies different channels, copy and features.
- **Ask:** "What kind of videos do you clip, and what happens to the clips afterwards?"
- **Listen for:** posting on their own channel, sending to a client or employer, clipping for a
  streamer, keeping for reference. Is it their job or a hobby?
- **Decides:** primary target customer (backlog: *Change the target customer*), homepage copy,
  which subreddits and Discords to work.

### 2. Is the need recurring?
A subscription only makes sense if they clip every week. If it is a burst ("I needed 15 clips for
one project"), we will see cancellations and a one-time licence fits better.
- **Ask:** "How often do you need to do this? When did you last do it before Klipprr?"
- **Decides:** subscription vs perpetual licence (backlog), whether 120 clips/month is the right
  Pro ceiling.

### 3. Where did they come from?
Sales come from somewhere. Until we know where, marketing is guessing.
- **Ask:** "How did you find Klipprr? What did you search for, or where did you see it?"
- **Listen for:** the exact search phrase, a Reddit thread, a video, a friend, an ad.
- **Decides:** first marketing channel; whether "downloader" keywords bring buyers or only
  freeloaders (backlog: *SEO: stop writing new downloader pages*).

### 4. What made them pay?
The limit, the watermark, 4K, or something we have not thought of.
- **Ask:** "What made you decide to upgrade to Pro?"
- **Decides:** whether to keep the 10-clip limit (backlog: *Remove clip metering*, currently "do
  not remove yet"), what the upgrade screen should emphasise.

### 5. What were they using before, and why did it fail?
Tells us who we actually compete with, in the buyer's words.
- **Ask:** "What did you use before? What was annoying about it?"
- **Listen for:** yt-dlp, an online clipper, screen recording, CapCut, paying an editor.
- **Decides:** comparison pages, positioning line, which "alternative to X" content to write.

### 6. Where do people like them gather?
The cheapest way to find customer #2 is to go where customer #1 hangs out.
- **Ask:** "Where do you talk to other people who do this? Any subreddits, Discords, creators you
  follow?" and "Do you know anyone else who clips a lot?"
- **Decides:** Reddit/Discord targets, founder content topics, referral potential.

### 7. Where did onboarding hurt?
Best observed on a screen share, not asked.
- **Ask:** "Walk me through your first clip." Then stay quiet and watch.
- **Listen for:** confusion at download/install, Gatekeeper warnings, the account requirement,
  slow previews, export settings.
- **Decides:** onboarding fixes, onboarding email content.

### 8. What almost stopped them buying?
- **Ask:** "Was there a moment you almost didn't buy?"
- **Listen for:** price, subscription fatigue, trust (unknown company, EU entity), checkout terms.
- **Decides:** pricing page and `/upgrade` copy.

### 9. Which machine and which platforms?
- **Ask:** "Which sites do you clip from most?" and "Do you also use a Windows PC?"
- **Decides:** platform priorities for fixes, how much the Windows waitlist matters.

### 10. Would they want to mark clips while watching?
Only ask heavy users, and only after the questions above.
- **Ask:** "Where are you when you notice a moment you want to clip? Watching in the browser, in
  the app, live?"
- **Decides:** in-app mark-while-playing hotkeys vs browser extension (backlog).

### 11. How heavy is a heavy user, and is volume the only reason to pay more?
Max ($39, 500 clips) differs from Pro ($12, 120 clips) almost only in clip count: 8K rarely
exists at the source, and "priority support" means little at our size. If heavy users only want
more clips, Max is a price wall rather than a tier. Customer #1 exported 44 clips in their first
three days, more than four times what every other real account has exported, ever.
- **Ask:** "How many clips do you usually make in a normal week? Was this week normal, or was it
  one big project?"
- **Ask:** "Have you ever hit a limit on a tool like this? What did you do?"
- **Ask:** "Is there anything you wish Klipprr did that it doesn't?" Then just listen. Anything
  they name besides "more clips" is a candidate reason for a higher tier.
- **Check on a screen share:** do they export the same moment more than once (retrying, trying
  another quality)? Re-exports count against the limit and inflate "heavy use".
- **Decides:** remove Max, raise the Pro ceiling, add a tier in between, or keep it as is
  (backlog: *Remove the Max (8K) tier*, *Remove clip metering*).

## First email to a new paying customer

Three questions only, answerable in a few lines. Picked for highest decision value and because
our own data cannot answer them (we already know when they signed up and how much they clip):
**#1** (who and what for), **#3** (channel), **#4** (upgrade trigger). Save the rest for the call.

## Answers log

| Customer | Date | Source | Q | Answer, in their words |
|----------|------|--------|---|------------------------|
| #1 (first Pro sale, 2026-10-07) | | | | |
