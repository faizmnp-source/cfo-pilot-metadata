"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Adds `.atelier-theme` to <body> on every page EXCEPT /growth/*.
// Growth Engine keeps its own existing design.
export function AtelierBodyClass() {
  const pathname = usePathname();
  useEffect(() => {
    const isGrowth = pathname?.startsWith("/growth");
    if (isGrowth) document.body.classList.remove("atelier-theme");
    else document.body.classList.add("atelier-theme");
    return () => { /* leave class on for next nav */ };
  }, [pathname]);
  return null;
}
