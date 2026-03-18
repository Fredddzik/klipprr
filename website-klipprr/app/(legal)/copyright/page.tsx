import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Copyright & Takedown — Klipprr",
  description: "How to report copyright concerns related to Klipprr.",
};

export default function CopyrightPage() {
  return (
    <>
      <h1>Copyright &amp; Takedown Policy</h1>
      <p>
        <strong>Effective date:</strong> March 17, 2026
      </p>

      <p>
        We respect intellectual property rights. If you believe content processed through Klipprr infringes your copyright or other
        rights, you can contact us to request review and appropriate action.
      </p>

      <h2>How to submit a notice</h2>
      <p>
        Send an email to <a href="mailto:hello@klipprr.com">hello@klipprr.com</a> with the subject line{" "}
        <strong>“Copyright Notice”</strong> and include:
      </p>
      <ul>
        <li>your name and contact information;</li>
        <li>identification of the copyrighted work you claim has been infringed;</li>
        <li>information reasonably sufficient for us to locate the relevant material or activity (links, timestamps, account email);</li>
        <li>a statement that you have a good-faith belief the use is not authorized by the rights owner, its agent, or the law;</li>
        <li>a statement that the information in your notice is accurate; and</li>
        <li>a statement, under penalty of perjury (where applicable), that you are the rights owner or authorized to act on their behalf.</li>
      </ul>

      <h2>What we may do</h2>
      <p>
        Depending on the nature of the request and the Service’s architecture, we may take steps such as disabling access, removing
        stored data (if any), restricting accounts associated with repeated infringement, or requesting additional information.
      </p>

      <h2>Counter-notices</h2>
      <p>
        If you believe a notice was submitted in error, you may contact us with a counter-notice explaining why you believe the content
        or activity is lawful. We may share the counter-notice with the original complainant where appropriate.
      </p>

      <h2>Contact</h2>
      <p>
        Email <a href="mailto:hello@klipprr.com">hello@klipprr.com</a>.
      </p>
    </>
  );
}
