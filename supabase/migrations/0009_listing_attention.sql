-- Buyer saved homes (current save set). View events use the existing events table
-- as listing.viewed; 30-day save activity uses listing.saved events.

create table if not exists public.saved_homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index if not exists saved_homes_listing_id_idx on public.saved_homes (listing_id);
create index if not exists saved_homes_user_id_idx on public.saved_homes (user_id);
create index if not exists saved_homes_listing_created_idx
  on public.saved_homes (listing_id, created_at desc);

alter table public.saved_homes enable row level security;

create policy "Users read own saved homes"
  on public.saved_homes for select
  using (auth.uid() = user_id);

create policy "Users insert own saved homes"
  on public.saved_homes for insert
  with check (auth.uid() = user_id);

create policy "Users delete own saved homes"
  on public.saved_homes for delete
  using (auth.uid() = user_id);
