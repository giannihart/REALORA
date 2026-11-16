-- Lender introduction packets + path-separated pre-approval confirmation facts.
-- Cash funds confirmation continues to use verifications.funds_status only.
-- Pre-approval confirmation uses preapproval_* columns and never writes funds_status.

-- Allow user-scoped events (lender packets) without a deal.
alter table public.events
  alter column deal_id drop not null;

alter table public.verifications
  add column if not exists preapproval_status text,
  add column if not exists approved_amount_cents bigint,
  add column if not exists lender_name text,
  add column if not exists preapproval_confirmed_at timestamptz;

alter table public.verifications
  drop constraint if exists verifications_preapproval_status_check;
alter table public.verifications
  add constraint verifications_preapproval_status_check
  check (preapproval_status is null or preapproval_status in ('pending', 'verified'));

alter table public.verifications
  drop constraint if exists verifications_approved_amount_check;
alter table public.verifications
  add constraint verifications_approved_amount_check
  check (approved_amount_cents is null or approved_amount_cents > 0);

create table if not exists public.lender_packets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lender_id text not null,
  lender_name text not null,
  lender_email text not null,
  payload jsonb not null default '{}'::jsonb,
  pdf_storage_path text,
  consent_version text not null,
  delivery_status text not null default 'prepared'
    check (delivery_status in ('prepared', 'sent', 'failed')),
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id)
);

comment on table public.lender_packets is
  'One lender introduction packet per buyer. Delivery failures update this row; never duplicate.';

create index if not exists lender_packets_user_id_idx on public.lender_packets (user_id);

alter table public.lender_packets enable row level security;

drop policy if exists lender_packets_select_own on public.lender_packets;
create policy lender_packets_select_own on public.lender_packets
  for select using (auth.uid() = user_id or public.is_staff());

drop policy if exists lender_packets_insert_own on public.lender_packets;
create policy lender_packets_insert_own on public.lender_packets
  for insert with check (auth.uid() = user_id);

drop policy if exists lender_packets_update_own on public.lender_packets;
create policy lender_packets_update_own on public.lender_packets
  for update using (auth.uid() = user_id or public.is_staff())
  with check (auth.uid() = user_id or public.is_staff());
