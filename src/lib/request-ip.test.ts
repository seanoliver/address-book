import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { firstForwardedIp, hashedIpKey } from "./request-ip";

describe("firstForwardedIp", () => {
  it("takes the first hop of a multi-hop list", () => {
    expect(firstForwardedIp("203.0.113.7, 198.51.100.1, 10.0.0.1")).toBe(
      "203.0.113.7",
    );
  });

  it("trims whitespace around the first hop", () => {
    expect(firstForwardedIp("  203.0.113.7 , 10.0.0.1")).toBe("203.0.113.7");
  });

  it("handles a single-hop header", () => {
    expect(firstForwardedIp("::1")).toBe("::1");
  });

  it('falls back to "unknown" for a missing header', () => {
    expect(firstForwardedIp(null)).toBe("unknown");
  });

  it('falls back to "unknown" for blank values', () => {
    expect(firstForwardedIp("")).toBe("unknown");
    expect(firstForwardedIp("   ")).toBe("unknown");
    expect(firstForwardedIp(" , 10.0.0.1")).toBe("unknown");
  });
});

describe("hashedIpKey", () => {
  it("is `${prefix}:${sha256hex(ip)}` — the raw IP never appears", () => {
    const key = hashedIpKey("token-view", "203.0.113.7");
    const digest = createHash("sha256").update("203.0.113.7").digest("hex");
    expect(key).toBe(`token-view:${digest}`);
    expect(key).not.toContain("203.0.113.7");
  });

  it("is deterministic and distinguishes prefixes and IPs", () => {
    expect(hashedIpKey("a", "1.1.1.1")).toBe(hashedIpKey("a", "1.1.1.1"));
    expect(hashedIpKey("a", "1.1.1.1")).not.toBe(hashedIpKey("b", "1.1.1.1"));
    expect(hashedIpKey("a", "1.1.1.1")).not.toBe(hashedIpKey("a", "1.1.1.2"));
  });
});
