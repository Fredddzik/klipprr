import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Klipprr",
  description: "Terms of Service for Klipprr.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>
        <strong>Effective date:</strong> March 17, 2026
      </p>
      <p>
        These Terms of Service (“Terms”) govern your access to and use of the Klipprr website and desktop app (the “Service”).
        By using the Service, you agree to these Terms. If you do not agree, do not use the Service.
      </p>
      <p>
        <strong>Important:</strong> Nothing in these Terms limits any mandatory consumer rights you may have under applicable law.
      </p>

      <h2>1. Who we are</h2>
      <p>
        The Service is provided by Klipprr, operated by a company registered in Slovakia (EU). Contact:{" "}
        <a href="mailto:hello@klipprr.com">hello@klipprr.com</a>.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 13 years old (or older if required by your local law).</li>
        <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
        <li>You agree to provide accurate information and keep it up to date.</li>
      </ul>

      <h2>3. License and acceptable use</h2>
      <p>
        We grant you a limited, non-exclusive, non-transferable, revocable license to use the Service for your personal or
        internal business purposes, subject to these Terms and your subscription plan.
      </p>
      <p>You may not (and you may not help others to):</p>
      <ul>
        <li>use the Service for illegal activities;</li>
        <li>infringe or violate others’ intellectual property or privacy rights;</li>
        <li>attempt to bypass technical limitations, usage limits, or paywalls;</li>
        <li>reverse engineer, decompile, or attempt to extract source code (except where prohibited by law);</li>
        <li>interfere with or disrupt the Service, including by abusing APIs or automation;</li>
        <li>use the Service to distribute malware or harmful content.</li>
      </ul>

      <h2>4. Third-party platforms and content (critical)</h2>
      <p>
        The Service can help you download, clip, or process content from third-party platforms (for example: YouTube, Twitch, X,
        Instagram, Vimeo) and from local files. You are solely responsible for:
      </p>
      <ul>
        <li>ensuring you have all rights, permissions, and licenses needed to access and process that content;</li>
        <li>complying with the terms and policies of those third-party platforms;</li>
        <li>complying with applicable laws (including copyright law).</li>
      </ul>
      <p>
        Klipprr is not affiliated with, endorsed by, or sponsored by any of those third-party platforms. Third-party services may
        change or block access at any time, and we are not responsible for their availability.
      </p>

      <h2>5. Plans, subscriptions, and billing</h2>
      <p>
        Some features require a paid subscription. Subscriptions may auto-renew unless you cancel. Your payment is processed by
        Stripe or another payment provider we use from time to time.
      </p>
      <ul>
        <li>
          <strong>Auto-renewal:</strong> if you purchase a subscription, it may renew automatically until cancelled.
        </li>
        <li>
          <strong>Cancellation:</strong> you can cancel to stop future renewals; you may retain access until the end of the then-current
          billing period (subject to plan terms).
        </li>
        <li>
          <strong>Taxes:</strong> prices may include or exclude VAT/sales tax depending on your location and payment settings.
        </li>
      </ul>
      <p>
        For refund and cancellation details, see our <a href="/refunds">Refund Policy</a>.
      </p>

      <h2>6. Changes to the Service</h2>
      <p>
        We may modify, suspend, or discontinue any part of the Service at any time (for example: to improve performance, add features,
        comply with law, or prevent abuse). Where required by law, we will provide notice.
      </p>

      <h2>7. Feedback</h2>
      <p>
        If you provide feedback or suggestions, you grant us the right to use them without restriction or compensation.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate access if you violate these Terms, fail to pay, or if
        we reasonably believe your use creates risk or legal exposure for us or others.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided on an “as is” and “as available” basis. To the maximum extent permitted by law, we disclaim all
        warranties, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Klipprr will not be liable for any indirect, incidental, special, consequential, or
        punitive damages, or for any loss of profits, revenues, data, or goodwill, arising out of or related to your use of the Service.
      </p>
      <p>
        To the extent permitted by law, our total liability for any claim related to the Service will not exceed the amount you paid to
        us for the Service in the 12 months before the event giving rise to the claim.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of Slovakia, without regard to conflict of laws principles, except where mandatory consumer
        protection laws in your country of residence apply.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We will post the updated version and update the effective date above.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a href="mailto:hello@klipprr.com">hello@klipprr.com</a>.
      </p>
    </>
  );
}
