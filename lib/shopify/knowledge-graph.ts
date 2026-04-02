/**
 * Knowledge Graph Module for Power Tools
 *
 * Implements a simple Knowledge Graph for power tool relationships as recommended
 * by the RAG Enterprise paper (20% improvement in ROUGE-L with hybrid dense+KG).
 *
 * Key features:
 * - Brand → Product Lines → Products → Accessories relationships
 * - Use case categorization
 * - Compatibility mapping
 * - Professional trade associations
 *
 * Base knowledge is loaded from `data/kg-base.json` at startup — edit that file
 * to add brands/categories without touching TypeScript.
 * For zero-deploy additions use the admin API (POST /api/admin/knowledge-graph)
 * which writes to Redis and is applied on top of the JSON on the next cold start.
 */

import KG_BASE from '@/data/kg-base.json';

// ============================================================================
// Types
// ============================================================================

/**
 * PROV-STAR provenance metadata attached to every dynamic write.
 * Inspired by: Dibowski et al., "Full Traceability and Provenance for Knowledge Graphs", FOIS 2024.
 */
export interface ProvenanceMetadata {
  /** URL or identifier of the source that supplied the information. */
  sourceUrl: string;
  /** ISO timestamp of when the write occurred. */
  timestamp: string;
  /** Agent or module that performed the write (e.g. "rag-adapter", "blog-researcher"). */
  agent: string;
  /** Confidence score [0..1] assigned by the writing agent. */
  confidence?: number;
}

/**
 * Atomic provenance log entry — one record per node/edge mutation.
 *
 * The log is append-only and never shrinks (event sourcing).
 * Rollbacks are expressed as inverse `delete_node` / `delete_edge` events,
 * preserving the full causal history of why data was added *and* removed.
 */
export interface ProvenanceEntry {
  op: 'add_node' | 'add_edge' | 'delete_node' | 'delete_edge';
  /** Node ID or edge key (`from→type→to`). */
  targetId: string;
  provenance: ProvenanceMetadata;
  /**
   * Human-readable reason for delete operations.
   * e.g. "rollback_by_admin", "taya_police_flag", "duplicate_detected"
   */
  reason?: string;
}

export interface KGNode {
  id: string;
  type: NodeType;
  name: string;
  properties: Record<string, string | number | boolean | string[]>;
  /** Present only on dynamically discovered nodes (not in base knowledge). */
  provenance?: ProvenanceMetadata;
}

export type NodeType =
  | 'brand'
  | 'product_line'
  | 'product_category'
  | 'product'
  | 'accessory'
  | 'battery_system'
  | 'use_case'
  | 'trade'
  | 'feature';

export interface KGEdge {
  from: string;
  to: string;
  type: EdgeType;
  properties?: Record<string, string | number | boolean>;
  /** Present only on dynamically discovered edges (not in base knowledge). */
  provenance?: ProvenanceMetadata;
}

export type EdgeType =
  | 'manufactures'      // brand → product
  | 'belongs_to'        // product → product_line
  | 'compatible_with'   // accessory → product
  | 'uses_battery'      // product → battery_system
  | 'suitable_for'      // product → use_case
  | 'used_by'           // product → trade
  | 'has_feature'       // product → feature
  | 'competes_with'     // product → product
  | 'upgrades_to'       // product → product
  | 'requires';         // product → accessory

export interface KnowledgeGraph {
  nodes: Map<string, KGNode>;
  edges: KGEdge[];
  /** Append-only delta log — one entry per dynamic mutation. */
  provenanceLog: ProvenanceEntry[];
}

export interface QueryResult {
  nodes: KGNode[];
  edges: KGEdge[];
  paths: KGNode[][];
}

// ============================================================================
// Base-spec types (mirrors data/kg-base.json schema)
// ============================================================================

interface BaseEntry {
  id: string;
  name: string;
  properties: Record<string, unknown>;
}

interface KGBaseSpec {
  version: string;
  brands: BaseEntry[];
  categories: BaseEntry[];
  trades: BaseEntry[];
  useCases: BaseEntry[];
  batterySystems: BaseEntry[];
  features: BaseEntry[];
}

// ============================================================================
// Knowledge Graph Builder
// ============================================================================

export class PowerToolKnowledgeGraph {
  private graph: KnowledgeGraph;

