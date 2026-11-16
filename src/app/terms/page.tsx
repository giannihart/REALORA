/* TODO(founder): legal review before public launch */

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-[760px] px-4 py-16 lg:px-8">
      {/* TODO(founder): legal review before public launch */}
      <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
      <p className="mt-2 text-sm text-muted">Last updated: October 2026</p>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Using this site</h2>
        <p className="text-[15px] leading-7 text-forest/80">
          REALORA is in formation and is not yet a licensed New York real estate broker.
          Figures, listings, and tools on this site are for illustration until brokerage
          services are offered through a license or a licensed broker partner.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Estimates are not promises</h2>
        <p className="text-[15px] leading-7 text-forest/80">
          Home-value, savings, and payment figures are estimates. They are not an appraisal,
          a guarantee of sale price, or a guarantee that an offer will be made or accepted.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">What we never do</h2>
        <p className="text-[15px] leading-7 text-forest/80">
          We never hold buyer deposits or escrow funds; deposits are held by the seller&apos;s
          attorney&apos;s escrow.
        </p>
      </section>
    </article>
  );
}
