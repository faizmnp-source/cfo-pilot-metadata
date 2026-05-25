import { CommandPalette } from "@/components/cmd/CommandPalette";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { UnifiedSidebar } from "@/components/layout/UnifiedSidebar";
import { AtelierBodyClass } from "@/components/layout/AtelierBodyClass";

export default async function CfoLayout({ children }: { children: React.ReactNode }) {
  let userName = "User";
  let userRole = "CFO";

  try {
    const cookieStore = cookies();
    const token = cookieStore.get("cfo_metadata_token")?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        userName = payload.name ?? payload.email ?? "User";
        userRole = payload.role ?? "CFO";
      }
    }
  } catch { /* defaults */ }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--paper, #f5efe2)" }}>
      {/* Auto-toggles body.atelier-theme on every page, removes on /growth */}
      <AtelierBodyClass />
      <UnifiedSidebar userName={userName} userRole={userRole} />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">{children}
      <CommandPalette /></div>
    </div>
  );
}
