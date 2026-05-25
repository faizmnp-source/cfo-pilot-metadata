// GET /api/v2/search/global?q=<query>
// Returns: { results: [{ kind, title, subtitle?, href, score }] }
// Searches across reports/jobs/rules/dimensions/forms/dashboards
// via a hand-curated route registry + dynamic dim/form/rule lookups.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";
import { score } from "@/lib/search/score";

type Result = { kind: string; title: string; subtitle?: string; href: string; score: number };

const STATIC_ROUTES: Array<Omit<Result, "score">> = [
  { kind: "Page", title: "Executive Brief",     href: "/dashboard" },
  { kind: "Page", title: "Explorer",            href: "/explore" },
  { kind: "Page", title: "Analyze (Ad Hoc)",    href: "/analyze" },
  { kind: "Page", title: "Visual Analytics",    href: "/analytics" },
  { kind: "Page", title: "Monthly Close",       href: "/monthly-close" },
  { kind: "Page", title: "Forecasting",         href: "/forecasting" },
  { kind: "Page", title: "Workforce Planning",  href: "/workforce" },
  { kind: "Page", title: "Budgeting",           href: "/budgeting" },
  { kind: "Page", title: "Calc Rules",          href: "/rules" },
  { kind: "Page", title: "Automation",          href: "/automation" },
  { kind: "Page", title: "Jobs Library",        href: "/jobs/library" },
  { kind: "Page", title: "Mapping Library",     href: "/mapping" },
  { kind: "Page", title: "Audit Trail",         href: "/audit" },
  { kind: "Page", title: "Dimension Library",   href: "/metadata/library" },
  { kind: "Page", title: "Data Forms",          href: "/data/forms" },
  { kind: "Page", title: "Data Input",          href: "/data/input" },
  { kind: "Report", title: "Income Statement",  href: "/reports/income-statement" },
  { kind: "Report", title: "Balance Sheet",     href: "/reports/balance-sheet" },
  { kind: "Report", title: "Trial Balance",     href: "/reports/trial-balance" },
  { kind: "Report", title: "Cash Flow",         href: "/reports/cash-flow" },
  { kind: "Report", title: "Board Pack",        href: "/reporting" },
];


export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return apiResponse({ results: [] });

  const out: Result[] = [];

  // Static routes
  for (const r of STATIC_ROUTES) {
    const sc = score(q, r.title);
    if (sc > 0) out.push({ ...r, score: sc });
  }

  // Dim members (entity + account most useful in search)
  const dimMatches = await prisma.dimensionMember.findMany({
    where: {
      tenantId: auth.tid, isActive: true,
      OR: [{ memberCode: { contains: q, mode: "insensitive" }}, { memberName: { contains: q, mode: "insensitive" }}],
      dimension: { code: { in: ["entity","account","scenario","time"] }},
    },
    select: { id: true, memberCode: true, memberName: true, dimension: { select: { code: true }}},
    take: 12,
  });
  for (const m of dimMatches as any[]) {
    out.push({
      kind: m.dimension.code.charAt(0).toUpperCase() + m.dimension.code.slice(1),
      title: m.memberName,
      subtitle: m.memberCode,
      href: `/metadata/library?dim=${m.dimension.code}&q=${encodeURIComponent(m.memberCode)}`,
      score: Math.max(score(q, m.memberCode), score(q, m.memberName)),
    });
  }

  // Forms by name
  const formMatches = await prisma.dataForm.findMany({
    where: { tenantId: auth.tid, isActive: true,
      OR: [{ code: { contains: q, mode: "insensitive" }}, { name: { contains: q, mode: "insensitive" }}],
    },
    select: { id: true, code: true, name: true },
    take: 8,
  });
  for (const f of formMatches) {
    out.push({ kind: "Form", title: f.name, subtitle: f.code, href: `/data/input?form=${f.id}`, score: Math.max(score(q, f.code), score(q, f.name)) });
  }

  // Calc rules
  const ruleMatches = await prisma.calcRule.findMany({
    where: { tenantId: auth.tid,
      OR: [{ code: { contains: q, mode: "insensitive" }}, { name: { contains: q, mode: "insensitive" }}],
    },
    select: { id: true, code: true, name: true },
    take: 8,
  });
  for (const r of ruleMatches) {
    out.push({ kind: "Rule", title: r.name, subtitle: r.code, href: `/rules?rule=${r.id}`, score: Math.max(score(q, r.code), score(q, r.name)) });
  }

  out.sort((a, b) => b.score - a.score);
  return apiResponse({ results: out.slice(0, 24) });
}
