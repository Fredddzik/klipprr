import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Klipprr"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="text-lg font-semibold text-white">Klipprr</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/download" className="text-sm text-zinc-400 hover:text-white transition">
              Download
            </Link>
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition">
              Sign In
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
          <div className="space-y-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_p]:text-sm [&_p]:leading-6 [&_p]:text-zinc-300 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:text-sm [&_ul]:text-zinc-300 [&_li]:mt-1 [&_a]:text-violet-300 hover:[&_a]:text-violet-200">
            {children}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-zinc-800 pt-8 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Klipprr. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/privacy" className="hover:text-zinc-300 transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-zinc-300 transition">
              Terms
            </Link>
            <Link href="/refunds" className="hover:text-zinc-300 transition">
              Refunds
            </Link>
            <Link href="/cookies" className="hover:text-zinc-300 transition">
              Cookies
            </Link>
            <Link href="/copyright" className="hover:text-zinc-300 transition">
              Copyright
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
