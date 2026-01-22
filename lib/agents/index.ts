/**
 * TAYA Agents Module
 * 
 * Agenti specializzati per l'arricchimento automatico dei contenuti.
 */

export {
  discoverProductImage,
  extractProductIdentifiers,
  searchProductImage,
  validateImageWithVision,
  isBlockedDomain,
  OFFICIAL_DOMAINS,
  BLOCKED_DOMAINS,
  type ImageSearchResult,
  type ImageValidationResult,
  type ImageDiscoveryResult,
} from './image-discovery-agent';
