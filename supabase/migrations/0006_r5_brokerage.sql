-- R5: brokerage operating layer — approvals, pause, identity, CAC honesty.

alter table public.deals
  add column if not exists paused boolean not null default false,
  add column if not exists paused_reason text;

alter table public.listings
  add column if not exists media_cost_cents bigint not null default 0,
  add column if not exists campaign_cost_cents bigint not null default 0;

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null check (kind in (
    'contract_execution',
    'deposit_confirmation',
    'designated_agency',
    'listing_publish',
    'verification_review',
    'extraction_confirmation'
  )),
  status text not null default 'pending' check (status in (
    'pending',
    'approved',
    'rejected',
    'changes_requested'
  )),
  context jsonb not null default '{}'::jsonb,
  requested_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists approvals_deal_idx on public.approvals (deal_id, created_at desc);
create index if not exists approvals_status_idx on public.approvals (status, kind);

create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value)
values
  ('brokerage_legal_name', 'REALORA (placeholder)'),
  ('brokerage_license_number', 'PENDING')
on conflict (key) do nothing;

alter table public.approvals enable row level security;
alter table public.settings enable row level security;

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select using (public.shares_deal(deal_id) or public.is_staff());

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals
  for insert with check (public.shares_deal(deal_id) or public.is_staff());

drop policy if exists approvals_update on public.approvals;
create policy approvals_update on public.approvals
  for update using (public.is_staff());

drop policy if exists settings_public_select on public.settings;
create policy settings_public_select on public.settings
  for select using (true);

drop policy if exists settings_staff_write on public.settings;
create policy settings_staff_write on public.settings
  for all using (public.is_staff()) with check (public.is_staff());
