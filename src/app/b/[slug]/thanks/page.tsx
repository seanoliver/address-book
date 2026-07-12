import { type Metadata } from "next";
import { Notice } from "../../../u/notice";

// Unlike the form page, there is no reason for a thank-you screen to be
// indexed. (This is hygiene, not secrecy — the page is static and generic.)
export const metadata: Metadata = {
  title: "Thanks!",
  robots: { index: false, follow: false },
};

/**
 * Static thank-you screen after a permalink submission. Deliberately
 * generic: NO echo of any submitted data, no params read, no data access —
 * so it renders identically for every submission (matched or not) and even
 * for a hand-typed URL.
 */
export default function SubmissionThanksPage() {
  return (
    <Notice title="Thanks — you're all set!">
      Your info was submitted for review. You can close this page now.
    </Notice>
  );
}
