import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download Instagram Reels on Mac — Klipprr",
  description:
    "Save any Instagram Reel to your Mac as a clean video file. Paste the URL, export the clip locally — no browser extensions, no cloud upload. Free to start.",
  alternates: { canonical: "/instagram-reel-downloader" },
  openGraph: {
    title: "Download Instagram Reels on Mac — Klipprr",
    description:
      "Save any Instagram Reel to your Mac as a clean video file. Local processing, no upload. Free to start.",
    url: "https://klipprr.com/instagram-reel-downloader",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@klipprr",
    creator: "@klipprr",
    title: "Download Instagram Reels on Mac — Klipprr",
    description: "Save any Instagram Reel to your Mac. Local processing. Free to start.",
  },
};

export default function InstagramReelDownloaderPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://klipprr.com" },
      { "@type": "ListItem", position: 2, name: "Instagram Reel Downloader", item: "https://klipprr.com/instagram-reel-downloader" },
    ],
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to download an Instagram Reel on Mac",
    description: "Use Klipprr to save any Instagram Reel to your Mac as a clean MP4 file — no browser extension required.",
    tool: [{ "@type": "HowToTool", name: "Klipprr", url: "https://klipprr.com" }],
    step: [
      { "@type": "HowToStep", position: 1, name: "Copy the Reel URL", text: "Open Instagram in your browser, navigate to the Reel you want to save, and copy the URL from the address bar. Reel URLs look like instagram.com/reel/ABC123/." },
      { "@type": "HowToStep", position: 2, name: "Paste the URL into Klipprr", text: "Open Klipprr and paste the Instagram Reel URL. The app fetches the media and loads it for preview. Nothing is downloaded to your drive yet.", url: "https://klipprr.com/download" },
      { "@type": "HowToStep", position: 3, name: "Optionally trim the clip", text: "If you want only part of the Reel, set In and Out points on the timeline. To save the full Reel as-is, skip this step." },
      { "@type": "HowToStep", position: 4, name: "Export to your Mac", text: "Click Export. Klipprr saves the Reel as an MP4 to your chosen folder. Processing happens locally — your content never passes through a third-party server." },
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
    description: "Klipprr is a native macOS app for downloading and clipping Instagram Reels, YouTube videos, Twitch VODs, and more.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "Can I download an Instagram Reel on Mac without a browser extension?", acceptedAnswer: { "@type": "Answer", text: "Yes. Klipprr is a native macOS app — no browser extension, no web service. Paste the Reel URL and export the video directly to your Mac." } },
      { "@type": "Question", name: "Does Klipprr upload my video to a server?", acceptedAnswer: { "@type": "Answer", text: "No. Klipprr processes everything locally on your Mac. Your content never passes through a third-party server. The only outbound calls are for account authentication and billing." } },
      { "@type": "Question", name: "Can I trim the Reel before saving it?", acceptedAnswer: { "@type": "Answer", text: "Yes. After pasting the URL, you can set In and Out points on the timeline to export only a specific segment of the Reel, or export the full clip as-is." } },
      { "@type": "Question", name: "Is it free to download Instagram Reels with Klipprr?", acceptedAnswer: { "@type": "Answer", text: "Yes. The free plan gives you 10 clips per month at up to 720p. Pro ($12/mo) and Max ($39/mo) remove the watermark and raise the quality ceiling." } },
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
            <span className="text-zinc-400">Instagram Reel Downloader</span>
          </nav>
        </div>
      </div>

      <section className="pt-10 pb-20 px-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-sm font-medium text-violet-400">For macOS · Free to start</p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Download Any{" "}
            <span className="bg-gradient-to-r from-pink-400 via-rose-400 to-orange-400 bg-clip-text text-transparent">
              Instagram Reel
            </span>
            {" "}to Your Mac
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-300">
            Paste the Reel URL. Export the video locally. No browser extension, no cloud upload,
            no watermark on paid plans. The file goes directly to your Mac.
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
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Why saving Reels is harder than it should be</h2>
          <p className="mt-4 text-zinc-400">Instagram doesn't provide a download button. The workarounds all have a catch.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {[
              { label: "Browser extensions", problem: "Extension permissions are broad. Most need access to all your browsing activity to intercept the video stream. You're trusting an unknown developer with your session data." },
              { label: "Online download sites", problem: "Paste your URL, wait in a queue, get a re-compressed file. Your Instagram session URL passes through their server. Quality varies. Many show ads or have file-size limits." },
              { label: "Screen recording", problem: "Real-time capture only. Quality is capped at your display resolution. Audio sync can drift. You still have to trim the recording to remove the UI chrome around the video." },
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
              Native Mac app. Paste the Reel URL, export the video to your drive. No extension
              permissions, no third-party server, no re-compression. Your content goes from
              Instagram to your Mac in a straight line.
            </p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">How to download an Instagram Reel with Klipprr</h2>
          <p className="mt-3 text-zinc-400">Four steps. Under a minute.</p>
          <ol className="mt-10 space-y-10">
            {[
              { n: "1", title: "Copy the Reel URL", body: "Open Instagram in your browser and navigate to the Reel you want to save. Copy the URL from the address bar — it looks like instagram.com/reel/ABC123/. You can also use the Share → Copy link option inside the Instagram app on your phone, then paste it to your Mac." },
              { n: "2", title: "Paste into Klipprr", body: "Open Klipprr and paste the URL. The app fetches the Reel and loads it in the preview timeline. Nothing is downloaded to your drive yet.", cta: { label: "Get Klipprr →", href: "/download" } },
              { n: "3", title: "Trim if needed", body: "Want just part of the Reel? Set an In point and an Out point on the timeline. Want the whole thing? Skip this step entirely and go straight to export." },
              { n: "4", title: "Export to your Mac", body: "Click Export. Klipprr saves the Reel as an MP4 to your chosen folder. Processing is local — your content never touches a third-party server. On M1 or newer, export is nearly instant for short Reels." },
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
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Who uses this</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { who: "Creators repurposing content", what: "Download your own Reels as source files for editing, archiving, or republishing on other platforms." },
              { who: "Social media managers", what: "Save reference Reels from brands or competitors for review, storyboarding, or client presentations." },
              { who: "Researchers and educators", what: "Archive Reels that illustrate a trend, cultural moment, or teaching example before they're deleted or made private." },
            ].map((uc) => (
              <div key={uc.who} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                <p className="text-sm font-semibold text-white">{uc.who}</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{uc.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Common questions</h2>
          <div className="mt-8 space-y-3">
            {[
              { q: "Can I download an Instagram Reel on Mac without a browser extension?", a: "Yes. Klipprr is a native macOS app — no browser extension, no web service. Paste the Reel URL and export the video directly to your Mac." },
              { q: "Does Klipprr upload my video to a server?", a: "No. Klipprr processes everything locally on your Mac. Your content never passes through a third-party server. The only outbound calls are for account authentication and billing." },
              { q: "Can I trim the Reel before saving it?", a: "Yes. After pasting the URL, you can set In and Out points on the timeline to export only a specific segment, or export the full Reel as-is." },
              { q: "Is it free?", a: "Yes. The free plan gives you 10 clips per month at up to 720p. Pro ($12/mo) and Max ($39/mo) remove the watermark and raise quality to 4K and 8K." },
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
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Save that Reel before it's gone.</h2>
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
