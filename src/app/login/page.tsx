"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      router.push("/metadata");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Database className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground">CFO Pilot</h1>
          <p className="mt-1 text-sm text-muted-foreground">Metadata Management</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-foreground">Sign in</h2>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-10 w-full rounded-md border border-input bg-white px-3 pr-10 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 rounded-md bg-blue-50 border border-blue-100 p-3">
            <p className="mb-2 text-xs font-semibold text-blue-800">Demo credentials (no DB required)</p>
            <div className="space-y-1.5 text-xs text-blue-700">
              {[
                { label: "Admin", email: "admin@demo.com", pw: "admin123" },
                { label: "Manager", email: "manager@demo.com", pw: "manager123" },
                { label: "User", email: "user@demo.com", pw: "user123" },
                { label: "Viewer", email: "viewer@demo.com", pw: "viewer123" },
              ].map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => { setEmail(u.email); setPassword(u.pw); }}
                  className="flex w-full items-center justify-between rounded px-2 py-1 hover:bg-blue-100 transition-colors text-left"
                >
                  <span className="font-medium">{u.label}</span>
                  <span className="font-mono opacity-80">{u.email}</span>
                </button>
              ))}
              <p className="pt-1 opacity-60 text-[10px]">Click a row to auto-fill credentials</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
