/*
 * Unit tests for the RBAC matrix in src/lib/permissions.ts.
 *
 * Every authenticated v2 API call funnels through `requireAuthAndPermission`
 * in api-helpers.ts, which in turn calls `can(role, resource, action)`. If a
 * cell silently flips here, an entire category of users either loses access
 * (false negative) or gains forbidden writes (false positive). Pin every
 * documented cell so any matrix edit must show up in a diff.
 *
 * No DB, no I/O, no Next runtime — `can()` is a pure lookup.
 *
 * Surface (4 roles × 14 resources × 7 actions = 392 cells; we pin them in
 * groups rather than one-test-per-cell):
 *   - per-resource: assert the four-row matrix for that resource
 *   - cross-cutting invariants (every VIEWER write is false, ADMIN cannot
 *     delete settings, auditLog is admin-only, etc.)
 *   - defensive: unknown role / resource / action → false (never undefined)
 */

import { can, Role, Action, Resource } from "./permissions";

// All roles and actions, used by cross-cutting checks.
const ROLES: Role[] = ["ADMIN", "FINANCE_MANAGER", "FINANCE_USER", "VIEWER"];
const ACTIONS: Action[] = [
  "create",
  "read",
  "update",
  "delete",
  "import",
  "export",
  "bulkUpdate",
];
const RESOURCES: Resource[] = [
  "account",
  "entity",
  "department",
  "costCenter",
  "currency",
  "scenario",
  "time",
  "icp",
  "project",
  "dimension",
  "importJob",
  "auditLog",
  "user",
  "settings",
];

// Helper: a "row" of permissions for one role × one resource.
type Row = Record<Action, boolean>;

/** Assert that can(role, resource, *) matches the expected row exactly. */
function expectRow(role: Role, resource: Resource, row: Row): void {
  for (const action of ACTIONS) {
    expect({
      role,
      resource,
      action,
      allowed: can(role, resource, action),
    }).toEqual({
      role,
      resource,
      action,
      allowed: row[action],
    });
  }
}

// Common rows reused across the "metadata" resources that all follow the
// same shape: ADMIN god-mode, others read-only (+ export for the two
// finance roles).
const ADMIN_FULL: Row = {
  create: true,
  read: true,
  update: true,
  delete: true,
  import: true,
  export: true,
  bulkUpdate: true,
};
const FINANCE_READ_EXPORT: Row = {
  create: false,
  read: true,
  update: false,
  delete: false,
  import: false,
  export: true,
  bulkUpdate: false,
};
const VIEWER_READ_ONLY: Row = {
  create: false,
  read: true,
  update: false,
  delete: false,
  import: false,
  export: false,
  bulkUpdate: false,
};
const FINANCE_READ_ONLY: Row = {
  create: false,
  read: true,
  update: false,
  delete: false,
  import: false,
  export: false,
  bulkUpdate: false,
};

// ---------------------------------------------------------------------------
// Resources that share the "metadata" shape: account, entity, department,
// costCenter, icp, project, dimension
// ---------------------------------------------------------------------------

describe.each<Resource>([
  "account",
  "entity",
  "department",
  "costCenter",
  "icp",
  "project",
  "dimension",
])("metadata resource — %s", (resource) => {
  test("ADMIN gets full god-mode row", () => {
    expectRow("ADMIN", resource, ADMIN_FULL);
  });

  test("FINANCE_MANAGER is read + export only", () => {
    expectRow("FINANCE_MANAGER", resource, FINANCE_READ_EXPORT);
  });

  test("FINANCE_USER is read + export only", () => {
    expectRow("FINANCE_USER", resource, FINANCE_READ_EXPORT);
  });

  test("VIEWER is read-only — no export, no write", () => {
    expectRow("VIEWER", resource, VIEWER_READ_ONLY);
  });
});

// ---------------------------------------------------------------------------
// currency — stricter: finance roles lose export
// ---------------------------------------------------------------------------

