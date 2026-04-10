import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy — Klipprr",
  description: "Cookie policy for the Klipprr website.",
};

export default function CookiesPage() {
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Cookie Policy — Klipprr",
    url: "https://klipprr.com/cookies",
    dateModified: "2026-04-10",
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://klipprr.com/" },
      { "@type": "ListItem", position: 2, name: "Cookies", item: "https://klipprr.com/cookies" },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <h1>Cookie Policy</h1>
      <p>
        <strong>Effective date:</strong> March 17, 2026
      </p>

      <p>
        This page explains how Klipprr uses cookies and similar technologies on our website (the “Site”).
      </p>

      <h2>What are cookies?</h2>
      <p>
        Cookies are small text files stored on your device. Similar technologies include local storage, session storage, and other
        identifiers used to remember preferences or keep you signed in.
      </p>

      <h2>How we use cookies</h2>
      <p>
        We use <strong>essential</strong> cookies/identifiers to make the Site work (for example: authentication flows, security, and
        basic functionality).
      </p>

      <h2>Analytics and marketing cookies</h2>
      <p>
        We do not intentionally use advertising or marketing tracking cookies. If we add optional analytics or marketing tags in the
        future, we will update this policy and (where required) request your consent before setting non-essential cookies.
      </p>

      <h2>How to control cookies</h2>
      <p>
        You can control cookies through your browser settings. Note that disabling certain cookies may prevent the Site from working
        correctly, especially sign-in flows.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href="mailto:hello@klipprr.com">hello@klipprr.com</a>.
      </p>
    </>
  );
}
