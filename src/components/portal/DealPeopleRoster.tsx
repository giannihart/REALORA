"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { invitePartyAction } from "@/lib/actions/invite";
import { useAppData } from "@/lib/data/use-app-data";
import {
  defaultInviteRoleForPortal,
  inviteRoleOptions,
  roleLabel,
  sideLabel,
  type InviteRole,
} from "@/lib/invite-roles";
import type { DealRosterEntry, Role } from "@/lib/types";

export function DealPeopleRoster({
  dealId,
  portalRole,
  canInvite,
}: {
  dealId: string | null;
  portalRole: Role;
  canInvite: boolean;
}) {
  const roster = useAppData((s) => s.dealRoster ?? []);
  const applySnapshot = useAppData((s) => s.applySnapshot);
  const [open, setOpen] = useState(false);
  const [preselect, setPreselect] = useState<InviteRole | null>(null);

  if (!dealId) return null;

  return (
    <div className="mt-5 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-forest">People on this deal</p>
          <p className="mt-1 text-xs text-muted">
            Parties and pending invites for this transaction.
          </p>
        </div>
        {canInvite ? (
          <Button
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => {
              setPreselect(defaultInviteRoleForPortal(portalRole === "seller" ? "seller" : "buyer"));
              setOpen(true);
            }}
          >
            Invite
          </Button>
        ) : null}
      </div>

      <ul className="mt-4 divide-y divide-line">
        {roster.length === 0 ? (
          <li className="py-3 text-sm text-muted">No parties listed yet.</li>
        ) : (
          roster.map((entry) => (
            <RosterRow
              key={entry.id}
              entry={entry}
              canInvite={canInvite}
              dealId={dealId}
              onReinvite={(url) => {
                toast("Invite refreshed. Share the link.");
                if (url) toast(url);
              }}
              onInvited={applySnapshot}
            />
          ))
        )}
      </ul>

      <InvitePartyModal
        open={open}
        dealId={dealId}
        initialRole={preselect ?? defaultInviteRoleForPortal(portalRole === "seller" ? "seller" : "buyer")}
        onClose={() => setOpen(false)}
        onInvited={(snap, url) => {
          applySnapshot(snap);
          setOpen(false);
          toast("Invite created. Share the link.");
          if (url) toast(url);
        }}
      />
    </div>
  );
}

function RosterRow({
  entry,
  canInvite,
  dealId,
  onReinvite,
  onInvited,
}: {
  entry: DealRosterEntry;
  canInvite: boolean;
  dealId: string;
  onReinvite: (url: string | null) => void;
  onInvited: (snap: import("@/lib/actions/snapshot").AppSnapshot) => void;
}) {
  const pending = entry.kind === "invite";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-forest">{entry.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {roleLabel(entry.role)} · {sideLabel(entry.side)}
          {pending ? " · Invited · awaiting acceptance" : ""}
        </p>
      </div>
      {pending && canInvite ? (
        <Button
          variant="ghost"
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => {
            void invitePartyAction(dealId, entry.email, entry.role as InviteRole).then((r) => {
              if (!r.ok) {
                toast(r.message);
                return;
              }
              onInvited(r.data.snapshot);
              onReinvite(r.data.url);
            });
          }}
        >
          Re-invite
        </Button>
      ) : null}
    </li>
  );
}

export function InvitePartyModal({
  open,
  dealId,
  initialRole,
  onClose,
  onInvited,
}: {
  open: boolean;
  dealId: string;
  initialRole: InviteRole;
  onClose: () => void;
  onInvited: (snap: import("@/lib/actions/snapshot").AppSnapshot, url: string) => void;
}) {
  const options = useMemo(() => inviteRoleOptions(), []);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>(initialRole);

  useEffect(() => {
    if (open) setRole(initialRole);
  }, [open, initialRole]);

  return (
    <Modal open={open} title="Invite a professional" onClose={onClose} showClose>
      <p className="text-xs text-muted">Link expires in 7 days.</p>
      <label className="mt-3 block text-sm font-medium">
        Email
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 h-11 w-full rounded-[14px] border border-line px-3"
          placeholder="name@firm.com"
        />
      </label>
      <MenuSelect
        className="mt-3"
        label="Role"
        value={role}
        options={options}
        onChange={(v) => setRole(v as InviteRole)}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="lime"
          className="rounded-xl"
          onClick={() => {
            void invitePartyAction(dealId, email, role).then((r) => {
              if (!r.ok) {
                toast(r.message);
                return;
              }
              setEmail("");
              onInvited(r.data.snapshot, r.data.url);
            });
          }}
        >
          Send invite
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
