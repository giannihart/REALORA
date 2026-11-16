"use client";

import { useState } from "react";

export default function MessageComposer({
  onSend,
}: {
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <form
      className="flex gap-2 border-t border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        onSend(text);
        setDraft("");
      }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write a message"
        className="h-11 flex-1 rounded-[14px] border border-line bg-cream px-3"
      />
      <button
        type="submit"
        className="ctrl h-11 rounded-full bg-forest-deep px-5 text-sm font-semibold text-cream"
      >
        Send
      </button>
    </form>
  );
}
