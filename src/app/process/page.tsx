"use client";

// Process landing — lists registered process types. New types (Translation,
// Allocation, Calculation, Elimination as its own step) get added here.

import Link from "next/link";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { GitBranch, Globe, Layers, Calculator, ArrowRight, ShieldCheck, DollarSign } from "lucide-react";

const PROCESS_TYPES = [
  {
    href:        "/process/consolidation",
    title:       "Consolidation",
    subtitle:    "Roll up leaf entities to parent",
    icon:        GitBranch,
    color:       "bg-violet-50 text-violet-700 border-violet-100",
    status:      "ready",
    description: "Walks the Entity hierarchy, sums leaf facts to the parent, applies FX translation (if multi-currency on) and IC eliminations (if intercompany on).",
  },
  {
    href:        "/process/fx-rates",
    title:       "FX Rates",
    subtitle:    "Manage currency conversion rates",
    icon:        DollarSign,
    color:       "bg-green-50 text-green-700 border-green-100",
    status:      "ready",
    description: "Maintain CLOSING and AVERAGE rates per currency × period. Used by Consolidation when multi-currency translation runs.",
  },
  {
    href:        "#",
    title:       "Translation",
    subtitle:    "Local → Reporting FX",
    icon:        Globe,
    color:       "bg-sky-50 text-sky-700 border-sky-100",
    status:      "soon",
    description: "Standalone FX translation pass. Useful when you want translated numbers without re-consolidating.",
  },
  {
    href:        "#",
    title:       "Allocation",
    subtitle:    "Spread one account to many",
    icon:        Layers,
    color:       "bg-amber-50 text-amber-700 border-amber-100",
    status:      "soon",
    description: "Distribute corporate costs by driver (revenue, headcount, square footage). Configure once, run monthly.",
  },
  {
    href:        "#",
    title:       "Custom Calculation",
    subtitle:    "User-defined formulas",
    icon:        Calculator,
    color:       "bg-emerald-50 text-emerald-700 border-emerald-100",
    status:      "soon",
    description: "Run scripted calcs (currency conversions, account derivations, KPIs) on saved data.",
  },
  {
    href:        "#",
    title:       "Reconciliation",
    subtitle:    "GL vs subledger / bank",
    icon:        ShieldCheck,
    color:       "bg-rose-50 text-rose-700 border-rose-100",
    status:      "soon",
    description: "Match GL balances to external statements, classify exceptions, flag unexplained variances.",
  },
];

export default function ProcessLandingPage() {
  return (
    <>
      <MetadataHeader title="Process" subtitle="Run computations and transformations on existing data" />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PROCESS_TYPES.map((t) => {
            const Icon = t.icon;
            const Card = (
              <div className={`group rounded-xl border ${t.color} p-5 transition-all hover:shadow-md ${t.status === "ready" ? "cursor-pointer hover:border-violet-300" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white p-2 shadow-sm"><Icon className="h-5 w-5" /></div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{t.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.subtitle}</p>
                  </div>
                  {t.status === "ready" && <ArrowRight className="h-4 w-4 opacity-40 group-hover:opacity-100 transition-opacity" />}
                  {t.status === "soon" && <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-white px-2 py-0.5 rounded-full">Soon</span>}
                </div>
                <p className="mt-3 text-xs text-gray-700 leading-relaxed">{t.description}</p>
              </div>
            );
            return t.status === "ready"
              ? <Link key={t.title} href={t.href}>{Card}</Link>
              : <div key={t.title}>{Card}</div>;
          })}
        </div>
      </main>
    </>
  );
}
