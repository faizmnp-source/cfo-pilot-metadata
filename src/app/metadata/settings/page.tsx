"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Settings, Save, CheckCircle, Globe, Calendar,
  Palette, Clock, Building2, DollarSign, AlertCircle,
} from "lucide-react";

const CURRENCIES_SHORT = [
  "AED","ARS","AUD","BDT","BHD","BRL","CAD","CHF","CLP","CNY",
  "COP","CZK","DKK","EGP","EUR","GBP","GHS","HKD","HUF","IDR",
  "ILS","INR","JOD","JPY","KES","KRW","KWD","LKR","MXN","MYR",
  "NGN","NOK","NPR","NZD","OMR","PEN","PHP","PKR","PLN","QAR",
  "RON","RUB","SAR","SEK","SGD","THB","TRY","TWD","UAH","USD",
  "VND","ZAR",
];

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
              {CURRENCIES_SHORT.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">All FX rates convert to this currency</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year Start</label>
            <select
              value={settings.fiscalYearStart}
              onChange={(e) => setSettings((s) => ({ ...s, fiscalYearStart: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name} (Month {i + 1})</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Used when generating time dimensions</p>
          </div>
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
