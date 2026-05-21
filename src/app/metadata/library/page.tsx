"use client";

// Unified Dimension Library — OneStream/EPBCS-style.
// One page, dropdown picks the dim, same hierarchy + action menu for all.
// Replaces the need to navigate to /metadata/accounts, /metadata/entities, etc.
// (Those pages still exist as bookmarkable deep links.)

import { useEffect, useState } from "react";
import { Library, Search, RefreshCw } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { HierarchyTreeView } from "@/components/metadata/v2/HierarchyTreeView";
import { AddMemberDialog, type SupportedDim } from "@/components/metadata/v2/AddMemberDialog";

interface DimOption { slug: SupportedDim; label: string; description: string; }

// Static catalog of dims the UI knows how to render. The dropdown filters
// these by the tenant's feature flags (UD slots show only when configured).
const ALL_DIMS: DimOption[] = [
  { slug: "account",  label: "Account",            description: "Chart of accounts — assets, liabilities, revenue, expense, stat, KPI" },
  { slug: "entity",   label: "Entity",             description: "Legal entities, subsidiaries, ownership %, base currency" },
  { slug: "scenario", label: "Scenario",           description: "Actual, Budget, Forecast, What-If — version-controlled" },
  { slug: "time",     label: "Time Period",        description: "Fiscal years, quarters, months — handles non-Jan fiscal years" },
  { slug: "currency", label: "Currency",           description: "ISO 4217 prefilled, base currency per tenant" },
  { slug: "icp",      label: "Intercompany Partner", description: "ICP counterparties — only enabled when intercompany is on" },
  // UD1..UD8 added below if the tenant has them named
];

export default function DimensionLibraryPage() {
  const [selectedDim, setSelectedDim] = useState<SupportedDim>("account");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  // Load feature flags so we hide disabled dims
  useEffect(() => {
    fetch("/api/v2/tenant-features", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setFeatures(d?.data?.flags ?? {}))
      .catch(() => { /* fall through to defaults */ });
  }, []);

  // Refresh counts when refreshKey changes
  useEffect(() => {
    ALL_DIMS.forEach((d) => {
      fetch(`/api/v2/members/${d.slug}?pageSize=1`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setCounts((c) => ({ ...c, [d.slug]: data?.data?.total ?? 0 })))
        .catch(() => { /* ignore */ });
    });
  }, [refreshKey]);

  // Filter dims by feature flags
  const visibleDims = ALL_DIMS.filter((d) => {
    if (d.slug === "icp") return features.intercompany_enabled !== false; // default ON if not loaded yet
    return true;
  });

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
            <span>Hover any row for actions: Add child · Edit · Copy · Move · Delete</span>
          </div>
        </div>

        {/* Hierarchy tree — reused across every dim */}
        <HierarchyTreeView
          key={`${selectedDim}-${refreshKey}`}   // remount on dim/refresh
          dimensionSlug={selectedDim}
          hierarchyCode="default"
        />
      </main>
    </>
  );
}
