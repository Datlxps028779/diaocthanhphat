import { describe, expect, it } from 'vitest';
import { calculateLoanBreakdown, roundVnd } from './loanCalculator';

describe('loan calculator arithmetic', () => {
  it('rounds every currency output to the nearest VND', () => {
    const result = calculateLoanBreakdown({
      priceInVND: 1.1 * 1e9,
      loanPct: 70,
      years: 20,
      annualRate: 8.5,
    });

    expect(result.loanAmount).toBe(770000000);
    expect(result.transferFee).toBe(22000000);
    expect(result.registrationFee).toBe(5500000);
    expect(result.totalCost).toBe(1127500000);
    expect(Number.isInteger(result.monthlyPayment)).toBe(true);
  });

  it('handles zero-interest calculations without floating artifacts', () => {
    const result = calculateLoanBreakdown({ priceInVND: 1000000001, loanPct: 50, years: 10, annualRate: 0 });
    expect(result.monthlyPayment).toBe(roundVnd(500000001 / 120));
    expect(Number.isInteger(result.monthlyPayment)).toBe(true);
  });
});
