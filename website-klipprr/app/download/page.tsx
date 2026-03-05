import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Download Klipprr — macOS Beta",
  description: "Download the Klipprr desktop app for Mac. Create viral clips from YouTube, Twitch, and local videos.",
};

export default function DownloadPage() {
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
        <a
          href="https://github.com/Fredddzik/klipprr/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
        >
          Download from GitHub Releases
        </a>
        <p className="mt-6 text-sm text-zinc-500">
          You’ll get the latest release. Open the .dmg, drag Klipprr to Applications, then launch the app.
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
