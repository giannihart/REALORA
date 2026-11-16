"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LocationSearch } from "@/components/marketplace/LocationSearch";

export function HomeSearchBar() {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [listRoot, setListRoot] = useState<HTMLDivElement | null>(null);

  function search() {
    const params = new URLSearchParams();
    if (location.trim()) params.set("location", location.trim());
    const q = params.toString();
    router.push(q ? `/buy?${q}` : "/buy");
  }

  return (
    <div ref={setListRoot} className="relative z-30 w-full max-w-xl">
      <form
        className="flex w-full items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <div className="min-w-0 flex-1">
          <LocationSearch
            variant="bare"
            placement="top"
            listRoot={listRoot}
            value={location}
            onChange={setLocation}
            className="w-full"
            placeholder="Enter a city, neighborhood, or address"
          />
        </div>
        <Button type="submit" variant="lime" className="h-11 shrink-0 gap-2 px-5">
          <Search size={16} strokeWidth={2} />
          Search
        </Button>
      </form>
    </div>
  );
}
