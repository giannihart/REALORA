export const metadata = { title: "Fair Housing" };

export default function FairHousingPage() {
  return (
    <article className="mx-auto max-w-[760px] px-4 py-16 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Fair Housing</h1>
      <p className="mt-6 text-[15px] leading-7 text-forest/80">
        REALORA supports Equal Housing Opportunity. We encourage and support an affirmative
        advertising and marketing program in which there are no barriers to obtaining housing
        because of race, color, religion, sex, handicap, familial status, or national origin.
      </p>
      <p className="mt-6 text-[15px] leading-7 text-forest/80">
        If you believe you have experienced discrimination in housing, you may file a complaint
        with the U.S. Department of Housing and Urban Development or the New York State Division
        of Human Rights.
      </p>
    </article>
  );
}
