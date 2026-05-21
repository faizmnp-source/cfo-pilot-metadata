"use client";

// Global 401 → /login interceptor.
// Mounted once at the root layout. Patches window.fetch so any response
// from /api/* with status 401 redirects the user to /login?expired=1.
//
// Skips the patch when the user is already on /login (otherwise the
// login form's own POST would loop on initial failures).

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function AuthInterceptor() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname?.startsWith("/login")) return;

    const original = window.fetch.bind(window);
    let redirecting = false;

    const patched: typeof window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status !== 401) return res;

      const reqUrl = typeof args[0] === "string"
        ? args[0]
        : args[0] instanceof URL
          ? args[0].toString()
          : (args[0] as Request).url;

      const isApi = reqUrl.includes("/api/");
      const isAuthEndpoint = reqUrl.includes("/api/auth/");

      if (isApi && !isAuthEndpoint && !redirecting) {
        redirecting = true;
        // Stash where the user was so /login can bounce them back
        const back = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?expired=1&next=${back}`;
      }
      return res;
    };

    window.fetch = patched;
    return () => { window.fetch = original; };
  }, [pathname]);

  return null;
}
