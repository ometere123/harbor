-- Durable short-lived liquidity reservation for competing solver quotes.
-- A signed quote may be accepted up to five minutes after issuance. Its
-- corresponding source escrow may then be funded on the destination within
-- twenty minutes; keep liquidity reserved for 26 minutes in total.
-- These reservations are conservative: a funded trade consumes funds on
-- chain before the reservation expires. Never treat this table as custody.
create table if not exists public.solver_liquidity_reservations (
  solver text not null check (solver ~ '^0x[0-9a-f]{40}$'),
  intent_id text not null check (intent_id ~ '^0x[0-9a-fA-F]{64}$'),
  amount numeric(78,0) not null check (amount > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (solver, intent_id)
);
create index if not exists solver_reservations_active_idx
  on public.solver_liquidity_reservations(solver, expires_at);
alter table public.solver_liquidity_reservations enable row level security;
revoke all on public.solver_liquidity_reservations from anon, authenticated;

-- Atomic admission within each funded solver identity. A database transaction
-- holds one solver-specific advisory lock while it calculates the total
-- already-promised spend, avoiding the balance-check/quote issuance race.
create or replace function public.reserve_solver_quote(
  p_solver text, p_intent_id text, p_required_value numeric, p_wallet_balance numeric
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_solver text := lower(p_solver);
  v_reserved numeric;
begin
  if v_solver !~ '^0x[0-9a-f]{40}$'
     or p_intent_id !~ '^0x[0-9a-fA-F]{64}$'
     or p_required_value <= 0 or p_wallet_balance < 0
     or p_required_value <> trunc(p_required_value)
     or p_wallet_balance <> trunc(p_wallet_balance) then
    raise exception 'Invalid solver reservation inputs';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_solver, 0));
  select coalesce(sum(amount), 0) into v_reserved
    from public.solver_liquidity_reservations
    where solver = v_solver and expires_at > now()
      and intent_id <> p_intent_id;
  if v_reserved + p_required_value > p_wallet_balance then
    return false;
  end if;

  insert into public.solver_liquidity_reservations
    (solver, intent_id, amount, expires_at)
  values (v_solver, p_intent_id, p_required_value, now() + interval '26 minutes')
  on conflict (solver, intent_id) do update
    set amount = excluded.amount,
        expires_at = greatest(
          public.solver_liquidity_reservations.expires_at,
          excluded.expires_at
        );
  return true;
end;
$$;

-- A failed quote creation may release its own reserved capacity, but must
-- never clear a quote already locked on chain. Intended only for cleanup
-- before the API sends the quote response.
create or replace function public.release_unpublished_quote_reservations(
  p_intent_id text
) returns void
language sql security definer set search_path = public
as $$
  delete from public.solver_liquidity_reservations
  where intent_id = p_intent_id
$$;

revoke all on function public.reserve_solver_quote(text,text,numeric,numeric)
  from public, anon, authenticated;
grant execute on function public.reserve_solver_quote(text,text,numeric,numeric)
  to service_role;
revoke all on function public.release_unpublished_quote_reservations(text)
  from public, anon, authenticated;
grant execute on function public.release_unpublished_quote_reservations(text)
  to service_role;
