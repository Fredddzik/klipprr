import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy — Klipprr",
  description: "Refund and cancellation policy for Klipprr subscriptions.",
};

export default function RefundsPage() {
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Refund Policy — Klipprr",
    url: "https://klipprr.com/refunds",
    dateModified: "2026-04-10",
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://klipprr.com/" },
      { "@type": "ListItem", position: 2, name: "Refunds", item: "https://klipprr.com/refunds" },
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
      <h1>Refund &amp; Cancellation Policy</h1>
      <p>
        <strong>Effective date:</strong> March 17, 2026
      </p>

      <h2>Cancellation</h2>
      <p>
        You can cancel your Klipprr subscription to stop future renewals. Cancellation typically takes effect at the end of the current
        billing period, and you will keep access until then (unless your account is suspended for abuse or non-payment).
      </p>
      <p>
        To avoid unexpected renewals, we recommend cancelling at least 24 hours before the next billing date shown in your billing
        dashboard. If you cancel after a renewal has already processed, the current billing cycle will generally remain active until the
        end of that paid term.
      </p>

      <h2>Refunds</h2>
      <p>
        Unless required by applicable law, payments are <strong>non-refundable</strong> and we do not provide refunds or credits for
        partial subscription periods, unused features, or unused time.
      </p>
      <p>
        That said, we review clear billing errors and legal entitlement cases in good faith. If duplicate charges, unauthorized charges,
        or obvious subscription processing errors occur, we will investigate and apply a correction where appropriate.
      </p>

      <h2>EU/EEA consumer rights</h2>
      <p>
        If you are a consumer in the EU/EEA/UK, you may have statutory rights (including withdrawal rights in some situations) that
        cannot be waived. Depending on the type of digital service and when performance begins, withdrawal rights may be limited once
        the service is provided. Nothing in this policy limits your mandatory consumer rights under applicable law.
      </p>
      <p>
        For digital services, withdrawal rights can be limited once service delivery has started with your consent. This can depend on
        how your purchase was completed and local consumer law. If you are unsure, contact us and we will clarify what applies to your
        case.
      </p>

      <h2>How to request a refund or help</h2>
      <p>
        If you believe you are entitled to a refund under applicable law (or you were billed incorrectly), contact us at{" "}
        <a href="mailto:hello@klipprr.com">hello@klipprr.com</a> with your account email and the Stripe receipt/invoice ID if available.
      </p>
      <p>
        To speed up review, include as much detail as possible:
      </p>
      <ul>
        <li>the account email used for purchase;</li>
        <li>the invoice or receipt ID from Stripe;</li>
        <li>the date and amount charged;</li>
        <li>a short description of the issue (for example: duplicate renewal, wrong plan, accidental purchase).</li>
      </ul>

      <h2>Review timeline</h2>
      <p>
        We aim to acknowledge support requests within 2 business days. Complex billing cases can take longer if we need additional
        confirmation from payment providers or if legal rights must be reviewed by jurisdiction. Once a refund is approved, bank/card
        posting times are controlled by your payment provider and can vary by region.
      </p>

      <h2>Eligibility summary</h2>
      <ul>
        <li>Billing mistakes and duplicate charges: generally eligible for correction/refund after verification.</li>
        <li>Unused time or changed plans mid-cycle: typically not refundable unless required by law.</li>
        <li>Feature requests or expected functionality differences: reviewed case-by-case, not automatically refundable.</li>
        <li>Requests without sufficient billing details: may be delayed until required information is provided.</li>
      </ul>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. We will post the updated version on this page and update the effective date above.
      </p>
    </>
  );
}
