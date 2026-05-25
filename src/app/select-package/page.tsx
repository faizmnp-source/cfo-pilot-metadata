// Public pre-login pricing / package picker.
// Renders the four Tier cards from src/lib/packaging/tiers.ts.
// Atelier-themed, no auth required.
"use client";
import { useEffect, useState } from "react";
import { TIERS } from "@/lib/packaging/tiers";

export default function SelectPackagePage() {
  const [ccy, setCcy] = useState<"INR" | "USD">("INR");

  useEffect(() => {
    document.body.classList.add("atelier-theme");
    return () => { document.body.classList.remove("atelier-theme"); };
  }, []);

  return (
    <main style={{ background: "var(--paper)", color: "var(--ink)", minHeight: "100vh", padding: "60px 40px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="text-center" style={{ marginBottom: 48 }}>
          <div className="atelier-eyebrow" style={{ fontSize: 11, color: "var(--accent)" }}>CFO Pilot · Choose your edition</div>
          <h1 className="atelier-serif" style={{ fontSize: 48, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 10 }}>
            The Finance Operating System
          </h1>
          <p className="atelier-serif italic mt-3" style={{ fontSize: 16, color: "var(--ink-3)", maxWidth: 720, margin: "16px auto 0" }}>
            One platform, four editions. Start with reporting, scale to a full finance OS as your team grows.
          </p>

          <div className="inline-flex items-center mt-7 rounded-full border" style={{ borderColor: "var(--ink)", overflow: "hidden" }}>
            <button onClick={() => setCcy("INR")} className="atelier-serif px-4 py-1.5"
              style={{ fontSize: 13, fontWeight: 600, background: ccy === "INR" ? "var(--ink)" : "transparent", color: ccy === "INR" ? "var(--paper)" : "var(--ink)" }}>
              ₹ INR
            </button>
            <button onClick={() => setCcy("USD")} className="atelier-serif px-4 py-1.5"
              style={{ fontSize: 13, fontWeight: 600, background: ccy === "USD" ? "var(--ink)" : "transparent", color: ccy === "USD" ? "var(--paper)" : "var(--ink)" }}>
              $ USD
            </button>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          {TIERS.map(t => {
            const isContact = t.priceInrPerMonth === 0 && t.priceUsdPerMonth === 0;
            return (
              <div key={t.key} className="atelier-card" style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 32, position: "relative" }}>
                <div className="atelier-eyebrow" style={{ color: t.key === "ENTERPRISE" ? "var(--accent)" : "var(--ink-3)", fontSize: 11 }}>{t.label}</div>
                <h2 className="atelier-serif" style={{ fontSize: 26, fontWeight: 600, marginTop: 6, letterSpacing: "-0.01em" }}>{t.tagline}</h2>

                <div className="atelier-serif tnum" style={{ fontSize: 42, fontWeight: 500, marginTop: 18, letterSpacing: "-0.02em" }}>
                  {isContact ? "Contact" : (ccy === "INR" ? "₹" + t.priceInrPerMonth.toLocaleString("en-IN") : "$" + t.priceUsdPerMonth.toLocaleString())}
                  {!isContact && <span className="atelier-eyebrow ml-1" style={{ fontSize: 10, color: "var(--ink-3)" }}>/ month</span>}
                </div>

                <ul style={{ marginTop: 22, listStyle: "none", padding: 0 }}>
                  {t.highlights.map((h, i) => (
                    <li key={i} className="atelier-serif" style={{ fontSize: 14, lineHeight: 1.5, padding: "5px 0", borderTop: i === 0 ? "1px solid var(--rule)" : undefined }}>
                      <span className="atelier-eyebrow mr-2" style={{ color: "var(--accent)" }}>·</span>{h}
                    </li>
                  ))}
                </ul>

                <a href={isContact ? "mailto:sales@cfopilot.ai" : "/login"} className="atelier-pill atelier-pill-dark mt-6 inline-block" style={{ textAlign: "center" }}>
                  {isContact ? "Talk to sales" : "Start with " + t.label} →
                </a>
              </div>
            );
          })}
        </div>

        <p className="atelier-serif italic mt-12" style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center" }}>
          All tiers include audit trail, lineage drill, monthly close checklist, and unlimited fact rows.
          Switch tiers any time from your tenant&apos;s App Settings.
        </p>
      </div>
    </main>
  );
}