  constructor() {
    this.graph = {
      nodes: new Map(),
      edges: [],
      provenanceLog: [],
    };
    this.initializeBaseKnowledge();
  }

  /**
   * Load base knowledge from a KGBaseSpec object.
   * Called by initializeBaseKnowledge (from the JSON file) and by applyBaseEntry
   * (for single-entry Redis overrides).  Since addNode always overwrites, later
   * calls to applyBaseEntry correctly override JSON defaults.
   */
  private loadFromSpec(spec: KGBaseSpec): void {
    for (const e of spec.brands)        this.addBrand(e.id, e.name, e.properties);
    for (const e of spec.categories)    this.addProductCategory(e.id, e.name, e.properties);
    for (const e of spec.trades)        this.addTrade(e.id, e.name, e.properties);
    for (const e of spec.useCases)      this.addUseCase(e.id, e.name, e.properties);
    for (const e of spec.batterySystems) this.addBatterySystem(e.id, e.name, e.properties);
    for (const e of spec.features)      this.addFeature(e.id, e.name, e.properties);
  }

  /**
   * Apply a single base-knowledge entry from an external source (Redis override).
   * Dispatches to the correct typed add* method based on `type`.
   * Because addNode uses Map.set() (always-overwrite), this correctly overrides
   * the JSON defaults loaded in initializeBaseKnowledge().
   *
   * Valid types: "brand" | "category" | "trade" | "use_case" | "battery_system" | "feature"
   */
  applyBaseEntry(type: string, id: string, name: string, properties: Record<string, unknown>): void {
    switch (type) {
      case 'brand':          this.addBrand(id, name, properties);          break;
      case 'category':       this.addProductCategory(id, name, properties); break;
      case 'trade':          this.addTrade(id, name, properties);           break;
      case 'use_case':       this.addUseCase(id, name, properties);         break;
      case 'battery_system': this.addBatterySystem(id, name, properties);   break;
      case 'feature':        this.addFeature(id, name, properties);         break;
      // Unknown types are silently ignored — forward compatibility
    }
  }

  /**
   * Initialize with base knowledge about power tool industry.
   * Reads from data/kg-base.json — edit that file to add/change entries.
   */
  private initializeBaseKnowledge(): void {
    this.loadFromSpec(KG_BASE as KGBaseSpec);
  }

  // All base knowledge is in data/kg-base.json.
  // For zero-deploy additions use POST /api/admin/knowledge-graph (Redis override).

  // ============================================================================
  // Node Addition Methods
  // ============================================================================

  addBrand(id: string, name: string, properties: Record<string, unknown>): void {
    this.addNode({
      id: `brand_${id}`,
      type: 'brand',
      name,
      properties: properties as Record<string, string | number | boolean | string[]>,
    });
  }

  addProductCategory(id: string, name: string, properties: Record<string, unknown>): void {
    this.addNode({
      id: `category_${id}`,
      type: 'product_category',
      name,
      properties: properties as Record<string, string | number | boolean | string[]>,
    });
  }

  addTrade(id: string, name: string, properties: Record<string, unknown>): void {
    this.addNode({
      id: `trade_${id}`,
      type: 'trade',
      name,
      properties: properties as Record<string, string | number | boolean | string[]>,
    });
  }

  addUseCase(id: string, name: string, properties: Record<string, unknown>): void {
    this.addNode({
      id: `usecase_${id}`,
      type: 'use_case',
      name,
      properties: properties as Record<string, string | number | boolean | string[]>,
    });
  }

  addBatterySystem(id: string, name: string, properties: Record<string, unknown>): void {
    this.addNode({
      id: `battery_${id}`,
      type: 'battery_system',
      name,
      properties: properties as Record<string, string | number | boolean | string[]>,
    });
  }

  addFeature(id: string, name: string, properties: Record<string, unknown>): void {
    this.addNode({
      id: `feature_${id}`,
      type: 'feature',
      name,
      properties: properties as Record<string, string | number | boolean | string[]>,
    });
  }

