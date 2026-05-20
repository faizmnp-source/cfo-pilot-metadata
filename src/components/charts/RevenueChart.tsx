"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCurrency } from "@/lib/utils";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white rounded-lg px-3 py-2.5 text-xs shadow-xl border border-gray-700">
      <p className="font-semibold mb-1.5 text-gray-300">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-300 capitalize">{p.name}:</span>
          <span className="font-medium tabular">{p.value ? formatCurrency(p.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
};

export function RevenueChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1} />
            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => formatCurrency(v, true)} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={52} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12, color: "#6B7280" }} iconType="circle" iconSize={6} />
        <Area type="monotone" dataKey="budget"   name="Budget"   stroke="#D1D5DB" strokeWidth={1.5} strokeDasharray="4 2" fill="none"              dot={false} />
        <Area type="monotone" dataKey="forecast" name="Forecast" stroke="#8B5CF6" strokeWidth={1.5} strokeDasharray="4 2" fill="url(#forecastGrad)" dot={false} />
        <Area type="monotone" dataKey="actual"   name="Actual"   stroke="#3B82F6" strokeWidth={2}   fill="url(#actualGrad)" dot={false} activeDot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
