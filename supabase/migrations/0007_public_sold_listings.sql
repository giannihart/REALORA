-- Public marketplace can read closed (sold) listings the same way as live ones.

drop policy if exists properties_public_live on public.properties;
create policy properties_public_live on public.properties
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.listings l
      where l.property_id = properties.id
        and (
          l.status in ('live', 'closed')
          or l.seller_id = auth.uid()
          or exists (
            select 1 from public.deals d
            where d.listing_id = l.id and public.shares_deal(d.id)
          )
        )
    )
  );

drop policy if exists listings_public_live on public.listings;
create policy listings_public_live on public.listings
  for select using (
    status in ('live', 'closed')
    or seller_id = auth.uid()
    or public.is_staff()
    or exists (
      select 1 from public.deals d
      where d.listing_id = listings.id and public.shares_deal(d.id)
    )
  );
