"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Settings, Save, CheckCircle, Globe, Calendar,
  Palette, Clock, Building2, DollarSign, AlertCircle,
  Layers, ToggleLeft, Wand2, Sparkles,
} from "lucide-react";
import { ISO_4217, ISO_TOP } from "@/lib/iso4217";
import { FISCAL_YEAR_START_OPTIONS, generateTimePeriods, type TimePeriodNode } from "@/lib/time-periods";

const TIMEZONES = [
  "UTC","Asia/Kolkata","Asia/Singapore","Asia/Dubai","Asia/Bangkok",
  "Asia/Tokyo","Asia/Shanghai","Europe/London","Europe/Paris","America/New_York","America/Los_Angeles",
];

const DATE_FORMATS = ["DD-MM-YYYY","MM/DD/YYYY","YYYY-MM-DD","DD/MM/YYYY"];
const NUMBER_FORMATS = ["1,234.56","1,23,456.78","1.234,56","1 234,56"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface Settings {
  appName: string;
  reportingCurrency: string;
  fiscalYearStart: number;
  dateFormat: string;
  numberFormat: string;
  timezone: string;
  logoUrl: string | null;
  primaryColor: string;
  isSetupComplete: boolean;
}

// Feature flags (mirror tenant_features table). LocalStorage-backed for now;
// task #12 wires the real /api/tenant-features endpoint.
type FeatureFlags = {
  multi_entity_enabled: boolean;
  multi_currency_enabled: boolean;
  intercompany_enabled: boolean;
  alternate_hierarchy_enabled: boolean;
  department_enabled: boolean;
  cost_center_enabled: boolean;
  project_enabled: boolean;
};

const DEFAULT_FLAGS: FeatureFlags = {
  multi_entity_enabled: false,
  multi_currency_enabled: false,
  intercompany_enabled: false,
  alternate_hierarchy_enabled: true,
  department_enabled: true,
  cost_center_enabled: false,
  project_enabled: false,
};

export default function AppSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>({
    appName: "CFO Pilot",
    reportingCurrency: "USD",
    fiscalYearStart: 1,
    dateFormat: "YYYY-MM-DD",
    numberFormat: "1,234.56",
    timezone: "UTC",
    logoUrl: null,
    primaryColor: "#6366f1",
    isSetupComplete: false,
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [isFirstSetup, setIsFirstSetup] = useState(false);

  // Time-period generator state
  const [periodStartFY, setPeriodStartFY] = useState<number>(new Date().getFullYear());
  const [periodNumYears, setPeriodNumYears] = useState<number>(3);
  const [periodPreview, setPeriodPreview] = useState<TimePeriodNode[] | null>(null);

  // Feature flags (localStorage-backed v1)
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("cfo_pilot_feature_flags") : null;
      if (raw) setFlags({ ...DEFAULT_FLAGS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  const saveFlag = (key: keyof FeatureFlags, value: boolean) => {
    const next = { ...flags, [key]: value };
    setFlags(next);
    try { window.localStorage.setItem("cfo_pilot_feature_flags", JSON.stringify(next)); } catch { /* ignore */ }
  };

  const handleGeneratePeriods = () => {
    const nodes = generateTimePeriods(settings.fiscalYearStart, periodStartFY, periodNumYears);
    setPeriodPreview(nodes);
    // Persist to localStorage so the Time dimension page picks them up
    // until the API route is migrated (task #8).
    try {
      window.localStorage.setItem("cfo_pilot_time_periods", JSON.stringify(nodes));
      window.localStorage.setItem("cfo_pilot_time_periods_meta", JSON.stringify({
        fiscalYearStartMonth: settings.fiscalYearStart,
        startFY: periodStartFY,
        numYears: periodNumYears,
        generatedAt: new Date().toISOString(),
      }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setSettings(d.data);
          setIsFirstSetup(!d.data.isSetupComplete);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { ...settings, isSetupComplete: true };
      const res = await fetch("/api/settings", {
        method:      "PUT",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSettings(data.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      if (isFirstSetup) {
        setTimeout(() => router.push("/metadata"), 1500);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-indigo-50">
          <Settings className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">App Settings</h1>
          <p className="text-sm text-gray-500">Configure your workspace before using the metadata module</p>
        </div>
        {settings.isSetupComplete && (
          <div className="ml-auto flex items-center gap-1 text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
            <CheckCircle className="h-4 w-4" />
            Setup complete
          </div>
        )}
      </div>

      {isFirstSetup && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Welcome! Please configure your workspace first.</p>
            <p className="text-sm text-amber-700 mt-1">Set your app name, reporting currency, and fiscal year before loading metadata.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* App Identity */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">App Identity</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Application Name</label>
            <input
              type="text"
              value={settings.appName}
              onChange={(e) => setSettings((s) => ({ ...s, appName: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Acme Corp Finance"
            />
            <p className="text-xs text-gray-400 mt-1">This appears in the sidebar and browser title</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primaryColor}
                onChange={(e) => setSettings((s) => ({ ...s, primaryColor: e.target.value }))}
                className="h-9 w-16 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={settings.primaryColor}
                onChange={(e) => setSettings((s) => ({ ...s, primaryColor: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="#6366f1"
              />
              <div
                className="h-9 w-9 rounded-lg border border-gray-200"
                style={{ backgroundColor: settings.primaryColor }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Finance Settings */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Finance & Reporting</h2>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reporting Currency</label>
            <select
              value={settings.reportingCurrency}
              onChange={(e) => setSettings((s) => ({ ...s, reportingCurrency: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <optgroup label="Most common">
                {ISO_TOP.map((code) => {
                  const c = ISO_4217.find((x) => x.code === code)!;
                  return <option key={code} value={code}>{c.code} — {c.name} ({c.symbol})</option>;
                })}
              </optgroup>
              <optgroup label="All ISO 4217">
                {ISO_4217.filter((c) => !ISO_TOP.includes(c.code))
                  .map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
                  ))}
              </optgroup>
            </select>
            <p className="text-xs text-gray-400 mt-1">All FX rates convert to this currency · {ISO_4217.length} currencies available</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year Start</label>
            <select
              value={settings.fiscalYearStart}
              onChange={(e) => setSettings((s) => ({ ...s, fiscalYearStart: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {FISCAL_YEAR_START_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {FISCAL_YEAR_START_OPTIONS.find((o) => o.value === settings.fiscalYearStart)?.description ?? "Used when generating time dimensions"}
            </p>
          </div>
        </div>
      </section>

      {/* Time Period Auto-Generation */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Time Periods — Auto-Generate</h2>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Based on your Fiscal Year Start, we'll generate <strong>Year → Quarter → Month</strong> hierarchy automatically (OneStream-style).
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Fiscal Year</label>
              <input
                type="number"
                min={2000}
                max={2099}
                value={periodStartFY}
                onChange={(e) => setPeriodStartFY(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Years</label>
              <input
                type="number"
                min={1}
                max={30}
                value={periodNumYears}
                onChange={(e) => setPeriodNumYears(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGeneratePeriods}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Generate Preview
              </button>
            </div>
          </div>

          {periodPreview && (
            <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50/40 max-h-72 overflow-y-auto">
              <p className="text-xs text-emerald-700 mb-2 font-medium">
                ✅ Generated &amp; saved {periodPreview.length} members ({periodPreview.filter((n) => n.type === "YEAR").length} years ·
                {" "}{periodPreview.filter((n) => n.type === "QUARTER").length} quarters ·
                {" "}{periodPreview.filter((n) => n.type === "MONTH").length} months) — visible now on{" "}
                <a href="/metadata/time" className="underline">Time dimension page</a>.
              </p>
              <ul className="text-sm space-y-0.5 font-mono">
                {periodPreview.map((n) => (
                  <li
                    key={n.code}
                    className={
                      n.type === "YEAR"    ? "font-semibold text-gray-900" :
                      n.type === "QUARTER" ? "pl-4 text-gray-700"         :
                                             "pl-8 text-gray-500"
                    }
                  >
                    {n.code} <span className="text-gray-400">— {n.name} · {n.startDate} → {n.endDate}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-700 mt-3">
                ⚠️ Saved to browser only. Full DB persistence kicks in after API migration (task #8).
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Optional Dimensions / Feature Flags */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <ToggleLeft className="h-4 w-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Optional Dimensions & Modules</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Always-on (cannot disable): <strong>Account · Entity · Scenario · Time · Currency</strong>.
            Toggle the optional dimensions and modules below — your sidebar updates after a refresh.
          </p>
          <div className="space-y-3">
            {[
              { key: "multi_entity_enabled",   label: "Multi-Entity",          desc: "Enable entity hierarchy + consolidation methods" },
              { key: "multi_currency_enabled", label: "Multi-Currency / FX",   desc: "Enable the FX rates table and currency translation behaviour" },
              { key: "intercompany_enabled",   label: "Intercompany (ICP)",    desc: "Enable ICP dimension and elimination tags on Entity" },
              { key: "department_enabled",     label: "Department",            desc: "Reserve a UD slot for Departments (default ON)" },
              { key: "cost_center_enabled",    label: "Cost Center",           desc: "Reserve a UD slot for Cost Centers" },
              { key: "project_enabled",        label: "Project",               desc: "Reserve a UD slot for Projects" },
              { key: "alternate_hierarchy_enabled", label: "Alternate Hierarchies", desc: "Multiple named hierarchies per dim (statutory vs management view)" },
            ].map((f) => (
              <label key={f.key} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{f.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={flags[f.key as keyof FeatureFlags]}
                  onChange={(e) => saveFlag(f.key as keyof FeatureFlags, e.target.checked)}
                  className="h-5 w-5 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-amber-700 mt-4">
            ⚠️ Toggles save to browser only for now. Persisting to the <code>tenant_features</code> table is task #12.
          </p>
        </div>
      </section>

      {/* Date & Number Formats */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Display Formats</h2>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
            <select
              value={settings.dateFormat}
              onChange={(e) => setSettings((s) => ({ ...s, dateFormat: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number Format</label>
            <select
              value={settings.numberFormat}
              onChange={(e) => setSettings((s) => ({ ...s, numberFormat: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {NUMBER_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              value={settings.timezone}
              onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Settings are tenant-wide — all users in your organization share these defaults.
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saved ? (
            <><CheckCircle className="h-4 w-4" /> Saved!</>
          ) : saving ? (
            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Saving…</>
          ) : (
            <><Save className="h-4 w-4" /> Save Settings</>
          )}
        </button>
      </div>
    </div>
  );
}