  addProduct(
    id: string,
    name: string,
    brandId: string,
    categoryId: string,
    properties: Record<string, unknown>
  ): void {
    const nodeId = `product_${id}`;
    
    this.addNode({
      id: nodeId,
      type: 'product',
      name,
      properties: properties as Record<string, string | number | boolean | string[]>,
    });

    // Add relationships
    this.addEdge({
      from: `brand_${brandId}`,
      to: nodeId,
      type: 'manufactures',
    });

    this.addEdge({
      from: nodeId,
      to: `category_${categoryId}`,
      type: 'belongs_to',
    });
  }

  addAccessory(
    id: string,
    name: string,
    compatibleWith: string[],
    properties: Record<string, unknown>
  ): void {
    const nodeId = `accessory_${id}`;
    
    this.addNode({
      id: nodeId,
      type: 'accessory',
      name,
      properties: properties as Record<string, string | number | boolean | string[]>,
    });

    // Add compatibility edges
    for (const productId of compatibleWith) {
      this.addEdge({
        from: nodeId,
        to: productId,
        type: 'compatible_with',
      });
    }
  }

  // ============================================================================
  // Core Graph Methods
  // ============================================================================

  private addNode(node: KGNode): void {
    this.graph.nodes.set(node.id, node);
    if (node.provenance) {
      this.graph.provenanceLog.push({
        op: 'add_node',
        targetId: node.id,
        provenance: node.provenance,
      });
    }
  }

  private addEdge(edge: KGEdge): void {
    this.graph.edges.push(edge);
    if (edge.provenance) {
      this.graph.provenanceLog.push({
        op: 'add_edge',
        targetId: `${edge.from}→${edge.type}→${edge.to}`,
        provenance: edge.provenance,
      });
    }
  }

