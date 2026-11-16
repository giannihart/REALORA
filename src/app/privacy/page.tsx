/* TODO(founder): legal review before public launch */

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-[760px] px-4 py-16 lg:px-8">
      {/* TODO(founder): legal review before public launch */}
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: October 2026</p>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">What we collect</h2>
        <p className="text-[15px] leading-7 text-forest/80">
          When you use REALORA we may collect the information you type into search, listing,
          mortgage, and sell tools — such as a location, a price, or an email you use to sign
          in — plus basic technical data the browser sends to keep the site working.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">How we use it</h2>
        <p className="text-[15px] leading-7 text-forest/80">
          We use that information to show homes, run the Net Sheet and mortgage estimates, and
          operate the transaction portal. We do not sell it.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">What we never do</h2>
        <p className="text-[15px] leading-7 text-forest/80">
          We never hold buyer deposits or escrow funds; deposits are held by the seller&apos;s
          attorney&apos;s escrow. We do not use this site to collect payment card numbers for a
          home purchase.
        </p>
      </section>
    </article>
  );
}