describe("resource — currency (admin-only writes; no export below ADMIN)", () => {
  test("ADMIN gets full god-mode", () => {
    expectRow("ADMIN", "currency", ADMIN_FULL);
  });

  test("FINANCE_MANAGER is read-only (NOT export — currency is admin-controlled)", () => {
    expectRow("FINANCE_MANAGER", "currency", FINANCE_READ_ONLY);
  });

  test("FINANCE_USER is read-only", () => {
    expectRow("FINANCE_USER", "currency", FINANCE_READ_ONLY);
  });

  test("VIEWER is read-only", () => {
    expectRow("VIEWER", "currency", VIEWER_READ_ONLY);
  });
});

// ---------------------------------------------------------------------------
// scenario & time — FINANCE_MANAGER may create + update (drives planning)
// ---------------------------------------------------------------------------

describe.each<Resource>(["scenario", "time"])(
  "resource — %s (FM may create+update for planning)",
  (resource) => {
    test("ADMIN gets full god-mode", () => {
      expectRow("ADMIN", resource, ADMIN_FULL);
    });

    test("FINANCE_MANAGER may create, read, update + export (no delete, no import, no bulkUpdate)", () => {
      expectRow("FINANCE_MANAGER", resource, {
        create: true,
        read: true,
        update: true,
        delete: false,
        import: false,
        export: true,
        bulkUpdate: false,
      });
    });

    test("FINANCE_USER is read-only — cannot move planning periods/scenarios", () => {
      expectRow("FINANCE_USER", resource, FINANCE_READ_ONLY);
    });

    test("VIEWER is read-only", () => {
      expectRow("VIEWER", resource, VIEWER_READ_ONLY);
    });
  }
);

// ---------------------------------------------------------------------------
// importJob — FINANCE_MANAGER may create + import (kick off data loads)
// ---------------------------------------------------------------------------

describe("resource — importJob (FM may create + import data loads)", () => {
  test("ADMIN gets full god-mode", () => {
    expectRow("ADMIN", "importJob", ADMIN_FULL);
  });

  test("FINANCE_MANAGER may create, read, import (no update/delete/export/bulkUpdate)", () => {
    expectRow("FINANCE_MANAGER", "importJob", {
      create: true,
      read: true,
      update: false,
      delete: false,
      import: true,
      export: false,
      bulkUpdate: false,
    });
  });

  test("FINANCE_USER is read-only — cannot launch a data load", () => {
    expectRow("FINANCE_USER", "importJob", FINANCE_READ_ONLY);
  });

  test("VIEWER is read-only — visibility into past loads but no action", () => {
    expectRow("VIEWER", "importJob", VIEWER_READ_ONLY);
  });
});

// ---------------------------------------------------------------------------
// auditLog — read-only, admin-only export, totally invisible to USER/VIEWER
// ---------------------------------------------------------------------------

describe("resource — auditLog (admin read+export; FM read; USER/VIEWER cannot read)", () => {
  test("ADMIN can read + export (and nothing else — audit log is append-only)", () => {
    expectRow("ADMIN", "auditLog", {
      create: false,
      read: true,
      update: false,
      delete: false,
      import: false,
      export: true,
      bulkUpdate: false,
    });
  });

  test("FINANCE_MANAGER can only read (no export)", () => {
    expectRow("FINANCE_MANAGER", "auditLog", FINANCE_READ_ONLY);
  });

  test("FINANCE_USER cannot even READ the audit log", () => {
    expectRow("FINANCE_USER", "auditLog", {
      create: false,
      read: false,
      update: false,
      delete: false,
      import: false,
      export: false,
      bulkUpdate: false,
    });
  });

  test("VIEWER cannot even READ the audit log", () => {
    expectRow("VIEWER", "auditLog", {
      create: false,
      read: false,
      update: false,
      delete: false,
      import: false,
      export: false,
      bulkUpdate: false,
    });
  });
});

