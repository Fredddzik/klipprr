import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { WindowsWaitlist } from "./WindowsWaitlist";

const GITHUB_REPO =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RELEASES_REPO) || "Fredddzik/klipprr";

async function getLatestRelease(): Promise<{
  version: string;
  macUrl: string | null;
  macLabel: string;
  windowsUrl: string | null;
  windowsLabel: string;
} | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name?: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    const version = data.tag_name?.replace(/^v/, "") ?? null;
    const assets = data.assets ?? [];
    const dmg = assets.find((a) => a.name.endsWith(".dmg"));
    const appTarGz = assets.find((a) => a.name.endsWith(".app.tar.gz"));
    const macAsset = dmg ?? appTarGz;
    const msi = assets.find((a) => a.name.endsWith(".msi"));
    if (!version) return null;
    const macLabel = dmg ? ".dmg" : ".app.tar.gz";
    const windowsLabel = msi ? ".msi" : "";
    return {
      version,
      macUrl: macAsset?.browser_download_url ?? null,
      macLabel,
      windowsUrl: msi?.browser_download_url ?? null,
      windowsLabel,
    };
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: "Download Klipprr — Mac Video Clip Downloader | YouTube, Twitch & More",
  description:
    "Download the Klipprr desktop app for macOS. Clip any part of a YouTube, Twitch, Instagram or X video and export just that moment. Free to start.",
  alternates: {
    canonical: "/download",
  },
  openGraph: {
    title: "Download Klipprr — Mac Video Clip Downloader | YouTube, Twitch & More",
    description:
      "Clip any part of a YouTube, Twitch, Instagram or X video and export just that moment. Free to start.",
    url: "https://klipprr.com/download",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@klipprr",
    creator: "@klipprr",
    title: "Download Klipprr — Mac Video Clip Downloader | YouTube, Twitch & More",
    description:
      "Clip any part of a YouTube, Twitch, Instagram or X video and export just that moment. Free to start.",
  },
};

export default async function DownloadPage() {
  const release = await getLatestRelease();
  const macDirectUrl = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL ?? null;
  const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Klipprr",
    url: "https://klipprr.com/download",
    downloadUrl: "https://klipprr.com/download",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "macOS, Windows (coming soon)",
    softwareVersion: release?.version ?? "0.1.19",
    description:
      "Klipprr is a native desktop application for clipping and exporting exact segments from YouTube, Twitch, Instagram, Twitter/X, and local video files.",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      { "@type": "Offer", name: "Pro", price: "12", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      { "@type": "Offer", name: "Max", price: "39", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    ],
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://klipprr.com/" },
      { "@type": "ListItem", position: 2, name: "Download", item: "https://klipprr.com/download" },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Klipprr" width={32} height={32} className="rounded-lg" priority />
            <span className="text-lg font-semibold text-white">Klipprr</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm text-zinc-400 hover:text-white transition">
              Home
            </Link>
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition">
              Sign In
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-bold text-white sm:text-4xl text-center">
          Download Klipprr
        </h1>
        <p className="mt-2 text-lg text-zinc-400 text-center">
          Native desktop app for clipping and exporting exact video segments.
        </p>

        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-300">
          <p>
            Klipprr is built for creators who need precise clip extraction without fighting a command
            line workflow. You can paste a video URL from YouTube, Twitch, Instagram Reels, or X, set
            in and out points, and export only the part you want. If your footage is already on your
            Mac, local file clipping works too.
          </p>
          <p className="mt-3">
            Current platform support is macOS with Apple Silicon processors required (M1, M2, M3, and
            newer). Windows support is in progress. Minimum OS/version requirements may change as the app
            evolves, and this page should be treated as the latest baseline guidance rather than final
            hardware certification documentation.
          </p>
        </div>

        <div className="mt-12 space-y-8">
          {/* Mac */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🍎</span> macOS (Apple Silicon)
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              M1/M2/M3. Open the .dmg and drag Klipprr to Applications (or use the .app.tar.gz and extract the .app).
            </p>
            <ul className="mt-4 list-disc pl-5 text-sm text-zinc-300 space-y-1">
              <li>Processor: Apple Silicon (M1 or newer)</li>
              <li>Recommended OS: recent macOS release (exact minimum subject to update)</li>
              <li>Estimated free disk space: ~225 MB for app + temp export overhead</li>
              <li>Internet required for URL-based sources; local files can be clipped directly</li>
            </ul>
            {(release?.macUrl ?? macDirectUrl) ? (
              <a
                href={(release?.macUrl ?? macDirectUrl)!}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
              >
                Download Klipprr
                {release ? ` v${release.version} (${release.macLabel})` : ""}
              </a>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                Releases are not publicly available. Build from source or request access.
              </p>
            )}
          </section>

          {/* Windows */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 opacity-80">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🪟</span> Windows
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Windows support is coming soon. Join the waitlist and we&apos;ll email you when the Windows
              build is ready.
            </p>
            <WindowsWaitlist />
          </section>

          {/* Linux */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 opacity-80">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🐧</span> Linux
            </h2>
            <p className="mt-1 text-sm text-zinc-400">Coming soon.</p>
          </section>
        </div>

        <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold text-white">Installation Guide (macOS)</h2>
          <ol className="mt-3 list-decimal pl-5 text-sm text-zinc-300 space-y-2">
            <li>Download the latest macOS build from the button above.</li>
            <li>Open the `.dmg` and drag Klipprr into your Applications folder.</li>
            <li>Launch Klipprr and allow it in macOS security prompts if required.</li>
            <li>Paste a URL or load a local file, set clip points, and export.</li>
          </ol>
        </section>

        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-300">
          <h2 className="text-xl font-semibold text-white">Formats, Codec Workflow, and Plans</h2>
          <p className="mt-3">
            Klipprr exports in creator-friendly formats such as MP4 and handles codec compatibility for
            practical social and editing workflows. Free is ideal for testing the workflow and supports up
            to 10 clips per month at 720p with watermarking. Pro and Max remove watermarking and unlock
            higher quality and larger monthly limits.
          </p>
          <p className="mt-3">
            Pricing: Pro is $12/month (or $10/month billed yearly), Max is $39/month (or $33/month billed
            yearly). Privacy and processing details are described in our{" "}
            <Link href="/privacy" className="text-violet-400 hover:text-violet-300">
              Privacy Policy
            </Link>.
          </p>
        </section>

        <p className="mt-8 text-sm text-zinc-500 text-center">
          Existing installs can use <strong>Check for updates</strong> inside the app.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-violet-400 hover:text-violet-300 transition"
        >
          ← Back to home
        </Link>
      </main>
    </div>
  );
}
