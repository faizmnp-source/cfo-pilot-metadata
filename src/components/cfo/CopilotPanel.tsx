"use client";
import { useState } from "react";
import { Sparkles, Send, X, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { aiInsights } from "@/lib/cfo-data";

interface Message { role: "user" | "ai"; text: string; }

const suggestedPrompts = [
  "Why is EBITDA below forecast?",
  "What's driving headcount growth?",
  "Show me cash flow risk for Q3",
  "Compare Q1 vs Q2 margins",
];

const canned: Record<string, string> = {
  "Why is EBITDA below forecast?": "EBITDA is tracking at $4.1M vs. $4.9M forecast (-16.3%). Primary drivers:\n\n1. G&A overspend: +$200K YTD vs. budget\n2. Sales & Marketing ramp: +$150K vs. plan\n3. Gross margin compression: -1.2pts from infra cost increases\n\nRecommend reviewing the G&A software subscriptions line first.",
  "What's driving headcount growth?": "Headcount grew from 119 to 127 (+6.7%) QoQ. Engineering added 5 net new hires for the new product platform, and Customer Success added 3 as part of the enterprise expansion plan. Both are within board-approved headcount budgets.",
  "Show me cash flow risk for Q3": "Q3 cash flow risk is moderate. Key risks: (1) $2.1M in AR currently 45+ days outstanding from 3 enterprise customers, (2) $850K software renewal cluster in August. Offsetting factors: committed ARR adds $1.4M in Q3. Net runway risk: +/- 6 weeks.",
  "Compare Q1 vs Q2 margins": "Gross margin: Q1 68.2% → Q2 68.7% (+0.5pts). EBITDA margin: Q1 18.9% → Q2 17.1% (-1.8pts). The gross margin improvement reflects infrastructure optimization, while EBITDA pressure comes from the planned S&M and R&D investments ramping in Q2.",
};

export function CopilotPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      const reply = canned[text] || "I'm analyzing your financial data… Based on current trends, revenue is tracking above forecast by 2.3% while EBITDA faces headwinds from planned investment ramp. Would you like me to drill into a specific area?";
      setMessages(prev => [...prev, { role: "ai", text: reply }]);
      setLoading(false);
    }, 900);
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-[var(--border-default)] w-96 shrink-0">
      <div className="flex items-center gap-2.5 h-14 px-4 border-b border-[var(--border-default)] bg-[var(--bg-surface-sunken)] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">AI Copilot</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Executive Dashboard · FY 2026 Q2</p>
        </div>
        <button onClick={onClose} className="ml-auto p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mb-3">Live Insights</p>
            <div className="space-y-2.5 mb-5">
              {aiInsights.map((insight) => (
                <div key={insight.id} className={cn("rounded-lg border p-3", insight.type === "positive" ? "bg-[var(--color-success-50)] border-green-100" : "bg-[var(--color-warning-50)] border-amber-100")}>
                  <div className="flex items-start gap-2">
                    {insight.type === "positive"
                      ? <TrendingUp className="w-3.5 h-3.5 text-[var(--color-success-600)] mt-0.5 shrink-0" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning-600)] mt-0.5 shrink-0" />}
                    <div>
                      <p className={cn("text-xs font-semibold mb-0.5", insight.type === "positive" ? "text-[var(--color-success-600)]" : "text-[var(--color-warning-600)]")}>{insight.title}</p>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{insight.body}</p>
                      <button className="text-[11px] font-medium text-[var(--color-brand-600)] mt-1.5 hover:underline">{insight.action} →</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mb-2.5">Suggested Prompts</p>
            <div className="space-y-1.5">
              {suggestedPrompts.map((p) => (
                <button key={p} onClick={() => send(p)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-xs text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--color-brand-300)] hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)] transition-all">
                  <Lightbulb className="w-3 h-3 inline-block mr-1.5 text-[var(--text-tertiary)]" />
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2.5", m.role === "user" && "justify-end")}>
                {m.role === "ai" && (
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className={cn("rounded-xl px-3.5 py-2.5 text-xs leading-relaxed max-w-[85%]",
                  m.role === "user" ? "bg-[var(--color-brand-600)] text-white" : "bg-[var(--color-ai-50)] border border-[var(--color-ai-100)] text-[var(--text-primary)] whitespace-pre-line")}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="bg-[var(--color-ai-50)] border border-[var(--color-ai-100)] rounded-xl px-4 py-3 flex gap-1 items-center">
                  {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--color-ai-400)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-[var(--border-default)] shrink-0">
        <div className="flex items-end gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-sunken)] px-3 py-2 focus-within:border-[var(--color-brand-400)] focus-within:bg-white transition-all">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask anything about your data…"
            rows={1}
            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none outline-none"
          />
          <button onClick={() => send(input)} disabled={!input.trim() || loading}
            className="w-7 h-7 rounded-lg bg-[var(--color-brand-600)] flex items-center justify-center disabled:opacity-40 hover:bg-[var(--color-brand-700)] transition-colors shrink-0">
            <Send className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
