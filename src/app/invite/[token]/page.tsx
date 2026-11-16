"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { acceptInviteAction, previewInviteAction } from "@/lib/actions/invite";
import { useAppData } from "@/lib/data/use-app-data";
import { isLocalDataMode } from "@/lib/data/mode";
import { roleLabel, sideLabel } from "@/lib/invite-roles";
import { toast } from "sonner";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const signedIn = useAppData((s) => s.user.signedIn);
  const applySnapshot = useAppData((s) => s.applySnapshot);
  const [info, setInfo] = useState<{
    email: string;
    role: string;
    side: string;
    expired: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLocalDataMode()) return;
    void previewInviteAction(params.token).then((r) => {
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setInfo(r.data);
    });
  }, [params.token]);

  if (isLocalDataMode()) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <p className="text-sm text-muted">Invites are available in supabase mode.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-sans text-3xl font-medium tracking-tight">
          Join this deal
        </h1>
        {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}
        {info ? (
          <div className="mt-8 space-y-3 rounded-3xl border border-line bg-white p-6">
            <p className="text-sm">
              Invited as <span className="font-medium">{roleLabel(info.role)}</span> (
              {sideLabel(info.side)}) at {info.email}.
            </p>
            {info.expired ? (
              <p className="text-sm text-muted">This invite is no longer valid.</p>
            ) : signedIn ? (
              <Button
                onClick={async () => {
                  const result = await acceptInviteAction(params.token);
                  if (!result.ok) {
                    toast(result.message);
                    return;
                  }
                  applySnapshot(result.data);
                  toast("You're on the deal.");
                  router.push(info.side === "seller" ? "/portal/seller" : "/portal/buyer");
                }}
              >
                Confirm and join
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    router.push(
                      `/auth?mode=signup&next=${encodeURIComponent(`/invite/${params.token}`)}`,
                    );
                  }}
                >
                  Create account
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    router.push(
                      `/auth?next=${encodeURIComponent(`/invite/${params.token}`)}`,
                    );
                  }}
                >
                  Sign in to accept
                </Button>
              </div>
            )}
          </div>
        ) : !error ? (
          <p className="mt-4 text-sm text-muted">Loading invite…</p>
        ) : null}
      </div>
    </div>
  );
}
