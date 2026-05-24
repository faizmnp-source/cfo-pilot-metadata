"use client";
import { ReportDetail } from "@/components/reports/ReportDetail";
export default function IncomeStatementPage() {
  return <ReportDetail kind="income-statement" title="Income Statement" subtitle="Revenue minus Expenses for the selected year" />;
}
