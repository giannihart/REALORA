import { notFound } from "next/navigation";
import { StageshowGallery } from "@/components/stageshow/StageshowGallery";
import { isLocalDataMode } from "@/lib/data/mode";

export const metadata = { title: "Stageshow · Realora" };
export const dynamic = "force-dynamic";

/** Engineering demo gallery — local data mode only. */
export default function Page() {
  if (!isLocalDataMode()) notFound();
  return <StageshowGallery />;
}
