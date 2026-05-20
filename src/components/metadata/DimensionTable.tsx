"use client";

import { useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (row: T) => React.ReactNode;
}

export interface DimensionTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSort?: (key: string, direction: "asc" | "desc") => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onView?: (row: T) => void;
  onViewTree?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

function SortIcon({
  columnKey,
  sortKey,
  sortDir,
}: {
  columnKey: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}) {
  if (sortKey !== columnKey)
    return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />;
  if (sortDir === "asc")
    return <ChevronUp className="h-3 w-3 text-primary" />;
  return <ChevronDown className="h-3 w-3 text-primary" />;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols + 1 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-muted animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export function DimensionTable<T extends { id: string }>({
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  onSort,
  sortKey,
  sortDir,
  onEdit,
  onDelete,
  onView,
  onViewTree,
  loading = false,
  emptyMessage = "No records found",
  canEdit = true,
  canDelete = true,
}: DimensionTableProps<T>) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const totalPages = Math.ceil(total / pageSize);
  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);

  const handleSort = (key: string) => {
    if (!onSort) return;
    if (sortKey === key) {
      onSort(key, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSort(key, "asc");
    }
  };

  const hasActions = onEdit || onDelete || onView || onViewTree;

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
                    col.sortable && onSort && "cursor-pointer select-none hover:text-foreground",
                    col.width
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && onSort && (
                      <SortIcon columnKey={col.key} sortKey={sortKey} sortDir={sortDir} />
                    )}
                  </div>
                </th>
              ))}
              {hasActions && (
                <th className="w-10 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={columns.length} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasActions ? 1 : 0)}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  className="bg-white hover:bg-muted/20 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-foreground">
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "—")}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="px-4 py-3 text-right">
                      <div className="relative flex items-center justify-end">
                        <button
                          onClick={() =>
                            setMenuOpenId(menuOpenId === row.id ? null : row.id)
                          }
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {menuOpenId === row.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setMenuOpenId(null)}
                            />
                            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-white py-1 shadow-md">
                              {onView && (
                                <button
                                  onClick={() => { onView(row); setMenuOpenId(null); }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View Details
                                </button>
                              )}
                              {onViewTree && (
                                <button
                                  onClick={() => { onViewTree(row); setMenuOpenId(null); }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                                >
                                  <GitBranch className="h-3.5 w-3.5" />
                                  View Hierarchy
                                </button>
                              )}
                              {canEdit && onEdit && (
                                <button
                                  onClick={() => { onEdit(row); setMenuOpenId(null); }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                              )}
                              {canDelete && onDelete && (
                                <button
                                  onClick={() => { onDelete(row); setMenuOpenId(null); }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between px-1 pt-3">
          <p className="text-xs text-muted-foreground">
            Showing {startRecord}–{endRecord} of {total} records
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="flex h-7 w-7 items-center justify-center rounded border border-input text-muted-foreground disabled:opacity-40 hover:enabled:bg-muted hover:enabled:text-foreground transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded border text-xs transition-colors",
                    pageNum === page
                      ? "border-primary bg-primary text-white"
                      : "border-input text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded border border-input text-muted-foreground disabled:opacity-40 hover:enabled:bg-muted hover:enabled:text-foreground transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
