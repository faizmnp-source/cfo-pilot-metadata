// Generate a OneStream-style Time dimension from a fiscal-year start month.
// Hierarchy produced (single year, fiscalYearStart=1=January):
//
//   FY2026
//   ├─ Q1-2026 (Jan, Feb, Mar)
//   ├─ Q2-2026 (Apr, May, Jun)
//   ├─ Q3-2026 (Jul, Aug, Sep)
//   └─ Q4-2026 (Oct, Nov, Dec)
//
// For fiscalYearStart=4 (April), FY2026 spans Apr-2026 → Mar-2027 and Q1 starts in April.

export type TimePeriodNode = {
  code: string;          // 'FY2026', 'Q1-FY2026', '2026M03'
  name: string;          // 'FY 2026', 'Q1 FY2026', 'March 2026'
  type: "YEAR" | "QUARTER" | "MONTH";
  parentCode: string | null;
  fiscalYear: number;
  startDate: string;     // YYYY-MM-DD
  endDate: string;       // YYYY-MM-DD
  monthIndex?: number;   // 0..11 (calendar month)
  quarterIndex?: number; // 1..4
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysIn(year: number, monthIdx: number): number {
  if (monthIdx === 1) return isLeap(year) ? 29 : 28;
  return MONTH_DAYS[monthIdx];
}

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, "0");
}

/**
 * Build the Time dimension nodes for a range of fiscal years.
 *
 * @param fiscalYearStartMonth 1..12 (1=Jan, 4=April, 7=July, 10=Oct)
 * @param startFY               first fiscal year to generate (e.g. 2024)
 * @param numYears              how many years to generate
 */
export function generateTimePeriods(
  fiscalYearStartMonth: number,
  startFY: number,
  numYears: number,
): TimePeriodNode[] {
  if (fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new Error("fiscalYearStartMonth must be 1..12");
  }
  if (numYears < 1 || numYears > 30) {
    throw new Error("numYears must be 1..30");
  }

  const nodes: TimePeriodNode[] = [];

  for (let i = 0; i < numYears; i++) {
    const fy = startFY + i;
    const yearCode = `FY${fy}`;
    const yearStartCalYear = fiscalYearStartMonth === 1 ? fy : fy;
    const yearStartMonthIdx = fiscalYearStartMonth - 1;
    const yearStart = `${yearStartCalYear}-${pad(fiscalYearStartMonth)}-01`;

    // Year ends 12 months later, last day of that month.
    const endCalYear = fiscalYearStartMonth === 1 ? fy : fy + 1;
    const endMonthIdx = (yearStartMonthIdx + 11) % 12;
    const yearEnd = `${endCalYear}-${pad(endMonthIdx + 1)}-${pad(daysIn(endCalYear, endMonthIdx))}`;

    // Year node
    nodes.push({
      code: yearCode,
      name: `FY ${fy}`,
      type: "YEAR",
      parentCode: null,
      fiscalYear: fy,
      startDate: yearStart,
      endDate: yearEnd,
    });

    // 4 quarters, 3 months each
    for (let q = 1; q <= 4; q++) {
      const qStartOffset = (q - 1) * 3;
      const qStartCalMonth = ((yearStartMonthIdx + qStartOffset) % 12) + 1;
      const qStartCalYear =
        yearStartCalYear + Math.floor((yearStartMonthIdx + qStartOffset) / 12);

      const qEndOffset = qStartOffset + 2;
      const qEndCalMonth = ((yearStartMonthIdx + qEndOffset) % 12) + 1;
      const qEndCalYear =
        yearStartCalYear + Math.floor((yearStartMonthIdx + qEndOffset) / 12);

      const qCode = `Q${q}-FY${fy}`;
      nodes.push({
        code: qCode,
        name: `Q${q} FY${fy}`,
        type: "QUARTER",
        parentCode: yearCode,
        fiscalYear: fy,
        quarterIndex: q,
        startDate: `${qStartCalYear}-${pad(qStartCalMonth)}-01`,
        endDate: `${qEndCalYear}-${pad(qEndCalMonth)}-${pad(daysIn(qEndCalYear, qEndCalMonth - 1))}`,
      });

      // 3 months in this quarter
      for (let m = 0; m < 3; m++) {
        const monthOffset = qStartOffset + m;
        const calMonthIdx = (yearStartMonthIdx + monthOffset) % 12;
        const calYear =
          yearStartCalYear + Math.floor((yearStartMonthIdx + monthOffset) / 12);
        const monthCode = `${calYear}M${pad(calMonthIdx + 1)}`;
        nodes.push({
          code: monthCode,
          name: `${MONTH_NAMES[calMonthIdx]} ${calYear}`,
          type: "MONTH",
          parentCode: qCode,
          fiscalYear: fy,
          monthIndex: calMonthIdx,
          quarterIndex: q,
          startDate: `${calYear}-${pad(calMonthIdx + 1)}-01`,
          endDate: `${calYear}-${pad(calMonthIdx + 1)}-${pad(daysIn(calYear, calMonthIdx))}`,
        });
      }
    }
  }

  return nodes;
}

export const FISCAL_YEAR_START_OPTIONS = [
  { value: 1,  label: "January (calendar year)",  description: "FY2026 = Jan 2026 – Dec 2026" },
  { value: 4,  label: "April",                     description: "FY2026 = Apr 2026 – Mar 2027 (India standard)" },
  { value: 7,  label: "July",                      description: "FY2026 = Jul 2026 – Jun 2027" },
  { value: 10, label: "October",                   description: "FY2026 = Oct 2026 – Sep 2027 (US federal)" },
];
