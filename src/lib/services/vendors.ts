import { vendors } from "@/data/seed";
import type { ServiceVendor } from "@/lib/types";

export interface VendorService {
  list(): Promise<ServiceVendor[]>;
  book(
    vendorId: string,
    date: string,
    time: string,
  ): Promise<{ ok: boolean; confirmation: string }>;
}

export const vendorService: VendorService = {
  async list() {
    return vendors;
  },
  async book(vendorId: string, date: string, time: string) {
    const vendor = vendors.find((v) => v.id === vendorId);
    return {
      ok: Boolean(vendor),
      confirmation: vendor
        ? `${vendor.name} · ${date} ${time}`
        : "unknown",
    };
  },
};
