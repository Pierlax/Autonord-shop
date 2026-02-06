/**
 * Skills Module — Public API
 * 
 * Re-exports the core types, registry functions, and skill loader.
 */

export type {
  AgentSkill,
  SkillContext,
  SkillResult,
  SkillStatus,
  SkillMetadata,
  SkillHealthStatus,
  SkillExecutionLog,
  HealthState,
} from './types';

export { createSkillContext } from './types';

export {
  registerSkill,
  unregisterSkill,
  getSkill,
  listSkills,
  listSkillNames,
  getSkillsHealth,
  executeSkill,
  getExecutionLogs,
  getExecutionLog,
  getExecutionStats,
} from './registry';

export { loadAllSkills } from './loader';
