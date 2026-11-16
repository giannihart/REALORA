-- R4: invites, vendors, notifications, service jobs, verification extras.

alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{"email": true, "sms": "deadline_critical"}'::jsonb;

alter table public.verifications
  add column if not exists persona_inquiry_id text;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  email text not null,
  role text not null,
  side text not null check (side in ('seller', 'buyer', 'neutral')),
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index if not exists invites_deal_email_role_open
  on public.invites (deal_id, lower(email), role)
  where accepted_at is null;
create index if not exists invites_token_hash_idx on public.invites (token_hash);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  business_name text not null,
  services text[] not null default '{}',
  service_area text,
  stripe_connect_id text,
  charges_enabled boolean not null default false,
  active boolean not null default true,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  deal_id uuid references public.deals (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'log')),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'logged_only',
  provider_id text,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_deal_idx on public.notifications (deal_id, template_key);

create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id),
  buyer_or_seller_payer uuid references public.profiles (id),
  service text not null,
  price_cents bigint not null check (price_cents >= 0),
  status text not null check (status in ('requested', 'confirmed', 'paid', 'completed', 'cancelled')),
  stripe_payment_intent text,
  scheduled_at timestamptz,
  deliverable_document_id uuid references public.documents (id),
  created_at timestamptz not null default now()
);

alter table public.invites enable row level security;
alter table public.vendors enable row level security;
alter table public.notifications enable row level security;
alter table public.service_jobs enable row level security;

drop policy if exists invites_party_select on public.invites;
create policy invites_party_select on public.invites
  for select using (public.shares_deal(deal_id) or public.is_staff());

drop policy if exists vendors_public_select on public.vendors;
create policy vendors_public_select on public.vendors
  for select using (active = true or user_id = auth.uid() or public.is_staff());

drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications
  for select using (user_id = auth.uid() or public.is_staff());

drop policy if exists service_jobs_party_select on public.service_jobs;
create policy service_jobs_party_select on public.service_jobs
  for select using (
    public.shares_deal(deal_id)
    or public.is_staff()
    or exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.user_id = auth.uid()
    )
  );

revoke all on public.invites from public, anon, authenticated;
grant select on public.invites to authenticated;
grant select, insert, update on public.invites to service_role;

revoke all on public.vendors from public, anon, authenticated;
grant select on public.vendors to authenticated, anon;
grant select, insert, update on public.vendors to service_role;

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant select, insert, update on public.notifications to service_role;

revoke all on public.service_jobs from public, anon, authenticated;
grant select on public.service_jobs to authenticated;
grant select, insert, update on public.service_jobs to service_role;
