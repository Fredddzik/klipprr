import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download Twitter / X Videos on Mac — Klipprr",
  description:
    "Save any Twitter or X video to your Mac before it gets deleted. Paste the tweet URL, export the clip locally — no browser extensions, no cloud upload. Free to start.",
  alternates: { canonical: "/twitter-clip-downloader" },
  openGraph: {
    title: "Download Twitter / X Videos on Mac — Klipprr",
    description:
      "Save any Twitter or X video to your Mac. Local processing, no upload. Free to start.",
    url: "https://klipprr.com/twitter-clip-downloader",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@klipprr",
    creator: "@klipprr",
    title: "Download Twitter / X Videos on Mac — Klipprr",
    description: "Save any Twitter or X video to your Mac. Local processing. Free to start.",
  },
};

export default function TwitterClipDownloaderPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://klipprr.com" },
      { "@type": "ListItem", position: 2, name: "Twitter / X Video Downloader", item: "https://klipprr.com/twitter-clip-downloader" },
    ],
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to download a Twitter or X video on Mac",
    description: "Use Klipprr to save any video from a tweet to your Mac as a clean MP4 file.",
    tool: [{ "@type": "HowToTool", name: "Klipprr", url: "https://klipprr.com" }],
    step: [
      { "@type": "HowToStep", position: 1, name: "Copy the tweet URL", text: "Find the tweet containing the video you want to save. Click the share icon on the tweet and choose 'Copy link', or copy the URL directly from your browser's address bar. Both twitter.com and x.com URLs work." },
      { "@type": "HowToStep", position: 2, name: "Paste the URL into Klipprr", text: "Open Klipprr and paste the tweet URL. The app fetches the video and loads it for preview.", url: "https://klipprr.com/download" },
      { "@type": "HowToStep", position: 3, name: "Trim if needed", text: "To save only part of the video, set In and Out points on the timeline. To save the full clip as-is, skip this step." },
      { "@type": "HowToStep", position: 4, name: "Export to your Mac", text: "Click Export. The video is saved as an MP4 to your chosen folder. Processing is local — no third-party server involved." },
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
    description: "Klipprr is a native macOS app for downloading and clipping videos from Twitter/X, YouTube, Twitch, Instagram, and local files.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "Can I download a video from a tweet on Mac?", acceptedAnswer: { "@type": "Answer", text: "Yes. Paste the tweet URL into Klipprr and export the video to your Mac as an MP4. Works with both twitter.com and x.com URLs." } },
      { "@type": "Question", name: "What happens if the tweet is deleted?", acceptedAnswer: { "@type": "Answer", text: "Once a tweet is deleted, its video is no longer accessible via the URL. Klipprr can only fetch videos from publicly accessible tweets. Save it before it's gone." } },
      { "@type": "Question", name: "Does Klipprr work with X (formerly Twitter)?", acceptedAnswer: { "@type": "Answer", text: "Yes. Both twitter.com and x.com URLs are supported. The rebranding doesn't affect how video URLs are resolved." } },
      { "@type": "Question", name: "Is it free?", acceptedAnswer: { "@type": "Answer", text: "Yes. The free plan gives you 10 clips per month at up to 720p. Pro ($12/mo) and Max ($39/mo) remove the watermark and raise the quality ceiling." } },
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
            <span className="text-zinc-400">Twitter / X Video Downloader</span>
          </nav>
        </div>
      </div>

      <section className="pt-10 pb-20 px-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-sm font-medium text-violet-400">For macOS · Free to start</p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Download Any{" "}
            <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Twitter / X Video
            </span>
            {" "}to Your Mac
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-300">
            Paste the tweet URL. Export the video locally. Tweets get deleted — save what you need
            before it's gone. No browser extension, no cloud upload.
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

      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Tweets disappear. Videos disappear with them.</h2>
          <p className="mt-4 text-zinc-400">
            Viral clips, breaking news footage, product announcements, sports moments — they live in tweets
            until the account owner deletes them, makes the account private, or X removes the content.
            Once a tweet is gone, the video is gone with it.
          </p>
          <p className="mt-3 text-zinc-400">
            Klipprr lets you save the video to your Mac the moment you find it — no waiting, no
            browser extension to install, no upload to a third-party service.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {[
              { label: "Right-click → Save video", problem: "Twitter/X doesn't expose a direct video file in the browser context menu. You get a static image at best, or nothing." },
              { label: "Online Twitter video downloaders", problem: "Your tweet URL goes through their server. Quality is often capped or re-encoded. Many require a login or subscription. Privacy trade-off is real." },
              { label: "Browser extensions", problem: "Extensions for video downloading require broad site permissions. You're trusting a third party with access to your Twitter session." },
              { label: "Screen recording", problem: "You watch the video at real speed while recording. Quality is limited by your display. Audio sync isn't guaranteed." },
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
              Paste the tweet URL. Export to your Mac. Local processing — no third-party server,
              no session exposure, no re-compression. Works with both twitter.com and x.com URLs.
            </p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">How to download a Twitter / X video with Klipprr</h2>
          <p className="mt-3 text-zinc-400">Four steps. Takes about 30 seconds.</p>
          <ol className="mt-10 space-y-10">
            {[
              { n: "1", title: "Copy the tweet URL", body: "Find the tweet with the video you want to save. Click the share icon (the upload arrow) on the tweet and select 'Copy link'. Or copy the URL directly from your browser's address bar. Both twitter.com/user/status/123 and x.com/user/status/123 formats work." },
              { n: "2", title: "Paste into Klipprr", body: "Open Klipprr and paste the tweet URL into the input field. The app fetches the video and loads it into the preview timeline. Nothing is saved to your drive yet.", cta: { label: "Get Klipprr →", href: "/download" } },
              { n: "3", title: "Trim if needed", body: "Want only part of the video? Set In and Out points on the timeline. Want the full clip exactly as posted? Skip this step entirely." },
              { n: "4", title: "Export to your Mac", body: "Click Export. Klipprr saves the video as an MP4 to your chosen folder. Processing is local — your content and your session data never pass through a third-party server. On M1 or newer, export is nearly instant for short Twitter clips." },
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

      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Common questions</h2>
          <div className="mt-8 space-y-3">
            {[
              { q: "Can I download a video from a tweet on Mac?", a: "Yes. Paste the tweet URL into Klipprr and export the video to your Mac as an MP4. Works with both twitter.com and x.com URLs." },
              { q: "What happens if the tweet is deleted before I save it?", a: "Once a tweet is deleted, its video is no longer accessible via the URL. Klipprr can only fetch videos from currently accessible public tweets. Save it as soon as you find it." },
              { q: "Does Klipprr work with X (formerly Twitter)?", a: "Yes. Both twitter.com and x.com URLs are supported. The rebranding doesn't affect how video URLs are resolved." },
              { q: "Is it free?", a: "Yes. The free plan gives you 10 clips per month at up to 720p. Pro ($12/mo) and Max ($39/mo) remove the watermark and raise quality to 4K and 8K respectively." },
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

      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Save it before it's deleted.</h2>
          <p className="mt-4 text-zinc-400">Download Klipprr for Mac. Free to start — no credit card required.</p>
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
