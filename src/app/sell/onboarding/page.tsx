import { Suspense } from "react";
import { SellOnboardingView } from "@/components/sell/SellOnboardingView";

/** Deep-link alias — prefer `/sell` for nav. Keeps resume / handoff URLs working. */
export default function SellOnboardingPage() {
  return (
    <Suspense>
      <SellOnboardingView />
    </Suspense>
  );
}
