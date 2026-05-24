"use client";

// Data Load landing page — lists the import types available for the tenant.
// Each card links to a wizard page. New import types (API import, scheduled
// imports, mapped TB imports) get added here as new cards over time.

import Link from "next/link";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { FileSpreadsheet, Database, Calendar, ArrowRight } from "lucide-react";

const IMPORT_TYPES = [
  {
    href:        "/data/load/facts-import",
    title:       "Excel / CSV Facts Import",
    subtitle:    "Long-format upload — one row per intersection",
    icon:        FileSpreadsheet,
    color:       "bg-indigo-50 text-indigo-700 border-indigo-100",
    status:      "ready",
    description: "Upload .xlsx or .csv. Every enabled dimension must be filled per row. Dry-run preview before commit.",
  },
  {
    href:        "#",
    title:       "TB / GL Mapped Import",
    subtitle:    "Source-to-target mapping rules",
    icon:        Database,
    color:       "bg-amber-50 text-amber-700 border-amber-100",
    status:      "soon",
    description: "Upload your TB once, save the column mapping, re-use every month. Coming in Phase 2.",
  },
  {
    href:        "#",
    title:       "Scheduled Import",
    subtitle:    "Auto-pull from S3 / SFTP / API",
    icon:        Calendar,
    color:       "bg-emerald-50 text-emerald-700 border-emerald-100",
    status:      "soon",
    description: "Hands-off monthly imports. Configure once, runs on schedule. Coming in Phase 3.",
  },
];

export default function DataLoadLandingPage() {
  return (
    <>
      <MetadataHeader title="Data Load" subtitle="Bring data into CFO Pilot from external files or systems" />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {IMPORT_TYPES.map((t) => {
            const Icon = t.icon;
            const Card = (
              <div className={`group rounded-xl border ${t.color} p-5 transition-all hover:shadow-md ${t.status === "ready" ? "cursor-pointer hover:border-indigo-300" : "opacity-60"}`}>
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
