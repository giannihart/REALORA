import { Suspense } from "react";
import { SellOnboardingView } from "@/components/sell/SellOnboardingView";

export default function SellPage() {
  return (
    <Suspense>
      <SellOnboardingView />
    </Suspense>
  );
}
