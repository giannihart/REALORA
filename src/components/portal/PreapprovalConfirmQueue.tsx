"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import {
  confirmPreApprovalDocsAction,
  listPendingPreapprovalConfirmationsAction,
} from "@/lib/actions/verification";
import { formatNumber } from "@/lib/format";

type Row = {
  userId: string;
  name: string;
  email: string | null;
  documentId: string;
  documentName: string;
  packetLenderName: string | null;
};

export function PreapprovalConfirmQueue() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [lender, setLender] = useState<Record<string, string>>({});
  const [date, setDate] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const result = await listPendingPreapprovalConfirmationsAction();
    if (result.ok) {
      setRows(result.data);
      const lenders: Record<string, string> = {};
      const dates: Record<string, string> = {};
      for (const row of result.data) {
        if (row.packetLenderName) lenders[row.userId] = row.packetLenderName;
        dates[row.userId] = new Date().toISOString().slice(0, 10);
      }
      setLender((prev) => ({ ...lenders, ...prev }));
      setDate((prev) => ({ ...dates, ...prev }));
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function confirm(row: Row) {
    const dollars = Number((amount[row.userId] ?? "").replace(/\D/g, ""));
    const lenderName = (lender[row.userId] ?? "").trim();
    const day = date[row.userId] || new Date().toISOString().slice(0, 10);
    if (!(dollars > 0)) {
      toast("Enter the approved amount from the letter.");
      return;
    }
    if (!lenderName) {
      toast("Enter the lender name from the letter.");
      return;
    }
    setBusyId(row.userId);
    try {
      const result = await confirmPreApprovalDocsAction(row.userId, {
        approvedAmountCents: dollars * 100,
        lenderName,
        confirmedAt: `${day}T12:00:00.000Z`,
      });
      if (!result.ok) {
        toast(result.message);
        return;
      }
      toast("Pre-approval confirmed.");
      router.refresh();
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading pre-approval queue…</p>;
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-muted">No pre-approval letters awaiting confirmation.</p>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li
          key={row.userId}
          className="rounded-2xl border border-line bg-white px-4 py-4 sm:px-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-forest">{row.name}</p>
              <p className="text-xs text-muted">
                {row.email ?? row.userId} · {row.documentName}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-muted">Approved amount</span>
              <input
                className="mt-1 h-10 w-full rounded-xl border border-line bg-cream px-3 nums text-sm"
                inputMode="numeric"
                placeholder="$ 0"
                value={
                  amount[row.userId]
                    ? `$ ${formatNumber(Number(amount[row.userId].replace(/\D/g, "") || 0))}`
                    : ""
                }
                onChange={(e) =>
                  setAmount((prev) => ({
                    ...prev,
                    [row.userId]: e.target.value.replace(/\D/g, ""),
                  }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Lender (from letter)</span>
              <input
                className="mt-1 h-10 w-full rounded-xl border border-line bg-cream px-3 text-sm"
                value={lender[row.userId] ?? ""}
                onChange={(e) =>
                  setLender((prev) => ({ ...prev, [row.userId]: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Confirmation date</span>
              <input
                type="date"
                className="mt-1 h-10 w-full rounded-xl border border-line bg-cream px-3 text-sm"
                value={date[row.userId] ?? ""}
                onChange={(e) =>
                  setDate((prev) => ({ ...prev, [row.userId]: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="mt-3">
            <Button
              type="button"
              variant="lime"
              className="rounded-xl"
              disabled={busyId === row.userId}
              onClick={() => void confirm(row)}
            >
              Confirm pre-approval
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
