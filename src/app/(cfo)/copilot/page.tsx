"use client";

// AI Copilot — chat surface over our v2 APIs (tool-use).
//
// Layout: 280px conversation rail + chat thread + input bar.
// Each user message kicks /api/v2/copilot/chat (POST). Assistant reply may
// embed tool_use blocks; we render them as collapsible cards.
//
// No SSE yet — non-streaming v1. Good enough for first ship.

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Send, Loader2, Plus, MessageSquare, Wrench, ChevronDown, ChevronRight, AlertTriangle, RefreshCcw } from "lucide-react";

type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  toolUseBlocks?: ToolBlock[];
  model?: string | null;
  costInr?: number | null;
  stub?: boolean;
};
type ToolBlock = { tool: string; input: any; result?: any; error?: string };
type Convo = { id: string; title: string; updatedAt: string; _count?: { messages: number } };

const SUGGESTIONS = [
  "Show me a dashboard summary for FY2026 ACTUAL",
  "List all expense accounts",
  "Generate income statement for US_HQ FY2026",
  "How is the business doing this year?",
];

export default function CopilotPage() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<"haiku-4.5" | "sonnet-4.6">("haiku-4.5");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load convo list on mount
  useEffect(() => { refreshConvos(); }, []);

  // Auto-scroll thread on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, sending]);

  async function refreshConvos() {
    try {
      const r = await fetch("/api/v2/copilot/chat", { credentials: "include" });
      const j = await r.json();
      setConvos(j?.data?.data ?? []);
    } catch { /* swallow */ }
  }

  async function loadConvo(id: string) {
    setActiveId(id); setMessages([]); setError(null);
    try {
      const r = await fetch(`/api/v2/copilot/chat?id=${id}`, { credentials: "include" });
      const j = await r.json();
      const msgs = (j?.data?.messages ?? []).map((m: any) => ({
        id: m.id, role: m.role, content: m.content,
        toolUseBlocks: m.toolUseBlocks, model: m.model,
        costInr: m.costInr ? Number(m.costInr) : null,
      }));
      setMessages(msgs);
    } catch (e: any) { setError(e.message ?? String(e)); }
  }

  function newChat() { setActiveId(null); setMessages([]); setError(null); setInput(""); }

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput(""); setError(null);
    const userMsg: Msg = { role: "user", content: msg };
    setMessages(m => [...m, userMsg]);
    setSending(true);
    try {
      const r = await fetch("/api/v2/copilot/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, model, conversationId: activeId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      const data = j.data ?? j;
      if (data.conversationId && data.conversationId !== activeId) {
        setActiveId(data.conversationId);
        refreshConvos();
      }
      const assistantMsg: Msg = {
        role: "assistant",
        content: data.response?.content ?? "(no response)",
        toolUseBlocks: data.response?.toolUseBlocks ?? [],
        stub: data.response?.stub ?? false,
        model: data.cost?.model,
        costInr: data.cost?.inr,
      };
      setMessages(m => [...m, assistantMsg]);
    } catch (e: any) {
      setError(e.message ?? String(e));
      // Roll back the user msg so they can retry
      setMessages(m => m.slice(0, -1));
      setInput(msg);
    } finally { setSending(false); }
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      {/* Conversation rail */}
      <aside className="w-64 shrink-0 border-r border-stone-200 bg-stone-50/50 flex flex-col">
        <div className="p-3 border-b border-stone-200">
          <button onClick={newChat}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition">
            <Plus className="w-3.5 h-3.5" /> New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {convos.length === 0 && (
            <p className="text-[11px] text-stone-400 px-2 py-3 italic">No chats yet. Try the suggestions →</p>
          )}
          {convos.map(c => (
            <button key={c.id} onClick={() => loadConvo(c.id)}
              className={`w-full flex items-start gap-2 px-2 py-2 rounded-md text-left text-xs transition ${
                activeId === c.id ? "bg-violet-100 text-violet-900" : "text-stone-700 hover:bg-stone-100"
              }`}>
              <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{c.title || "Untitled"}</p>
                <p className="text-[10px] text-stone-500 mt-0.5">{c._count?.messages ?? 0} msgs · {new Date(c.updatedAt).toLocaleDateString()}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat thread */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        {/* Header */}
        <div className="border-b border-stone-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <h1 className="text-sm font-bold text-stone-900">AI Copilot</h1>
            <span className="text-[10px] text-stone-500">· tool-use chat over your finance data</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={model} onChange={e => setModel(e.target.value as any)}
              className="text-[11px] border border-stone-200 rounded px-2 py-1 bg-white">
              <option value="haiku-4.5">Haiku (fast, cheap)</option>
              <option value="sonnet-4.6">Sonnet (deeper)</option>
            </select>
          </div>
        </div>

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <EmptyState onSuggestion={send} />
          )}
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-stone-500 pl-10">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-2 px-3 py-2 rounded bg-rose-50 text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-stone-200 px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Ask anything — 'show dashboard for FY2026', 'list expense accounts', 'run consolidation on GRP'…"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 max-h-32"
              disabled={sending}
            />
            <button onClick={() => send()} disabled={sending || !input.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 transition">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send
            </button>
          </div>
          <p className="text-[10px] text-stone-400 text-center mt-1.5">Copilot can read & analyse your data, and trigger consolidation. Confirms before writes.</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto py-10 text-center">
      <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 items-center justify-center mb-4 shadow-lg shadow-violet-200/60">
        <Sparkles className="w-6 h-6 text-white" />
      </div>
      <h2 className="text-xl font-bold text-stone-900 mb-1">Ask your books anything</h2>
      <p className="text-sm text-stone-500 mb-6">Copilot uses your real metadata + facts. No spreadsheets. No hallucinations.</p>
      <div className="grid grid-cols-2 gap-2">
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => onSuggestion(s)}
            className="px-3 py-3 rounded-lg border border-stone-200 text-left text-xs text-stone-700 hover:border-violet-300 hover:bg-violet-50/40 transition">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-violet-600 text-white text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.stub && (
          <div className="mb-2 px-3 py-2 rounded bg-stone-100 text-stone-700 text-[11px] flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> Stub mode — set ANTHROPIC_API_KEY in Vercel env for live AI.
          </div>
        )}
        {msg.toolUseBlocks && msg.toolUseBlocks.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {msg.toolUseBlocks.map((t, i) => <ToolCard key={i} t={t} />)}
          </div>
        )}
        <div className="prose prose-sm max-w-none text-stone-800 whitespace-pre-wrap text-sm leading-relaxed">
          {msg.content}
        </div>
        {(msg.model || msg.costInr != null) && (
          <p className="text-[10px] text-stone-400 mt-2">
            {msg.model && <span>{msg.model}</span>}
            {msg.costInr != null && msg.costInr > 0 && <span> · ₹{msg.costInr.toFixed(2)}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

function ToolCard({ t }: { t: ToolBlock }) {
  const [open, setOpen] = useState(false);
  const status = t.error ? "error" : "ok";
  return (
    <div className={`rounded-md border ${status === "error" ? "border-rose-200 bg-rose-50/50" : "border-stone-200 bg-stone-50"}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-stone-700">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Wrench className="w-3 h-3 text-violet-500" />
        <span className="font-mono">{t.tool}</span>
        <span className="text-stone-400">·</span>
        <span className="text-stone-500 truncate">{Object.keys(t.input ?? {}).join(", ") || "no args"}</span>
        {t.error && <span className="ml-auto text-rose-600">error</span>}
      </button>
      {open && (
        <div className="px-3 pb-2 text-[10px] font-mono text-stone-600">
          <p className="mb-1 text-stone-400 uppercase tracking-wide">input</p>
          <pre className="bg-white/70 rounded px-2 py-1 overflow-x-auto">{JSON.stringify(t.input, null, 2)}</pre>
          {t.result && (
            <>
              <p className="mt-2 mb-1 text-stone-400 uppercase tracking-wide">result</p>
              <pre className="bg-white/70 rounded px-2 py-1 overflow-x-auto max-h-48">{JSON.stringify(t.result, null, 2).slice(0, 800)}{JSON.stringify(t.result).length > 800 ? "…" : ""}</pre>
            </>
          )}
          {t.error && (
            <>
              <p className="mt-2 mb-1 text-rose-600 uppercase tracking-wide">error</p>
              <pre className="bg-rose-50 text-rose-800 rounded px-2 py-1">{t.error}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
