-- One-time 6-digit email codes for sign-in / sign-up verification (Resend delivery).

create table if not exists public.auth_email_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  purpose text not null check (purpose in ('signin', 'signup')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists auth_email_codes_email_created_idx
  on public.auth_email_codes (email, created_at desc);

alter table public.auth_email_codes enable row level security;
-- No policies: client roles cannot read/write. Service role bypasses RLS.
