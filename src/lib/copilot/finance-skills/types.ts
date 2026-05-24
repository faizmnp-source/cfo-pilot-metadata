// Type definitions for finance skill wrappers.
//
// Each FinanceSkill becomes a Copilot tool. When invoked, the executor
// fetches the relevant data from our v2 APIs and returns a payload
// containing both the data AND the skill's analytical guidance. Claude
// then internalizes the guidance and produces the final narrative.
//
// This avoids an extra Anthropic round-trip per skill (which would
// double cost) while still giving Claude the skill's expert lens.

export interface FinanceSkillResult {
  /** The skill's analytical lens — Claude follows this to interpret data */
  skill_guidance: string;
  /** Fetched data from v2 APIs */
  data: any;
  /** Direct instruction: "now do this with the guidance + data above" */
  instructions: string;
  /** Optional metadata (period, currency, etc.) */
  meta?: Record<string, any>;
}

export interface FinanceSkillContext {
  tenantId: string;
  sessionCookie: string;
  baseUrl: string;   // for internal fetch calls
}

export interface FinanceSkill {
  /** Tool name as exposed to Anthropic — snake_case */
  name: string;
  /** Tool description shown to Claude */
  description: string;
  /** Tool input_schema for Anthropic */
  inputSchema: any;
  /** Skill prompt content — distilled from plugin SKILL.md */
  skillPrompt: string;
  /** Execute: fetch data + return skill payload */
  execute: (args: any, ctx: FinanceSkillContext) => Promise<FinanceSkillResult>;
}
