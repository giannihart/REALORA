import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { notify } from "@/lib/services/notifications";
import { siteUrl } from "@/lib/site";

/** One email after Fully executed — vault copy for the seller's records. */
export async function emailExecutedAgreementCopy(
  admin: SupabaseClient<Database>,
  dealId: string,
  documentId: string,
) {
  const { data: parties } = await admin.from("deal_parties").select("*").eq("deal_id", dealId);
  const seller = (parties ?? []).find((p) => p.role === "seller");
  if (!seller?.user_id) return;
  const { data: deal } = await admin.from("deals").select("listing_id").eq("id", dealId).maybeSingle();
  let address = "your property";
  if (deal) {
    const { data: listing } = await admin
      .from("listings")
      .select("property_id")
      .eq("id", deal.listing_id)
      .maybeSingle();
    if (listing) {
      const { data: property } = await admin
        .from("properties")
        .select("address_line")
        .eq("id", listing.property_id)
        .maybeSingle();
      if (property?.address_line) address = property.address_line;
    }
  }
  const link = `${siteUrl()}/portal/seller/documents`;
  await notify(
    seller.user_id,
    "agreement.executed_copy",
    {
      address,
      name: "Listing agreement",
      link,
      document_id: documentId,
      siteUrl: siteUrl(),
    },
    { dealId },
  );
}
