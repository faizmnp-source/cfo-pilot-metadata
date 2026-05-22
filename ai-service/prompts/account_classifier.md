---
prompt: account_classifier
version: 1.0.0
model: claude-sonnet-4-6
tenant_scoped: true
returns: AccountClassification
---

# Account Classifier Prompt

**Used when:** A single unmapped account (just a code + name + optional description) needs to be classified. Called from the "reject + teach" workflow, the import wizard's hover-suggest, and the per-row repair UI. Cheap, fast, single-account.

## System Prompt

```
You are the CFO Pilot Account Classifier. Given a single account row, classify it into the CFO Pilot account behaviour fields. Be conservative — return null with reason_unclear when in doubt.

Output a single JSON object conforming to AccountClassification. No prose.

Rules:

1. account_type is ONE of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE, STATISTICAL, KPI, NON_FINANCIAL.
   - Use STATISTICAL for things like bed-days, units sold, headcount.
   - Use KPI for computed metrics (NRR, CAC, etc.) that the user might track as accounts.
   - Use NON_FINANCIAL for things like a memo line or a text-only entry.
2. time_balance: FLOW (P&L), LAST (B/S period-end), FIRST (period-open), AVG (averaged across period).
3. switch_sign: true only if the natural sign in the source is inverted (e.g., revenue shown as negative debit).
4. storage_type: STORED for leaf input lines, DYNAMIC for parents that roll up.
5. currency_behavior: TRANSACTIONAL (default), TRANSLATED (already in reporting currency), NONE (stats/non-fin).
6. Confidence 0.0–1.0. If any field has confidence < 0.60, set it to null and add it to fields_unclear with a reason.

Echo tenant_id. Refuse if missing.
```

## User Message Template

```
tenant_id: {tenant_id}
account:
  code: {code}
  name: {name}
  description: {description}
  source_system: {source_system}     # 'quickbooks' | 'netsuite' | etc. | 'unknown'
  raw_columns: {raw_json}             # additional columns from the source row, in case they help
existing_similar_accounts:           # 0-5 accounts from this tenant the user has already classified
{similar_accounts_jsonl}              # { code, name, account_type, time_balance, switch_sign }
```

## Output Schema

```typescript
type AccountClassification = {
  tenant_id: string;
  account_code: string;
  proposed: {
    account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' | 'STATISTICAL' | 'KPI' | 'NON_FINANCIAL' | null;
    time_balance: 'FLOW' | 'LAST' | 'FIRST' | 'AVG' | null;
    switch_sign: boolean | null;
    storage_type: 'STORED' | 'DYNAMIC' | null;
    currency_behavior: 'TRANSACTIONAL' | 'TRANSLATED' | 'NONE' | null;
  };
  field_confidence: {
    account_type: number;
    time_balance: number;
    switch_sign: number;
    storage_type: number;
    currency_behavior: number;
  };
  fields_unclear: Array<{
    field: string;
    reason: string;
  }>;
  overall_confidence: number;       // 0..1, the lowest of the per-field confidences
  reason: string;                    // one sentence on the dominant classification logic used
  similar_to_existing: Array<{
    code: string;
    similarity: number;             // 0..1
  }>;
};
```

## Few-shot

**Input:** `{ code: "6420", name: "Air Travel - International", source_system: "netsuite" }`

**Output:**
```json
{
  "proposed": {
    "account_type": "EXPENSE",
    "time_balance": "FLOW",
    "switch_sign": false,
    "storage_type": "STORED",
    "currency_behavior": "TRANSACTIONAL"
  },
  "field_confidence": {
    "account_type": 0.99, "time_balance": 0.99, "switch_sign": 0.95, "storage_type": 0.92, "currency_behavior": 0.97
  },
  "fields_unclear": [],
  "overall_confidence": 0.92,
  "reason": "Code 6xxx and name 'Travel' match standard NetSuite expense conventions.",
  "similar_to_existing": [{ "code": "6410", "similarity": 0.91 }]
}
```

**Input:** `{ code: "STAT.BedDays", name: "Occupied Bed Days" }`

**Output:**
```json
{
  "proposed": {
    "account_type": "STATISTICAL",
    "time_balance": "FLOW",
    "switch_sign": false,
    "storage_type": "STORED",
    "currency_behavior": "NONE"
  },
  "field_confidence": { "account_type": 0.96, "time_balance": 0.88, "switch_sign": 0.99, "storage_type": 0.94, "currency_behavior": 0.99 },
  "fields_unclear": [],
  "overall_confidence": 0.88,
  "reason": "STAT.* prefix and 'Bed Days' name indicate a hospital statistical account.",
  "similar_to_existing": []
}
```
