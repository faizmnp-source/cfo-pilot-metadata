"use client";

// Growth Engine — consumer-app marketing dashboard for Dtaxdude.
// Warmer palette than Finance (coral / amber / teal / indigo).
// Big icon-led KPI cards + funnel + retention cohort + IG metrics + revenue lines.

import { useEffect, useState } from "react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend, ComposedChart,
} from "recharts";
import {
  Smartphone, Users, ArrowUpRight, ArrowDownRight, DollarSign, TrendingUp,
  Heart, RefreshCw, Loader2, Instagram, Sparkles, Award, UserCheck,
  Repeat, MessageCircle, Eye, Bookmark, Activity, Megaphone, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GrowthData {
  kpis: Record<string, { label: string; value: number; delta: number; trend: number[]; unit: string; positiveGreen?: boolean }>;
  downloadsTrend: { month: string; iOS: number; Android: number }[];
  funnel: { stage: string; value: number; pct: number }[];
  acquisitionChannels: { channel: string; installs: number; share: number; cac: number }[];
  retentionCohort: { week: string; pct: number }[];
  instagram: {
    followers: number; followersDelta: number;
    reachMonthly: number; reachDelta: number;
    engagementRate: number; engagementDelta: number;
    topPosts: { id: string; caption: string; reach: number; likes: number; comments: number; saved: number }[];
  };
  revenueLines: { product: string; mrr: number; subscribers: number; color: string }[];
  meta: { source: string; generatedAt: string; explainer: string };
}

// Growth palette — warmer, marketing-vibe
const G = {
  bg:        "#FCFBF8",
  card:      "#FFFFFF",
  ink:       "#0E0F12",
  inkSoft:   "#3F4147",
  inkDim:    "#9095A0",
  rule:      "#E8E8E5",
  ruleSoft:  "#F0F0EC",
  coral:     "#FF6B6B",
  amber:     "#F59E0B",
  teal:      "#06B6D4",
  indigo:    "#4F46E5",
  pink:      "#EC4899",
  emerald:   "#10B981",
  rose:      "#E11D48",
  funnel:    ["#4F46E5", "#06B6D4", "#10B981", "#F59E0B", "#EC4899"],
};

function fmt(n: number, unit: string): string {
  if (n === 0) return "—";
  if (unit === "pct")   return `${n.toFixed(1)}%`;
  if (unit === "usd")   return n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
  if (unit === "score") return n.toFixed(0);
  // count
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export default function GrowthPage() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/v2/growth/summary", { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setData(j.data as GrowthData);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  if (!data && loading) return (
    <main className="flex-1 flex items-center justify-center" style={{ background: G.bg }}>
      <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
    </main>
  );

  if (!data) return (
    <main className="flex-1 flex items-center justify-center" style={{ background: G.bg }}>
      <p className="text-sm text-rose-700">Failed to load: {error}</p>
    </main>
  );

  return (
    <>
      <MetadataHeader title="Growth Engine" subtitle={`Consumer app · all data is stub today (Phase 2: wires Stripe / Posthog / App Store / Meta APIs)`} />

      <main className="flex-1 overflow-y-auto" style={{ background: G.bg }}>
        {/* Stub notice */}
        <div className="px-6 pt-5">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-2.5 text-xs text-amber-900 mb-5">
            <Info className="w-4 h-4 shrink-0" />
            <span><strong>Stub data</strong> · realistic numbers for prototyping. Real wiring: {data.meta.explainer}</span>
          </div>
        </div>

        <div className="px-6 pb-8 space-y-5">
          {/* Hero KPI row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard kpi={data.kpis.downloads}        icon={Smartphone} accent={G.coral}   />
            <KpiCard kpi={data.kpis.mau}              icon={Users}      accent={G.teal}    />
            <KpiCard kpi={data.kpis.conversion}       icon={UserCheck}  accent={G.emerald} />
            <KpiCard kpi={data.kpis.mrr}              icon={DollarSign} accent={G.indigo}  highlight />
          </div>

          {/* KPI row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard kpi={data.kpis.activeSubscribers} icon={Repeat}      accent={G.indigo}  />
            <KpiCard kpi={data.kpis.churn}             icon={ArrowDownRight} accent={G.rose} positiveGreen={false} />
            <KpiCard kpi={data.kpis.nps}               icon={Heart}       accent={G.pink}    />
            <KpiCard kpi={data.kpis.arpu}              icon={Award}       accent={G.amber}   />
          </div>

          {/* Downloads trend + Funnel */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <Card title="Downloads · iOS vs Android" eyebrow="MONTHLY · LAST 12" subtitle="App Store + Google Play" iconColor={G.coral} icon={Smartphone} className="xl:col-span-2">
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.downloadsTrend} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gIos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor={G.indigo} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={G.indigo} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gAndr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor={G.teal} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={G.teal} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={G.ruleSoft} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} stroke={G.inkDim} fontSize={11} />
                    <YAxis axisLine={false} tickLine={false} stroke={G.inkDim} fontSize={11} tickFormatter={v => fmt(v, "count")} width={50} />
                    <Tooltip contentStyle={{ background: G.card, border: `1px solid ${G.rule}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => fmt(Number(v), "count")} />
                    <Area type="monotone" dataKey="iOS"     stackId="1" stroke={G.indigo} fill="url(#gIos)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Android" stackId="1" stroke={G.teal}   fill="url(#gAndr)" strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Conversion Funnel" eyebrow="LAST 90 DAYS" subtitle="Visitor → Paid" iconColor={G.emerald} icon={TrendingUp}>
              <div className="space-y-2">
                {data.funnel.map((s, i) => {
                  const widthPct = s.pct;
                  return (
                    <div key={s.stage} className="relative">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-medium text-stone-700">{s.stage}</span>
                        <span className="font-mono tabular-nums text-stone-900 font-bold">{fmt(s.value, "count")}</span>
                      </div>
                      <div className="h-7 rounded-md bg-stone-100 relative overflow-hidden">
                        <div
                          className="h-full rounded-md flex items-center justify-end pr-2 text-[10px] font-bold text-white tabular-nums transition-all"
                          style={{ width: `${widthPct}%`, background: G.funnel[i % G.funnel.length] }}
                        >
                          {s.pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Acquisition channels + Retention cohort */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card title="Acquisition Channels" eyebrow="LAST 90 DAYS" subtitle="Installs + CAC per channel" iconColor={G.amber} icon={Megaphone}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-stone-500 border-b border-stone-100">
                    <th className="text-left py-2 font-semibold">Channel</th>
                    <th className="text-right py-2 font-semibold">Installs</th>
                    <th className="text-right py-2 font-semibold">Share</th>
                    <th className="text-right py-2 font-semibold">CAC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.acquisitionChannels.map((c, i) => (
                    <tr key={c.channel} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/50">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: G.funnel[i % G.funnel.length] }} />
                          <span className="font-medium text-stone-800">{c.channel}</span>
                        </div>
                      </td>
                      <td className="text-right font-mono tabular-nums text-stone-900">{fmt(c.installs, "count")}</td>
                      <td className="text-right font-mono tabular-nums text-stone-600">{c.share.toFixed(1)}%</td>
                      <td className="text-right font-mono tabular-nums text-stone-700">{c.cac === 0 ? "—" : `$${c.cac.toFixed(2)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Retention Cohort" eyebrow="USER RETENTION" subtitle="% still active after N weeks" iconColor={G.teal} icon={Activity}>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.retentionCohort} margin={{ top: 8, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gRet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor={G.teal} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={G.teal} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={G.ruleSoft} vertical={false} />
                    <XAxis dataKey="week" axisLine={false} tickLine={false} stroke={G.inkDim} fontSize={11} />
                    <YAxis axisLine={false} tickLine={false} stroke={G.inkDim} fontSize={11} tickFormatter={v => `${v}%`} domain={[0, 100]} width={40} />
                    <Tooltip contentStyle={{ background: G.card, border: `1px solid ${G.rule}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => `${v}%`} />
                    <Line type="monotone" dataKey="pct" stroke={G.teal} strokeWidth={2.5} dot={{ fill: G.teal, r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Instagram + Revenue lines */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <Card title="Instagram" eyebrow="@DTAXDUDE" subtitle="Audience + engagement" iconColor={G.pink} icon={Instagram} className="xl:col-span-1">
              <div className="space-y-4">
                <IgMetric icon={Users}         label="Followers"   value={fmt(data.instagram.followers, "count")}   delta={data.instagram.followersDelta}  color={G.pink} />
                <IgMetric icon={Eye}           label="Monthly Reach" value={fmt(data.instagram.reachMonthly, "count")} delta={data.instagram.reachDelta}      color={G.coral} />
                <IgMetric icon={Heart}         label="Engagement Rate" value={`${data.instagram.engagementRate}%`}  delta={data.instagram.engagementDelta} color={G.rose} />
              </div>
              <div className="mt-5 pt-4 border-t border-stone-100">
                <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500 mb-2.5">Top Posts (last 30d)</p>
                <div className="space-y-2.5">
                  {data.instagram.topPosts.map(p => (
                    <div key={p.id} className="rounded-md bg-stone-50 p-2.5">
                      <p className="text-[11px] text-stone-800 mb-1.5 line-clamp-2">{p.caption}</p>
                      <div className="flex items-center gap-3 text-[10px] text-stone-600">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {fmt(p.reach, "count")}</span>
                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {fmt(p.likes, "count")}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {fmt(p.comments, "count")}</span>
                        <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" /> {fmt(p.saved, "count")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Consumer Revenue Lines" eyebrow="MRR BREAKDOWN" subtitle="By product · monthly recurring" iconColor={G.indigo} icon={DollarSign} className="xl:col-span-2">
              <div className="flex flex-col xl:flex-row items-stretch gap-5">
                <div style={{ height: 240, flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.revenueLines} dataKey="mrr" nameKey="product" innerRadius="55%" outerRadius="85%" paddingAngle={3}>
                        {data.revenueLines.map((r, i) => <Cell key={i} fill={r.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: G.card, border: `1px solid ${G.rule}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => fmt(Number(v), "usd")} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-3 self-center">
                  {data.revenueLines.map(r => {
                    const totalMrr = data.revenueLines.reduce((s, x) => s + x.mrr, 0);
                    const pct = (r.mrr / totalMrr) * 100;
                    return (
                      <div key={r.product} className="rounded-md border border-stone-100 p-2.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                          <span className="text-[11px] font-semibold text-stone-800 flex-1">{r.product}</span>
                          <span className="text-[10px] text-stone-500">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="font-mono tabular-nums font-bold text-stone-900">{fmt(r.mrr, "usd")}</span>
                          <span className="font-mono tabular-nums text-stone-500">{fmt(r.subscribers, "count")} subs</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

          {/* Future integration teaser */}
          <div className="rounded-lg bg-gradient-to-br from-indigo-50 via-violet-50 to-pink-50 border border-violet-200/50 p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-white/80">
                <Sparkles className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-stone-900 mb-1">Wire to real sources (Phase 2)</h3>
                <p className="text-xs text-stone-700 mb-3 leading-relaxed">Once these connect, every card on this page becomes live and refreshes hourly:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  <SourceRow label="App Downloads"           via="App Store Connect API + Google Play Console API" />
                  <SourceRow label="MAU / Funnel / Cohort"   via="Posthog or Mixpanel SDK on the app" />
                  <SourceRow label="MRR / Subscribers / Churn" via="Stripe Subscriptions or RevenueCat API" />
                  <SourceRow label="Instagram metrics"       via="Meta Graph API (Business token)" />
                  <SourceRow label="NPS"                     via="Delighted / SatisMeter API" />
                  <SourceRow label="CAC by channel"          via="Posthog UTM attribution + ad spend from Stripe Billing or manual upload" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────

function KpiCard({ kpi, icon: Icon, accent, highlight, positiveGreen = true }: {
  kpi: { label: string; value: number; delta: number; trend: number[]; unit: string };
  icon: any; accent: string; highlight?: boolean; positiveGreen?: boolean;
}) {
  const delta = kpi.delta;
  const positive = positiveGreen ? delta > 0 : delta < 0;
  return (
    <div className={cn(
      "relative rounded-xl p-4 bg-white border transition-all hover:-translate-y-0.5",
      highlight ? "border-indigo-200 ring-1 ring-indigo-100" : "border-stone-200/80"
    )}
      style={{ boxShadow: highlight ? "0 6px 24px rgba(79,70,229,0.10)" : "0 1px 3px rgba(0,0,0,0.03)" }}
    >
      <div className="flex items-start justify-between mb-2.5">
        <div className="p-1.5 rounded-md" style={{ background: accent + "15" }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums",
          positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
          {delta > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
          {Math.abs(delta).toFixed(1)}%
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-widest font-semibold text-stone-500 mb-1">{kpi.label}</p>
      <p className="text-[24px] font-extrabold tabular-nums text-stone-900 leading-none">{fmt(kpi.value, kpi.unit)}</p>
      {/* Sparkline */}
      <Sparkline data={kpi.trend} color={accent} />
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data?.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 100, h = 24;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full" style={{ height: 24 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Card({ title, eyebrow, subtitle, icon: Icon, iconColor, children, className }: {
  title: string; eyebrow?: string; subtitle?: string; icon?: any; iconColor?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-white border border-stone-200/80 p-5", className)} style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
      <div className="flex items-start gap-3 mb-4">
        {Icon && (
          <div className="p-1.5 rounded-md" style={{ background: (iconColor ?? "#999") + "15" }}>
            <Icon className="w-4 h-4" style={{ color: iconColor }} />
          </div>
        )}
        <div className="flex-1">
          {eyebrow && <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-stone-500 mb-0.5">{eyebrow}</p>}
          <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-stone-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function IgMetric({ icon: Icon, label, value, delta, color }: { icon: any; label: string; value: string; delta: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-md" style={{ background: color + "15" }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">{label}</p>
        <p className="text-lg font-bold tabular-nums text-stone-900 leading-none mt-0.5">{value}</p>
      </div>
      <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums",
        delta > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
        {delta > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
        {Math.abs(delta).toFixed(1)}%
      </div>
    </div>
  );
}

function SourceRow({ label, via }: { label: string; via: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-semibold text-stone-800">{label}</span>
      <span className="text-stone-500">→ {via}</span>
    </div>
  );
}
