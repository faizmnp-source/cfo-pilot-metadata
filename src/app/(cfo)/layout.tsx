import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { UnifiedSidebar } from "@/components/layout/UnifiedSidebar";

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
  } catch { /* use defaults */ }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-page)]">
      <UnifiedSidebar userName={userName} userRole={userRole} />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
