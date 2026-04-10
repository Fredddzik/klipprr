import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/login", "/account", "/auth/", "/api/", "/upgrade"],
      },
      {
        userAgent: ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Googlebot-Extended"],
        allow: "/",
        disallow: ["/login", "/account", "/auth/", "/api/", "/upgrade"],
        crawlDelay: 2,
      },
    ],
    sitemap: "https://klipprr.com/sitemap.xml",
  };
}

