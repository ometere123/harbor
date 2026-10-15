export interface Env {
  BASE_RPC_URL: string; PORTALDOT_EVM_RPC_URL: string;
  BASE_CHAIN_ID: string; PORTALDOT_CHAIN_ID: string;
  PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED: string; DEST_EVM_VALUE_DECIMALS: string;
  SOLVER_ALPHA_RATE_BPS: string; SOLVER_BRAVO_RATE_BPS: string;
  SOURCE_CONFIRMATIONS: string; DEST_CONFIRMATIONS: string;
  SOURCE_TOKEN_ADDRESS: string; SOURCE_ESCROW_ADDRESS: string; DESTINATION_ESCROW_ADDRESS: string;
  TREASURY_ADDRESS: string;
  SOLVER_ALPHA_PRIVATE_KEY: string; SOLVER_BRAVO_PRIVATE_KEY: string;
  SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string;
  WORKER_ADMIN_TOKEN: string;
  HARBOR_JOBS: Queue<Job>;
}
export type Job =
  | { type: "scan"; chain: "source" | "destination" }
  | { type: "fund"; intentId: string }
  | { type: "claimSource"; intentId: string; secret: string }
  | { type: "refundSource"; intentId: string }
  | { type: "refundDestination"; intentId: string };

export async function db<T>(env: Env, table: string, query = "", init: RequestInit = {}): Promise<T> {
  const endpoint = env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + table + query;
  const res = await fetch(endpoint, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw Error("Database " + table + ": HTTP " + res.status + " " + (await res.text()).slice(0,500));
  if (res.status === 204) return null as T;
  const body = await res.text();
  return (body ? JSON.parse(body) : null) as T;
}
export function upsert<T>(env: Env, table: string, rows: unknown, onConflict: string): Promise<T> {
  return db<T>(env, table, "?on_conflict=" + encodeURIComponent(onConflict), {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
}
export function iso(): string { return new Date().toISOString(); }