// ---------------------------------------------------------------------------
// user — admin-only CRUD; FM may read; USER/VIEWER cannot see the user list
// ---------------------------------------------------------------------------

describe("resource — user (admin CRUD; FM read; USER/VIEWER cannot read)", () => {
  test("ADMIN may create/read/update/delete (no import/export/bulkUpdate)", () => {
    expectRow("ADMIN", "user", {
      create: true,
      read: true,
      update: true,
      delete: true,
      import: false,
      export: false,
      bulkUpdate: false,
    });
  });

  test("FINANCE_MANAGER may read (and only read)", () => {
    expectRow("FINANCE_MANAGER", "user", FINANCE_READ_ONLY);
  });

  test("FINANCE_USER cannot read the user list", () => {
    expectRow("FINANCE_USER", "user", {
      create: false,
      read: false,
      update: false,
      delete: false,
      import: false,
      export: false,
      bulkUpdate: false,
    });
  });

  test("VIEWER cannot read the user list", () => {
    expectRow("VIEWER", "user", {
      create: false,
      read: false,
      update: false,
      delete: false,
      import: false,
      export: false,
      bulkUpdate: false,
    });
  });
});

// ---------------------------------------------------------------------------
// settings — ADMIN cannot delete; FM may update; lower roles read-only
// ---------------------------------------------------------------------------

