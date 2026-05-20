"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
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
          <span className="font-medium tabular">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export function ForecastChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => formatCurrency(v, true)} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={52} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12, color: "#6B7280" }} iconType="circle" iconSize={6} />
        <ReferenceLine x="Mar" stroke="#E5E7EB" strokeDasharray="4 2" label={{ value: "Today", fontSize: 10, fill: "#9CA3AF" }} />
        <Line type="monotone" dataKey="bear" name="Bear" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
        <Line type="monotone" dataKey="base" name="Base" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }} />
        <Line type="monotone" dataKey="bull" name="Bull" stroke="#22C55E" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
