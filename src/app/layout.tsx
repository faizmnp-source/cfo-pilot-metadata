import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "CFO Pilot — Metadata Management",
  description: "Enterprise-grade master data management for finance teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-screen">
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
