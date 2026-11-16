-- Listing agreement brokerage countersign on the R5 approvals surface.

alter table public.approvals
  drop constraint if exists approvals_kind_check;

alter table public.approvals
  add constraint approvals_kind_check check (kind in (
    'contract_execution',
    'deposit_confirmation',
    'designated_agency',
    'listing_publish',
    'verification_review',
    'extraction_confirmation',
    'listing_agreement_countersign'
  ));
