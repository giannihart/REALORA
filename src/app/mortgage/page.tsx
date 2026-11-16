import { Suspense } from "react";
import { MortgageIntakeView } from "@/components/mortgage/MortgageIntakeView";

export default function MortgagePage() {
  return (
    <Suspense fallback={null}>
      <MortgageIntakeView />
    </Suspense>
  );
}
