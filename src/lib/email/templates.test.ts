import { describe, expect, it } from "vitest";
import { addressRequestEmail, submissionNotificationEmail } from "./templates";

const addressRequest = {
  ownerName: "Sean O",
  updateUrl: "https://self-hosted.example/u/abc123",
};

describe("addressRequestEmail", () => {
  it("identifies Sealed in every email representation", () => {
    const { subject, html, text } = addressRequestEmail(addressRequest);
    for (const part of [subject, html, text]) {
      expect(part).toContain("Sealed");
    }
  });

  it("uses the owner name and title-free address-book copy", () => {
    const { subject, html, text } = addressRequestEmail(addressRequest);
    expect(subject).toBe(
      "Sean O would like your current mailing address · Sealed",
    );
    expect(html).toContain("Sean O is updating their address book");
    expect(text).toContain("Sean O is updating their address book");
  });

  it("keeps the configured self-hosted update URL in html and text", () => {
    const { html, text } = addressRequestEmail(addressRequest);
    expect(html).toContain(`href="${addressRequest.updateUrl}"`);
    expect(text).toContain(addressRequest.updateUrl);
    expect(`${html}${text}`).not.toContain("sealed.page");
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
      "Eve Bcc: victim@test.dev X would like your current mailing address · Sealed",
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
    reviewUrl: "https://self-hosted.example/dashboard/review",
  };

  it("identifies Sealed in every email representation", () => {
    const { subject, html, text } = submissionNotificationEmail(notification);
    for (const part of [subject, html, text]) {
      expect(part).toContain("Sealed");
    }
  });

  it("uses title-free submission copy", () => {
    const { subject, html, text } = submissionNotificationEmail(notification);
    expect(subject).toBe("New address submission · Sealed");
    expect(html).toContain("Someone added their info through your public link");
    expect(text).toContain("Someone added their info through your public link");
  });

  it("keeps the configured self-hosted review URL in html and text", () => {
    const { html, text } = submissionNotificationEmail(notification);
    expect(html).toContain(`href="${notification.reviewUrl}"`);
    expect(text).toContain(notification.reviewUrl);
    expect(`${html}${text}`).not.toContain("sealed.page");
  });

  it("contains no placeholder for submitted data", () => {
    const { html, text, subject } = submissionNotificationEmail(notification);
    for (const part of [html, text, subject]) {
      expect(part).not.toContain("undefined");
      expect(part).not.toMatch(/\$\{/);
    }
  });
});
