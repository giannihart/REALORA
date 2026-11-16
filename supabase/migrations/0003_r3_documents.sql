-- R3: private deal vault, document visibility, extraction payload, contract reference.

alter table public.documents
  add column if not exists visibility text not null default 'shared'
    check (visibility in ('shared', 'seller_side', 'buyer_side')),
  add column if not exists extracted jsonb,
  add column if not exists signature_request_id text;

alter table public.deals
  add column if not exists contract_document_id uuid references public.documents (id);

create or replace function public.is_buyer_side(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.deal_parties
    where deal_id = p_deal_id and user_id = auth.uid() and side = 'buyer'
  );
$$;

create or replace function public.can_access_document(p_deal_id uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_staff()
    or exists (
      select 1 from public.deal_parties
      where deal_id = p_deal_id
        and user_id = auth.uid()
        and role = 'broker_of_record'
    )
    or (
      public.shares_deal(p_deal_id)
      and (
        p_visibility = 'shared'
        or (p_visibility = 'seller_side' and public.is_seller_side(p_deal_id))
        or (p_visibility = 'buyer_side' and public.is_buyer_side(p_deal_id))
      )
    );
$$;

grant execute on function public.is_buyer_side(uuid) to authenticated;
grant execute on function public.can_access_document(uuid, text) to authenticated;

drop policy if exists documents_party_select on public.documents;
create policy documents_visibility_select on public.documents
  for select using (
    (status is distinct from 'deleted')
    and public.can_access_document(deal_id, visibility)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-documents',
  'deal-documents',
  false,
  26214400,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists deal_documents_select on storage.objects;
create policy deal_documents_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'deal-documents'
  and public.can_access_document(
    nullif(split_part(name, '/', 1), '')::uuid,
    coalesce(
      (
        select d.visibility from public.documents d
        where d.id::text = split_part(name, '/', 2)
        limit 1
      ),
      'shared'
    )
  )
);

drop policy if exists deal_documents_insert on storage.objects;
create policy deal_documents_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'deal-documents'
  and (
    public.is_staff()
    or public.shares_deal(nullif(split_part(name, '/', 1), '')::uuid)
  )
);

drop policy if exists deal_documents_update on storage.objects;
create policy deal_documents_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'deal-documents'
  and (public.is_staff() or public.shares_deal(nullif(split_part(name, '/', 1), '')::uuid))
)
with check (
  bucket_id = 'deal-documents'
  and (public.is_staff() or public.shares_deal(nullif(split_part(name, '/', 1), '')::uuid))
);

drop policy if exists deal_documents_delete on storage.objects;
create policy deal_documents_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'deal-documents'
  and public.is_staff()
);
