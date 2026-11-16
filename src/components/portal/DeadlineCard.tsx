import { Eyebrow } from "@/components/shared/Eyebrow";
import type { Deadline } from "@/lib/types";

export function DeadlineCard({ deadline }: { deadline: Deadline }) {
  return (
    <div className="rounded-[20px] bg-white px-6 py-4">
      <Eyebrow className="text-muted">Next deadline</Eyebrow>
      <p className="mt-2 font-semibold">
        {deadline.item} · {deadline.date}
      </p>
    </div>
  );
}
