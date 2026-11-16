"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function HomeSearch() {
  const router = useRouter();
  const [address, setAddress] = useState("");

  return (
    <form
      className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const q = address.trim();
        router.push(q ? `/savings?address=${encodeURIComponent(q)}` : "/savings");
      }}
    >
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Enter your address"
        className="h-11 flex-1 rounded-[14px] border border-line bg-white px-4"
        aria-label="Home address"
      />
      <button
        type="submit"
        className="ctrl h-11 rounded-full bg-lime px-6 font-semibold text-forest"
      >
        See your net
      </button>
    </form>
  );
}
