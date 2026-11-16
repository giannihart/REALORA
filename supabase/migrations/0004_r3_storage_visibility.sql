-- Visibility lookup must be security definer so storage policies are not
-- neutered by documents RLS (missing row → coalesce to shared).

create or replace function public.document_visibility(p_document_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select visibility from public.documents where id = p_document_id;
$$;

grant execute on function public.document_visibility(uuid) to authenticated;

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
      public.document_visibility(nullif(split_part(name, '/', 2), '')::uuid),
      'shared'
    )
  )
);
