-- R1 schema. All money is bigint cents. RLS on every table.
-- events is append-only: no UPDATE/DELETE grants.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  app_role text not null default 'user' check (app_role in ('user', 'broker', 'admin')),
  intent text check (intent in ('buying', 'selling', 'both')),
  created_at timestamptz not null default now()
);

create table public.verifications (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tier int not null default 0 check (tier between 0 and 3),
  id_status text,
  funds_status text,
  method text,
  verified_at timestamptz
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  bbl text unique,
  address_line text not null,
  city text,
  state text,
  zip text,
  borough text,
  block text,
  lot text,
  property_type text,
  beds numeric,
  baths numeric,
  sqft int,
  year_built int,
  acris_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (address_line, zip)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  seller_id uuid not null references public.profiles (id),
  status text not null check (status in ('draft', 'live', 'under_contract', 'closed', 'withdrawn')),
  price_cents bigint not null check (price_cents >= 0),
  description text,
  media jsonb not null default '[]'::jsonb,
  buyer_agent_offered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings (id),
  state text not null check (state in (
    'intake', 'prep', 'live', 'tours_offers', 'accepted', 'contract',
    'in_contract', 'diligence', 'clear_to_close', 'closing', 'post_close', 'fell_through'
  )),
  fell_through_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deal_parties (
  deal_id uuid not null references public.deals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in (
    'seller', 'co_seller', 'buyer', 'co_buyer', 'broker_of_record',
    'agent_seller', 'agent_buyer', 'attorney_seller', 'attorney_buyer',
    'lender', 'title', 'inspector', 'vendor'
  )),
  side text not null check (side in ('seller', 'buyer', 'neutral')),
  primary key (deal_id, user_id, role)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id),
  status text not null check (status in (
    'new', 'under_review', 'accepted', 'declined', 'countered', 'expired', 'withdrawn'
  )),
  price_cents bigint not null check (price_cents >= 0),
  financing text not null check (financing in ('cash', 'conventional', 'jumbo', 'other')),
  down_pct numeric not null,
  emd_cents bigint not null check (emd_cents >= 0),
  close_date date,
  expires_at timestamptz,
  contingencies jsonb not null default '{}'::jsonb,
  verified_funds boolean not null default false,
  certainty_label text,
  ai_note text,
  supersedes_id uuid references public.offers (id),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  title text not null,
  description text,
  owner_user_id uuid references public.profiles (id),
  owner_role text,
  status text not null check (status in ('pending', 'in_progress', 'waiting', 'done', 'skipped')),
  due_date date,
  auto boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  key text not null,
  label text not null,
  audience text not null check (audience in ('buyer', 'seller')),
  position int not null,
  status text not null check (status in ('complete', 'in_progress', 'upcoming')),
  completed_at timestamptz,
  target_date date,
  responsible_label text,
  next_text text,
  unique (deal_id, audience, key)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  uploader_id uuid references public.profiles (id),
  name text not null,
  kind text,
  storage_path text,
  status text,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  thread_key text not null,
  sender_id uuid references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.money_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null,
  amount_cents bigint not null,
  status text,
  note text,
  created_at timestamptz not null default now()
);

