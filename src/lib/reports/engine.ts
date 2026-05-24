// Reports engine — pulls fact rows for a (scenario, entity, year) POV and
// emits a normalized SectionedReport that the 4 report types format.
//
// Design principle: math here, formatting in the UI. The engine returns
// concrete numbers per leaf account; section grouping + subtotals are
// derived from Account.account_type and the account hierarchy.

import { prisma } from "../prisma";

export type AccountType =
  | "ASSET" | "LIABILITY" | "EQUITY"
  | "REVENUE" | "EXPENSE"
  | "STATISTICAL" | "KPI" | "NON_FINANCIAL";

export type TimeBalance = "FLOW" | "LAST" | "FIRST" | "AVG";

export interface ReportLine {
  accountId:   string;
  code:        string;
  name:        string;
  value:       number;
  indent:      number;       // 0 = root, 1+ = children
  isSubtotal:  boolean;
  isBold:      boolean;
  accountType: AccountType | null;
}

export interface ReportSection {
  title:    string;
  lines:    ReportLine[];
  subtotal: { label: string; value: number } | null;
  type?:    AccountType;
}

export interface SectionedReport {
  meta: {
    kind:        "trial-balance" | "income-statement" | "balance-sheet" | "cash-flow";
    scenarioId:  string;
    entityId:    string;
    yearCode:    string;
    currencyId?: string;
    generatedAt: string;   // ISO
    rowsRead:    number;
  };
  sections: ReportSection[];
  totals:   { label: string; value: number } | null;
}

export interface ReportInput {
  tenantId:   string;
  scenarioId: string;
  entityId:   string;
  yearCode:   string;
  kind:       SectionedReport["meta"]["kind"];
}

// ─── Shared data pull ──────────────────────────────────────────────

interface LoadedFacts {
  byAccount: Map<string, { value: number; account: AccountMeta }>;
  rowsRead:  number;
  monthIds:  string[];
}

interface AccountMeta {
  id:           string;
  code:         string;
  name:         string;
  accountType:  AccountType | null;
  timeBalance:  TimeBalance;
  sortOrder:    number;
  parentId?:    string | null;
}

/**
 * Pulls every leaf fact for (scenario, entity, year-months) and aggregates
 * to one number per account. Respects Account.time_balance:
 *   FLOW   → sum across the 12 months
 *   LAST   → take the value from the latest month with data
 *   FIRST  → take the value from the earliest month with data
 *   AVG    → average across months that have a value
 *
 * For YTD-only v1, this means:
 *   IS accounts (Revenue/Expense, FLOW)   → YTD sum
 *   BS accounts (Asset/Liab/Equity, LAST) → closing balance
 */
export async function loadFactsForReport(input: ReportInput): Promise<LoadedFacts> {
  // Universal Time POV: resolve ANY Time member (year/half/quarter/month) → leaf months.
  // Replaces the old 2-level year→quarter→month walk.
  const { resolveTimeMembersToLeafMonths } = await import("./time-resolver");
  const { leafMonthIds } = await resolveTimeMembersToLeafMonths(input.tenantId, input.yearCode);
  if (leafMonthIds.length === 0) return { byAccount: new Map(), rowsRead: 0, monthIds: [] };
  const monthIds = leafMonthIds;

  // Pull all fact rows + months for sort
  const months = await prisma.dimensionMember.findMany({
    where: { tenantId: input.tenantId, id: { in: monthIds }, isActive: true },
    select: { id: true, memberCode: true },
    orderBy: { memberCode: "asc" },
  });
  const monthSortIndex = new Map(months.map((m, i) => [m.id, i]));

  const facts = await prisma.factRow.findMany({
    where: {
      tenantId:   input.tenantId,
      scenarioId: input.scenarioId,
      entityId:   input.entityId,
      timeId:     { in: monthIds },
      isCurrent:  true,
    },
    select: {
      accountId: true, timeId: true, valueReporting: true,
    },
  });

  // Pull Account members + their properties for the leaves we hit
  const accountIds = Array.from(new Set(facts.map(f => f.accountId)));
  const accounts = await prisma.dimensionMember.findMany({
    where: { tenantId: input.tenantId, id: { in: accountIds } },
    select: {
      id: true, memberCode: true, memberName: true, sortOrder: true, properties: true,
    },
  });
  const accountById = new Map<string, AccountMeta>();
  for (const a of accounts) {
    const p = (a.properties as any) ?? {};
    accountById.set(a.id, {
      id:          a.id,
      code:        a.memberCode,
      name:        a.memberName,
      accountType: (p.account_type as AccountType) ?? null,
      timeBalance: (p.time_balance as TimeBalance) ?? "FLOW",
      sortOrder:   a.sortOrder,
    });
  }

  // Aggregate facts → per-account value, respecting time_balance
  const byAccount = new Map<string, { value: number; account: AccountMeta }>();
  // Group facts by account
  const factsByAccount = new Map<string, { timeId: string; value: number }[]>();
  for (const f of facts) {
    const arr = factsByAccount.get(f.accountId) ?? [];
    arr.push({ timeId: f.timeId, value: Number(f.valueReporting) });
    factsByAccount.set(f.accountId, arr);
  }

  for (const [accId, rows] of Array.from(factsByAccount.entries())) {
    const meta = accountById.get(accId);
    if (!meta) continue;
    let v = 0;
    if (meta.timeBalance === "FLOW") {
      v = rows.reduce((s, r) => s + r.value, 0);
    } else if (meta.timeBalance === "LAST") {
      const sorted = rows.sort((a, b) => (monthSortIndex.get(b.timeId) ?? 0) - (monthSortIndex.get(a.timeId) ?? 0));
      v = sorted[0]?.value ?? 0;
    } else if (meta.timeBalance === "FIRST") {
      const sorted = rows.sort((a, b) => (monthSortIndex.get(a.timeId) ?? 0) - (monthSortIndex.get(b.timeId) ?? 0));
      v = sorted[0]?.value ?? 0;
    } else if (meta.timeBalance === "AVG") {
      v = rows.length === 0 ? 0 : rows.reduce((s, r) => s + r.value, 0) / rows.length;
    }
    byAccount.set(accId, { value: v, account: meta });
  }

  return { byAccount, rowsRead: facts.length, monthIds };
}

