import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://klipprr.com";
  return [
    { url: `${base}/`, lastModified: new Date("2026-04-10") },
    { url: `${base}/download`, lastModified: new Date("2026-04-10") },
    { url: `${base}/youtube-clip-downloader`, lastModified: new Date("2026-04-10") },
    { url: `${base}/twitch-clip-downloader`, lastModified: new Date("2026-04-10") },
    { url: `${base}/instagram-reel-downloader`, lastModified: new Date("2026-04-10") },
    { url: `${base}/twitter-clip-downloader`, lastModified: new Date("2026-04-10") },
    // Blog
    { url: `${base}/blog`, lastModified: new Date("2026-04-10") },
    { url: `${base}/blog/how-to-download-part-of-youtube-video-mac`, lastModified: new Date("2026-04-10") },
    { url: `${base}/blog/how-to-clip-twitch-vod`, lastModified: new Date("2026-04-10") },
    { url: `${base}/blog/fastest-way-to-clip-youtube-videos-mac`, lastModified: new Date("2026-04-10") },
    { url: `${base}/blog/how-to-save-instagram-reel`, lastModified: new Date("2026-04-10") },
    { url: `${base}/blog/yt-dlp-vs-klipprr`, lastModified: new Date("2026-04-10") },
    // Legal
    { url: `${base}/privacy`, lastModified: new Date("2026-04-10") },
    { url: `${base}/terms`, lastModified: new Date("2026-04-10") },
    { url: `${base}/cookies`, lastModified: new Date("2026-04-10") },
    { url: `${base}/refunds`, lastModified: new Date("2026-04-10") },
  ];
}

