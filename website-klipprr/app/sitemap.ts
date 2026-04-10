import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://klipprr.com";
  return [
    { url: `${base}/`, lastModified: new Date("2026-04-10") },
    { url: `${base}/download`, lastModified: new Date("2026-04-10") },
    { url: `${base}/youtube-clip-downloader`, lastModified: new Date("2026-04-10") },
    { url: `${base}/privacy`, lastModified: new Date("2026-04-10") },
    { url: `${base}/terms`, lastModified: new Date("2026-04-10") },
    { url: `${base}/cookies`, lastModified: new Date("2026-04-10") },
    { url: `${base}/refunds`, lastModified: new Date("2026-04-10") },
  ];
}

