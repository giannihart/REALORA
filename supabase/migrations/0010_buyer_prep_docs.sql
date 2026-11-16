-- Allow buyer financing docs (PoF / pre-approval) before a deal exists.
alter table public.documents
  alter column deal_id drop not null;

comment on column public.documents.deal_id is
  'Deal vault scope. Null for pre-offer buyer prep uploads (uploader-scoped).';
