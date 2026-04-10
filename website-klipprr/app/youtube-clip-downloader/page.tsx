import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download Part of a YouTube Video on Mac — Klipprr",
  description:
    "Clip any segment of a YouTube video and export just that part — no full download, no screen recording. Free to start. Native macOS app.",
  alternates: {
    canonical: "/youtube-clip-downloader",
  },
  openGraph: {
    title: "Download Part of a YouTube Video on Mac — Klipprr",
    description:
      "Set in and out points on any YouTube video and export exactly the clip you want. Hardware-accelerated, local processing. Free to start.",
    url: "https://klipprr.com/youtube-clip-downloader",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@klipprr",
    creator: "@klipprr",
    title: "Download Part of a YouTube Video on Mac — Klipprr",
    description:
      "Set in and out points on any YouTube video and export exactly the clip you want. Free to start.",
  },
};

export default function YouTubeClipDownloaderPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://klipprr.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Download Part of a YouTube Video",
        item: "https://klipprr.com/youtube-clip-downloader",
      },
    ],
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to download part of a YouTube video on Mac",
    description:
      "Use Klipprr to clip any segment of a YouTube video and export only that part — without downloading the full file or screen recording.",
    tool: [{ "@type": "HowToTool", name: "Klipprr", url: "https://klipprr.com" }],
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Download and open Klipprr",
        text: "Download Klipprr for macOS from klipprr.com/download. Open the app — no browser tab, no sign-in required to get started.",
        url: "https://klipprr.com/download",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Paste the YouTube URL",
        text: "Copy the URL of the YouTube video you want to clip. Paste it into Klipprr. The app fetches the media and loads it into a preview timeline — no full download to your drive required at this stage.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Set your in and out points",
        text: "Scrub the timeline to find the exact moment you want to start. Set your In point. Then find the end of the segment and set your Out point. You can preview the selection before exporting. Multiple clips from one video are supported — set them all before exporting.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Export the clip",
        text: "Hit export. Klipprr processes the clip locally on your Mac using hardware acceleration. The finished file is saved to your chosen folder — ready to publish, share, or drop into your editor.",
      },
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
    description:
      "Klipprr is a native macOS app that lets you clip any segment of a YouTube video and export just that part — no full download, no screen recording.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Can I download just a part of a YouTube video, not the whole thing?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Klipprr lets you paste a YouTube URL, set precise in and out points on a visual timeline, and export only that segment. You never download the full video file — Klipprr fetches and clips only the part you need.",
        },
      },
      {
        "@type": "Question",
        name: "Is it free to clip YouTube videos with Klipprr?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Klipprr's free plan gives you 10 clips per month at up to 720p. No credit card required. Paid plans (Pro at $12/mo, Max at $39/mo) remove the watermark, raise the quality ceiling to 4K or 8K, and increase monthly clip limits.",
        },
      },
      {
        "@type": "Question",
        name: "Does Klipprr work on macOS Ventura, Sonoma, or Sequoia?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Klipprr runs on Apple Silicon Macs (M1, M2, M3 and newer) and is tested on recent macOS versions. If you're on an Intel Mac, Intel support is in evaluation — email hello@klipprr.com to be notified.",
        },
      },
      {
        "@type": "Question",
        name: "Does Klipprr upload my video to a server?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. All processing happens locally on your Mac. Your video content never leaves your machine. The only server calls are for account login and billing.",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Klipprr" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-semibold text-white">Klipprr</span>
          </Link>
          <Link
            href="/download"
            className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
          >
            Download for Mac
          </Link>
        </nav>
      </header>

      {/* Breadcrumb */}
      <div className="pt-24 px-6">
        <div className="mx-auto max-w-4xl">
          <nav className="flex items-center gap-2 text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-300 transition">Home</Link>
            <span>/</span>
            <span className="text-zinc-400">YouTube Clip Downloader</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="pt-10 pb-20 px-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-sm font-medium text-violet-400">For macOS · Free to start</p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Download Any Part of a{" "}
            <span className="bg-gradient-to-r from-red-400 via-rose-400 to-pink-400 bg-clip-text text-transparent">
              YouTube Video
            </span>
            {" "}on Mac
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-300">
            Paste the URL. Set your in and out points. Export just the clip. No full download, no
            screen recording, no ffmpeg command to write. Klipprr does it in seconds.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/download"
              className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
            >
              Download Klipprr Free
            </Link>
            <a
              href="#how-it-works"
              className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition"
            >
              See how it works ↓
            </a>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Free · 10 clips/month · Apple Silicon · No credit card
          </p>
        </div>
      </section>

      {/* Why not the alternatives */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Why not just screen record or use yt-dlp?
          </h2>
          <p className="mt-4 text-zinc-400">
            Both work. Both are annoying in different ways.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                label: "Screen recording",
                problem: "Real-time only. You wait through the whole segment. Quality degrades. Audio sync drifts. Then you still have to trim in another app.",
              },
              {
                label: "yt-dlp / youtube-dl",
                problem: "Download the entire video first — could be gigabytes. Then pipe through ffmpeg with timestamps to trim. One wrong flag and you re-run the whole thing.",
              },
              {
                label: "Online clip tools",
                problem: "Upload your footage to a third-party server, wait in a queue, download a re-compressed file with a watermark, and hope the URL still works next week.",
              },
            ].map((alt) => (
              <div key={alt.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <p className="text-sm font-semibold text-zinc-300">{alt.label}</p>
                <p className="mt-2 text-sm text-zinc-500">{alt.problem}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-xl border border-violet-500/30 bg-violet-500/5 p-6">
            <p className="text-sm font-semibold text-violet-300">Klipprr</p>
            <p className="mt-2 text-sm text-zinc-300">
              Paste URL → set in/out points → export. Processing happens locally on your Mac using
              Apple's hardware encoder. No waiting, no server, no re-compression surprise. The clip
              you see in the timeline is the clip you get.
            </p>
          </div>
        </div>
      </section>

      {/* How it works — tutorial */}
      <section id="how-it-works" className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            How to clip a YouTube video with Klipprr
          </h2>
          <p className="mt-3 text-zinc-400">Four steps. Under a minute the first time.</p>

          <ol className="mt-10 space-y-10">
            {[
              {
                n: "1",
                title: "Download and open Klipprr",
                body: "Head to the download page and grab the macOS build. Open the app — it installs like any other Mac app. No browser extension, no account wall.",
                cta: { label: "Go to download →", href: "/download" },
              },
              {
                n: "2",
                title: "Paste the YouTube URL",
                body: "Find the YouTube video you want to clip. Copy the URL from the address bar or from the Share menu. Paste it into Klipprr. The app resolves the video and loads it into a preview timeline — nothing is downloaded to your drive yet.",
              },
              {
                n: "3",
                title: "Set your in and out points",
                body: "Scrub through the preview to find the exact frame where you want the clip to start. Press I (or click the In button) to mark it. Then scrub to where you want it to end and press O (or click Out). The selection snaps to your marks. You can create multiple clips from the same video — useful for pulling a highlight reel from a long stream or interview.",
              },
              {
                n: "4",
                title: "Export",
                body: "Click Export. Klipprr processes the clip locally using Apple's VideoToolbox hardware encoder — M1, M2, and M3 chips handle this in seconds regardless of clip length. The finished file lands in your chosen folder. MP4 by default. Ready to upload, share, or drop into your editor.",
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-6">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-400">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                  {step.cta && (
                    <Link
                      href={step.cta.href}
                      className="mt-3 inline-block text-sm text-violet-400 hover:text-violet-300 transition"
                    >
                      {step.cta.label}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Built for clipping, not just downloading
          </h2>
          <p className="mt-3 text-zinc-400">
            Most YouTube downloaders grab the whole video and leave the trimming to you. Klipprr
            makes the clip the primary unit of work.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: "Frame-perfect in/out points",
                body: "The timeline lets you set marks at the exact frame — not an approximation. What you set is what you get in the export. No re-trimming in a separate editor.",
              },
              {
                title: "Multiple clips from one video",
                body: "Set up several in/out pairs before you export. Batch export them all at once. Great for pulling multiple highlights from a long-form interview or VOD.",
              },
              {
                title: "Hardware-accelerated on Apple Silicon",
                body: "Export uses Apple's VideoToolbox encoder. On M1, M2, and M3 chips, a 60-second clip exports in roughly 3–5 seconds. The CPU barely notices.",
              },
              {
                title: "Local processing — nothing leaves your Mac",
                body: "No cloud queue, no upload, no privacy trade-off. Klipprr processes entirely on your machine. Your content stays yours.",
              },
              {
                title: "No full download required",
                body: "Klipprr streams and clips the segment directly. You're not downloading a 4GB file to trim 30 seconds out of it.",
              },
              {
                title: "Works with local files too",
                body: "Already have the video on your Mac? Load it directly. Same workflow, no internet needed. Useful for footage you've already archived.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Who uses it</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                who: "Content creators",
                what: "Pull reaction clips, repurpose long-form content into shorts, or archive a segment before a video gets taken down.",
              },
              {
                who: "Streamers & editors",
                what: "Clip highlights from VODs for YouTube, TikTok, or Reels. Set multiple marks, export in a batch, move on.",
              },
              {
                who: "Researchers & students",
                what: "Clip a specific section of a lecture, documentary, or interview for reference or presentation use.",
              },
            ].map((uc) => (
              <div key={uc.who} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <p className="text-sm font-semibold text-white">{uc.who}</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{uc.what}</p>
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
              {
                q: "Can I download just a part of a YouTube video, not the whole thing?",
                a: "Yes. Klipprr lets you paste a YouTube URL, set precise in and out points on a visual timeline, and export only that segment. You never download the full video file — Klipprr fetches and clips only the part you need.",
              },
              {
                q: "Is it free to clip YouTube videos with Klipprr?",
                a: "Yes. Klipprr's free plan gives you 10 clips per month at up to 720p. No credit card required. Paid plans (Pro at $12/mo, Max at $39/mo) remove the watermark, raise the quality ceiling to 4K or 8K, and increase monthly clip limits.",
              },
              {
                q: "Does Klipprr work on macOS Ventura, Sonoma, or Sequoia?",
                a: "Klipprr runs on Apple Silicon Macs (M1, M2, M3 and newer) and is tested on recent macOS versions. If you're on an Intel Mac, Intel support is in evaluation — email hello@klipprr.com to be notified.",
              },
              {
                q: "Does Klipprr upload my video to a server?",
                a: "No. All processing happens locally on your Mac. Your video content never leaves your machine. The only server calls are for account login and billing.",
              },
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 open:border-zinc-700 transition-colors"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="text-base font-semibold text-white">{item.q}</span>
                  <svg
                    className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </summary>
                <div className="px-6 pb-5">
                  <p className="text-sm leading-relaxed text-zinc-400">{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Ready to clip your first YouTube segment?
          </h2>
          <p className="mt-4 text-zinc-400">
            Download Klipprr for Mac. Free to start — no credit card, no account wall.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/download"
              className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
            >
              Download Klipprr Free
            </Link>
            <Link
              href="/#pricing"
              className="rounded-full border border-zinc-700 px-7 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition"
            >
              View pricing
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-600">Apple Silicon · macOS · Free plan included</p>
        </div>
      </section>

      {/* Footer */}
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
