"use client";
import { CFOHeader } from "@/components/cfo/Header";
import { BarChart3 } from "lucide-react";

export default function ReportingPage() {
  return (
    <>
      <CFOHeader title="Reporting" subtitle="Board & Management Reporting · FY 2026" />
      <main className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-brand-50)] flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-7 h-7 text-[var(--color-brand-600)]" />
          </div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">Reporting</h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Board packages, management reports, and automated financial narratives — coming soon.
          </p>
        </div>
      </main>
    </>
  );
}
