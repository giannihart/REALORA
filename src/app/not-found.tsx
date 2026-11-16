import { Button } from "@/components/ui/Button";

export const metadata = {
  title: "Not found",
};

export default function NotFound() {
  return (
    <div>
      <section className="mx-auto max-w-4xl px-4 py-16">
        <p className="text-sm text-muted">404</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          That page could not be found.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-forest/80">
          Listings, portals, and tools live on the routes in the nav. Start from
          Buy or open the Portal.
        </p>
        <div className="mt-10 flex gap-3">
          <Button href="/buy">Browse homes</Button>
          <Button href="/" variant="outline">
            Home
          </Button>
        </div>
      </section>
    </div>
  );
}
