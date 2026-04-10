import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://klipprr.com";
  return [
    { url: `${base}/`, lastModified: new Date("2026-04-10") },
    { url: `${base}/download`, lastModified: new Date("2026-04-10") },
    { url: `${base}/youtube-clip-downloader`, lastModified: new Date("2026-04-10") },
    // Blog
    { url: `${base}/blog`, lastModified: new Date("2026-04-10") },
    { url: `${base}/blog/how-to-download-part-of-youtube-video-mac`, lastModified: new Date("2026-04-10") },
    // Legal
    { url: `${base}/privacy`, lastModified: new Date("2026-04-10") },
    { url: `${base}/terms`, lastModified: new Date("2026-04-10") },
    { url: `${base}/cookies`, lastModified: new Date("2026-04-10") },
    { url: `${base}/refunds`, lastModified: new Date("2026-04-10") },
  ];
}

