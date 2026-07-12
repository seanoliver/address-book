import { describe, it, expect } from "vitest";
import { bookSchema } from "./book";

describe("bookSchema", () => {
  it("accepts valid input", () => {
    expect(bookSchema.safeParse({
      title: "Sean's Book", slug: "sean-oliver",
      partner_name: true, kids_names: false, birthday: true,
    }).success).toBe(true);
  });
  it.each(["ab", "-bad", "Bad Slug", "a".repeat(64), "sean_oliver"])(
    "rejects slug %s", (slug) => {
      expect(bookSchema.safeParse({ title: "T", slug, partner_name: true, kids_names: true, birthday: true }).success).toBe(false);
    });
  it("rejects empty title", () => {
    expect(bookSchema.safeParse({ title: "", slug: "good-slug", partner_name: true, kids_names: true, birthday: true }).success).toBe(false);
  });
});
