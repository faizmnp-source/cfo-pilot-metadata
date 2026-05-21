import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthInterceptor } from "@/components/AuthInterceptor";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "CFO Pilot — Metadata Management",
  description: "Enterprise-grade master data management for finance teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <AuthInterceptor />
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