describe("resource — settings (ADMIN cannot delete; FM may update)", () => {
  test("ADMIN may create/read/update — but NOT delete (settings rows persist)", () => {
    expectRow("ADMIN", "settings", {
      create: true,
      read: true,
      update: true,
      delete: false,
      import: false,
      export: false,
      bulkUpdate: false,
    });
  });

  test("FINANCE_MANAGER may read + update settings", () => {
    expectRow("FINANCE_MANAGER", "settings", {
      create: false,
      read: true,
      update: true,
      delete: false,
      import: false,
      export: false,
      bulkUpdate: false,
    });
  });

  test("FINANCE_USER may read", () => {
    expectRow("FINANCE_USER", "settings", FINANCE_READ_ONLY);
  });

  test("VIEWER may read", () => {
    expectRow("VIEWER", "settings", VIEWER_READ_ONLY);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting invariants — catch silent matrix-wide regressions
// ---------------------------------------------------------------------------

describe("invariants — VIEWER never writes anywhere", () => {
  test.each(RESOURCES)("VIEWER cannot create/update/delete/import/bulkUpdate %s", (resource) => {
    expect(can("VIEWER", resource, "create")).toBe(false);
    expect(can("VIEWER", resource, "update")).toBe(false);
    expect(can("VIEWER", resource, "delete")).toBe(false);
    expect(can("VIEWER", resource, "import")).toBe(false);
    expect(can("VIEWER", resource, "bulkUpdate")).toBe(false);
  });

  test("VIEWER never exports anything", () => {
    for (const r of RESOURCES) expect(can("VIEWER", r, "export")).toBe(false);
  });
});

describe("invariants — FINANCE_USER never writes anywhere", () => {
  test.each(RESOURCES)("FINANCE_USER cannot create/update/delete/import/bulkUpdate %s", (resource) => {
    expect(can("FINANCE_USER", resource, "create")).toBe(false);
    expect(can("FINANCE_USER", resource, "update")).toBe(false);
    expect(can("FINANCE_USER", resource, "delete")).toBe(false);
    expect(can("FINANCE_USER", resource, "import")).toBe(false);
    expect(can("FINANCE_USER", resource, "bulkUpdate")).toBe(false);
  });
});

describe("invariants — FINANCE_MANAGER never deletes or bulk-updates", () => {
  test.each(RESOURCES)("FINANCE_MANAGER cannot delete %s", (resource) => {
    expect(can("FINANCE_MANAGER", resource, "delete")).toBe(false);
  });

  test.each(RESOURCES)("FINANCE_MANAGER cannot bulkUpdate %s", (resource) => {
    expect(can("FINANCE_MANAGER", resource, "bulkUpdate")).toBe(false);
  });
});

describe("invariants — ADMIN is god-mode wherever it makes sense", () => {
  test.each(RESOURCES)("ADMIN can always read %s", (resource) => {
    expect(can("ADMIN", resource, "read")).toBe(true);
  });

  // ADMIN cannot create on auditLog (append-only system writes), cannot
  // delete settings — every OTHER resource lets ADMIN create+update.
  const writableByAdmin = RESOURCES.filter((r) => r !== "auditLog");
  test.each(writableByAdmin)("ADMIN can create %s (except auditLog)", (resource) => {
    expect(can("ADMIN", resource, "create")).toBe(true);
  });

  test("ADMIN cannot CREATE on auditLog (append-only via system)", () => {
    expect(can("ADMIN", "auditLog", "create")).toBe(false);
  });

  test("ADMIN cannot DELETE on auditLog (immutable audit trail)", () => {
    expect(can("ADMIN", "auditLog", "delete")).toBe(false);
  });

  test("ADMIN cannot DELETE settings (settings persist; only update)", () => {
    expect(can("ADMIN", "settings", "delete")).toBe(false);
  });
});

describe("invariants — read access for every authenticated role on operating resources", () => {
  // Operating resources every finance role needs to see (excludes auditLog
  // and user, which restrict read to ADMIN/FM).
  const operating: Resource[] = [
    "account",
    "entity",
    "department",
    "costCenter",
    "currency",
    "scenario",
    "time",
    "icp",
    "project",
    "dimension",
    "importJob",
    "settings",
  ];

  test.each(operating)("every role can read %s", (resource) => {
    for (const role of ROLES) {
      expect(can(role, resource, "read")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Defensive — null-safety fallback in `can()`
// ---------------------------------------------------------------------------

describe("can() defensive — unknown inputs", () => {
  test("unknown resource returns false (not undefined)", () => {
    // Cast through string to reach the PERMISSIONS[resource]?.[…] fallback.
    expect(can("ADMIN", "nope" as unknown as Resource, "read")).toBe(false);
  });

  test("unknown role returns false (not undefined)", () => {
    expect(can("ROOT" as unknown as Role, "account", "read")).toBe(false);
  });

  test("unknown action returns false (not undefined)", () => {
    expect(can("ADMIN", "account", "transmogrify" as unknown as Action)).toBe(false);
  });

  test("every defined cell returns a strict boolean (never undefined/null)", () => {
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          const value = can(role, resource, action);
          expect(typeof value).toBe("boolean");
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Sanity — known-business-rule spot checks (regression catchers)
// ---------------------------------------------------------------------------

describe("business-rule spot checks", () => {
  test("VIEWER cannot delete a department", () => {
    expect(can("VIEWER", "department", "delete")).toBe(false);
  });

  test("FINANCE_USER cannot launch an import", () => {
    expect(can("FINANCE_USER", "importJob", "import")).toBe(false);
  });

  test("FINANCE_MANAGER cannot delete a scenario it created", () => {
    expect(can("FINANCE_MANAGER", "scenario", "delete")).toBe(false);
  });

  test("FINANCE_MANAGER cannot export currency master data", () => {
    expect(can("FINANCE_MANAGER", "currency", "export")).toBe(false);
  });

  test("FINANCE_USER cannot read the audit log (privacy boundary)", () => {
    expect(can("FINANCE_USER", "auditLog", "read")).toBe(false);
  });

  test("FINANCE_MANAGER cannot create new users", () => {
    expect(can("FINANCE_MANAGER", "user", "create")).toBe(false);
  });

  test("ADMIN can bulkUpdate accounts (mass-edit flow)", () => {
    expect(can("ADMIN", "account", "bulkUpdate")).toBe(true);
  });

  test("ADMIN cannot bulkUpdate users (no mass-edit on people)", () => {
    expect(can("ADMIN", "user", "bulkUpdate")).toBe(false);
  });
});
