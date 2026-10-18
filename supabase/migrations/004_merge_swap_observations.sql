-- Atomic, non-destructive merge of observations from two independent chains.
-- Prevents PostgREST partial UPSERT values from clearing the other chain's
-- status, addresses, timeouts or transaction identifiers.
create or replace function public.record_swap_observation(
  p_intent_id text,
  p_user_address text default null,
  p_solver_address text default null,
  p_source_status text default null,
  p_destination_status text default null,
  p_source_deadline bigint default null,
  p_destination_deadline bigint default null,
  p_source_tx text default null,
  p_destination_tx text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_intent_id !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'Bad intent identifier';
  end if;
  if p_source_status is not null and
    p_source_status not in ('UNKNOWN','LOCKED','CLAIMED','REFUNDED') then
    raise exception 'Bad source status';
  end if;
  if p_destination_status is not null and
    p_destination_status not in ('UNKNOWN','LOCKED','CLAIMED','REFUNDED') then
    raise exception 'Bad destination status';
  end if;
  insert into public.swaps (
    intent_id,user_address,solver_address,source_status,destination_status,
    source_deadline,destination_deadline,source_tx,destination_tx
  ) values (
    p_intent_id,p_user_address,p_solver_address,
    coalesce(p_source_status,'UNKNOWN'),
    coalesce(p_destination_status,'UNKNOWN'),
    p_source_deadline,p_destination_deadline,p_source_tx,p_destination_tx
  )
  on conflict (intent_id) do update set
    user_address = coalesce(public.swaps.user_address, excluded.user_address),
    solver_address = coalesce(public.swaps.solver_address, excluded.solver_address),
    source_deadline = coalesce(public.swaps.source_deadline, excluded.source_deadline),
    destination_deadline = coalesce(public.swaps.destination_deadline, excluded.destination_deadline),
    source_tx = coalesce(public.swaps.source_tx, excluded.source_tx),
    destination_tx = coalesce(public.swaps.destination_tx, excluded.destination_tx),
    source_status = case
      when p_source_status is null then public.swaps.source_status
      when public.swaps.source_status in ('CLAIMED','REFUNDED')
        and p_source_status = 'LOCKED' then public.swaps.source_status
      else excluded.source_status
    end,
    destination_status = case
      when p_destination_status is null then public.swaps.destination_status
      when public.swaps.destination_status in ('CLAIMED','REFUNDED')
        and p_destination_status = 'LOCKED' then public.swaps.destination_status
      else excluded.destination_status
    end;
end;
$$;

revoke all on function public.record_swap_observation(
  text,text,text,text,text,bigint,bigint,text,text
) from public,anon,authenticated;
grant execute on function public.record_swap_observation(
  text,text,text,text,text,bigint,bigint,text,text
) to service_role;
