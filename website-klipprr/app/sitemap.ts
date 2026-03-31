import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://klipprr.com";
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/download`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/login`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/account`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/cookies`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/refunds`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/copyright`, changeFrequency: "yearly", priority: 0.3 },
  ];
}

