import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clip and Download Twitch VODs on Mac — Klipprr",
  description:
    "Extract any highlight from a Twitch VOD on your Mac. Set in and out points, export just that moment — no full download, no screen recording. Free to start.",
  alternates: { canonical: "/twitch-clip-downloader" },
  openGraph: {
    title: "Clip and Download Twitch VODs on Mac — Klipprr",
    description:
      "Extract highlights from Twitch VODs with frame-precise trimming. Local processing, hardware-accelerated export. Free to start.",
    url: "https://klipprr.com/twitch-clip-downloader",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@klipprr",
    creator: "@klipprr",
    title: "Clip and Download Twitch VODs on Mac — Klipprr",
    description:
      "Extract highlights from Twitch VODs with frame-precise trimming. Free to start.",
  },
};

export default function TwitchClipDownloaderPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://klipprr.com" },
      { "@type": "ListItem", position: 2, name: "Twitch Clip Downloader", item: "https://klipprr.com/twitch-clip-downloader" },
    ],
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to clip and download a Twitch VOD highlight on Mac",
    description: "Use Klipprr to extract any segment from a Twitch VOD on macOS — no full download required.",
    tool: [{ "@type": "HowToTool", name: "Klipprr", url: "https://klipprr.com" }],
    step: [
      { "@type": "HowToStep", position: 1, name: "Open the Twitch VOD", text: "Go to the streamer's channel on Twitch and open the VOD you want to clip from. Copy the VOD URL from the address bar — it will look like twitch.tv/videos/1234567890.", url: "https://klipprr.com/download" },
      { "@type": "HowToStep", position: 2, name: "Paste the URL into Klipprr", text: "Open Klipprr and paste the Twitch VOD URL. The app loads the VOD into a preview timeline. Nothing is downloaded to your drive at this stage." },
      { "@type": "HowToStep", position: 3, name: "Mark your In and Out points", text: "Scrub to the moment where you want your clip to start and press I. Scrub to the end of the highlight and press O. For a multi-hour VOD, you can jump to approximate timestamps first and then fine-tune frame by frame." },
      { "@type": "HowToStep", position: 4, name: "Export", text: "Click Export. Klipprr processes the clip locally on your Mac using hardware acceleration. The finished file is saved to your folder — ready for YouTube, TikTok, or your editor." },
    ],
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Klipprr",
    url: "https://klipprr.com",
    downloadUrl: "https://klipprr.com/download",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "macOS",
    description: "Klipprr is a native macOS app for clipping highlights from Twitch VODs and other video sources with frame-precise in/out points.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "Can I download a clip from a Twitch VOD without downloading the whole stream?", acceptedAnswer: { "@type": "Answer", text: "Yes. Klipprr lets you paste the Twitch VOD URL, set precise in and out points, and export only that segment. You never download the full VOD — Klipprr streams and clips only the part you mark." } },
      { "@type": "Question", name: "What's the difference between a Twitch Clip and a Twitch VOD?", acceptedAnswer: { "@type": "Answer", text: "A Twitch Clip is a short segment already cut by a viewer inside Twitch (60 seconds max). A VOD is the full recorded stream — often hours long. Klipprr works with VODs, letting you cut any segment of any length with precise frame control." } },
      { "@type": "Question", name: "Does Klipprr work on Twitch VODs that are subscriber-only?", acceptedAnswer: { "@type": "Answer", text: "Klipprr works with publicly accessible VOD URLs. Subscriber-only or deleted VODs require authentication that Klipprr doesn't handle — those are not accessible through the app." } },
      { "@type": "Question", name: "Is it free to clip Twitch VODs with Klipprr?", acceptedAnswer: { "@type": "Answer", text: "Yes. The free plan gives you 10 clips per month at up to 720p. Pro ($12/mo) and Max ($39/mo) remove the watermark and raise the quality ceiling." } },
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Klipprr" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-semibold text-white">Klipprr</span>
          </Link>
          <Link href="/download" className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition">
            Download for Mac
          </Link>
        </nav>
      </header>

      <div className="pt-24 px-6">
        <div className="mx-auto max-w-4xl">
          <nav className="flex items-center gap-2 text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-300 transition">Home</Link>
            <span>/</span>
            <span className="text-zinc-400">Twitch Clip Downloader</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="pt-10 pb-20 px-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-sm font-medium text-violet-400">For macOS · Free to start</p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Clip Any Highlight from a{" "}
            <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Twitch VOD
            </span>
            {" "}on Mac
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-300">
            Paste the VOD URL, mark the moment you want, export just that clip. No downloading
            the full stream. No waiting in real-time. Works on multi-hour VODs.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/download" className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition">
              Download Klipprr Free
            </Link>
            <a href="#how-it-works" className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition">
              See how it works ↓
            </a>
          </div>
          <p className="mt-4 text-xs text-zinc-500">Free · 10 clips/month · Apple Silicon · No credit card</p>
        </div>
      </section>

      {/* The Twitch VOD problem */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">The Twitch VOD problem</h2>
          <p className="mt-4 text-zinc-400">
            A streamer goes live for 6 hours. There's one 3-minute moment you want — a clutch play,
            a funny reaction, a key announcement. Getting just that moment out cleanly is harder than it should be.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {[
              { label: "Twitch's built-in Clip tool", problem: "60-second maximum. No frame control. The Clip button captures what's on screen in real-time — if you missed it live, you're already too late." },
              { label: "Download the full VOD first", problem: "Full Twitch VODs can be 10–30GB for a long stream. Download it, wait, then open it in an editor, trim, re-export, wait again. Two workflows, double the time." },
              { label: "Screen recording", problem: "You watch the stream at real speed while recording. A 3-minute clip takes at least 3 minutes to capture, and your screen resolution is the quality ceiling — not the stream's actual resolution." },
            ].map((alt) => (
              <div key={alt.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <p className="text-sm font-semibold text-zinc-300">{alt.label}</p>
                <p className="mt-2 text-sm text-zinc-500">{alt.problem}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-violet-500/30 bg-violet-500/5 p-6">
            <p className="text-sm font-semibold text-violet-300">Klipprr</p>
            <p className="mt-2 text-sm text-zinc-300">
              Paste the VOD URL. Jump to any timestamp instantly. Set your In and Out points.
              Export in seconds. The clip is processed locally — no cloud queue, no stream resolution
              cap, no real-time wait.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">How to clip a Twitch VOD with Klipprr</h2>
          <p className="mt-3 text-zinc-400">Four steps. Works on VODs of any length.</p>
          <ol className="mt-10 space-y-10">
            {[
              { n: "1", title: "Find the VOD URL", body: "Go to the streamer's Twitch channel and open their Videos tab. Click the VOD you want. The URL in your browser will look like twitch.tv/videos/1234567890 — copy that. You can also use a timestamped URL (twitch.tv/videos/1234567890?t=1h23m45s) and Klipprr will start the preview at that point.", cta: null },
              { n: "2", title: "Paste it into Klipprr", body: "Open Klipprr and paste the VOD URL. The app loads the stream into a preview timeline — nothing is saved to your drive yet. For long VODs, use the timestamp jump field to navigate directly to the region you care about.", cta: { label: "Download Klipprr →", href: "/download" } },
              { n: "3", title: "Set In and Out points", body: "Scrub to the exact frame where you want the clip to start and press I. Find the end of the moment and press O. Arrow keys let you step frame by frame for precision. You can create multiple clips from the same VOD — set them all before you export.", cta: null },
              { n: "4", title: "Export", body: "Click Export. Klipprr processes the clip locally using Apple's hardware encoder. On M1 or newer, export is fast regardless of the original stream length — the processing time is proportional to your clip length, not the VOD length. The finished MP4 is saved to your chosen folder.", cta: null },
            ].map((step) => (
              <li key={step.n} className="flex gap-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-400">{step.n}</span>
                <div>
                  <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                  {step.cta && <Link href={step.cta.href} className="mt-3 inline-block text-sm text-violet-400 hover:text-violet-300 transition">{step.cta.label}</Link>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Built for VOD workflows</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {[
              { title: "Jump to any timestamp", body: "Navigate directly to any point in a multi-hour VOD without scrubbing through the full timeline." },
              { title: "Frame-precise trimming", body: "Set In and Out points at the exact frame. What you mark is what you get — no off-by-one-second surprises." },
              { title: "Multiple clips, one export", body: "Mark several highlights from the same stream, then batch export them all in one pass." },
              { title: "No full VOD download", body: "Klipprr streams and clips the segment directly. A 4-hour VOD doesn't need to hit your drive first." },
              { title: "Hardware-accelerated on Apple Silicon", body: "Export uses Apple's VideoToolbox. M1, M2, M3 chips process clips in seconds." },
              { title: "Local processing — your content stays yours", body: "No cloud queue. No upload. No third-party server touching your clips." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Common questions</h2>
          <div className="mt-8 space-y-3">
            {[
              { q: "Can I download a clip from a Twitch VOD without downloading the whole stream?", a: "Yes. Klipprr lets you paste the Twitch VOD URL, set precise in and out points, and export only that segment. You never download the full VOD — Klipprr streams and clips only the part you mark." },
              { q: "What's the difference between a Twitch Clip and a Twitch VOD?", a: "A Twitch Clip is a short segment already cut by a viewer inside Twitch (60 seconds max). A VOD is the full recorded stream — often hours long. Klipprr works with VODs, letting you cut any segment of any length with precise frame control." },
              { q: "Does Klipprr work on subscriber-only Twitch VODs?", a: "Klipprr works with publicly accessible VOD URLs. Subscriber-only or deleted VODs require authentication that Klipprr doesn't handle." },
              { q: "Is it free?", a: "Yes. The free plan gives you 10 clips per month at up to 720p. Pro ($12/mo) and Max ($39/mo) remove the watermark and raise the quality ceiling to 4K and 8K respectively." },
            ].map((item) => (
              <details key={item.q} className="group rounded-xl border border-zinc-800 bg-zinc-900/50 open:border-zinc-700 transition-colors">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="text-base font-semibold text-white">{item.q}</span>
                  <svg className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </summary>
                <div className="px-6 pb-5"><p className="text-sm leading-relaxed text-zinc-400">{item.a}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Pull that highlight from the VOD.</h2>
          <p className="mt-4 text-zinc-400">Download Klipprr for Mac. Free to start — no credit card, no account wall.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/download" className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition">
              Download Klipprr Free
            </Link>
            <Link href="/#pricing" className="rounded-full border border-zinc-700 px-7 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition">
              View pricing
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-600">Apple Silicon · macOS · Free plan included</p>
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-10 px-6">
        <div className="mx-auto max-w-6xl flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Klipprr" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-semibold text-white">Klipprr</span>
          </Link>
          <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-500">
            <Link href="/download" className="hover:text-zinc-300 transition">Download</Link>
            <Link href="/privacy" className="hover:text-zinc-300 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition">Terms</Link>
            <a href="mailto:hello@klipprr.com" className="hover:text-zinc-300 transition">Contact</a>
          </div>
          <p className="text-xs text-zinc-600">© 2026 Klipprr</p>
        </div>
      </footer>
    </div>
  );
}
