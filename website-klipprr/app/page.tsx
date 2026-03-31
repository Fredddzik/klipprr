import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { PricingSection } from "./PricingSection";

export const metadata: Metadata = {
  title: "Klipprr — Trim & Download Video Clips | YouTube, Twitch, Reels & More",
  description:
    "Klipprr lets you clip and download exactly the part of a video you want — from YouTube, Twitch, Instagram Reels, Twitter/X, or your own files. Free to start, no account needed.",
  openGraph: {
    title: "Klipprr — Trim & Download Video Clips from YouTube, Twitch, Reels & More",
    description:
      "Clip and download exactly the part of any video you want. Supports YouTube, Twitch, Reels, Twitter/X and local files. Free to start.",
    url: "https://klipprr.com",
    type: "website",
  },
};

export default function Home() {
  const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Klipprr",
    url: "https://klipprr.com",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro", priceCurrency: "USD" },
      { "@type": "Offer", name: "Max", priceCurrency: "USD" },
    ],
    description:
      "Klipprr is a freemium online tool to trim and download clips from YouTube, Twitch, Instagram Reels, Twitter/X, and local video files. Set a start and end timestamp and download only the part you want.",
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
          text: "Yes. Paste the YouTube URL into Klipprr, set your start and end timestamps, and download only that clip — no need to download the full video.",
        },
      },
      {
        "@type": "Question",
        name: "Which platforms does Klipprr support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Klipprr supports YouTube, Twitch, Instagram Reels, Twitter/X, and local video files uploaded from your device.",
        },
      },
      {
        "@type": "Question",
        name: "Is Klipprr free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, Klipprr has a free plan that includes 10 clips per month at up to 720p resolution, with a watermark on exports. Paid plans (Pro and Max) remove the watermark, increase quality to 4K or 8K, and allow up to 500 clips per month.",
        },
      },
      {
        "@type": "Question",
        name: "How do I remove the watermark from my clips?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Upgrade to the Pro or Max plan. Both remove the watermark and unlock higher resolution exports (up to 4K on Pro, up to 8K on Max).",
        },
      },
      {
        "@type": "Question",
        name: "What is the difference between the Pro and Max plans?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Pro gives you 120 clips per month, up to 4K quality, no watermark, custom clip naming, and custom export paths. Max gives you everything in Pro plus up to 8K resolution (where the source supports it), 500 clips per month, and priority support.",
        },
      },
      {
        "@type": "Question",
        name: "Do I need to create an account to use Klipprr?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No account is needed to use the free plan. Creating an account is required to access Pro or Max features.",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Klipprr" width={32} height={32} className="rounded-lg" />
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
              href="/login"
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 transition"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-wider text-violet-400">
            Turn long videos into viral clips
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Trim and Download Video Clips from{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
              YouTube, Twitch, Reels & More
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            Extract the best moments from online, or local videos. Precise trimming meets
            lightning-fast exports — no AI, just you in control.
          </p>
          <p className="mx-auto mt-4 max-w-3xl text-sm text-zinc-300">
            Klipprr is a free online clip downloader. Paste a URL from YouTube, Twitch, Instagram
            Reels, or Twitter/X — or upload a local file — set your start and end timestamps, and
            download only the part you want. No need to download the full video. Free plan includes
            10 clips per month at up to 720p. Upgrade for 4K, no watermark, and more.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/download"
              className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
            >
              Download for Mac
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-zinc-600 bg-zinc-900/50 px-6 py-3 text-sm font-medium text-white hover:border-zinc-500 hover:bg-zinc-800/50 transition"
            >
              Start Clipping for Free
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
                title: "Video platform Support",
                description: "Paste any video URL and start clipping instantly. No downloads needed.",
              },
              {
                title: "Twitch Integration",
                description: "Clip your best streaming moments from Twitch Clips with ease.",
              },
              {
                title: "Local Files",
                description: "Upload your own videos and create clips from any format.",
              },
              {
                title: "Precise Editing",
                description: "Frame-accurate trimming with real-time preview for perfect clips.",
              },
              {
                title: "Multiple Clips",
                description: "Create as many clips as you need from one video, then export in one go.",
              },
              {
                title: "Lightning Fast",
                description: "Export clips in seconds with hardware-accelerated encoding.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-zinc-700 transition"
              >
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
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
                description: "Start with a video link, or upload your own video file.",
              },
              {
                step: "02",
                title: "Select Your Clip",
                description: "Use the timeline to mark start and end points with frame-perfect precision.",
              },
              {
                step: "03",
                title: "Export & Share",
                description: "Download in your preferred format and resolution. Ready to share anywhere.",
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
          </div>
          <div className="mt-12 space-y-6">
            {[
              {
                q: "Can I download just part of a YouTube video?",
                a: "Yes. Paste the YouTube URL into Klipprr, set your start and end timestamps, and download only that clip — no need to download the full video.",
              },
              {
                q: "Which platforms does Klipprr support?",
                a: "Klipprr supports YouTube, Twitch, Instagram Reels, Twitter/X, and local video files uploaded from your device.",
              },
              {
                q: "Is Klipprr free?",
                a: "Yes, Klipprr has a free plan that includes 10 clips per month at up to 720p resolution, with a watermark on exports. Paid plans (Pro and Max) remove the watermark, increase quality to 4K or 8K, and allow up to 500 clips per month.",
              },
              {
                q: "How do I remove the watermark from my clips?",
                a: "Upgrade to the Pro or Max plan. Both remove the watermark and unlock higher resolution exports (up to 4K on Pro, up to 8K on Max).",
              },
              {
                q: "What is the difference between the Pro and Max plans?",
                a: "Pro gives you 120 clips per month, up to 4K quality, no watermark, custom clip naming, and custom export paths. Max gives you everything in Pro plus up to 8K resolution (where the source supports it), 500 clips per month, and priority support.",
              },
              {
                q: "Do I need to create an account to use Klipprr?",
                a: "No account is needed to use the free plan. Creating an account is required to access Pro or Max features.",
              },
            ].map((item) => (
              <article key={item.q} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h3 className="text-lg font-semibold text-white">{item.q}</h3>
                <p className="mt-2 text-sm text-zinc-400">{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-16 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
            <div>
              <Link href="/" className="flex items-center gap-2">
                <Image src="/logo.png" alt="Klipprr" width={28} height={28} className="rounded-lg" />
                <span className="text-lg font-semibold text-white">Klipprr</span>
              </Link>
              <p className="mt-3 max-w-xs text-sm text-zinc-400">
                Create viral clips from any video in seconds.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
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
                    <a href="https://klipprr.com" className="text-sm text-zinc-400 hover:text-white transition">
                      Documentation
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
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-zinc-800 pt-8 sm:flex-row">
            <p className="text-sm text-zinc-500">© 2026 Klipprr. All rights reserved.</p>
            <p className="text-sm text-zinc-500">Made for content creators</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