// ─── Report builders ──────────────────────────────────────────────

export async function buildTrialBalance(input: ReportInput): Promise<SectionedReport> {
  const { byAccount, rowsRead } = await loadFactsForReport(input);

  // Trial balance: one row per leaf account. Debit/Credit split by natural
  // balance. Asset/Expense = debit-natural; Liability/Equity/Revenue = credit-natural.
  // Phase 1 just shows the raw value with sign; columns split lands when
  // sign convention is locked.
  const rows: ReportLine[] = Array.from(byAccount.values())
    .sort((a, b) => a.account.code.localeCompare(b.account.code))
    .map(({ value, account }) => ({
      accountId:   account.id,
      code:        account.code,
      name:        account.name,
      value,
      indent:      0,
      isSubtotal:  false,
      isBold:      false,
      accountType: account.accountType,
    }));

  const total = rows.reduce((s, r) => s + r.value, 0);

  return {
    meta: {
      kind: "trial-balance",
      scenarioId: input.scenarioId, entityId: input.entityId, yearCode: input.yearCode,
      generatedAt: new Date().toISOString(),
      rowsRead,
    },
    sections: [{ title: "All Accounts", lines: rows, subtotal: null }],
    totals: { label: "Total", value: total },
  };
}

export async function buildIncomeStatement(input: ReportInput): Promise<SectionedReport> {
  const { byAccount, rowsRead } = await loadFactsForReport(input);

  // GAAP-style sub-classification by account code prefix:
  //   4xxx = Operating Revenue
  //   5xxx = Cost of Services (COGS)
  //   6xxx = Operating Expenses
  //   7xxx = Other Income / Expense (interest, FX)
  //   8xxx = Tax
  // Falls back to account_type bucketing for any non-numeric codes.
  const operatingRevenue: ReportLine[] = [];
  const cogs:             ReportLine[] = [];
  const opex:             ReportLine[] = [];
  const otherIncome:      ReportLine[] = [];   // 7xxx tagged REVENUE
  const otherExpense:     ReportLine[] = [];   // 7xxx tagged EXPENSE
  const tax:              ReportLine[] = [];   // 8xxx EXPENSE
  const unclassified:     ReportLine[] = [];

  function mkLine(value: number, account: AccountMeta): ReportLine {
    return {
      accountId: account.id, code: account.code, name: account.name, value,
      indent: 1, isSubtotal: false, isBold: false, accountType: account.accountType,
    };
  }

  for (const { value, account } of Array.from(byAccount.values())) {
    const line = mkLine(value, account);
    const prefix = account.code.charAt(0);
    if (account.accountType === "REVENUE") {
      if (prefix === "4") operatingRevenue.push(line);
      else if (prefix === "7") otherIncome.push(line);
      else operatingRevenue.push(line);
    } else if (account.accountType === "EXPENSE") {
      if (prefix === "5") cogs.push(line);
      else if (prefix === "6") opex.push(line);
      else if (prefix === "7") otherExpense.push(line);
      else if (prefix === "8") tax.push(line);
      else opex.push(line);
    } else if (!["ASSET","LIABILITY","EQUITY"].includes(account.accountType ?? "")) {
      unclassified.push(line);
    }
  }

  const sortByCode = (a: ReportLine, b: ReportLine) => a.code.localeCompare(b.code);
  [operatingRevenue, cogs, opex, otherIncome, otherExpense, tax, unclassified].forEach(arr => arr.sort(sortByCode));

  const totalOpRev   = operatingRevenue.reduce((s, r) => s + r.value, 0);
  const totalCogs    = cogs.reduce((s, r) => s + r.value, 0);
  const grossProfit  = totalOpRev - totalCogs;
  const totalOpex    = opex.reduce((s, r) => s + r.value, 0);
  const operatingIncome = grossProfit - totalOpex;
  const totalOtherInc = otherIncome.reduce((s, r) => s + r.value, 0);
  const totalOtherExp = otherExpense.reduce((s, r) => s + r.value, 0);
  const netOther      = totalOtherInc - totalOtherExp;
  const preTaxIncome  = operatingIncome + netOther;
  const totalTax      = tax.reduce((s, r) => s + r.value, 0);
  const netIncome     = preTaxIncome - totalTax;

  const sections: ReportSection[] = [];
  if (operatingRevenue.length) sections.push({
    title: "Operating Revenue", type: "REVENUE", lines: operatingRevenue,
    subtotal: { label: "Total Revenue", value: totalOpRev },
  });
  if (cogs.length) sections.push({
    title: "Cost of Services", type: "EXPENSE", lines: cogs,
    subtotal: { label: "Total COGS", value: totalCogs },
  });
  // Inject Gross Profit as a single-row section
  if (cogs.length || operatingRevenue.length) sections.push({
    title: "Gross Profit", lines: [],
    subtotal: { label: "Gross Profit", value: grossProfit },
  });
  if (opex.length) sections.push({
    title: "Operating Expenses", type: "EXPENSE", lines: opex,
    subtotal: { label: "Total Operating Expenses", value: totalOpex },
  });
  if (opex.length || cogs.length) sections.push({
    title: "Operating Income (Loss)", lines: [],
    subtotal: { label: operatingIncome < 0 ? "Operating Loss" : "Operating Income", value: operatingIncome },
  });
  if (otherIncome.length || otherExpense.length) {
    const otherCombined = [...otherIncome, ...otherExpense.map(e => ({ ...e, value: -e.value }))]
      .sort(sortByCode);
    sections.push({
      title: "Other Income / (Expense)", lines: otherCombined,
      subtotal: { label: "Net Other Income / (Expense)", value: netOther },
    });
  }
  if (otherIncome.length || otherExpense.length) sections.push({
    title: "Pre-Tax Income", lines: [],
    subtotal: { label: preTaxIncome < 0 ? "Pre-Tax Loss" : "Pre-Tax Income", value: preTaxIncome },
  });
  if (tax.length) sections.push({
    title: "Tax", type: "EXPENSE", lines: tax,
    subtotal: { label: "Total Tax", value: totalTax },
  });
  if (unclassified.length) sections.push({
    title: "Unclassified (no account_type set)", lines: unclassified,
    subtotal: null,
  });

  return {
    meta: {
      kind: "income-statement",
      scenarioId: input.scenarioId, entityId: input.entityId, yearCode: input.yearCode,
      generatedAt: new Date().toISOString(),
      rowsRead,
    },
    sections,
    totals: { label: netIncome < 0 ? "Net Loss" : "Net Income", value: netIncome },
  };
}

