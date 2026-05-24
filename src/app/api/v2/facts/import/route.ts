// Facts import — Excel/CSV → FactRow batch insert.
//
// Two-step flow:
//   1. POST with mode=dry-run  → returns { rowsValid, rowsInvalid, errors[], preview[] }
//   2. POST with mode=commit   → inserts rows, returns { loadBatchId, rowsCommitted }
//
// Long-format file shape (one row per intersection):
//   Header row 1: Account | Entity | Scenario | Period | Currency | ICP |
//                 Origin | <UD labels> | Value
//   Member columns hold the member CODE, not UUID.
//
// Required columns are derived from which dims are enabled for the tenant
// (every enabled dim is required). The Value and Period columns are always
// required. Origin defaults to 'Import' if omitted.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";
import { parseFactsFile } from "@/lib/parse-facts-file";
import { ensureOriginMember, IMPORT_ORIGIN_CODE } from "@/lib/seed-origin";
import { ensureIcpSeed } from "@/lib/sync-icp";
import { ensureCurrencySeed, resolveSemanticCurrency } from "@/lib/seed-currency";
import { findNonLeafMembers } from "@/lib/leaf-check";
import type { DimensionKind } from "@prisma/client";

// Map header text → DimensionKind. Case-insensitive. We accept the
// label (Department), the slot (UD1), or the kind (DEPARTMENT).
function buildHeaderMap(
  enabledDims: { kind: string; label: string }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of enabledDims) {
    m.set(d.kind.toLowerCase(), d.kind);
    m.set(d.label.toLowerCase(), d.kind);
    if (d.kind.startsWith("UD")) {
      // Also accept "Cost Center" / "CostCenter" / "Cost_Center" variants
      const norm = d.label.toLowerCase().replace(/[\s_-]/g, "");
      m.set(norm, d.kind);
    }
  }
  return m;
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role === "VIEWER") return apiError("Viewer role cannot import facts", 403);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const mode = (form.get("mode") as string | null) ?? "dry-run";  // 'dry-run' | 'commit'
  if (!file) return apiError("No file uploaded (field 'file' required)", 400);
  if (!["dry-run", "commit"].includes(mode)) return apiError("mode must be 'dry-run' or 'commit'", 400);

  // ── Parse the file ──────────────────────────────────────────────
  const buffer = await file.arrayBuffer();
  let parsed;
  try {
    parsed = await parseFactsFile(buffer, file.type, file.name);
  } catch (e: any) {
    return apiError(e.message, 400);
  }

  // ── Load enabled dimensions for this tenant ─────────────────────
  const allDims = await prisma.dimension.findMany({
    where: { tenantId: auth.tid, isEnabled: true },
    select: { id: true, kind: true, label: true },
  });
  // ICP and ORIGIN are always present but ORIGIN is optional in the file
  const required: { kind: string; label: string }[] = [];
  for (const d of allDims) {
    const k = String(d.kind);
    // Always required (the 5 fixed dims + any enabled UDs/ICP)
    if (["ACCOUNT","ENTITY","SCENARIO","TIME","CURRENCY"].includes(k)) required.push({ kind: k, label: d.label });
    else if (k === "ICP") required.push({ kind: k, label: d.label });
    else if (k.startsWith("UD")) required.push({ kind: k, label: d.label });
    // ORIGIN is optional — defaults to 'Import'
  }

  // ── Header validation ────────────────────────────────────────────
  const headerMap = buildHeaderMap(required);
  // Strip the magic Value/Period columns from member-column matching
  const headerLower = parsed.headers.map(h => h.toLowerCase());
  const valueIdx  = headerLower.indexOf("value");
  const periodIdx = headerLower.indexOf("period");
  if (valueIdx < 0)  return apiError("File missing required column: Value", 422);
  if (periodIdx < 0) return apiError("File missing required column: Period (use Time member code, e.g. 2026M01)", 422);

  // Time uses the "Period" header — register it now so the missing-required check passes
  headerMap.set("period", "TIME");

  // Confirm every required dim has a matching header
  const headerKinds = new Set<string>();
  for (const h of parsed.headers) {
    const kind = headerMap.get(h.toLowerCase());
    if (kind) headerKinds.add(kind);
  }
  const missing = required.filter(d => !headerKinds.has(d.kind)).map(d => d.label);
  if (missing.length > 0) {
    return apiError(`File missing required columns: ${missing.join(", ")}`, 422, { missing });
  }

  // ── Build code→memberId lookup per dim (all in one round trip) ──
  const members = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, isActive: true },
    select: { id: true, memberCode: true, dimensionId: true, properties: true,
      dimension: { select: { kind: true } } },
  });
  const memberByKindCode = new Map<string, { id: string; properties: any }>();
  const memberById       = new Map<string, { code: string; kind: string; properties: any }>();
  for (const m of members) {
    const k = String(m.dimension.kind);
    memberByKindCode.set(`${k}::${m.memberCode}`, { id: m.id, properties: m.properties });
    memberById.set(m.id, { code: m.memberCode, kind: k, properties: m.properties });
  }

  // Leaf check (one shot for everything we might use)
  const allMemberIds = members.map(m => m.id);
  const nonLeaves = await findNonLeafMembers(auth.tid, allMemberIds);

  // ── Ensure system defaults (ICP=None, Origin=Import, Currency seeds) ──
  await ensureIcpSeed(auth.tid, auth.sub);
  await ensureCurrencySeed(auth.tid, auth.sub);
  const defaultOriginId = await ensureOriginMember(auth.tid, auth.sub, IMPORT_ORIGIN_CODE);
  const icpDim = allDims.find(d => String(d.kind) === "ICP");
  const noneIcpId = icpDim
    ? memberByKindCode.get(`ICP::None`)?.id ?? null
    : null;

  // ── Per-row validation ──────────────────────────────────────────
  type Issue = { row: number; field: string; message: string };
  type Resolved = {
    rowIndex: number;
    scenarioId: string; entityId: string; timeId: string; accountId: string;
    currencyId: string; icpId: string; originId: string;
    udIds: Record<string, string | null>;
    value: number;
    sourceRowHash: string;
  };
  const issues:   Issue[]   = [];
  const resolved: Resolved[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const r = parsed.rows[i];
    const rowNum = i + 2;   // header is row 1, data starts at row 2
    const rowErrs: Issue[] = [];

    // Value
    const valueStr = (r[parsed.headers[valueIdx]] ?? "").trim();
    const value = Number(valueStr.replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      rowErrs.push({ row: rowNum, field: "Value", message: `'${valueStr}' is not a number` });
    }

    // Resolve each enabled dim's column → memberId
    const ids: Record<string, string | null> = {};
    for (const d of required) {
      // Find the matching header for this dim
      const matchedHeader = parsed.headers.find(h => headerMap.get(h.toLowerCase()) === d.kind);
      if (!matchedHeader) continue;  // already caught above
      const code = (r[matchedHeader] ?? "").trim();
      if (!code) {
        rowErrs.push({ row: rowNum, field: d.label, message: `Required (every enabled dim must be filled)` });
        ids[d.kind] = null;
        continue;
      }
      const found = memberByKindCode.get(`${d.kind}::${code}`);
      if (!found) {
        rowErrs.push({ row: rowNum, field: d.label, message: `Unknown ${d.label} code '${code}'` });
        ids[d.kind] = null;
      } else {
        ids[d.kind] = found.id;
      }
    }

    // Origin column is optional → default to Import
    const originHeader = parsed.headers.find(h => h.toLowerCase() === "origin");
    let originId = defaultOriginId;
    if (originHeader) {
      const orgCode = (r[originHeader] ?? "").trim();
      if (orgCode) {
        const found = memberByKindCode.get(`ORIGIN::${orgCode}`);
        if (!found) rowErrs.push({ row: rowNum, field: "Origin", message: `Unknown Origin '${orgCode}'` });
        else originId = found.id;
      }
    }

    // Leaf checks — Account, Time, Entity must all be leaves
    for (const kind of ["ACCOUNT", "TIME", "ENTITY"] as const) {
      const id = ids[kind];
      if (id && nonLeaves.has(id)) {
        rowErrs.push({ row: rowNum, field: kind.charAt(0) + kind.slice(1).toLowerCase(),
          message: `${kind} member is a parent/rollup — data load only at leaf level` });
      }
    }

    // ICP rule — if account.is_icp = true, ICP must NOT be [None]
    if (ids.ACCOUNT) {
      const acctProps = memberById.get(ids.ACCOUNT)?.properties as any;
      if (acctProps?.is_icp === true) {
        const icpId = ids.ICP;
        if (!icpId || icpId === noneIcpId) {
          rowErrs.push({ row: rowNum, field: "ICP", message: `Account requires intercompany partner — ICP cannot be [None]` });
        }
      }
    }

    if (rowErrs.length > 0) {
      issues.push(...rowErrs);
      continue;
    }

    // Resolve Local/Reporting currency to concrete ISO
    let currencyId = ids.CURRENCY!;
    const resolvedCcy = await resolveSemanticCurrency(auth.tid, currencyId, ids.ENTITY!);
    if (resolvedCcy) currencyId = resolvedCcy;

    // Build the UD slot map
    const udIds: Record<string, string | null> = {
      ud1Id: null, ud2Id: null, ud3Id: null, ud4Id: null,
      ud5Id: null, ud6Id: null, ud7Id: null, ud8Id: null,
    };
    for (let s = 1; s <= 8; s++) {
      const kind = `UD${s}`;
      if (ids[kind]) udIds[`ud${s}Id`] = ids[kind];
    }

    // Source row hash — used for dedup if we re-import the same file
    const sourceRowHash = await sha256Hex(
      [ids.SCENARIO, ids.ENTITY, ids.ACCOUNT, ids.TIME, currencyId,
       ids.ICP ?? noneIcpId ?? "", originId, value.toString()].join("|")
    );

    resolved.push({
      rowIndex: rowNum,
      scenarioId: ids.SCENARIO!,
      entityId:   ids.ENTITY!,
      timeId:     ids.TIME!,
      accountId:  ids.ACCOUNT!,
      currencyId,
      icpId:      ids.ICP ?? noneIcpId!,
      originId,
      udIds,
      value,
      sourceRowHash,
    });
  }

  // ── Dry-run response ────────────────────────────────────────────
  if (mode === "dry-run") {
    return apiResponse({
      mode: "dry-run",
      rowsTotal:   parsed.rows.length,
      rowsValid:   resolved.length,
      rowsInvalid: parsed.rows.length - resolved.length,
      errors:      issues.slice(0, 100),   // cap UI payload
      preview:     resolved.slice(0, 20).map(r => ({
        rowIndex: r.rowIndex,
        value:    r.value,
      })),
    });
  }

  // ── Commit (all-or-nothing) ────────────────────────────────────
  if (issues.length > 0) {
    return apiError(`Cannot commit — ${issues.length} validation error(s). Fix and re-upload.`, 422, {
      rowsInvalid: parsed.rows.length - resolved.length,
      errors:      issues.slice(0, 100),
    });
  }
  if (resolved.length === 0) {
    return apiError("Nothing to import — 0 valid rows", 400);
  }

  // Create the ProcessRun + LoadBatch records
  const run = await prisma.processRun.create({
    data: {
      tenantId: auth.tid,
      kind:     "FACTS_IMPORT",
      params:   { filename: file.name, fileSize: file.size, mode: "commit" } as any,
      status:   "RUNNING",
      startedAt: new Date(),
      startedBy: auth.sub,
    },
  });
  const batch = await prisma.loadBatch.create({
    data: {
      tenantId:     auth.tid,
      processRunId: run.id,
      filename:     file.name,
      fileSize:     file.size,
      mimeType:     file.type || null,
      rowsTotal:    parsed.rows.length,
      rowsCommitted: 0,
      uploadedBy:   auth.sub,
    },
  });

  // Insert facts in a transaction. Re-saves bump version (matches form input).
  let committed = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const r of resolved) {
        const matchKey = {
          tenantId:   auth.tid,
          scenarioId: r.scenarioId,
          timeId:     r.timeId,
          entityId:   r.entityId,
          accountId:  r.accountId,
          currencyId: r.currencyId,
          icpId:      r.icpId,
          originId:   r.originId,
          ud1Id: r.udIds.ud1Id, ud2Id: r.udIds.ud2Id,
          ud3Id: r.udIds.ud3Id, ud4Id: r.udIds.ud4Id,
          ud5Id: r.udIds.ud5Id, ud6Id: r.udIds.ud6Id,
          ud7Id: r.udIds.ud7Id, ud8Id: r.udIds.ud8Id,
          isCurrent: true,
        };
        const prior = await tx.factRow.findFirst({ where: matchKey });
        if (prior) {
          await tx.factRow.update({ where: { id: prior.id }, data: { isCurrent: false } });
          await tx.factRow.create({
            data: {
              ...matchKey,
              valueTxn:       r.value,
              valueLocal:     r.value,
              valueReporting: r.value,
              version:        prior.version + 1,
              isCurrent:      true,
              postedBy:       auth.sub,
              loadBatchId:    batch.id,
              sourceRowHash:  Buffer.from(r.sourceRowHash, "hex"),
            },
          });
        } else {
          await tx.factRow.create({
            data: {
              ...matchKey,
              valueTxn:       r.value,
              valueLocal:     r.value,
              valueReporting: r.value,
              version:        1,
              isCurrent:      true,
              postedBy:       auth.sub,
              loadBatchId:    batch.id,
              sourceRowHash:  Buffer.from(r.sourceRowHash, "hex"),
            },
          });
        }
        committed++;
      }
    }, { timeout: 30_000 });
  } catch (e: any) {
    await prisma.processRun.update({
      where: { id: run.id },
      data:  { status: "FAILED", finishedAt: new Date(), error: String(e?.message ?? e) },
    });
    return apiError(`Import failed mid-commit: ${e?.message ?? e}`, 500);
  }

  await prisma.loadBatch.update({
    where: { id: batch.id }, data: { rowsCommitted: committed },
  });
  await prisma.processRun.update({
    where: { id: run.id },
    data: {
      status:     "SUCCEEDED",
      finishedAt: new Date(),
      rowsRead:    parsed.rows.length,
      rowsWritten: committed,
      rowsErrored: 0,
      summary:     `Imported ${committed} fact rows from ${file.name}`,
    },
  });

  try {
    await audit({
      tenantId:   auth.tid,
      userId:     auth.sub,
      action:     "IMPORT",
      entityType: "fact_row",
      entityId:   batch.id,
      metadata:   { rowsCommitted: committed, filename: file.name, processRunId: run.id },
    });
  } catch { /* ignore */ }

  return apiResponse({
    mode:           "commit",
    loadBatchId:    batch.id,
    processRunId:   run.id,
    rowsCommitted:  committed,
    rowsTotal:      parsed.rows.length,
  }, 201);
}

// ─── helpers ────────────────────────────────────────────────────────

async function sha256Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
