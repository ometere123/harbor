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
export function rpc<T>(env: Env, functionName: string, args: Record<string, unknown>): Promise<T> {
  return db<T>(env, "rpc/" + functionName, "", {
    method: "POST",
    body: JSON.stringify(args),
  });
}
export function iso(): string { return new Date().toISOString(); }
