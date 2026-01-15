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
 */

// ============================================================================
// Types
// ============================================================================

export interface KGNode {
  id: string;
  type: NodeType;
  name: string;
  properties: Record<string, string | number | boolean | string[]>;
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
}

export interface QueryResult {
  nodes: KGNode[];
  edges: KGEdge[];
  paths: KGNode[][];
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
    };
    this.initializeBaseKnowledge();
  }

  /**
   * Initialize with base knowledge about power tool industry
   */
  private initializeBaseKnowledge(): void {
    // === BRANDS ===
    this.addBrand('milwaukee', 'Milwaukee', {
      country: 'USA',
      batterySystem: 'M18',
      targetMarket: 'professional',
      strengths: ['durability', 'battery_life', 'trade_specific_tools'],
    });

    this.addBrand('makita', 'Makita', {
      country: 'Japan',
      batterySystem: 'LXT',
      targetMarket: 'professional',
      strengths: ['reliability', 'ergonomics', 'wide_range'],
    });

    this.addBrand('dewalt', 'DeWalt', {
      country: 'USA',
      batterySystem: 'XR',
      targetMarket: 'professional',
      strengths: ['power', 'construction_focus', 'flexvolt'],
    });

    this.addBrand('bosch', 'Bosch Professional', {
      country: 'Germany',
      batterySystem: 'ProCORE',
      targetMarket: 'professional',
      strengths: ['precision', 'innovation', 'connected_tools'],
    });

    this.addBrand('hilti', 'Hilti', {
      country: 'Liechtenstein',
      batterySystem: 'Nuron',
      targetMarket: 'premium_professional',
      strengths: ['durability', 'service', 'fleet_management'],
    });

    this.addBrand('metabo', 'Metabo', {
      country: 'Germany',
      batterySystem: 'LiHD',
      targetMarket: 'professional',
      strengths: ['metalworking', 'safety', 'battery_technology'],
    });

    this.addBrand('festool', 'Festool', {
      country: 'Germany',
      batterySystem: 'Festool',
      targetMarket: 'premium_professional',
      strengths: ['dust_extraction', 'precision', 'system_integration'],
    });

    this.addBrand('hikoki', 'HiKOKI', {
      country: 'Japan',
      batterySystem: 'Multi Volt',
      targetMarket: 'professional',
      strengths: ['value', 'innovation', 'multi_volt'],
    });

    // === PRODUCT CATEGORIES ===
    this.addProductCategory('drill_driver', 'Trapano Avvitatore', {
      description: 'Per foratura e avvitatura',
      powerRange: '12V-18V',
    });

    this.addProductCategory('impact_driver', 'Avvitatore a Impulsi', {
      description: 'Per viti e bulloni',
      powerRange: '12V-18V',
    });

    this.addProductCategory('impact_wrench', 'Avvitatore a Massa Battente', {
      description: 'Per bulloni ad alta coppia',
      powerRange: '18V-36V',
    });

    this.addProductCategory('hammer_drill', 'Tassellatore', {
      description: 'Per foratura in muratura',
      powerRange: '18V-36V',
    });

    this.addProductCategory('angle_grinder', 'Smerigliatrice Angolare', {
      description: 'Per taglio e smerigliatura',
      discSizes: ['115mm', '125mm', '230mm'],
    });

    this.addProductCategory('circular_saw', 'Sega Circolare', {
      description: 'Per taglio legno',
      bladeSize: '165mm-190mm',
    });

    this.addProductCategory('reciprocating_saw', 'Sega a Gattuccio', {
      description: 'Per demolizione e taglio',
      strokeLength: '28-32mm',
    });

    this.addProductCategory('jigsaw', 'Seghetto Alternativo', {
      description: 'Per tagli curvi',
      strokeLength: '20-26mm',
    });

    this.addProductCategory('planer', 'Pialla', {
      description: 'Per piallatura legno',
      cutWidth: '82mm',
    });

    this.addProductCategory('router', 'Fresatrice', {
      description: 'Per fresatura legno',
      colletSize: '6-12mm',
    });

    // === TRADES ===
    this.addTrade('electrician', 'Elettricista', {
      primaryTools: ['drill_driver', 'impact_driver', 'reciprocating_saw'],
      workEnvironment: 'indoor',
    });

    this.addTrade('plumber', 'Idraulico', {
      primaryTools: ['drill_driver', 'impact_wrench', 'reciprocating_saw'],
      workEnvironment: 'mixed',
    });

    this.addTrade('carpenter', 'Falegname', {
      primaryTools: ['circular_saw', 'jigsaw', 'planer', 'router'],
      workEnvironment: 'workshop',
    });

    this.addTrade('hvac', 'Termoidraulico', {
      primaryTools: ['drill_driver', 'impact_driver', 'reciprocating_saw'],
      workEnvironment: 'mixed',
    });

    this.addTrade('mason', 'Muratore', {
      primaryTools: ['hammer_drill', 'angle_grinder', 'circular_saw'],
      workEnvironment: 'outdoor',
    });

    this.addTrade('metalworker', 'Fabbro', {
      primaryTools: ['angle_grinder', 'drill_driver', 'impact_wrench'],
      workEnvironment: 'workshop',
    });

    // === USE CASES ===
    this.addUseCase('drilling_wood', 'Foratura Legno', {
      requiredTools: ['drill_driver'],
      accessories: ['wood_bits', 'forstner_bits'],
    });

    this.addUseCase('drilling_metal', 'Foratura Metallo', {
      requiredTools: ['drill_driver'],
      accessories: ['hss_bits', 'step_bits'],
    });

    this.addUseCase('drilling_concrete', 'Foratura Calcestruzzo', {
      requiredTools: ['hammer_drill'],
      accessories: ['sds_bits', 'core_bits'],
    });

    this.addUseCase('fastening_screws', 'Avvitatura', {
      requiredTools: ['impact_driver', 'drill_driver'],
      accessories: ['bit_sets', 'magnetic_holders'],
    });

    this.addUseCase('fastening_bolts', 'Bullonatura', {
      requiredTools: ['impact_wrench'],
      accessories: ['socket_sets'],
    });

    this.addUseCase('cutting_wood', 'Taglio Legno', {
      requiredTools: ['circular_saw', 'jigsaw', 'reciprocating_saw'],
      accessories: ['saw_blades'],
    });

    this.addUseCase('cutting_metal', 'Taglio Metallo', {
      requiredTools: ['angle_grinder', 'reciprocating_saw'],
      accessories: ['cutting_discs', 'metal_blades'],
    });

    this.addUseCase('grinding', 'Smerigliatura', {
      requiredTools: ['angle_grinder'],
      accessories: ['grinding_discs', 'flap_discs'],
    });

    // === BATTERY SYSTEMS ===
    this.addBatterySystem('m18', 'Milwaukee M18', {
      voltage: 18,
      capacities: ['2.0Ah', '3.0Ah', '5.0Ah', '6.0Ah', '8.0Ah', '12.0Ah'],
      compatibleProducts: 200,
    });

    this.addBatterySystem('m12', 'Milwaukee M12', {
      voltage: 12,
      capacities: ['2.0Ah', '3.0Ah', '4.0Ah', '6.0Ah'],
      compatibleProducts: 100,
    });

    this.addBatterySystem('lxt', 'Makita LXT', {
      voltage: 18,
      capacities: ['2.0Ah', '3.0Ah', '4.0Ah', '5.0Ah', '6.0Ah'],
      compatibleProducts: 300,
    });

    this.addBatterySystem('xr', 'DeWalt XR', {
      voltage: 18,
      capacities: ['2.0Ah', '4.0Ah', '5.0Ah'],
      compatibleProducts: 200,
    });

    this.addBatterySystem('flexvolt', 'DeWalt FlexVolt', {
      voltage: '54/18',
      capacities: ['6.0Ah', '9.0Ah', '12.0Ah'],
      compatibleProducts: 50,
    });

    this.addBatterySystem('procore', 'Bosch ProCORE', {
      voltage: 18,
      capacities: ['4.0Ah', '5.5Ah', '8.0Ah', '12.0Ah'],
      compatibleProducts: 150,
    });

    // === FEATURES ===
    this.addFeature('brushless', 'Motore Brushless', {
      benefits: ['efficiency', 'durability', 'power'],
    });

    this.addFeature('variable_speed', 'Velocità Variabile', {
      benefits: ['control', 'versatility'],
    });

    this.addFeature('led_light', 'Luce LED', {
      benefits: ['visibility', 'precision'],
    });

    this.addFeature('dust_extraction', 'Aspirazione Polvere', {
      benefits: ['health', 'cleanliness'],
    });

    this.addFeature('bluetooth', 'Connettività Bluetooth', {
      benefits: ['tracking', 'customization'],
    });

    this.addFeature('kickback_protection', 'Protezione Contraccolpo', {
      benefits: ['safety'],
    });
  }

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
  }

  private addEdge(edge: KGEdge): void {
    this.graph.edges.push(edge);
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
    ];

    for (const [pattern, category] of categoryPatterns) {
      if (pattern.test(nameLower)) {
        return category;
      }
    }

    return undefined;
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
