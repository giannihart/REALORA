import { getApprovalsQueueAction, listAssignableUsersAction } from "@/lib/actions/broker";
import { PreapprovalConfirmQueue } from "@/components/portal/PreapprovalConfirmQueue";
import { ApprovalsClient } from "./ApprovalsClient";

export default async function BrokerApprovalsPage() {
  const [queue, users] = await Promise.all([getApprovalsQueueAction(), listAssignableUsersAction()]);
  if (!queue.ok) return <p className="text-sm text-muted">{queue.message}</p>;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-sans text-2xl font-medium tracking-tight text-forest">Approvals</h1>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-forest">Pre-approval letters</h2>
        <p className="text-sm text-muted">
          Record the approved amount, lender, and date from the letter. This flips the buyer&apos;s
          number platform-wide — it does not write cash funds_status.
        </p>
        <PreapprovalConfirmQueue />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-forest">Supervision packets</h2>
        <ApprovalsClient packets={queue.data} users={users.ok ? users.data : []} />
      </section>
    </div>
  );
}
