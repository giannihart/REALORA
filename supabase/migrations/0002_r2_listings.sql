-- R2: listing coordinates, ACRIS cache timestamp, nullable public-record payload,
-- and the public listing-media bucket.

alter table public.properties
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists acris_fetched_at timestamptz;

alter table public.properties
  alter column acris_payload drop not null;

alter table public.properties
  alter column acris_payload set default null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists listing_media_public_read on storage.objects;
create policy listing_media_public_read
on storage.objects
for select
using (bucket_id = 'listing-media');

drop policy if exists listing_media_seller_insert on storage.objects;
create policy listing_media_seller_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-media'
  and (
    public.is_staff()
    or exists (
      select 1 from public.listings l
      where l.seller_id = auth.uid()
        and split_part(name, '/', 1) = l.id::text
    )
  )
);

drop policy if exists listing_media_seller_update on storage.objects;
create policy listing_media_seller_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'listing-media'
  and (
    public.is_staff()
    or exists (
      select 1 from public.listings l
      where l.seller_id = auth.uid()
        and split_part(name, '/', 1) = l.id::text
    )
  )
)
with check (
  bucket_id = 'listing-media'
  and (
    public.is_staff()
    or exists (
      select 1 from public.listings l
      where l.seller_id = auth.uid()
        and split_part(name, '/', 1) = l.id::text
    )
  )
);

drop policy if exists listing_media_seller_delete on storage.objects;
create policy listing_media_seller_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-media'
  and (
    public.is_staff()
    or exists (
      select 1 from public.listings l
      where l.seller_id = auth.uid()
        and split_part(name, '/', 1) = l.id::text
    )
  )
);