export async function buildBalanceSheet(input: ReportInput): Promise<SectionedReport> {
  const { byAccount, rowsRead } = await loadFactsForReport(input);

  const assets:      ReportLine[] = [];
  const liabilities: ReportLine[] = [];
  const equity:      ReportLine[] = [];

  for (const { value, account } of Array.from(byAccount.values())) {
    const line: ReportLine = {
      accountId:   account.id,
      code:        account.code,
      name:        account.name,
      value,
      indent:      1,
      isSubtotal:  false,
      isBold:      false,
      accountType: account.accountType,
    };
    if (account.accountType === "ASSET")          assets.push(line);
    else if (account.accountType === "LIABILITY") liabilities.push(line);
    else if (account.accountType === "EQUITY")    equity.push(line);
  }

  const sortByCode = (a: ReportLine, b: ReportLine) => a.code.localeCompare(b.code);
  assets.sort(sortByCode);
  liabilities.sort(sortByCode);
  equity.sort(sortByCode);

  const totalAssets = assets.reduce((s, r) => s + r.value, 0);
  const totalLiab   = liabilities.reduce((s, r) => s + r.value, 0);
  const totalEquity = equity.reduce((s, r) => s + r.value, 0);

  const sections: ReportSection[] = [];
  if (assets.length) sections.push({
    title: "Assets", type: "ASSET", lines: assets,
    subtotal: { label: "Total Assets", value: totalAssets },
  });
  if (liabilities.length) sections.push({
    title: "Liabilities", type: "LIABILITY", lines: liabilities,
    subtotal: { label: "Total Liabilities", value: totalLiab },
  });
  if (equity.length) sections.push({
    title: "Equity", type: "EQUITY", lines: equity,
    subtotal: { label: "Total Equity", value: totalEquity },
  });

  // BS check: Assets vs Liab + Equity
  const check = totalAssets - (totalLiab + totalEquity);

  return {
    meta: {
      kind: "balance-sheet",
      scenarioId: input.scenarioId, entityId: input.entityId, yearCode: input.yearCode,
      generatedAt: new Date().toISOString(),
      rowsRead,
    },
    sections,
    totals: { label: `Total Liabilities + Equity (check: ${check.toFixed(2)})`, value: totalLiab + totalEquity },
  };
}

