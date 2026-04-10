import fs from "fs";
import path from "path";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Klipprr",
  description:
    "Tutorials and guides for clipping and downloading video on Mac. YouTube, Twitch, Instagram, and more.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog — Klipprr",
    description:
      "Tutorials and guides for clipping and downloading video on Mac.",
    url: "https://klipprr.com/blog",
    type: "website",
  },
  twitter: { card: "summary_large_image", site: "@klipprr", creator: "@klipprr" },
};

type PostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^"|"$/g, "");
    meta[key] = value;
  }
  return { meta, content: match[2] };
}

function getPosts(): PostMeta[] {
  const dir = path.join(process.cwd(), "public", "blog");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { meta } = parseFrontmatter(raw);
      return {
        slug: file.replace(/\.md$/, ""),
        title: meta.title ?? file,
        description: meta.description ?? "",
        date: meta.date ?? "",
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export default function BlogPage() {
  const posts = getPosts();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
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

      <main className="pt-28 pb-24 px-6">
        <div className="mx-auto max-w-3xl">
          {/* Breadcrumb */}
          <nav className="mb-8 flex items-center gap-2 text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-300 transition">Home</Link>
            <span>/</span>
            <span className="text-zinc-400">Blog</span>
          </nav>

          <h1 className="text-3xl font-bold text-white sm:text-4xl">Blog</h1>
          <p className="mt-3 text-zinc-400">
            Tutorials and guides for clipping video on Mac.
          </p>

          <div className="mt-12 space-y-6">
            {posts.length === 0 && (
              <p className="text-zinc-500">No posts yet — check back soon.</p>
            )}
            {posts.map((post) => (
              <article
                key={post.slug}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition hover:border-zinc-700"
              >
                <Link href={`/blog/${post.slug}`} className="block">
                  {post.date && (
                    <time className="text-xs text-zinc-500">
                      {new Date(post.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  )}
                  <h2 className="mt-2 text-lg font-semibold text-white group-hover:text-violet-300 transition">
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{post.description}</p>
                  )}
                  <span className="mt-4 inline-block text-sm text-violet-400 group-hover:text-violet-300 transition">
                    Read article →
                  </span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </main>

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
            <a href="mailto:hello@klipprr.com" className="hover:text-zinc-300 transition">Contact</a>
          </div>
          <p className="text-xs text-zinc-600">© 2026 Klipprr</p>
        </div>
      </footer>
    </div>
  );
}
