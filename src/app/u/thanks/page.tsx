import { type Metadata } from "next";
import { Notice } from "../notice";

export const metadata: Metadata = {
  title: "Thanks!",
  robots: { index: false, follow: false },
};

/**
 * Static thank-you screen after a successful token update. Deliberately
 * carries NO data and no link back to the token URL (it's spent), and no
 * retry/resend affordance — that would be a spam vector.
 */
export default function ThanksPage() {
  return (
    <Notice title="Thanks — you're all set!">
      Your details were updated. You can close this page now.
    </Notice>
  );
}
