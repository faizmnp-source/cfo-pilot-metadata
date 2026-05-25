/*
 * Workforce v2 forecast — pure functions.
 * Projects headcount, attrition, new hires, salary spend, and bonus
 * accrual over N months given a starting roster + planning assumptions.
 *
 * Roster row shape (positions / headcount facts):
 *   { positionId, count, avgSalary, attritionRatePct (annual),
 *     promotionEligibleAt (monthsFromStart), bonusTarget (% of salary) }
 *
 * Plan rows:
 *   { startMonth, positionId, count }   // new hire plan
 */

export type RosterRow = {
  positionId:           string;
  positionName?:        string;
  count:                number;
  avgSalary:            number;   // annual, in reporting currency
  attritionRatePct:     number;   // annual %; 0..100
  promotionEligibleAt?: number;   // months from start
  promotionRaisePct?:   number;   // % bump at promotion
  bonusTargetPct?:      number;   // % of salary, paid in last month of horizon
};

export type HirePlanRow = {
  startMonth: number;    // 0-indexed from forecast start
  positionId: string;
  count:      number;
  avgSalary?: number;    // optional override; defaults to roster avg
};

export type WorkforceForecast = {
  months: number;
  headcountByMonth:        number[];
  salarySpendByMonth:      number[];
  attritionLossByMonth:    number[];
  newHiresByMonth:         number[];
  promotionsByMonth:       number[];
  bonusAccrualByMonth:     number[];
  endingHeadcount:         number;
  totalSalaryAnnualised:   number;
  totalBonusAccrued:       number;
};

export function workforceForecast(
  roster: RosterRow[],
  hires: HirePlanRow[],
  months = 12,
): WorkforceForecast {
  // Work in floating headcount — we round at the end for display
  let openHc: Record<string, number>       = Object.fromEntries(roster.map(r => [r.positionId, r.count]));
  let salaryByPos: Record<string, number>  = Object.fromEntries(roster.map(r => [r.positionId, r.avgSalary]));
  const attritionMonthly: Record<string, number> = Object.fromEntries(
    roster.map(r => [r.positionId, 1 - Math.pow(1 - r.attritionRatePct / 100, 1 / 12)])
  );
  const promotedFlags: Record<string, boolean> = {};

  const headcountByMonth:     number[] = [];
  const salarySpendByMonth:   number[] = [];
  const attritionLossByMonth: number[] = [];
  const newHiresByMonth:      number[] = [];
  const promotionsByMonth:    number[] = [];
  const bonusAccrualByMonth:  number[] = [];

  for (let m = 0; m < months; m++) {
    let monthHires = 0;
    let monthLosses = 0;
    let monthPromotions = 0;

    // Attrition (monthly)
    for (const r of roster) {
      const loss = openHc[r.positionId] * attritionMonthly[r.positionId];
      openHc[r.positionId] = Math.max(0, openHc[r.positionId] - loss);
      monthLosses += loss;
    }
    // New hires
    for (const h of hires) {
      if (h.startMonth !== m) continue;
      openHc[h.positionId] = (openHc[h.positionId] ?? 0) + h.count;
      monthHires += h.count;
      // If a salary override is provided AND we don't yet have one, set it.
      if (h.avgSalary && !salaryByPos[h.positionId]) salaryByPos[h.positionId] = h.avgSalary;
    }
    // Promotions (one-shot per position when eligible month reached)
    for (const r of roster) {
      if (r.promotionEligibleAt === undefined) continue;
      if (m >= r.promotionEligibleAt && !promotedFlags[r.positionId]) {
        const raise = (r.promotionRaisePct ?? 8) / 100;
        salaryByPos[r.positionId] = (salaryByPos[r.positionId] ?? r.avgSalary) * (1 + raise);
        promotedFlags[r.positionId] = true;
        monthPromotions += openHc[r.positionId];
      }
    }

    // Salary spend for this month = sum(headcount × monthly salary)
    let salaryThisMonth = 0;
    let hcThisMonth = 0;
    for (const r of roster) {
      const sal = (salaryByPos[r.positionId] ?? r.avgSalary) / 12;
      salaryThisMonth += openHc[r.positionId] * sal;
      hcThisMonth += openHc[r.positionId];
    }

    // Bonus accrual — straight-line over the year, paid at year end
    let bonusThisMonth = 0;
    for (const r of roster) {
      const target = (r.bonusTargetPct ?? 0) / 100;
      const annualBonus = openHc[r.positionId] * (salaryByPos[r.positionId] ?? r.avgSalary) * target;
      bonusThisMonth += annualBonus / 12;
    }

    headcountByMonth.push(hcThisMonth);
    salarySpendByMonth.push(salaryThisMonth);
    attritionLossByMonth.push(monthLosses);
    newHiresByMonth.push(monthHires);
    promotionsByMonth.push(monthPromotions);
    bonusAccrualByMonth.push(bonusThisMonth);
  }

  const endingHc = headcountByMonth[headcountByMonth.length - 1] ?? 0;
  const totalSalaryAnnualised = salarySpendByMonth.reduce((a, b) => a + b, 0);
  const totalBonusAccrued = bonusAccrualByMonth.reduce((a, b) => a + b, 0);

  return {
    months,
    headcountByMonth,
    salarySpendByMonth,
    attritionLossByMonth,
    newHiresByMonth,
    promotionsByMonth,
    bonusAccrualByMonth,
    endingHeadcount: endingHc,
    totalSalaryAnnualised,
    totalBonusAccrued,
  };
}
