import { describe, it, expect } from "vitest";
import {
  DISPLAY_VALUE_MAX,
  dropDisabledFields,
  parseSubmissionForDisplay,
  submissionDisplaySchema,
  type EnabledFields,
} from "./submission";

const allEnabled: EnabledFields = {
  partner_name: true,
  kids_names: true,
  birthday: true,
};

describe("submissionDisplaySchema", () => {
  it("accepts an empty object", () => {
    expect(submissionDisplaySchema.safeParse({}).success).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "hi"],
    ["a number", 42],
    ["a boolean", true],
    ["an array", ["full_name", "x"]],
  ])("rejects non-object payload: %s", (_label, payload) => {
    expect(submissionDisplaySchema.safeParse(payload).success).toBe(false);
  });

  it("drops unknown keys, including a smuggled notes and __proto__", () => {
    // JSON.parse (how jsonb actually arrives) creates a REAL own __proto__
    // key, unlike an object literal where it would be inert.
    const result = submissionDisplaySchema.parse(
      JSON.parse(
        '{"full_name":"Ada","notes":"owner-private","unknown_key":"x","__proto__":"y"}',
      ),
    );
    expect(result).toEqual({ full_name: "Ada" });
    expect(Object.keys(result)).toEqual(["full_name"]);
  });

  it("drops non-string values under known keys instead of failing the card", () => {
    const result = submissionDisplaySchema.parse({
      full_name: "Ada",
      city: 42,
      email: { nested: true },
      country: null,
    });
    expect(result).toEqual({ full_name: "Ada" });
  });

  it("truncates huge values for display with an ellipsis", () => {
    const long = "a".repeat(DISPLAY_VALUE_MAX + 50);
    const result = submissionDisplaySchema.parse({ full_name: long });
    expect(result.full_name).toHaveLength(DISPLAY_VALUE_MAX + 1);
    expect(result.full_name?.endsWith("…")).toBe(true);
  });

  it("leaves values at the cap untouched", () => {
    const exact = "a".repeat(DISPLAY_VALUE_MAX);
    const result = submissionDisplaySchema.parse({ full_name: exact });
    expect(result.full_name).toBe(exact);
  });

  it("passes XSS strings through as plain strings (escaping is React's job)", () => {
    const result = submissionDisplaySchema.parse({
      full_name: "<script>alert(1)</script>",
    });
    expect(result.full_name).toBe("<script>alert(1)</script>");
  });
});

describe("dropDisabledFields", () => {
  it("removes fields the book disables", () => {
    const gated = dropDisabledFields(
      { full_name: "Ada", kids_names: "smuggled", partner_name: "p", birthday: "2000-01-01" },
      { partner_name: true, kids_names: false, birthday: false },
    );
    expect(gated).toEqual({ full_name: "Ada", partner_name: "p" });
  });

  it("keeps everything when all fields are enabled", () => {
    const data = { full_name: "Ada", kids_names: "k" };
    expect(dropDisabledFields(data, allEnabled)).toEqual(data);
  });

  it("does not mutate its input", () => {
    const data = { full_name: "Ada", kids_names: "k" };
    dropDisabledFields(data, { ...allEnabled, kids_names: false });
    expect(data.kids_names).toBe("k");
  });
});

describe("parseSubmissionForDisplay", () => {
  it("returns null for non-object payloads", () => {
    expect(parseSubmissionForDisplay(null, allEnabled)).toBeNull();
    expect(parseSubmissionForDisplay([1, 2], allEnabled)).toBeNull();
    expect(parseSubmissionForDisplay("scalar", allEnabled)).toBeNull();
  });

  it("gates disabled fields out of the parsed result", () => {
    const result = parseSubmissionForDisplay(
      { full_name: "Ada", kids_names: "SMUGGLED", unknown_key: "x" },
      { partner_name: true, kids_names: false, birthday: true },
    );
    expect(result).toEqual({ full_name: "Ada" });
  });

  it("never throws on hostile shapes", () => {
    for (const payload of [undefined, 0, "", () => {}, Symbol("x")]) {
      expect(() => parseSubmissionForDisplay(payload, allEnabled)).not.toThrow();
    }
  });
});
