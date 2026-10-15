import { describe, expect, it } from "vitest";
import { collectPages, expiredJobs, expiryQuery, hasSufficientFunding, requiredFunding, type ExpiryRow } from "./reliability";

describe("solver expiry recovery", () => {
  it("requires destination liquidity plus a doubled gas reserve before publishing a quote", () => {
    expect(requiredFunding(100n, 21_000n, 3n)).toBe(126_100n);
    expect(hasSufficientFunding(126_100n, 100n, 21_000n, 3n)).toBe(true);
    expect(hasSufficientFunding(126_099n, 100n, 21_000n, 3n)).toBe(false);
  });

  it("paginates beyond the first page and returns only still-locked expired rows", async () => {
    const now = 10_000;
    const rows: ExpiryRow[] = Array.from({ length: 205 }, (_, index) => ({
      intent_id: "closed-" + index,
      source_status: "CLAIMED",
      destination_status: "REFUNDED",
    }));
    rows.push({ intent_id: "new-source", source_status: "LOCKED", source_deadline: now - 1 });
    rows.push({ intent_id: "new-destination", destination_status: "LOCKED", destination_deadline: now });
    const pages = await collectPages(async (offset, limit) => rows.slice(offset, offset + limit));
    expect(pages).toHaveLength(207);
    expect(expiredJobs(pages, now)).toEqual([
      { type: "refundSource", intentId: "new-source" },
      { type: "refundDestination", intentId: "new-destination" },
    ]);
  });

  it("builds a server-side status/deadline filter and stable pagination", () => {
    expect(expiryQuery(123, 200, 100)).toBe(
      "?select=intent_id,source_status,destination_status,source_deadline,destination_deadline"
      + "&or=(and(source_status.eq.LOCKED,source_deadline.lte.123),and(destination_status.eq.LOCKED,destination_deadline.lte.123))"
      + "&order=created_at.asc&limit=100&offset=200",
    );
  });
});
