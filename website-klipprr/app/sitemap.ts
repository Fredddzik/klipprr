import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://klipprr.com";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/download`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/cookies`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/refunds`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/copyright`, changeFrequency: "yearly", priority: 0.3 },
  ];
}

