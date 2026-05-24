"use client";

// Reports landing — card per report type.

import Link from "next/link";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { Receipt, BookOpen, Scale, TrendingDown, ArrowRight } from "lucide-react";

const REPORTS = [
  { href: "/reports/income-statement", title: "Income Statement", subtitle: "Revenue, Expenses, Net Income",  icon: TrendingDown, color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  { href: "/reports/balance-sheet",    title: "Balance Sheet",    subtitle: "Assets, Liabilities, Equity",      icon: Scale,       color: "bg-sky-50 text-sky-700 border-sky-100" },
  { href: "/reports/trial-balance",    title: "Trial Balance",    subtitle: "All accounts × YTD values",        icon: Receipt,     color: "bg-amber-50 text-amber-700 border-amber-100" },
  { href: "/reports/cash-flow",        title: "Cash Flow",        subtitle: "Operating, Investing, Financing",  icon: BookOpen,    color: "bg-violet-50 text-violet-700 border-violet-100" },
];

export default function ReportsLandingPage() {
  return (
    <>
      <MetadataHeader title="Reports" subtitle="Generate financial statements from your loaded data" />
      <main className="flex-1 overflow-y-auto bg-[#FAF9F6] p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {REPORTS.map(r => {
            const Icon = r.icon;
            return (
              <Link key={r.title} href={r.href} className={`group rounded-xl border ${r.color} p-5 transition-all hover:shadow-md hover:border-stone-300`}>
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white p-2 shadow-sm"><Icon className="h-5 w-5" /></div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-stone-900">{r.title}</h3>
                    <p className="text-xs text-stone-600 mt-0.5">{r.subtitle}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 opacity-30 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
