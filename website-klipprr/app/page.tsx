import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { PricingSection } from "./PricingSection";

export const metadata: Metadata = {
  title: "Klipprr — Clip & Download Videos | YouTube, Twitch & More",
  description:
    "Klipprr is a desktop app for editors and creators. Clip any YouTube, Twitch, Instagram or X video — export just the part you want. No full download needed.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Klipprr — Clip & Download Videos | YouTube, Twitch & More",
    description:
      "Clip and download exactly the part of any video you want. Supports YouTube, Twitch, Reels, Twitter/X and local files. Free to start.",
    url: "https://klipprr.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@klipprr",
    creator: "@klipprr",
    title: "Klipprr — Clip & Download Videos | YouTube, Twitch & More",
    description:
      "Clip and download exactly the part of any video you want. Supports YouTube, Twitch, Reels, Twitter/X and local files. Free to start.",
  },
};

export default function Home() {
  const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Klipprr",
    url: "https://klipprr.com",
    downloadUrl: "https://klipprr.com/download",
    image: "https://klipprr.com/og-image",
    screenshot: "https://klipprr.com/og-image",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "macOS, Windows (coming soon)",
    softwareVersion: "0.1.19",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "12",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        description: "$12 monthly or $10/mo when billed yearly upfront.",
      },
      {
        "@type": "Offer",
        name: "Max",
        price: "39",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        description: "$39 monthly or $33/mo when billed yearly upfront.",
      },
    ],
    description:
      "Klipprr is a native desktop application for editors and creators. Clip any part of a YouTube, Twitch, Instagram Reels, Twitter/X, or local video file by setting precise in and out points, then export only that segment.",
  };

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Klipprr",
    url: "https://klipprr.com",
    logo: "https://klipprr.com/logo.png",
    description:
      "Klipprr is a desktop video clipping app for creators who need fast, precise exports from online and local videos.",
    email: "hello@klipprr.com",
    foundingLocation: { "@type": "Place", addressCountry: "SK" },
    sameAs: [
      "https://x.com/klipprr",
      "https://www.instagram.com/klipprr/",
      "https://tiktok.com/@getklipprr",
    ],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Klipprr",
    url: "https://klipprr.com",
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to clip and download part of a video with Klipprr",
    description:
      "Use Klipprr to clip only the section you want from online videos or local files and export it in seconds.",
    step: [
      {
        "@type": "HowToStep",
        name: "Paste a video URL or load a local file",
        text: "Start by pasting a supported video link from YouTube, Twitch, Instagram, or X, or load a local file from your Mac. Klipprr resolves the playable source and prepares the timeline for trimming.",
      },
      {
        "@type": "HowToStep",
        name: "Set In and Out points",
        text: "Use the timeline and preview player to mark exact start and end timestamps. You can create one or multiple clips from the same source and rename each clip before export.",
      },
      {
        "@type": "HowToStep",
        name: "Export and share",
        text: "Export your clip with the quality and format that fit your workflow. Klipprr processes the clip locally on your machine so you get the exact segment without uploading your footage to the cloud.",
      },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Can I download just part of a YouTube video?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes — that’s exactly what Klipprr is built for. Paste the YouTube URL, set your in and out points on the timeline, and export only the segment you want. No downloading the full video first, no screen recording, no manual trimming after the fact. It works the same way for Twitch VODs, Instagram Reels, and Twitter/X clips.",
        },
      },
      {
        "@type": "Question",
        name: "Which platforms does Klipprr support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "YouTube, Twitch, Instagram Reels, Twitter/X, and local video files. Paste a URL or drag in a file — Klipprr handles both in the same workflow. More platforms are on the roadmap. If there’s one you need urgently, email us at hello@klipprr.com.",
        },
      },
      {
        "@type": "Question",
        name: "Is Klipprr free to use?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. The free plan gives you 10 clips per month at up to 720p, with a small watermark. No credit card required to get started. When you need more — higher quality, no watermark, or more clips per month — Pro ($12/mo) and Max ($39/mo) have you covered. Both paid plans include a yearly option that works out to 2 months free.",
        },
      },
      {
        "@type": "Question",
        name: "How do I get rid of the watermark?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Upgrade to Pro or Max. Both remove the watermark entirely and raise the export quality ceiling. Pro goes up to 4K and gives you 120 clips per month. Max goes up to 8K (where the source supports it) and gives you 500 clips per month. If you’re clipping for clients or publishing regularly, Pro pays for itself fast.",
        },
      },
      {
        "@type": "Question",
        name: "What’s the difference between Pro and Max?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Both remove watermarks and unlock higher quality exports. The difference is scale. Pro gives you up to 4K and 120 clips per month — the right fit for most creators. Max gives you up to 8K and 500 clips per month, plus priority support. If you’re running a heavy editorial or social workflow, Max removes the ceiling.",
        },
      },
      {
        "@type": "Question",
        name: "Do I need an account to use Klipprr?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Not to try it. You can download and use the free tier without signing up. An account is only required when you upgrade to Pro or Max — so your subscription and clip limits stay synced. Sign in before checkout for the smoothest experience.",
        },
      },
      {
        "@type": "Question",
        name: "What Mac do I need to run Klipprr?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Klipprr is built for Apple Silicon — M1, M2, M3, and newer. Hardware-accelerated export relies on Apple’s VideoToolbox, which is why the app is fast on these chips. Intel Mac support is something we’re evaluating. If you’re on Intel and want to be notified, drop us a note at hello@klipprr.com.",
        },
      },
      {
        "@type": "Question",
        name: "How is Klipprr different from yt-dlp or youtube-dl?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "yt-dlp is powerful and we respect it — but it’s a command-line tool. Every clip requires typing a command, managing flags, and piping through ffmpeg to trim. Klipprr gives you a visual timeline, instant preview, and one-click export. If you clip videos more than occasionally, the time saved adds up fast. Klipprr is for people who want results, not a terminal session.",
        },
      },
      {
        "@type": "Question",
        name: "Can I use Klipprr without internet?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, for local files. If the video is already on your Mac, Klipprr works without any internet connection. For URL-based sources like YouTube or Twitch, you need a connection to resolve and stream the media — but processing and export always happen locally on your machine.",
        },
      },
      {
        "@type": "Question",
        name: "Does Klipprr upload my videos anywhere?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. All clipping and export happens locally in the app on your Mac. Your video files never leave your machine. The only server interaction is for account authentication and billing — nothing related to your video content. See the Privacy Policy for the full picture.",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Klipprr" width={32} height={32} className="rounded-lg" priority />
            <span className="text-lg font-semibold text-white">Klipprr</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-zinc-400 hover:text-white transition">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-zinc-400 hover:text-white transition">
              How It Works
            </a>
            <a href="#pricing" className="text-sm text-zinc-400 hover:text-white transition">
              Pricing
            </a>
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition">
              Sign In
            </Link>
            <Link
              href="/download"
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 transition"
            >
              Download for Mac
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-4 text-sm font-medium tracking-wider">
            <span className="text-white">macOS</span>
            <span className="mx-2 text-zinc-500">·</span>
            <span className="text-zinc-400">Windows coming soon</span>
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Clip Any Part of Any Video.{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
              Download in Seconds.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-sm text-zinc-300">
            Klipprr is a desktop app built for editors and creators. Paste a YouTube, Twitch,
            Instagram or X URL — or load a local file — set your in and out points, and export just
            that clip. No full downloads. No screen recording. Just the clip you need.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/download"
              className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
            >
              Download for Mac
            </Link>
            <Link
              href="/download"
              className="rounded-full border border-zinc-600 bg-zinc-900/50 px-6 py-3 text-sm font-medium text-zinc-300 hover:border-violet-500 hover:text-white transition"
            >
              Windows? Join the waitlist →
            </Link>
            <a
              href="#how-it-works"
              className="rounded-full border border-zinc-600 bg-zinc-900/50 px-6 py-3 text-sm font-medium text-white hover:border-zinc-500 hover:bg-zinc-800/50 transition"
            >
              Watch Demo
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-zinc-800 py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Everything You Need to Clip Faster
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Built for content creators, streamers, and editors
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: "🔗",
                title: "YouTube, Twitch, Instagram & X",
                description: "Paste any video URL and start clipping instantly. No full download required.",
              },
              {
                icon: "🎬",
                title: "Frame-Perfect Trimming",
                description: "Set precise in and out points with a visual timeline. What you see is what you export.",
              },
              {
                icon: "📁",
                title: "Local File Support",
                description: "Already have the video? Load it directly from your Mac and clip away.",
              },
              {
                icon: "⚡",
                title: "Hardware-Accelerated Exports",
                description: "Exports in seconds using your Mac's GPU. Not minutes. Seconds.",
              },
              {
                icon: "🗂️",
                title: "Multiple Clips, One Export",
                description: "Mark multiple clips from one video and batch export them all at once.",
              },
              {
                icon: "🖥️",
                title: "Native macOS App",
                description: "Built for Mac. No browser tab. No cloud upload. Your files stay on your machine.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-zinc-700 transition"
              >
                <span className="text-2xl">{f.icon}</span>
                <h3 className="mt-3 text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-zinc-800 py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Clip in Three Simple Steps
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              From video to viral clip in under a minute
            </p>
          </div>
          <div className="mt-16 grid gap-12 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Paste URL or Upload",
                description:
                  "Paste a supported URL from YouTube, Twitch, Instagram, or X, or load a local file from your Mac. Klipprr resolves the media and prepares a clean preview timeline. This keeps setup fast and removes guesswork before clipping.",
              },
              {
                step: "02",
                title: "Select Your Clip",
                description:
                  "Mark exact in and out points with a timeline built for precise trimming. Create multiple clips from one source, adjust ranges quickly, and rename clips before export. What you set in the timeline is what gets exported.",
              },
              {
                step: "03",
                title: "Export & Share",
                description:
                  "Export in the format and quality you need, from quick social clips to higher-quality deliverables. Klipprr prioritizes local processing for speed and control. Your final clip is ready to publish without extra conversion steps.",
              },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <span className="inline-block rounded-full bg-violet-500/20 px-3 py-1 text-sm font-medium text-violet-400">
                  {s.step}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PricingSection />

      <section id="faq" className="border-t border-zinc-800 py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Frequently Asked Questions</h2>
            <p className="mt-4 text-zinc-400">Everything you need to know before downloading.</p>
          </div>
          <div className="mt-12 space-y-3">
            {[
              {
                q: "Can I download just part of a YouTube video?",
                a: "Yes — that’s exactly what Klipprr is built for. Paste the YouTube URL, set your in and out points on the timeline, and export only the segment you want. No downloading the full video first, no screen recording, no manual trimming after the fact. It works the same way for Twitch VODs, Instagram Reels, and Twitter/X clips.",
              },
              {
                q: "Which platforms does Klipprr support?",
                a: "YouTube, Twitch, Instagram Reels, Twitter/X, and local video files. Paste a URL or drag in a file — Klipprr handles both in the same workflow. More platforms are on the roadmap. If there’s one you need urgently, email us at hello@klipprr.com.",
              },
              {
                q: "Is Klipprr free to use?",
                a: "Yes. The free plan gives you 10 clips per month at up to 720p, with a small watermark. No credit card required to get started. When you need more — higher quality, no watermark, or more clips per month — Pro ($12/mo) and Max ($39/mo) have you covered. Both paid plans include a yearly option that works out to 2 months free.",
              },
              {
                q: "How do I get rid of the watermark?",
                a: "Upgrade to Pro or Max. Both remove the watermark entirely and raise the export quality ceiling. Pro goes up to 4K and gives you 120 clips per month. Max goes up to 8K (where the source supports it) and gives you 500 clips per month. If you’re clipping for clients or publishing regularly, Pro pays for itself fast.",
              },
              {
                q: "What’s the difference between Pro and Max?",
                a: "Both remove watermarks and unlock higher quality exports. The difference is scale. Pro gives you up to 4K and 120 clips per month — the right fit for most creators. Max gives you up to 8K and 500 clips per month, plus priority support. If you’re running a heavy editorial or social workflow, Max removes the ceiling.",
              },
              {
                q: "Do I need an account?",
                a: "Not to try it. You can download and use the free tier without signing up. An account is only required when you upgrade to Pro or Max — so your subscription and clip limits stay synced. Sign in before checkout for the smoothest experience.",
              },
              {
                q: "What Mac do I need?",
                a: "Klipprr is built for Apple Silicon — M1, M2, M3, and newer. Hardware-accelerated export relies on Apple’s VideoToolbox, which is why the app is fast on these chips. Intel Mac support is something we’re evaluating. If you’re on Intel and want to be notified, drop us a note at hello@klipprr.com.",
              },
              {
                q: "How is Klipprr different from yt-dlp or youtube-dl?",
                a: "yt-dlp is powerful and we respect it — but it’s a command-line tool. Every clip requires typing a command, managing flags, and piping through ffmpeg to trim. Klipprr gives you a visual timeline, instant preview, and one-click export. If you clip videos more than occasionally, the time saved adds up fast. Klipprr is for people who want results, not a terminal session.",
              },
              {
                q: "Can I use Klipprr offline?",
                a: "Yes, for local files. If the video is already on your Mac, Klipprr works without any internet connection. For URL-based sources like YouTube or Twitch, you need a connection to resolve and stream the media — but processing and export always happen locally on your machine.",
              },
              {
                q: "Does Klipprr upload my videos anywhere?",
                a: "No. All clipping and export happens locally in the app on your Mac. Your video files never leave your machine. The only server interaction is for account authentication and billing — nothing related to your video content. See the Privacy Policy for the full picture.",
              },
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 open:border-zinc-700 transition-colors"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 marker:hidden [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base font-semibold text-white">{item.q}</h3>
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

      <section className="border-t border-zinc-800 py-16 px-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h2 className="text-2xl font-bold text-white">Built by a Small Team of Creators</h2>
          <p className="mt-3 text-sm text-zinc-300">
            Klipprr is independently built by a small EU-based team focused on practical tools for
            editors and content creators. We prioritize speed, reliability, and straightforward workflows
            over feature bloat.
          </p>
          <p className="mt-3 text-sm text-zinc-300">
            Our goal is simple: help you go from long-form video to publish-ready clips in minutes, with
            precise control and local-first processing. This section is a placeholder and will be expanded
            with a full founder story soon.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-16 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
            <div>
              <Link href="/" className="flex items-center gap-2">
                <Image src="/logo.png" alt="Klipprr" width={28} height={28} className="rounded-lg" priority />
                <span className="text-lg font-semibold text-white">Klipprr</span>
              </Link>
              <p className="mt-3 max-w-xs text-sm text-zinc-400">
                Create viral clips from any video in seconds.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-4">
              <div>
                <h4 className="text-sm font-semibold text-white">Product</h4>
                <ul className="mt-3 space-y-2">
                  <li>
                    <Link href="/download" className="text-sm text-zinc-400 hover:text-white transition">
                      Download
                    </Link>
                  </li>
                  <li>
                    <a href="#features" className="text-sm text-zinc-400 hover:text-white transition">
                      Features
                    </a>
                  </li>
                  <li>
                    <a href="#pricing" className="text-sm text-zinc-400 hover:text-white transition">
                      Pricing
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Resources</h4>
                <ul className="mt-3 space-y-2">
                  <li>
                    <a href="mailto:hello@klipprr.com" className="text-sm text-zinc-400 hover:text-white transition">
                      Support
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Company</h4>
                <ul className="mt-3 space-y-2">
                  <li>
                    <a href="mailto:hello@klipprr.com" className="text-sm text-zinc-400 hover:text-white transition">
                      Contact
                    </a>
                  </li>
                  <li>
                    <Link href="/privacy" className="text-sm text-zinc-400 hover:text-white transition">
                      Privacy
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="text-sm text-zinc-400 hover:text-white transition">
                      Terms
                    </Link>
                  </li>
                  <li>
                    <Link href="/refunds" className="text-sm text-zinc-400 hover:text-white transition">
                      Refunds
                    </Link>
                  </li>
                  <li>
                    <Link href="/cookies" className="text-sm text-zinc-400 hover:text-white transition">
                      Cookies
                    </Link>
                  </li>
                  <li>
                    <Link href="/copyright" className="text-sm text-zinc-400 hover:text-white transition">
                      Copyright
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Follow Us</h4>
                <ul className="mt-3 space-y-2">
                  <li>
                    <a
                      href="https://x.com/klipprr"
                      className="text-sm text-zinc-400 hover:text-white transition"
                    >
                      Twitter / X
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.instagram.com/klipprr/"
                      className="text-sm text-zinc-400 hover:text-white transition"
                    >
                      Instagram
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://tiktok.com/@getklipprr"
                      className="text-sm text-zinc-400 hover:text-white transition"
                    >
                      TikTok
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-zinc-800 pt-8 sm:flex-row">
            <p className="text-sm text-zinc-500">© 2026 Klipprr. All rights reserved.</p>
            <p className="text-sm text-zinc-500">macOS · Windows coming soon</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
