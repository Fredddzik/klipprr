import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login", "/account", "/auth/", "/api/", "/upgrade"],
    },
    sitemap: "https://klipprr.com/sitemap.xml",
  };
}

