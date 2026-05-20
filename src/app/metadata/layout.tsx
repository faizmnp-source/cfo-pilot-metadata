import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { MetadataSidebar } from "@/components/layout/MetadataSidebar";

export default async function MetadataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read user info from cookie for sidebar props
  let userName = "User";
  let userRole = "VIEWER";

  try {
    const cookieStore = cookies();
    const token = cookieStore.get("auth-token")?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        userName = payload.name ?? payload.email ?? "User";
        userRole = payload.role ?? "VIEWER";
      }
    }
  } catch {
    // Use defaults
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MetadataSidebar
        userName={userName}
        userRole={userRole}
        tenantName="CFO Pilot"
      />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