create table public.events (
  id bigserial primary key,
  deal_id uuid not null references public.deals (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index offers_deal_id_idx on public.offers (deal_id);
create index tasks_deal_id_idx on public.tasks (deal_id);
create index milestones_deal_id_idx on public.milestones (deal_id);
create index documents_deal_id_idx on public.documents (deal_id);
create index messages_deal_id_idx on public.messages (deal_id);
create index events_deal_id_idx on public.events (deal_id);
create index deal_parties_user_id_idx on public.deal_parties (user_id);
create index listings_status_idx on public.listings (status);

-- ---------------------------------------------------------------------------
-- Profile trigger on auth.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email;
  insert into public.verifications (user_id, tier)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and app_role in ('broker', 'admin')
  );
$$;

create or replace function public.shares_deal(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.deal_parties
    where deal_id = p_deal_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_seller_side(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.deal_parties
    where deal_id = p_deal_id and user_id = auth.uid() and side = 'seller'
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.verifications enable row level security;
alter table public.properties enable row level security;
alter table public.listings enable row level security;
alter table public.deals enable row level security;
alter table public.deal_parties enable row level security;
alter table public.offers enable row level security;
alter table public.tasks enable row level security;
alter table public.milestones enable row level security;
alter table public.documents enable row level security;
alter table public.messages enable row level security;
alter table public.money_events enable row level security;
alter table public.events enable row level security;

-- profiles
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid() or public.is_staff());

create policy profiles_deal_mates_select on public.profiles
  for select using (
    exists (
      select 1 from public.deal_parties me
      join public.deal_parties them on them.deal_id = me.deal_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- verifications: own row, staff all
create policy verifications_self on public.verifications
  for select using (user_id = auth.uid() or public.is_staff());

create policy verifications_self_update on public.verifications
  for update using (user_id = auth.uid() or public.is_staff());

create policy verifications_self_insert on public.verifications
  for insert with check (user_id = auth.uid() or public.is_staff());

-- properties: readable if linked listing is live or user is seller/staff/party
create policy properties_public_live on public.properties
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.listings l
      where l.property_id = properties.id
        and (
          l.status = 'live'
          or l.seller_id = auth.uid()
          or exists (
            select 1 from public.deals d
            where d.listing_id = l.id and public.shares_deal(d.id)
          )
        )
    )
  );

-- listings
create policy listings_public_live on public.listings
  for select using (
    status = 'live'
    or seller_id = auth.uid()
    or public.is_staff()
    or exists (
      select 1 from public.deals d
      where d.listing_id = listings.id and public.shares_deal(d.id)
    )
  );

create policy listings_seller_write on public.listings
  for all using (seller_id = auth.uid() or public.is_staff())
  with check (seller_id = auth.uid() or public.is_staff());

-- deals / parties / tasks / milestones / documents / messages / money_events
create policy deals_party_select on public.deals
  for select using (public.shares_deal(id) or public.is_staff());

create policy deal_parties_select on public.deal_parties
  for select using (public.shares_deal(deal_id) or public.is_staff());

create policy tasks_party_select on public.tasks
  for select using (public.shares_deal(deal_id) or public.is_staff());

create policy milestones_party_select on public.milestones
  for select using (public.shares_deal(deal_id) or public.is_staff());

create policy documents_party_select on public.documents
  for select using (public.shares_deal(deal_id) or public.is_staff());

create policy messages_party_select on public.messages
  for select using (public.shares_deal(deal_id) or public.is_staff());

create policy money_events_party_select on public.money_events
  for select using (public.shares_deal(deal_id) or public.is_staff());

create policy events_party_select on public.events
  for select using (public.shares_deal(deal_id) or public.is_staff());

-- offers: buyer of the row, seller-side parties, staff — not other buyers
create policy offers_select on public.offers
  for select using (
    public.is_staff()
    or buyer_id = auth.uid()
    or public.is_seller_side(deal_id)
  );

-- Writes go through server actions (service role or security-definer). Authenticated
-- clients may insert messages they send, and nothing else on these tables.
create policy messages_insert_own on public.messages
  for insert with check (
    sender_id = auth.uid() and public.shares_deal(deal_id)
  );

-- events is append-only. Authenticated clients may SELECT (via RLS). Writes go
-- through server actions using the service role. No UPDATE/DELETE for any role.
revoke all on public.events from public, anon, authenticated;
grant select on public.events to authenticated, anon;
grant select, insert on public.events to service_role;
grant usage, select on sequence public.events_id_seq to service_role;
revoke update, delete on public.events from public, anon, authenticated, service_role;

-- Realtime
alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.offers;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.milestones;
alter publication supabase_realtime add table public.messages;
