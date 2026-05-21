/**
 * POST /api/metadata/time/generate
 * Generates a full OneStream-style time hierarchy for one or more fiscal years.
 * Hierarchy: Year → HY → Q → Month
 *
 * Body: { years: number[], fiscalYearStart?: number (1-12, default 1=Jan) }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const GenerateSchema = z.object({
  years:            z.array(z.number().int().min(2000).max(2100)).min(1).max(10),
  fiscalYearStart:  z.number().int().min(1).max(12).default(1),  // 1=Jan, 4=Apr (India)
  overwrite:        z.boolean().default(false),
});

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function getLastDay(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

/** Build padded ISO date string */
function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

interface TimePeriod {
  code:         string;
  name:         string;
  periodType:   string;
  fiscalYear:   number;
  fiscalPeriod: number | null;
  startDate:    Date;
  endDate:      Date;
  sortOrder:    number;
  parentCode:   string | null;
}

function buildHierarchy(calYear: number, fyStart: number): TimePeriod[] {
  const periods: TimePeriod[] = [];
  // For FY starting in April (fyStart=4): FY2026 = Apr-2026 to Mar-2027
  // For standard Jan FY (fyStart=1): FY2026 = Jan-2026 to Dec-2026

  // Determine the 12 calendar months in this fiscal year
  const fyMonths: Array<{ calYear: number; month: number }> = [];
  for (let i = 0; i < 12; i++) {
    let m = fyStart + i;
    let y = calYear;
    if (m > 12) { m -= 12; y += 1; }
    fyMonths.push({ calYear: y, month: m });
  }

  const fyCode   = `${calYear}`;
  const fyStart_ = fyMonths[0];
  const fyEnd_   = fyMonths[11];

  // ── Year ───────────────────────────────────────────────────────────────────
  periods.push({
    code:         fyCode,
    name:         fyCode,
    periodType:   "YEAR",
    fiscalYear:   calYear,
    fiscalPeriod: null,
    startDate:    new Date(isoDate(fyStart_.calYear, fyStart_.month, 1)),
    endDate:      new Date(isoDate(fyEnd_.calYear, fyEnd_.month, getLastDay(fyEnd_.calYear, fyEnd_.month))),
    sortOrder:    0,
    parentCode:   null,
  });

  // ── Half-Years ─────────────────────────────────────────────────────────────
  const hy1Months = fyMonths.slice(0, 6);
  const hy2Months = fyMonths.slice(6, 12);
  const halves = [
    { code: `${calYear}HY1`, months: hy1Months, sort: 1 },
    { code: `${calYear}HY2`, months: hy2Months, sort: 2 },
  ];

  for (const hy of halves) {
    const start = hy.months[0];
    const end   = hy.months[5];
    periods.push({
      code:         hy.code,
      name:         hy.code,
      periodType:   "HALFYEAR",
      fiscalYear:   calYear,
      fiscalPeriod: null,
      startDate:    new Date(isoDate(start.calYear, start.month, 1)),
      endDate:      new Date(isoDate(end.calYear,   end.month,   getLastDay(end.calYear, end.month))),
      sortOrder:    hy.sort,
      parentCode:   fyCode,
    });
  }

  // ── Quarters ───────────────────────────────────────────────────────────────
  const quarterDef = [
    { code: `${calYear}Q1`, months: fyMonths.slice(0, 3),  sort: 1, hyParent: `${calYear}HY1`, qNum: 1 },
    { code: `${calYear}Q2`, months: fyMonths.slice(3, 6),  sort: 2, hyParent: `${calYear}HY1`, qNum: 2 },
    { code: `${calYear}Q3`, months: fyMonths.slice(6, 9),  sort: 3, hyParent: `${calYear}HY2`, qNum: 3 },
    { code: `${calYear}Q4`, months: fyMonths.slice(9, 12), sort: 4, hyParent: `${calYear}HY2`, qNum: 4 },
  ];

  for (const q of quarterDef) {
    const start = q.months[0];
    const end   = q.months[2];
    periods.push({
      code:         q.code,
      name:         q.code,
      periodType:   "QUARTER",
      fiscalYear:   calYear,
      fiscalPeriod: q.qNum,
      startDate:    new Date(isoDate(start.calYear, start.month, 1)),
      endDate:      new Date(isoDate(end.calYear,   end.month,   getLastDay(end.calYear, end.month))),
      sortOrder:    q.sort,
      parentCode:   q.hyParent,
    });
  }

  // ── Months ─────────────────────────────────────────────────────────────────
  const quarterForFPeriod = (fp: number) => {
    if (fp <= 3)  return `${calYear}Q1`;
    if (fp <= 6)  return `${calYear}Q2`;
    if (fp <= 9)  return `${calYear}Q3`;
    return              `${calYear}Q4`;
  };

  fyMonths.forEach((m, idx) => {
    const fp      = idx + 1;  // fiscal period 1-12
    const lastDay = getLastDay(m.calYear, m.month);
    periods.push({
      code:         `${calYear}M${fp}`,
      name:         MONTH_NAMES[m.month - 1],   // "January", "February", …
      periodType:   "MONTH",
      fiscalYear:   calYear,
      fiscalPeriod: fp,
      startDate:    new Date(isoDate(m.calYear, m.month, 1)),
      endDate:      new Date(isoDate(m.calYear, m.month, lastDay)),
      sortOrder:    fp,
      parentCode:   quarterForFPeriod(fp),
    });
  });

  return periods;
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "time", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body   = await req.json();
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const { years, fiscalYearStart, overwrite } = parsed.data;
  let created = 0;
  let skipped = 0;

  for (const year of years) {
    const periods = buildHierarchy(year, fiscalYearStart);
    const codeToId = new Map<string, string>();

    for (const tp of periods) {
      const parentId = tp.parentCode ? codeToId.get(tp.parentCode) ?? null : null;

      const existing = await prisma.timePoint.findUnique({
        where: { tenantId_code: { tenantId: auth.tid, code: tp.code } },
      });

      if (existing && !overwrite) {
        codeToId.set(tp.code, existing.id);
        skipped++;
        continue;
      }

      if (existing && overwrite) {
        const updated = await prisma.timePoint.update({
          where: { id: existing.id },
          data:  { name: tp.name, periodType: tp.periodType, fiscalYear: tp.fiscalYear, fiscalPeriod: tp.fiscalPeriod, startDate: tp.startDate, endDate: tp.endDate, sortOrder: tp.sortOrder, parentId },
        });
        codeToId.set(tp.code, updated.id);
        created++;
      } else {
        const record = await prisma.timePoint.create({
          data: {
            tenantId:     auth.tid,
            code:         tp.code,
            name:         tp.name,
            periodType:   tp.periodType,
            fiscalYear:   tp.fiscalYear,
            fiscalPeriod: tp.fiscalPeriod,
            startDate:    tp.startDate,
            endDate:      tp.endDate,
            sortOrder:    tp.sortOrder,
            parentId,
            isActive:     true,
          },
        });
        codeToId.set(tp.code, record.id);
        created++;
      }
    }
  }

  await writeAuditLog({
    tenantId:  auth.tid,
    tableName: "time_points",
    recordId:  "bulk-generate",
    action:    "IMPORT",
    newValue:  { years, fiscalYearStart, created, skipped },
    userId:    auth.sub,
    userName:  auth.name,
    userEmail: auth.email,
    userRole:  auth.role,
  });

  return apiResponse({
    message: `Generated time hierarchy for years: ${years.join(", ")}`,
    created,
    skipped,
    structure: "Year → HY → Q → Month",
  }, 201);
}
