"use client";
import { CFOHeader } from "@/components/cfo/Header";
import { FolderKanban } from "lucide-react";

export default function ProjectsPage() {
  return (
    <>
      <CFOHeader title="Projects & Initiatives" subtitle="Strategic Programs · FY 2026" />
      <main className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-brand-50)] flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-7 h-7 text-[var(--color-brand-600)]" />
          </div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">Projects & Initiatives</h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Strategic project budgets, milestone tracking, and capital allocation — coming soon.
          </p>
        </div>
      </main>
    </>
  );
}
