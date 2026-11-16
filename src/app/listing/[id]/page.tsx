import type { Metadata } from "next";
import { listings } from "@/data/seed";
import { isSupabaseDataMode } from "@/lib/data/mode";
import { getPublicListingAction } from "@/lib/actions/listing";
import { ListingView } from "./ListingView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (isSupabaseDataMode()) {
    const result = await getPublicListingAction(id);
    const listing = result.ok ? result.data : null;
    return { title: listing ? listing.address : "Listing" };
  }
  const listing = listings.find((l) => l.id === id);
  return {
    title: listing ? listing.address : "Listing",
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = isSupabaseDataMode()
    ? await getPublicListingAction(id).then((r) => (r.ok ? r.data : null))
    : null;
  return <ListingView id={id} initial={initial} />;
}
