"use client";

import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function SignInModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <Modal open={open} title="Sign in" onClose={onClose}>
      <p className="mb-5 text-sm leading-6 text-muted">
        Sign in to your Realora account to continue to the buyer or seller portal.
      </p>
      <Button
        onClick={() => {
          onClose();
          router.push("/auth");
        }}
      >
        Continue to sign in
      </Button>
    </Modal>
  );
}
