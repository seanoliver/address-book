import { describe, expect, it } from "vitest";
import { addressRequestEmail, submissionNotificationEmail } from "./templates";

const addressRequest = {
  ownerName: "Sean O",
  updateUrl: "http://localhost:3000/u/abc123",
};

describe("addressRequestEmail", () => {
  it("uses the owner name and title-free address-book copy", () => {
    const { subject, html, text } = addressRequestEmail(addressRequest);
    expect(subject).toBe("Sean O would like your current mailing address");
    expect(html).toContain("Sean O is updating their address book");
    expect(text).toContain("Sean O is updating their address book");
  });

  it("includes the update URL in html (as link) and text (bare)", () => {
    const { html, text } = addressRequestEmail(addressRequest);
    expect(html).toContain(`href="${addressRequest.updateUrl}"`);
    expect(text).toContain(addressRequest.updateUrl);
  });

  it("mentions the 30-day expiry", () => {
    const { html, text } = addressRequestEmail(addressRequest);
    expect(html).toContain("expires in 30 days");
    expect(text).toContain("expires in 30 days");
  });

  it("strips control characters from the owner name in the subject", () => {
    const { subject } = addressRequestEmail({
      ...addressRequest,
      ownerName: "Eve\r\nBcc: victim@test.dev\tX",
    });
    expect(subject).toBe(
      "Eve Bcc: victim@test.dev X would like your current mailing address",
    );
    expect(subject).not.toMatch(/[\r\n\t]/);
  });

  it("escapes the user-controlled owner name in html", () => {
    const { html } = addressRequestEmail({
      ...addressRequest,
      ownerName: `<script>alert("x")</script>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });
});

describe("submissionNotificationEmail", () => {
  const notification = {
    reviewUrl: "http://localhost:3000/dashboard/review",
  };

  it("uses title-free submission copy", () => {
    const { subject, html, text } = submissionNotificationEmail(notification);
    expect(subject).toBe("New address submission");
    expect(html).toContain("Someone added their info through your public link");
    expect(text).toContain("Someone added their info through your public link");
  });

  it("includes the review URL in html (as link) and text (bare)", () => {
    const { html, text } = submissionNotificationEmail(notification);
    expect(html).toContain(`href="${notification.reviewUrl}"`);
    expect(text).toContain(notification.reviewUrl);
  });

  it("contains no placeholder for submitted data", () => {
    const { html, text, subject } = submissionNotificationEmail(notification);
    for (const part of [html, text, subject]) {
      expect(part).not.toContain("undefined");
      expect(part).not.toMatch(/\$\{/);
    }
  });
});
