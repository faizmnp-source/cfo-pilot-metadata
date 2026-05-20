"use client";
import { CFOHeader } from "@/components/cfo/Header";
import { FileSpreadsheet } from "lucide-react";

export default function ExcelPage() {
  return (
    <>
      <CFOHeader title="Excel Add-in" subtitle="Live Data in Your Spreadsheets" />
      <main className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-brand-50)] flex items-center justify-center mx-auto mb-4">
            <FileSpreadsheet className="w-7 h-7 text-[var(--color-brand-600)]" />
          </div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">Excel Add-in</h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Pull live financial data directly into Excel with one-click refresh and writeback — coming soon.
          </p>
        </div>
      </main>
    </>
  );
}
