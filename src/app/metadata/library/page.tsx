"use client";

// Unified Dimension Library — OneStream/EPBCS-style.
// One page, dropdown picks the dim, same hierarchy + action menu for all.
// Replaces the need to navigate to /metadata/accounts, /metadata/entities, etc.
// (Those pages still exist as bookmarkable deep links.)

import { useEffect, useState } from "react";
import { Library, Search, RefreshCw, Upload } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { HierarchyTreeView } from "@/components/metadata/v2/HierarchyTreeView";
import { AddMemberDialog, type SupportedDim } from "@/components/metadata/v2/AddMemberDialog";
import { ExcelImport } from "@/components/metadata/v2/ExcelImport";

interface DimOption { slug: SupportedDim; label: string; description: string; }

// Always-on catalog: the 5 + ICP dims the UI knows how to render. UD1..UD8
// are appended dynamically from /api/metadata/dimensions when they exist
// (configured via Configure Dimensions page).
const CORE_DIMS: DimOption[] = [
  { slug: "account",  label: "Account",            description: "Chart of accounts — assets, liabilities, revenue, expense, stat, KPI" },
  { slug: "entity",   label: "Entity",             description: "Legal entities, subsidiaries, ownership %, base currency" },
  { slug: "scenario", label: "Scenario",           description: "Actual, Budget, Forecast, What-If — version-controlled" },
  { slug: "time",     label: "Time Period",        description: "Fiscal years, quarters, months — handles non-Jan fiscal years" },
  { slug: "currency", label: "Currency",           description: "ISO 4217 prefilled, base currency per tenant" },
  { slug: "icp",      label: "Intercompany Partner", description: "ICP counterparties — only enabled when intercompany is on" },
];

export default function DimensionLibraryPage() {
  const [selectedDim, setSelectedDim] = useState<SupportedDim>("account");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [userDims, setUserDims] = useState<DimOption[]>([]);

  // Load feature flags so we hide disabled dims
  useEffect(() => {
    fetch("/api/v2/tenant-features", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setFeatures(d?.data?.flags ?? {}))
      .catch(() => { /* fall through to defaults */ });
  }, [refreshKey]);

  // Load user-configured UDs from the Configure Dimensions page so they
  // appear in the selector dropdown. Without this, renaming UD1 to "Doctor"
  // (or any UD config) had no visible effect on the Library — caught by
  // Faizan's hand-test.
  useEffect(() => {
    fetch("/api/metadata/dimensions", { credentials: "include" })
      .then((r) => r.json())
      .then((res) => {
        const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
        const uds: DimOption[] = rows
          .filter((d: any) => d.isActive && /^UD[1-8]$/.test(String(d.slot ?? "")))
          .map((d: any) => ({
            slug: String(d.slot).toLowerCase() as SupportedDim,
            label: d.name || d.slot,
            description: `Custom dimension (${d.slot}) — ${d.pluralName ?? d.name ?? ""}`,
          }));
        setUserDims(uds);
      })
      .catch(() => { /* defaults: no UDs visible */ });
  }, [refreshKey]);

  // Visible dim list = CORE_DIMS filtered by features, + user-configured UDs
  const visibleDims: DimOption[] = [
    ...CORE_DIMS.filter((d) => {
      if (d.slug === "icp")      return features.intercompany_enabled !== false; // default ON until features load
      if (d.slug === "currency") return features.multi_currency_enabled !== false; // hide when single-currency
      return true;
    }),
    ...userDims,
  ];

  // Refresh counts when refreshKey or the visible list changes
  useEffect(() => {
    visibleDims.forEach((d) => {
      fetch(`/api/v2/members/${d.slug}?pageSize=1`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setCounts((c) => ({ ...c, [d.slug]: data?.data?.total ?? 0 })))
        .catch(() => { /* ignore */ });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, userDims.length, features.intercompany_enabled, features.multi_currency_enabled]);

  const activeDim = visibleDims.find((d) => d.slug === selectedDim) ?? visibleDims[0];

  return (
    <>
      <MetadataHeader
        title="Dimension Library"
        subtitle={activeDim?.description ?? ""}
        onRefresh={() => setRefreshKey((k) => k + 1)}
        showSearch
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search members by code or name…"
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Dim selector — OneStream/EPBCS pattern */}
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-sm">
          <Library className="h-4 w-4 text-primary flex-shrink-0" />
          <label className="text-xs font-medium text-muted-foreground">Dimension:</label>
          <select
            value={selectedDim}
            onChange={(e) => setSelectedDim(e.target.value as SupportedDim)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {visibleDims.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.label} {counts[d.slug] != null ? `(${counts[d.slug]})` : ""}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>Total members: <strong className="text-foreground">{counts[selectedDim] ?? "—"}</strong></span>
            <span className="text-gray-300">·</span>
            <span>Right-click for actions · drag to reparent</span>
            <button
              onClick={() => setImportOpen(true)}
              className="ml-2 flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
            >
              <Upload className="h-3 w-3" /> Import Excel
            </button>
          </div>
        </div>

        {/* Hierarchy tree — reused across every dim */}
        <HierarchyTreeView
          key={`${selectedDim}-${refreshKey}`}   // remount on dim/refresh
          dimensionSlug={selectedDim}
          hierarchyCode="default"
        />

        {/* Excel import dialog */}
        <ExcelImport
          open={importOpen}
          dim={selectedDim}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); setRefreshKey((k) => k + 1); }}
        />
      </main>
    </>
  );
}
