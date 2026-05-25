// Registry of finance skills available to the Copilot.
//
// To add a new skill: import its export here and add to FINANCE_SKILLS.
// Each skill is auto-exposed as a Copilot tool with input_schema and
// description. The Copilot endpoint maps tool calls back to skill.execute().
//
// Future skills (Sprint I+): reconciliation, journal-entry, audit-support,
// sox-testing, cash-flow-narrative, board-pack.

import type { FinanceSkill } from "./types";
import { financialStatementsSkill } from "./financial-statements";
import { varianceAnalysisSkill }    from "./variance-analysis";
import { closeManagementSkill }     from "./close-management";
import { reconciliationSkill }      from "./reconciliation";
import { journalEntrySkill }        from "./journal-entry";
import { auditSupportSkill }        from "./audit-support";
import { soxTestingSkill }          from "./sox-testing";
import { journalEntryPrepSkill }    from "./journal-entry-prep";

export const FINANCE_SKILLS: Record<string, FinanceSkill> = {
  [financialStatementsSkill.name]: financialStatementsSkill,
  [varianceAnalysisSkill.name]:    varianceAnalysisSkill,
  [closeManagementSkill.name]:     closeManagementSkill,
  [reconciliationSkill.name]:      reconciliationSkill,
  [journalEntrySkill.name]:        journalEntrySkill,
  [auditSupportSkill.name]:        auditSupportSkill,
  [soxTestingSkill.name]:          soxTestingSkill,
  [journalEntryPrepSkill.name]:    journalEntryPrepSkill,
};

/** Anthropic tool definitions auto-built from registry */
export function skillsToToolDefs() {
  return Object.values(FINANCE_SKILLS).map(s => ({
    name: s.name,
    description: s.description,
    input_schema: s.inputSchema,
  }));
}

/** Returns the skill if name matches a registered finance skill.
 *  Uses `hasOwn` so inherited keys like `toString` / `constructor` don't
 *  accidentally resolve to `Object.prototype.toString` etc. — important
 *  because the `name` here comes from Anthropic tool_use responses.
 */
export function findSkill(name: string): FinanceSkill | null {
  return Object.prototype.hasOwnProperty.call(FINANCE_SKILLS, name)
    ? FINANCE_SKILLS[name]
    : null;
}

export type { FinanceSkill, FinanceSkillResult, FinanceSkillContext } from "./types";
