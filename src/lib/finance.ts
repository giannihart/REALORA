export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  termYears: number,
) {
  const monthlyRate = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (monthlyRate === 0) return principal / n;
  const factor = Math.pow(1 + monthlyRate, n);
  return (principal * monthlyRate * factor) / (factor - 1);
}

export function defaultInsuranceAnnual(price: number) {
  return Math.round(Math.min(14_400, Math.max(3_600, price * 0.00035)));
}

export function estimatePayment(options: {
  price: number;
  downPaymentPct: number;
  annualRatePct: number;
  termYears: number;
  taxRatePct?: number;
  annualTaxes?: number;
  insuranceAnnual?: number;
  hoaMonthly?: number;
  includePmi?: boolean;
  utilitiesMonthly?: number;
}) {
  const {
    price,
    downPaymentPct,
    annualRatePct,
    termYears,
    taxRatePct = 1.1,
    annualTaxes,
    insuranceAnnual,
    hoaMonthly = 0,
    includePmi = true,
    utilitiesMonthly = 0,
  } = options;
  const downPayment = price * (downPaymentPct / 100);
  const loanAmount = Math.max(price - downPayment, 0);
  const principalAndInterest = monthlyPayment(
    loanAmount,
    annualRatePct,
    termYears,
  );
  const taxes =
    annualTaxes != null
      ? annualTaxes / 12
      : (price * (taxRatePct / 100)) / 12;
  const insuranceYear = insuranceAnnual ?? defaultInsuranceAnnual(price);
  const insurance = insuranceYear / 12;
  const mortgageInsurance =
    includePmi && downPaymentPct < 20 ? (loanAmount * 0.0055) / 12 : 0;
  const hoa = Math.max(0, hoaMonthly);
  const utilities = Math.max(0, utilitiesMonthly);
  return {
    downPayment,
    loanAmount,
    principalAndInterest,
    mortgageInsurance,
    taxes,
    insurance,
    insuranceAnnual: insuranceYear,
    hoa,
    utilities,
    total:
      principalAndInterest +
      mortgageInsurance +
      taxes +
      insurance +
      hoa +
      utilities,
  };
}
