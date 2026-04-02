/**
 * Skill Loader — Registers all available skills at startup
 * 
 * This module is called once during application initialization
 * to populate the SkillRegistry with all available skills.
 */

import { createLogger } from '@/lib/logger';
import { registerSkill, listSkillNames } from './registry';

// Import skill implementations
import { productEnrichmentSkill } from '@/skills/product-enrichment';
import { blogResearchSkill } from '@/skills/blog-research';
import { contentValidationSkill } from '@/skills/content-validation';
import { imageSearchSkill } from '@/skills/image-search';

const log = createLogger('skill-loader');

let loaded = false;

/**
 * Load and register all skills.
 * Safe to call multiple times — will only load once.
 */
export function loadAllSkills(): void {
  if (loaded) {
    return;
  }

  log.info('Loading all skills...');

  const allSkills = [
    productEnrichmentSkill,
    blogResearchSkill,
    contentValidationSkill,
    imageSearchSkill,
  ];

  for (const skill of allSkills) {
    try {
      registerSkill(skill);
    } catch (error) {
      log.error(`Failed to register skill "${skill.metadata.name}"`, error);
    }
  }

  loaded = true;
  log.info(`All skills loaded. Registered: ${listSkillNames().join(', ')}`);
}
