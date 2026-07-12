import { describe, expect, it } from "vitest";
import { addressRequestEmail, submissionNotificationEmail } from "./templates";

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

describe("submissionNotificationEmail", () => {
  const base = {
    bookTitle: "Sean's Book",
    reviewUrl: "http://localhost:3000/dashboard/review",
  };

  it("builds the subject from the book title", () => {
    const { subject } = submissionNotificationEmail(base);
    expect(subject).toBe("New address submission for Sean's Book");
  });

  it("includes the review URL in html (as link) and text (bare)", () => {
    const { html, text } = submissionNotificationEmail(base);
    expect(html).toContain(`href="${base.reviewUrl}"`);
    expect(text).toContain(base.reviewUrl);
  });

  it("strips control characters from the book title in the subject", () => {
    const { subject } = submissionNotificationEmail({
      ...base,
      bookTitle: "Xmas\r\nBcc: victim@test.dev\tList",
    });
    expect(subject).toBe(
      "New address submission for Xmas Bcc: victim@test.dev List",
    );
    expect(subject).not.toMatch(/[\r\n\t]/);
  });

  it("escapes the user-controlled book title in html", () => {
    const { html } = submissionNotificationEmail({
      ...base,
      bookTitle: `<script>alert("x")</script>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("contains no placeholder for submitted data (static copy only)", () => {
    const { html, text, subject } = submissionNotificationEmail(base);
    // The entire content is the title + review URL + static copy; nothing
    // else is interpolated. Guard the invariant loosely: no "undefined"
    // artifacts and no unexpected interpolation braces.
    for (const part of [html, text, subject]) {
      expect(part).not.toContain("undefined");
      expect(part).not.toMatch(/\$\{/);
    }
  });
});
