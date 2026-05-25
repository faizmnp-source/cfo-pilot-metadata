import { workforceForecast } from "./forecast";

describe("workforceForecast", () => {
  it("preserves headcount with 0 attrition and no hires", () => {
    const r = workforceForecast(
      [{ positionId: "P1", count: 10, avgSalary: 1_200_000, attritionRatePct: 0 }],
      [], 12,
    );
    expect(r.endingHeadcount).toBeCloseTo(10, 1);
    expect(r.attritionLossByMonth.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 5);
  });

  it("loses ~10% headcount in a year with 10% annual attrition", () => {
    const r = workforceForecast(
      [{ positionId: "P1", count: 100, avgSalary: 1_000_000, attritionRatePct: 10 }],
      [], 12,
    );
    expect(r.endingHeadcount).toBeLessThan(91);
    expect(r.endingHeadcount).toBeGreaterThan(89);
  });

  it("adds new hires at the right month", () => {
    const r = workforceForecast(
      [{ positionId: "P1", count: 10, avgSalary: 1_000_000, attritionRatePct: 0 }],
      [{ positionId: "P1", count: 5, startMonth: 6 }], 12,
    );
    expect(r.headcountByMonth[5]).toBeCloseTo(10, 1);
    expect(r.headcountByMonth[6]).toBeCloseTo(15, 1);
    expect(r.endingHeadcount).toBeCloseTo(15, 1);
  });

  it("applies promotion raise once at the eligible month", () => {
    const r = workforceForecast(
      [{ positionId: "P1", count: 1, avgSalary: 1_000_000, attritionRatePct: 0, promotionEligibleAt: 6, promotionRaisePct: 10 }],
      [], 12,
    );
    // Pre-promotion: salary = 1_000_000/12 = 83_333 per month
    expect(r.salarySpendByMonth[0]).toBeCloseTo(83333, 0);
    // Post-promotion: salary = 1_100_000/12 = 91_666 per month
    expect(r.salarySpendByMonth[11]).toBeCloseTo(91666, 0);
    expect(r.promotionsByMonth[6]).toBeGreaterThan(0);
  });

  it("accrues bonus straight-line", () => {
    const r = workforceForecast(
      [{ positionId: "P1", count: 10, avgSalary: 1_200_000, attritionRatePct: 0, bonusTargetPct: 12 }],
      [], 12,
    );
    // Annual bonus = 10 * 1.2M * 12% = 1.44M; per month ≈ 120k
    expect(r.bonusAccrualByMonth[0]).toBeCloseTo(120_000, -2);
    expect(r.totalBonusAccrued).toBeCloseTo(1_440_000, -3);
  });
});
