import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { marked } from "marked";
import Link from "next/link";
import type { Metadata } from "next";

// ─── Frontmatter parser ──────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^"|"$/g, "");
    meta[key] = value;
  }
  return { meta, content: match[2] } as unknown as { meta: Record<string, string>; body: string };
}

function getPost(slug: string): { meta: Record<string, string>; body: string } | null {
  const file = path.join(process.cwd(), "public", "blog", `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^"|"$/g, "");
    meta[key] = value;
  }
  return { meta, body: match[2] };
}

export async function generateStaticParams() {
  const dir = path.join(process.cwd(), "public", "blog");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, "") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  const { meta } = post;
  return {
    title: meta.title ? `${meta.title} — Klipprr` : "Klipprr Blog",
    description: meta.description ?? "",
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: meta.title ?? "Klipprr Blog",
      description: meta.description ?? "",
      url: `https://klipprr.com/blog/${slug}`,
      type: "article",
      ...(meta.date ? { publishedTime: meta.date } : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: "@klipprr",
      creator: "@klipprr",
      title: meta.title ?? "Klipprr Blog",
      description: meta.description ?? "",
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { meta, body } = post;
  const html = await marked(body, { gfm: true, breaks: false });

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: meta.title,
    description: meta.description,
    datePublished: meta.date,
    dateModified: meta.date,
    url: `https://klipprr.com/blog/${slug}`,
    publisher: {
      "@type": "Organization",
      name: "Klipprr",
      url: "https://klipprr.com",
      logo: "https://klipprr.com/logo.png",
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://klipprr.com" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://klipprr.com/blog" },
      {
        "@type": "ListItem",
        position: 3,
        name: meta.title,
        item: `https://klipprr.com/blog/${slug}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

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
            <Link href="/blog" className="hover:text-zinc-300 transition">Blog</Link>
            <span>/</span>
            <span className="text-zinc-400 truncate max-w-[200px]">{meta.title}</span>
          </nav>

          {/* Header */}
          <header className="mb-10">
            {meta.date && (
              <time className="text-xs text-zinc-500">
                {new Date(meta.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            )}
            <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
              {meta.title}
            </h1>
            {meta.description && (
              <p className="mt-4 text-lg leading-relaxed text-zinc-400">{meta.description}</p>
            )}
            {/* Markdown source link for AI crawlers */}
            <p className="mt-4 text-xs text-zinc-600">
              Plain text version:{" "}
              <a
                href={`/blog/${slug}.md`}
                className="hover:text-zinc-400 transition underline underline-offset-2"
              >
                {`/blog/${slug}.md`}
              </a>
            </p>
          </header>

          {/* Article body */}
          <div
            className="prose-klipprr"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* CTA */}
          <div className="mt-16 rounded-xl border border-violet-500/30 bg-violet-500/5 p-7 text-center">
            <p className="text-lg font-semibold text-white">Ready to try it?</p>
            <p className="mt-2 text-sm text-zinc-400">
              Download Klipprr for Mac — free to start, no credit card required.
            </p>
            <Link
              href="/download"
              className="mt-5 inline-block rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-fuchsia-500 transition"
            >
              Download Klipprr Free
            </Link>
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
            <Link href="/blog" className="hover:text-zinc-300 transition">Blog</Link>
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