  getNode(id: string): KGNode | undefined {
    return this.graph.nodes.get(id);
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Find related nodes by edge type
   */
  findRelated(nodeId: string, edgeType?: EdgeType): KGNode[] {
    const relatedIds = new Set<string>();

    for (const edge of this.graph.edges) {
      if (edgeType && edge.type !== edgeType) continue;

      if (edge.from === nodeId) {
        relatedIds.add(edge.to);
      }
      if (edge.to === nodeId) {
        relatedIds.add(edge.from);
      }
    }

    return Array.from(relatedIds)
      .map(id => this.graph.nodes.get(id))
      .filter((node): node is KGNode => node !== undefined);
  }

  /**
   * Find products by brand
   */
  findProductsByBrand(brandId: string): KGNode[] {
    return this.findRelated(`brand_${brandId}`, 'manufactures');
  }

  /**
   * Find products by category
   */
  findProductsByCategory(categoryId: string): KGNode[] {
    const products: KGNode[] = [];
    
    for (const edge of this.graph.edges) {
      if (edge.type === 'belongs_to' && edge.to === `category_${categoryId}`) {
        const node = this.graph.nodes.get(edge.from);
        if (node) products.push(node);
      }
    }
    
    return products;
  }

  /**
   * Find suitable products for a trade
   */
  findProductsForTrade(tradeId: string): KGNode[] {
    const trade = this.graph.nodes.get(`trade_${tradeId}`);
    if (!trade) return [];

    const primaryTools = trade.properties.primaryTools as string[] || [];
    const products: KGNode[] = [];

    for (const toolCategory of primaryTools) {
      products.push(...this.findProductsByCategory(toolCategory));
    }

    return products;
  }

  /**
   * Find compatible accessories for a product
   */
  findCompatibleAccessories(productId: string): KGNode[] {
    const accessories: KGNode[] = [];
    
    for (const edge of this.graph.edges) {
      if (edge.type === 'compatible_with' && edge.to === productId) {
        const node = this.graph.nodes.get(edge.from);
        if (node) accessories.push(node);
      }
    }
    
    return accessories;
  }

  /**
   * Find competing products
   */
  findCompetitors(productId: string): KGNode[] {
    const product = this.graph.nodes.get(productId);
    if (!product) return [];

    // Find category
    let categoryId: string | undefined;
    for (const edge of this.graph.edges) {
      if (edge.type === 'belongs_to' && edge.from === productId) {
        categoryId = edge.to;
        break;
      }
    }

    if (!categoryId) return [];

    // Find other products in same category
    return this.findProductsByCategory(categoryId.replace('category_', ''))
      .filter(p => p.id !== productId);
  }

  /**
   * Get battery system for a brand
   */
  getBatterySystemForBrand(brandId: string): KGNode | undefined {
    const brand = this.graph.nodes.get(`brand_${brandId}`);
    if (!brand) return undefined;

    const batterySystemName = brand.properties.batterySystem as string;
    if (!batterySystemName) return undefined;

    // Find matching battery system
    for (const [id, node] of Array.from(this.graph.nodes.entries())) {
      if (node.type === 'battery_system' && 
          node.name.toLowerCase().includes(batterySystemName.toLowerCase())) {
        return node;
      }
    }

    return undefined;
  }

  /**
   * Enrich product context with KG knowledge
   */
  enrichProductContext(
    productName: string,
    brand: string,
    category?: string
  ): {
    brandInfo: KGNode | undefined;
    categoryInfo: KGNode | undefined;
    batterySystem: KGNode | undefined;
    suitableForTrades: KGNode[];
    relatedUseCases: KGNode[];
    suggestedFeatures: KGNode[];
  } {
    const brandId = brand.toLowerCase().replace(/\s+/g, '_');
    const brandInfo = this.graph.nodes.get(`brand_${brandId}`);
    
    // Try to infer category from product name
    let categoryId = category?.toLowerCase().replace(/\s+/g, '_');
    if (!categoryId) {
      categoryId = this.inferCategoryFromName(productName);
    }
    const categoryInfo = categoryId ? this.graph.nodes.get(`category_${categoryId}`) : undefined;

    const batterySystem = brandInfo ? this.getBatterySystemForBrand(brandId) : undefined;

    // Find suitable trades
    const suitableForTrades: KGNode[] = [];
    if (categoryId) {
      for (const [id, node] of Array.from(this.graph.nodes.entries())) {
        if (node.type === 'trade') {
          const primaryTools = node.properties.primaryTools as string[] || [];
          if (primaryTools.includes(categoryId)) {
            suitableForTrades.push(node);
          }
        }
      }
    }

    // Find related use cases
    const relatedUseCases: KGNode[] = [];
    if (categoryId) {
      for (const [id, node] of Array.from(this.graph.nodes.entries())) {
        if (node.type === 'use_case') {
          const requiredTools = node.properties.requiredTools as string[] || [];
          if (requiredTools.includes(categoryId)) {
            relatedUseCases.push(node);
          }
        }
      }
    }

    // Suggest features based on category
    const suggestedFeatures: KGNode[] = [];
    // All professional tools should have brushless
    const brushless = this.graph.nodes.get('feature_brushless');
    if (brushless) suggestedFeatures.push(brushless);
    
    const led = this.graph.nodes.get('feature_led_light');
    if (led) suggestedFeatures.push(led);

    return {
      brandInfo,
      categoryInfo,
      batterySystem,
      suitableForTrades,
      relatedUseCases,
      suggestedFeatures,
    };
  }

  /**
   * Infer product category from name
   */
  private inferCategoryFromName(productName: string): string | undefined {
    const nameLower = productName.toLowerCase();
    
    const categoryPatterns: [RegExp, string][] = [
      // Utensili elettrici portatili
      [/avvitatore.*impulsi|impact.*driver/i, 'impact_driver'],
      [/avvitatore.*massa|impact.*wrench/i, 'impact_wrench'],
      [/trapano.*avvitatore|drill.*driver/i, 'drill_driver'],
      [/tassellatore|hammer.*drill|rotary.*hammer/i, 'hammer_drill'],
      [/smerigliatrice|angle.*grinder/i, 'angle_grinder'],
      [/sega.*circolare|circular.*saw/i, 'circular_saw'],
      [/sega.*gattuccio|reciprocating|sabre.*saw/i, 'reciprocating_saw'],
      [/seghetto.*alternativo|jigsaw/i, 'jigsaw'],
      [/pialla|planer/i, 'planer'],
      [/fresatrice|router/i, 'router'],
      // Macchine da cantiere
      [/miniescavatore|mini.*excavat|microescavatore/i, 'mini_excavator'],
      [/benna|bucket.*escavator|escavator.*bucket|benna.*demolitore/i, 'excavator_bucket'],
      [/martello.*demolitore.*idraul|demolition.*hammer.*attach/i, 'demolition_hammer'],
      // Generatori
      [/gruppo.*elettrogeno|generatore.*corrente|generator/i, 'generator'],
      // Attrezzatura edilizia
      [/tagliatrice.*piastrelle|tile.*cutter|tagliapiastrelle|montolit/i, 'tile_cutter'],
      [/betoniera|concrete.*mixer|miscelatore.*calcestruzzo/i, 'concrete_mixer'],
      [/idropulitrice|pressure.*washer|alta.*pressione/i, 'pressure_washer'],
      [/aspiratore.*industriale|industrial.*vacuum|aspirapolvere.*cantiere/i, 'vacuum_industrial'],
      [/motosega|chainsaw|sega.*catena/i, 'chainsaw'],
      [/tassello|ancoraggio.*chimico|anchor.*system|fischer/i, 'anchor_system'],
      // Ricambi veicoli
      [/ammortizzatore|alternatore|ricambio.*dfsk|ricambio.*vem|spare.*part.*vehicle/i, 'vehicle_spare_parts'],
    ];

    for (const [pattern, category] of categoryPatterns) {
      if (pattern.test(nameLower)) {
        return category;
      }
    }

    return undefined;
  }

  /**
   * Public method to add a directional relation between two nodes.
   * Used by the RAG pipeline to persist product relationships discovered from web text.
   * Silently skips if the from-node doesn't exist (avoids dangling edges).
   *
   * @param provenance - PROV-STAR metadata: sourceUrl, agent, timestamp, confidence.
   *   If omitted the edge is treated as a base-knowledge assertion (no audit trail).
   */
  addRelation(fromId: string, toId: string, type: EdgeType, provenance?: ProvenanceMetadata): void {
    if (!this.graph.nodes.has(fromId) && !fromId.startsWith('product_')) return;
    // Avoid duplicate edges
    const exists = this.graph.edges.some(
      e => e.from === fromId && e.to === toId && e.type === type
    );
    if (!exists) {
      this.addEdge({ from: fromId, to: toId, type, provenance });
    }
  }

  /**
   * Register a product discovered during RAG enrichment.
   * Idempotent: returns existing node ID if product is already in the graph.
   * Adds manufactures + belongs_to edges automatically if the brand/category nodes exist.
   *
   * @param provenance - PROV-STAR metadata attached to the new node and its edges.
   */
  registerDiscoveredProduct(
    id: string,
    name: string,
    brandId: string,
    categoryId?: string,
    provenance?: ProvenanceMetadata,
  ): string {
    const nodeId = `product_${id}`;
    if (!this.graph.nodes.has(nodeId)) {
      this.addNode({
        id: nodeId,
        type: 'product',
        name,
        properties: { discoveredFromRAG: true },
        provenance,
      });
      if (this.graph.nodes.has(`brand_${brandId}`)) {
        this.addEdge({ from: `brand_${brandId}`, to: nodeId, type: 'manufactures', provenance });
      }
      if (categoryId && this.graph.nodes.has(`category_${categoryId}`)) {
        this.addEdge({ from: nodeId, to: `category_${categoryId}`, type: 'belongs_to', provenance });
      }
    }
    return nodeId;
  }

  // ============================================================================
  // Provenance Query & Rollback (PROV-STAR)
  // ============================================================================

  /**
   * Return provenance log entries, optionally filtered by node/edge ID.
   *
   * @param targetId - If provided, return only entries whose targetId starts with this value.
   */
  getProvenanceLog(targetId?: string): ProvenanceEntry[] {
    if (!targetId) return [...this.graph.provenanceLog];
    return this.graph.provenanceLog.filter(e => e.targetId.startsWith(targetId));
  }

  /**
   * Remove all dynamically-added nodes and edges whose provenance timestamp is
   * at or after `since` from the **in-memory graph** (so queries return correct data),
   * then append matching `delete_node` / `delete_edge` inverse events to the log.
   *
   * The provenance log is **never truncated** — it is an append-only event stream.
   * This means the full causal history (why data was added AND why it was removed)
   * is always preserved, enabling audit, replay, and root-cause analysis.
   *
   * @param since  - Remove nodes/edges whose provenance.timestamp >= this date.
   * @param reason - Optional label stored in the delete events (default: "rollback").
   * @returns Counts of removed nodes and edges.
   */
  rollbackSince(
    since: Date,
    reason = 'rollback'
  ): { removedNodes: number; removedEdges: number } {
    const sinceTs = since.getTime();
    // Synthetic provenance for the delete events themselves
    const deletionProvenance: ProvenanceMetadata = {
      sourceUrl: 'internal://rollback',
      timestamp: new Date().toISOString(),
      agent: 'knowledge-graph.rollbackSince',
    };

    // --- Identify and remove nodes ---
    const nodeIdsToRemove = new Set<string>();
    for (const [id, node] of Array.from(this.graph.nodes.entries())) {
      if (node.provenance && new Date(node.provenance.timestamp).getTime() >= sinceTs) {
        nodeIdsToRemove.add(id);
      }
    }

    let removedNodes = 0;
    for (const id of Array.from(nodeIdsToRemove)) {
      this.graph.nodes.delete(id);
      // Append inverse event — log is never pruned
      this.graph.provenanceLog.push({
        op: 'delete_node',
        targetId: id,
        provenance: deletionProvenance,
        reason,
      });
      removedNodes++;
    }

    // --- Remove edges whose provenance is in range, or that touch removed nodes ---
    const edgesBefore = this.graph.edges.length;
    const removedEdges_list: KGEdge[] = [];

    this.graph.edges = this.graph.edges.filter(edge => {
      const touchesRemovedNode =
        nodeIdsToRemove.has(edge.from) || nodeIdsToRemove.has(edge.to);
      const inRange =
        edge.provenance && new Date(edge.provenance.timestamp).getTime() >= sinceTs;

      if (touchesRemovedNode || inRange) {
        removedEdges_list.push(edge);
        return false;
      }
      return true;
    });

    for (const edge of removedEdges_list) {
      this.graph.provenanceLog.push({
        op: 'delete_edge',
        targetId: `${edge.from}→${edge.type}→${edge.to}`,
        provenance: deletionProvenance,
        reason,
      });
    }

    return { removedNodes, removedEdges: edgesBefore - this.graph.edges.length };
  }

  /**
   * Return only the dynamically-added nodes and edges (those with provenance metadata).
   * Used by kg-store to serialize the mutable KG state to Redis without touching
   * base-knowledge entries that are rehydrated from code on every cold start.
   */
  getDynamicState(): {
    nodes: KGNode[];
    edges: KGEdge[];
    provenanceLog: ProvenanceEntry[];
  } {
    const nodes: KGNode[] = [];
    for (const node of Array.from(this.graph.nodes.values())) {
      if (node.provenance) nodes.push(node);
    }
    const edges = this.graph.edges.filter(e => e.provenance !== undefined);
    return { nodes, edges, provenanceLog: [...this.graph.provenanceLog] };
  }

  /**
   * Inject a pre-serialized node directly into the graph (used by kg-store during hydration).
   * Skips all guards — callers must ensure correctness.
   */
  injectNode(node: KGNode): void {
    if (!this.graph.nodes.has(node.id)) {
      this.graph.nodes.set(node.id, node);
      if (node.provenance) {
        this.graph.provenanceLog.push({ op: 'add_node', targetId: node.id, provenance: node.provenance });
      }
    }
  }

  /**
   * Inject a pre-serialized edge directly into the graph (used by kg-store during hydration).
   * Deduplicates by from+type+to.
   */
  injectEdge(edge: KGEdge): void {
    const exists = this.graph.edges.some(
      e => e.from === edge.from && e.to === edge.to && e.type === edge.type
    );
    if (!exists) {
      this.graph.edges.push(edge);
      if (edge.provenance) {
        this.graph.provenanceLog.push({
          op: 'add_edge',
          targetId: `${edge.from}→${edge.type}→${edge.to}`,
          provenance: edge.provenance,
        });
      }
    }
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<string, number>;
  } {
    const nodesByType: Record<string, number> = {};
    
    for (const node of Array.from(this.graph.nodes.values())) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    return {
      nodeCount: this.graph.nodes.size,
      edgeCount: this.graph.edges.length,
      nodesByType,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let kgInstance: PowerToolKnowledgeGraph | null = null;

export function getKnowledgeGraph(): PowerToolKnowledgeGraph {
  if (!kgInstance) {
    kgInstance = new PowerToolKnowledgeGraph();
  }
  return kgInstance;
}