export async function buildCashFlow(input: ReportInput): Promise<SectionedReport> {
  // V1: simplified direct method. Look up accounts tagged with
  // properties.cash_flow_category in [OPERATING, INVESTING, FINANCING]
  // and sum FLOW values. Without that tag, Cash Flow shows an empty
  // state with instructions.
  const { byAccount, rowsRead } = await loadFactsForReport(input);

  const operating:  ReportLine[] = [];
  const investing:  ReportLine[] = [];
  const financing:  ReportLine[] = [];
  const unclassified: ReportLine[] = [];

  for (const { value, account } of Array.from(byAccount.values())) {
    // Look at account.properties.cash_flow_category — set via Library UI
    // (Phase 2 wiring). For now we'll default to unclassified.
    const cat = (await getAccountCfCategory(input.tenantId, account.id)) ?? null;
    const line: ReportLine = {
      accountId:   account.id,
      code:        account.code,
      name:        account.name,
      value,
      indent:      1,
      isSubtotal:  false,
      isBold:      false,
      accountType: account.accountType,
    };
    if (cat === "OPERATING")      operating.push(line);
    else if (cat === "INVESTING") investing.push(line);
    else if (cat === "FINANCING") financing.push(line);
    else                          unclassified.push(line);
  }

  const sortByCode = (a: ReportLine, b: ReportLine) => a.code.localeCompare(b.code);
  [operating, investing, financing, unclassified].forEach(arr => arr.sort(sortByCode));

  const sumOp  = operating.reduce((s, r) => s + r.value, 0);
  const sumIn  = investing.reduce((s, r) => s + r.value, 0);
  const sumFin = financing.reduce((s, r) => s + r.value, 0);
  const netCash = sumOp + sumIn + sumFin;

  const sections: ReportSection[] = [
    { title: "Operating Activities",   lines: operating,    subtotal: { label: "Net Cash from Operating",  value: sumOp  } },
    { title: "Investing Activities",   lines: investing,    subtotal: { label: "Net Cash from Investing",  value: sumIn  } },
    { title: "Financing Activities",   lines: financing,    subtotal: { label: "Net Cash from Financing",  value: sumFin } },
  ];
  if (unclassified.length) sections.push({
    title: "Unclassified (set cash_flow_category on account)", lines: unclassified, subtotal: null,
  });

  return {
    meta: {
      kind: "cash-flow",
      scenarioId: input.scenarioId, entityId: input.entityId, yearCode: input.yearCode,
      generatedAt: new Date().toISOString(),
      rowsRead,
    },
    sections,
    totals: { label: "Net Change in Cash", value: netCash },
  };
}

// Tiny cached lookup. Cash Flow looks at properties.cash_flow_category
// which lives on the Account member's JSON properties. Cached per request.
const cfCatCache = new Map<string, string | null>();
async function getAccountCfCategory(tenantId: string, accountId: string): Promise<string | null> {
  const key = `${tenantId}::${accountId}`;
  if (cfCatCache.has(key)) return cfCatCache.get(key) ?? null;
  const m = await prisma.dimensionMember.findFirst({
    where: { tenantId, id: accountId },
    select: { properties: true },
  });
  const cat = (m?.properties as any)?.cash_flow_category ?? null;
  cfCatCache.set(key, cat);
  return cat;
}
