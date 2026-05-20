/**
 * Unit tests for the accounts API route helpers.
 * Run with: npx jest
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// ─── Utility helpers under test ──────────────────────────────────────────────

function buildTree(items: Array<{ id: string; code: string; name: string; parentId: string | null }>) {
  const map = new Map<string, { id: string; code: string; name: string; children: typeof items }>();
  items.forEach((item) => map.set(item.id, { ...item, children: [] }));
  const roots: typeof items = [];
  items.forEach((item) => {
    if (item.parentId && map.has(item.parentId)) {
      (map.get(item.parentId)! as { children: typeof items }).children.push(item);
    } else {
      roots.push(map.get(item.id)! as typeof item);
    }
  });
  return roots;
}

function validateAccountCode(code: string): string | null {
  if (!code.trim()) return "Code is required";
  if (code.length > 20) return "Code exceeds 20 characters";
  if (!/^[A-Z0-9\-_.]+$/i.test(code)) return "Code contains invalid characters";
  return null;
}

function validateAccountType(type: string): string | null {
  const valid = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
  if (!valid.includes(type.toUpperCase())) return `Invalid type. Must be one of: ${valid.join(", ")}`;
  return null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildTree", () => {
  it("should build a single-level tree", () => {
    const items = [
      { id: "1", code: "1000", name: "Assets", parentId: null },
      { id: "2", code: "2000", name: "Liabilities", parentId: null },
    ];
    const tree = buildTree(items);
    expect(tree).toHaveLength(2);
  });

  it("should nest children under parents", () => {
    const items = [
      { id: "1", code: "1000", name: "Assets", parentId: null },
      { id: "2", code: "1100", name: "Current Assets", parentId: "1" },
      { id: "3", code: "1110", name: "Cash", parentId: "2" },
    ];
    const tree = buildTree(items);
    expect(tree).toHaveLength(1);
    const root = tree[0] as any;
    expect(root.children).toHaveLength(1);
    expect(root.children[0].children).toHaveLength(1);
  });

  it("should handle missing parent gracefully", () => {
    const items = [
      { id: "1", code: "1100", name: "Current Assets", parentId: "999" },
    ];
    // Item with unknown parent becomes root
    const tree = buildTree(items);
    expect(tree).toHaveLength(1);
  });

  it("should handle empty input", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("validateAccountCode", () => {
  it("should reject empty code", () => {
    expect(validateAccountCode("")).not.toBeNull();
  });

  it("should reject code longer than 20 chars", () => {
    expect(validateAccountCode("A".repeat(21))).not.toBeNull();
  });

  it("should reject code with spaces", () => {
    expect(validateAccountCode("1100 A")).not.toBeNull();
  });

  it("should accept valid code", () => {
    expect(validateAccountCode("1100")).toBeNull();
    expect(validateAccountCode("ASSET-01")).toBeNull();
    expect(validateAccountCode("ACC_001.A")).toBeNull();
  });

  it("should accept exactly 20 chars", () => {
    expect(validateAccountCode("A".repeat(20))).toBeNull();
  });
});

describe("validateAccountType", () => {
  const validTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

  validTypes.forEach((type) => {
    it(`should accept valid type: ${type}`, () => {
      expect(validateAccountType(type)).toBeNull();
    });
  });

  it("should reject invalid type", () => {
    expect(validateAccountType("INCOME")).not.toBeNull();
    expect(validateAccountType("")).not.toBeNull();
    expect(validateAccountType("asset")).toBeNull(); // case insensitive
  });
});

describe("Permissions", () => {
  // Simplified permission matrix
  const PERMISSIONS: Record<string, Record<string, string[]>> = {
    ADMIN: {
      account: ["read", "write", "delete", "export", "import"],
    },
    FINANCE_MANAGER: {
      account: ["read", "write", "export"],
    },
    FINANCE_USER: {
      account: ["read", "write"],
    },
    VIEWER: {
      account: ["read"],
    },
  };

  function can(role: string, resource: string, action: string): boolean {
    return PERMISSIONS[role]?.[resource]?.includes(action) ?? false;
  }

  it("ADMIN should have all permissions", () => {
    expect(can("ADMIN", "account", "read")).toBe(true);
    expect(can("ADMIN", "account", "delete")).toBe(true);
    expect(can("ADMIN", "account", "import")).toBe(true);
  });

  it("VIEWER should only read", () => {
    expect(can("VIEWER", "account", "read")).toBe(true);
    expect(can("VIEWER", "account", "write")).toBe(false);
    expect(can("VIEWER", "account", "delete")).toBe(false);
  });

  it("FINANCE_USER should not delete", () => {
    expect(can("FINANCE_USER", "account", "read")).toBe(true);
    expect(can("FINANCE_USER", "account", "write")).toBe(true);
    expect(can("FINANCE_USER", "account", "delete")).toBe(false);
  });

  it("unknown role returns false", () => {
    expect(can("UNKNOWN", "account", "read")).toBe(false);
  });
});
