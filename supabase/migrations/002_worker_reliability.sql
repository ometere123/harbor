-- Operational indexes keep expiry and checkpoint coordination bounded.
create index if not exists swaps_source_expiry_idx
  on public.swaps(source_deadline, created_at)
  where source_status = 'LOCKED';
create index if not exists swaps_destination_expiry_idx
  on public.swaps(destination_deadline, created_at)
  where destination_status = 'LOCKED';

-- Cron and manual scans may overlap. Never allow a later-finishing request to
-- move a checkpoint backwards and cause an unbounded rescan.
create or replace function public.advance_worker_checkpoint(
  p_chain text,
  p_last_block bigint,
  p_checked_at timestamptz default now()
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.worker_checkpoints(chain, last_block, checked_at)
  values (p_chain, p_last_block, p_checked_at)
  on conflict (chain) do update
    set last_block = greatest(public.worker_checkpoints.last_block, excluded.last_block),
        checked_at = greatest(public.worker_checkpoints.checked_at, excluded.checked_at);
$$;

revoke all on function public.advance_worker_checkpoint(text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.advance_worker_checkpoint(text, bigint, timestamptz) to service_role;
