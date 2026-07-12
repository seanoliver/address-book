import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generateToken, hashToken, TOKEN_SHAPE, TOKEN_TTL_DAYS } from "./tokens";

describe("generateToken", () => {
  it("returns a 43-char base64url token (32 random bytes)", () => {
    const { token } = generateToken();
    // 32 bytes → ceil(32 * 4 / 3) = 43 base64 chars, unpadded.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns the sha256 of the token as a 32-byte Buffer", () => {
    const { token, hash } = generateToken();
    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash).toHaveLength(32);
    const expected = createHash("sha256").update(token).digest();
    expect(hash.equals(expected)).toBe(true);
  });

  it("agrees with hashToken", () => {
    const { token, hash } = generateToken();
    expect(hashToken(token).equals(hash)).toBe(true);
  });

  it("never collides across 1000 calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateToken().token);
    }
    expect(seen.size).toBe(1000);
  });
});

describe("hashToken", () => {
  it("is deterministic", () => {
    expect(hashToken("abc").equals(hashToken("abc"))).toBe(true);
  });

  it("differs for different inputs", () => {
    expect(hashToken("abc").equals(hashToken("abd"))).toBe(false);
  });
});

describe("TOKEN_SHAPE", () => {
  it("matches every generated token", () => {
    for (let i = 0; i < 100; i++) {
      expect(TOKEN_SHAPE.test(generateToken().token)).toBe(true);
    }
  });

  it("rejects malformed candidates", () => {
    const valid = generateToken().token;
    expect(TOKEN_SHAPE.test("")).toBe(false);
    expect(TOKEN_SHAPE.test("abc")).toBe(false);
    expect(TOKEN_SHAPE.test(valid.slice(0, 42))).toBe(false); // too short
    expect(TOKEN_SHAPE.test(`${valid}a`)).toBe(false); // too long
    expect(TOKEN_SHAPE.test(`${valid.slice(0, 42)}+`)).toBe(false); // non-base64url char
    expect(TOKEN_SHAPE.test(`${valid.slice(0, 42)}=`)).toBe(false); // padding
    expect(TOKEN_SHAPE.test(`${valid}\n${valid}`)).toBe(false); // multiline smuggle
  });
});

describe("TOKEN_TTL_DAYS", () => {
  it("is 30", () => {
    expect(TOKEN_TTL_DAYS).toBe(30);
  });
});
