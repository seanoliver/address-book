import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { dbAdmin, withRls } from "./index";
import { contacts, updateTokens } from "./schema";

// drizzle wraps Postgres errors in DrizzleQueryError ("Failed query: ...")
// with the real error as `cause` — match against the full chain.
function chainMessage(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  while (cur instanceof Error) {
    parts.push(cur.message);
    cur = cur.cause;
  }
  return parts.join(" <- ");
}

const U1 = "00000000-0000-0000-0000-00000000b001";
const U2 = "00000000-0000-0000-0000-00000000b002";
const B1 = "10000000-0000-0000-0000-00000000b001";
const C1 = "20000000-0000-0000-0000-00000000b001";

describe("withRls", () => {
  beforeAll(async () => {
    await dbAdmin.execute(sql`
      insert into auth.users (id, email) values
        (${U1}, 'rlstest1@test.dev'), (${U2}, 'rlstest2@test.dev')
      on conflict (id) do nothing`);
    await dbAdmin.execute(sql`
      insert into public.books (id, owner_id, slug, title)
      values (${B1}, ${U1}, 'rls-test-book', 'RLS Test')
      on conflict (id) do nothing`);
    await dbAdmin.execute(sql`
      insert into public.contacts (id, book_id, full_name)
      values (${C1}, ${B1}, 'RLS Test Contact')
      on conflict (id) do nothing`);
  });

  it("owner sees own contacts", async () => {
    const rows = await withRls({ sub: U1 }, (tx) => tx.select().from(contacts));
    expect(rows.some((r) => r.fullName === "RLS Test Contact")).toBe(true);
  });

  it("other user sees nothing", async () => {
    const rows = await withRls({ sub: U2 }, (tx) => tx.select().from(contacts));
    expect(rows.filter((r) => r.bookId === B1)).toHaveLength(0);
  });

  it("update_tokens are unreachable under RLS (zero grants -> permission denied)", async () => {
    await expect(
      withRls({ sub: U1 }, (tx) => tx.select().from(updateTokens)),
    ).rejects.toSatisfy((e) =>
      /permission denied for table update_tokens/.test(chainMessage(e)),
    );
  });

  it("rejects writes into another owner's book", async () => {
    await expect(
      withRls({ sub: U2 }, (tx) =>
        tx.insert(contacts).values({ bookId: B1, fullName: "Intruder" }),
      ),
    ).rejects.toSatisfy((e) => /row-level security/.test(chainMessage(e)));
  });

  it("does not leave the pool connection stuck in the authenticated role", async () => {
    // A failed withRls call must not poison the connection for admin use:
    // update_tokens has zero grants for `authenticated`, so this only
    // succeeds if the role was actually reset.
    await expect(
      withRls({ sub: U1 }, (tx) => tx.select().from(updateTokens)),
    ).rejects.toThrow();
    const rows = await dbAdmin.select().from(updateTokens);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("throws immediately when claims.sub is missing or empty", async () => {
    await expect(
      withRls({ sub: "" }, (tx) => tx.select().from(contacts)),
    ).rejects.toThrow(/sub/);
  });
});
