import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy — Klipprr",
  description: "Refund and cancellation policy for Klipprr subscriptions.",
};

export default function RefundsPage() {
  return (
    <>
      <h1>Refund &amp; Cancellation Policy</h1>
      <p>
        <strong>Effective date:</strong> March 17, 2026
      </p>

      <h2>Cancellation</h2>
      <p>
        You can cancel your Klipprr subscription to stop future renewals. Cancellation typically takes effect at the end of the current
        billing period, and you will keep access until then (unless your account is suspended for abuse or non-payment).
      </p>

      <h2>Refunds</h2>
      <p>
        Unless required by applicable law, payments are <strong>non-refundable</strong> and we do not provide refunds or credits for
        partial subscription periods, unused features, or unused time.
      </p>

      <h2>EU/EEA consumer rights</h2>
      <p>
        If you are a consumer in the EU/EEA/UK, you may have statutory rights (including withdrawal rights in some situations) that
        cannot be waived. Depending on the type of digital service and when performance begins, withdrawal rights may be limited once
        the service is provided. Nothing in this policy limits your mandatory consumer rights under applicable law.
      </p>

      <h2>How to request a refund or help</h2>
      <p>
        If you believe you are entitled to a refund under applicable law (or you were billed incorrectly), contact us at{" "}
        <a href="mailto:hello@klipprr.com">hello@klipprr.com</a> with your account email and the Stripe receipt/invoice ID if available.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. We will post the updated version on this page and update the effective date above.
      </p>
    </>
  );
}
