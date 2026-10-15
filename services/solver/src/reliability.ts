import type { Job } from "./store";

export type ExpiryRow = {
  intent_id: string;
  source_status?: string;
  destination_status?: string;
  source_deadline?: number | string | null;
  destination_deadline?: number | string | null;
};

/** Reserve twice the quoted gas estimate so a quote is executable, not merely signed. */
export function requiredFunding(amount: bigint, gasEstimate: bigint, gasPrice: bigint): bigint {
  return amount + gasEstimate * gasPrice * 2n;
}

export function hasSufficientFunding(balance: bigint, amount: bigint, gasEstimate: bigint, gasPrice: bigint): boolean {
  return balance >= requiredFunding(amount, gasEstimate, gasPrice);
}

/**
 * Restrict the Supabase read to rows that can produce work. The worker still
 * re-reads authoritative chain state before every transaction.
 */
export function expiryQuery(now: number, offset: number, limit: number): string {
  return "?select=intent_id,source_status,destination_status,source_deadline,destination_deadline"
    + "&or=(and(source_status.eq.LOCKED,source_deadline.lte." + now + ")"
    + ",and(destination_status.eq.LOCKED,destination_deadline.lte." + now + "))"
    + "&order=created_at.asc&limit=" + limit + "&offset=" + offset;
}

export function expiredJobs(rows: ExpiryRow[], now: number): Job[] {
  const jobs: Job[] = [];
  for (const row of rows) {
    if (row.source_status === "LOCKED" && row.source_deadline !== null && row.source_deadline !== undefined
      && Number(row.source_deadline) <= now) {
      jobs.push({ type: "refundSource", intentId: row.intent_id });
    }
    if (row.destination_status === "LOCKED" && row.destination_deadline !== null && row.destination_deadline !== undefined
      && Number(row.destination_deadline) <= now) {
      jobs.push({ type: "refundDestination", intentId: row.intent_id });
    }
  }
  return jobs;
}

/** Paginate until a short page, so old closed rows cannot hide newer locks. */
export async function collectPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = 100,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchPage(offset, pageSize);
    all.push(...page);
    if (page.length < pageSize) return all;
    offset += pageSize;
  }
}
