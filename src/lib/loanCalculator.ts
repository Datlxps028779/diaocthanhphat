export interface LoanBreakdown {
  loanAmount: number;
  monthlyPayment: number;
  transferFee: number;
  registrationFee: number;
  totalCost: number;
}

export function roundVnd(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function calculateLoanBreakdown(input: {
  priceInVND: number;
  loanPct: number;
  years: number;
  annualRate: number;
}): LoanBreakdown {
  const price = roundVnd(input.priceInVND);
  const loanAmount = roundVnd(price * (input.loanPct / 100));
  const monthlyRate = input.annualRate / 100 / 12;
  const months = input.years * 12;
  const monthlyRaw = monthlyRate === 0
    ? loanAmount / months
    : loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
  const transferFee = roundVnd(price * 0.02);
  const registrationFee = roundVnd(price * 0.005);
  return {
    loanAmount,
    monthlyPayment: roundVnd(monthlyRaw),
    transferFee,
    registrationFee,
    totalCost: price + transferFee + registrationFee,
  };
}
