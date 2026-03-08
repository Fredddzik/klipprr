import Image from "next/image";
import Link from "next/link";

const GITHUB_REPO = "Fredddzik/klipprr";
const RELEASES_LATEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

async function getLatestRelease(): Promise<{ version: string; downloadUrl: string; downloadLabel: string } | null> {
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
    if (!version || !macAsset?.browser_download_url) return null;
    const label = dmg ? ".dmg" : ".app.tar.gz";
    return { version, downloadUrl: macAsset.browser_download_url, downloadLabel: label };
  } catch {
    return null;
  }
}

export const metadata = {
  title: "Download Klipprr — macOS Beta",
  description: "Download the Klipprr desktop app for Mac. Create viral clips from YouTube, Twitch, and local videos.",
};

export default async function DownloadPage() {
  const release = await getLatestRelease();

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

      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">
          Download Klipprr for Mac
        </h1>
        <p className="mt-4 text-lg text-zinc-400">
          macOS beta. Apple Silicon (M1/M2/M3) supported.
        </p>
        {release ? (
          <>
            <a
              href={release.downloadUrl}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
            >
              Download Klipprr v{release.version} ({release.downloadLabel})
            </a>
            <p className="mt-4 text-sm text-zinc-500">
              <a
                href={RELEASES_LATEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300"
              >
                View all assets on GitHub →
              </a>
            </p>
          </>
        ) : (
          <a
            href={RELEASES_LATEST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
          >
            Download from GitHub Releases
          </a>
        )}
        <p className="mt-6 text-sm text-zinc-500">
          {release?.downloadLabel === ".app.tar.gz"
            ? "Extract the .app and drag it to Applications, then launch."
            : "Open the .dmg, drag Klipprr to Applications, then launch the app."}
          Existing installs can use <strong>Check for updates</strong> inside the app.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block text-sm text-violet-400 hover:text-violet-300 transition"
        >
          ← Back to home
        </Link>
      </main>
    </div>
  );
}
