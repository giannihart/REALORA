-- Buying Power profile. Buyers read/write only their own row.
-- Spec named 0007; that slot is taken by public sold listings.

create table if not exists public.buying_power_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  annual_income_cents bigint not null check (annual_income_cents >= 0),
  monthly_debts_cents bigint not null check (monthly_debts_cents >= 0),
  down_payment_cents bigint not null check (down_payment_cents >= 0),
  credit_band text not null check (credit_band in ('excellent', 'good', 'fair', 'building')),
  rate_pct numeric not null check (rate_pct > 0 and rate_pct < 30),
  term_years int not null check (term_years in (15, 30)),
  updated_at timestamptz not null default now()
);

alter table public.buying_power_profiles enable row level security;

drop policy if exists buying_power_select_own on public.buying_power_profiles;
create policy buying_power_select_own on public.buying_power_profiles
  for select using (auth.uid() = user_id);

drop policy if exists buying_power_insert_own on public.buying_power_profiles;
create policy buying_power_insert_own on public.buying_power_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists buying_power_update_own on public.buying_power_profiles;
create policy buying_power_update_own on public.buying_power_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists buying_power_delete_own on public.buying_power_profiles;
create policy buying_power_delete_own on public.buying_power_profiles
  for delete using (auth.uid() = user_id);
