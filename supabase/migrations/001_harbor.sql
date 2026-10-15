-- Index/cache only. Contracts remain the authority for funds.
create table if not exists public.quotes (
 intent_id text not null, solver text not null, payload jsonb not null, signature text not null,
 created_at timestamptz not null default now(),
 primary key(intent_id,solver)
);
create table if not exists public.swaps (
 intent_id text primary key, user_address text, solver_address text,
 source_status text not null default 'UNKNOWN', destination_status text not null default 'UNKNOWN',
 source_deadline bigint, destination_deadline bigint, source_tx text, destination_tx text,
 created_at timestamptz not null default now()
);
create index if not exists swaps_user_idx on public.swaps(user_address);
create index if not exists swaps_solver_idx on public.swaps(solver_address);
create table if not exists public.observed_events (
 chain text not null, tx_hash text not null, log_index int not null,
 block_number bigint not null, event_name text not null, intent_id text not null,
 observed_at timestamptz not null default now(),
 primary key(chain,tx_hash,log_index)
);
create index if not exists events_intent_idx on public.observed_events(intent_id);
create table if not exists public.worker_checkpoints (
 chain text primary key, last_block bigint not null, checked_at timestamptz not null default now()
);
create table if not exists public.worker_health (
 service text primary key, checked_at timestamptz not null default now(), state jsonb not null default '{}'::jsonb
);
alter table public.quotes enable row level security;
alter table public.swaps enable row level security;
alter table public.observed_events enable row level security;
alter table public.worker_checkpoints enable row level security;
alter table public.worker_health enable row level security;
revoke all on public.quotes,public.swaps,public.observed_events,public.worker_checkpoints,public.worker_health from anon,authenticated;
