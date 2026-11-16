import { StatusPill } from "@/components/shared/StatusPill";
import type { HandlingTask } from "@/lib/types";

export function HandlingList({ tasks }: { tasks: HandlingTask[] }) {
  return (
    <section>
      <h3 className="text-lg font-medium tracking-tight">Realora is handling it</h3>
      <p className="mt-1 text-sm text-muted">
        No action needed from you on these items.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center justify-between gap-4 rounded-[20px] border border-line bg-white p-6 shadow-card"
          >
            <div>
              <p className="font-semibold">{task.title}</p>
              <p className="text-sm text-muted">{task.description}</p>
            </div>
            <StatusPill label={task.status} mutedProgress />
          </li>
        ))}
      </ul>
    </section>
  );
}
