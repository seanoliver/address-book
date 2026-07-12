import { describe, expect, it } from "vitest";
import { addressRequestEmail } from "./templates";

const base = {
  ownerName: "Sean O",
  bookTitle: "Sean's Book",
  updateUrl: "http://localhost:3000/u/abc123",
};

describe("addressRequestEmail", () => {
  it("builds the subject from the owner name", () => {
    const { subject } = addressRequestEmail(base);
    expect(subject).toBe("Sean O would like your current mailing address");
  });

  it("includes the update URL in html (as link) and text (bare)", () => {
    const { html, text } = addressRequestEmail(base);
    expect(html).toContain(`href="${base.updateUrl}"`);
    expect(text).toContain(base.updateUrl);
  });

  it("mentions the 30-day expiry", () => {
    const { html, text } = addressRequestEmail(base);
    expect(html).toContain("expires in 30 days");
    expect(text).toContain("expires in 30 days");
  });

  it("strips control characters from the owner name in the subject", () => {
    const { subject } = addressRequestEmail({
      ...base,
      ownerName: "Eve\r\nBcc: victim@test.dev\tX",
    });
    expect(subject).toBe(
      "Eve Bcc: victim@test.dev X would like your current mailing address",
    );
    expect(subject).not.toMatch(/[\r\n\t]/);
  });

  it("escapes user-controlled owner name and book title in html", () => {
    const { html } = addressRequestEmail({
      ...base,
      ownerName: `<script>alert("x")</script>`,
      bookTitle: `Bob & Sue's "list" <b>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Bob &amp; Sue&#39;s &quot;list&quot; &lt;b&gt;");
  });
});
