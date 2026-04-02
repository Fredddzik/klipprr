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
  title: "Download Klipprr — Mac, Windows, Linux",
  description:
    "Download the Klipprr desktop app. Create viral clips from YouTube, Twitch, and local videos.",
  alternates: {
    canonical: "/download",
  },
};

export default async function DownloadPage() {
  const release = await getLatestRelease();
  const macDirectUrl = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Klipprr" width={32} height={32} className="rounded-lg" />
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

      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-bold text-white sm:text-4xl text-center">
          Download Klipprr
        </h1>
        <p className="mt-2 text-lg text-zinc-400 text-center">
          Pick your platform below.
        </p>

        <div className="mt-12 space-y-8">
          {/* Mac */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🍎</span> macOS (Apple Silicon)
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              M1/M2/M3. Open the .dmg and drag Klipprr to Applications (or use the .app.tar.gz and extract the .app).
            </p>
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
