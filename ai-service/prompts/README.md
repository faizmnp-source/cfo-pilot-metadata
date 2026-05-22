# CFO Pilot — AI Prompt Library

**Owner:** prompt-engineer agent
**Status:** v1 — drafted 2026-05-21
**Used by:** `ai-service/` Python FastAPI service (when wired) and the Next.js API routes that call Claude directly for the AI Metadata Builder.

## Principles (load-bearing)

These are the rules every prompt in this folder must obey. They come from the EPM Solution Architect, the CFO buyer persona, and the FP&A Lead — the "AI proposes, human approves" rule is non-negotiable.

1. **Structured output only.** Every prompt returns JSON conforming to a stated schema. No free-text fields where structure is possible. No prose explanation outside of fields explicitly designed for it.
2. **Member IDs, never names.** Whenever the model references a dimension member in output, it returns the `member_id` (UUID), not the name. The Builder is the only exception (because it's *creating* members) — but its output schema still treats codes as opaque strings to be validated, not parsed.
3. **Confidence on every decision.** Per-row, 0.0–1.0. The application routes by confidence (≥0.95 auto-apply, 0.80–0.94 apply + flag, 0.60–0.79 hold for human, <0.60 escalate with options).
4. **Cite the evidence.** Every proposal includes the source row, the rule type used, and the reason — so the audit trail is readable.
5. **Never fabricate.** If the model can't determine a field with confidence ≥ 0.60, return `null` + a `reason_unclear` string. Don't guess.
6. **No DB writes.** The model proposes. The application validates and writes only after a human approves. Prompts must not include any "auto-execute" or "apply now" instructions to the model.
7. **Tenant-scoped retrieval.** Any context passed to the model comes from one tenant only. Prompts must include a `tenant_id` echo field so we can detect cross-tenant leaks in logs.

## Prompt files

| File | Purpose | Schema location |
|---|---|---|
| `metadata_builder.md` | Turn an uploaded ERP export / chart of accounts into a proposed Account + Entity + Hierarchy dimension. | Returns `MetadataBuilderProposal` |
| `smart_mapping.md` | Take a user's natural-language mapping rule + unmapped source rows, return structured mapping rules. | Returns `MappingRuleProposal[]` |
| `account_classifier.md` | Given a single unmapped account name/code, classify into the AccountType enum with confidence. | Returns `AccountClassification` |

## Versioning

Every prompt file has a `version` in its YAML header. Bump it whenever you change the system prompt OR the output schema. Old versions stay in `prompts/_archive/` so we can replay old proposals.

## Testing

Each prompt has a `tests/<prompt_name>_fixtures.jsonl` file with 20+ realistic mid-market inputs and expected outputs. The `qa` agent runs the suite on every prompt change. Target: ≥85% agreement with golden output on the fixture set.

## Hand-offs

- → **epm-architect**: when the output schema needs a new field (e.g. adding `time_balance`)
- → **engineer**: when a prompt is ready to be wired into the application
- → **qa**: when fixtures need to be added or accuracy regression-tested
