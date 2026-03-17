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

    // --- Macchine da cantiere e benne ---
    this.addBrand('yanmar', 'Yanmar', {
      country: 'Japan',
      batterySystem: 'diesel',
      targetMarket: 'professional',
      strengths: ['reliability', 'compact_excavators', 'fuel_efficiency'],
    });

    this.addBrand('cangini', 'Cangini Benne', {
      country: 'Italy',
      batterySystem: 'hydraulic',
      targetMarket: 'professional',
      strengths: ['bucket_variety', 'italian_manufacturing', 'customization'],
    });

    this.addBrand('hammer', 'Hammer', {
      country: 'Italy',
      batterySystem: 'hydraulic',
      targetMarket: 'professional',
      strengths: ['hydraulic_attachments', 'demolition', 'heavy_duty'],
    });

    this.addBrand('tmbenne', 'TM Benne', {
      country: 'Italy',
      batterySystem: 'hydraulic',
      targetMarket: 'professional',
      strengths: ['sorting_buckets', 'screening', 'italian_manufacturing'],
    });

    // --- Gruppi elettrogeni ---
    this.addBrand('tecnogen', 'Tecnogen', {
      country: 'Italy',
      batterySystem: 'generator',
      targetMarket: 'professional',
      strengths: ['italian_manufacturing', 'reliability', 'open_frame'],
    });

    // --- Attrezzatura edilizia ---
    this.addBrand('imer', 'Imer International', {
      country: 'Italy',
      batterySystem: 'electric_fuel',
      targetMarket: 'professional',
      strengths: ['concrete_mixers', 'tile_saws', 'construction_equipment'],
    });

    this.addBrand('montolit', 'Brevetti Montolit', {
      country: 'Italy',
      batterySystem: 'manual_electric',
      targetMarket: 'professional',
      strengths: ['tile_cutting_precision', 'italian_manufacturing', 'wide_range'],
    });

    this.addBrand('husqvarna', 'Husqvarna', {
      country: 'Sweden',
      batterySystem: 'battery_fuel',
      targetMarket: 'professional',
      strengths: ['chainsaws', 'construction_cutting', 'outdoor_equipment'],
    });

    this.addBrand('nilfisk', 'Nilfisk', {
      country: 'Denmark',
      batterySystem: 'electric',
      targetMarket: 'professional',
      strengths: ['industrial_cleaning', 'vacuum_systems', 'pressure_washers'],
    });

    // --- Veicoli speciali e ricambi ---
    this.addBrand('vem_dfsk', 'VEM/DFSK', {
      country: 'Italy',
      batterySystem: 'combustion',
      targetMarket: 'professional',
      strengths: ['light_commercial_vehicles', 'spare_parts', 'italian_distribution'],
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

    // --- Macchine da cantiere ---
    this.addProductCategory('mini_excavator', 'Miniescavatore', {
      description: 'Miniescavatore compatto per lavori di scavo',
      weightRange: '1t-8t',
      powerType: 'diesel',
    });

    this.addProductCategory('excavator_bucket', 'Benna Escavatore', {
      description: 'Benna e attrezzatura idraulica per escavatori',
      compatibility: 'mini_excavator',
      powerType: 'hydraulic',
    });

    this.addProductCategory('demolition_hammer', 'Martello Demolitore da Cantiere', {
      description: 'Martello idraulico per demolizione su escavatore',
      powerType: 'hydraulic',
    });

    // --- Generatori ---
    this.addProductCategory('generator', 'Gruppo Elettrogeno', {
      description: 'Generatore di corrente per cantiere e uso professionale',
      powerRange: '1kVA-20kVA',
      powerType: 'petrol_diesel',
    });

    // --- Attrezzatura edilizia ---
    this.addProductCategory('tile_cutter', 'Tagliatrice per Piastrelle', {
      description: 'Tagliatrice manuale o elettrica per ceramica e gres',
      cutLengths: ['60cm', '90cm', '120cm'],
    });

    this.addProductCategory('concrete_mixer', 'Betoniera', {
      description: 'Betoniera per la miscelazione del calcestruzzo',
      capacityRange: '100L-300L',
      powerType: 'electric_fuel',
    });

    this.addProductCategory('pressure_washer', 'Idropulitrice', {
      description: 'Idropulitrice ad alta pressione per pulizia professionale',
      pressureRange: '100-300 bar',
      powerType: 'electric',
    });

    this.addProductCategory('vacuum_industrial', 'Aspiratore Industriale', {
      description: 'Aspiratore industriale per cantiere e officina',
      filterClass: ['L', 'M', 'H'],
    });

    this.addProductCategory('chainsaw', 'Motosega', {
      description: 'Motosega professionale per abbattimento e potatura',
      barLengths: ['35cm', '40cm', '50cm'],
      powerType: 'petrol_battery',
    });

    this.addProductCategory('anchor_system', 'Sistema di Ancoraggio', {
      description: 'Tasselli, ancoraggi chimici e sistemi di fissaggio',
      materials: ['concrete', 'masonry', 'metal'],
    });

    // --- Ricambi veicoli ---
    this.addProductCategory('vehicle_spare_parts', 'Ricambi Veicoli Commerciali', {
      description: 'Ricambi e accessori per veicoli commerciali leggeri',
      vehicleTypes: ['van', 'light_truck', 'special_vehicle'],
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

    this.addTrade('tiler', 'Piastrellista', {
      primaryTools: ['tile_cutter', 'angle_grinder', 'drill_driver'],
      workEnvironment: 'indoor',
    });

    this.addTrade('excavator_operator', 'Escavatorista', {
      primaryTools: ['mini_excavator', 'excavator_bucket', 'demolition_hammer'],
      workEnvironment: 'outdoor',
    });

    this.addTrade('site_manager', 'Capocantiere', {
      primaryTools: ['generator', 'concrete_mixer', 'pressure_washer', 'vacuum_industrial'],
      workEnvironment: 'outdoor',
    });

    this.addTrade('arborist', 'Arboricoltore', {
      primaryTools: ['chainsaw'],
      workEnvironment: 'outdoor',
    });

    this.addTrade('mechanic', 'Meccanico', {
      primaryTools: ['impact_wrench', 'drill_driver', 'vehicle_spare_parts'],
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

    this.addUseCase('tile_cutting', 'Taglio Piastrelle', {
      requiredTools: ['tile_cutter', 'angle_grinder'],
      accessories: ['diamond_blades', 'cutting_wheels'],
    });

    this.addUseCase('excavation', 'Scavo e Movimento Terra', {
      requiredTools: ['mini_excavator', 'excavator_bucket'],
      accessories: ['teeth_bucket', 'ripper'],
    });

    this.addUseCase('demolition_site', 'Demolizione da Cantiere', {
      requiredTools: ['demolition_hammer', 'mini_excavator'],
      accessories: ['chisel_bits'],
    });

    this.addUseCase('power_generation', 'Generazione Energia in Cantiere', {
      requiredTools: ['generator'],
      accessories: ['power_cables', 'distribution_box'],
    });

    this.addUseCase('concrete_mixing', 'Miscelazione Calcestruzzo', {
      requiredTools: ['concrete_mixer'],
      accessories: ['cement_bags', 'mixer_blade'],
    });

    this.addUseCase('surface_cleaning', 'Pulizia Superfici Professionali', {
      requiredTools: ['pressure_washer', 'vacuum_industrial'],
      accessories: ['cleaning_nozzles', 'detergent'],
    });

    this.addUseCase('tree_felling', 'Abbattimento e Potatura', {
      requiredTools: ['chainsaw'],
      accessories: ['chain_files', 'bar_oil', 'protective_gear'],
    });

    this.addUseCase('anchoring', 'Tassellatura e Ancoraggio', {
      requiredTools: ['hammer_drill', 'anchor_system'],
      accessories: ['chemical_anchors', 'sds_bits', 'threaded_rods'],
    });

    this.addUseCase('vehicle_maintenance', 'Manutenzione Veicoli Commerciali', {
      requiredTools: ['impact_wrench', 'vehicle_spare_parts'],
      accessories: ['socket_sets', 'oil_filters'],
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

    // --- Feature nuove macro-categorie ---
    this.addFeature('diesel_engine', 'Motore Diesel', {
      benefits: ['autonomy', 'power', 'reliability'],
    });

    this.addFeature('honda_gx_engine', 'Motore Honda GX', {
      benefits: ['reliability', 'fuel_efficiency', 'easy_start'],
    });

    this.addFeature('hydraulic_system', 'Sistema Idraulico', {
      benefits: ['force', 'precision', 'versatility'],
    });

    this.addFeature('avr_regulation', 'Regolazione AVR', {
      benefits: ['voltage_stability', 'electronics_protection', 'inverter_compatibility'],
    });

    this.addFeature('diamond_blade', 'Disco Diamantato', {
      benefits: ['cutting_precision', 'durability', 'clean_cut'],
    });

    this.addFeature('quick_coupler', 'Attacco Rapido', {
      benefits: ['versatility', 'fast_attachment_change', 'compatibility'],
    });

    this.addFeature('electric_start', 'Avviamento Elettrico', {
      benefits: ['ease_of_use', 'cold_start', 'reliability'],
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
   */
  addRelation(fromId: string, toId: string, type: EdgeType): void {
    if (!this.graph.nodes.has(fromId) && !fromId.startsWith('product_')) return;
    // Avoid duplicate edges
    const exists = this.graph.edges.some(
      e => e.from === fromId && e.to === toId && e.type === type
    );
    if (!exists) {
      this.addEdge({ from: fromId, to: toId, type });
    }
  }

  /**
   * Register a product discovered during RAG enrichment.
   * Idempotent: returns existing node ID if product is already in the graph.
   * Adds manufactures + belongs_to edges automatically if the brand/category nodes exist.
   */
  registerDiscoveredProduct(
    id: string,
    name: string,
    brandId: string,
    categoryId?: string
  ): string {
    const nodeId = `product_${id}`;
    if (!this.graph.nodes.has(nodeId)) {
      this.addNode({
        id: nodeId,
        type: 'product',
        name,
        properties: { discoveredFromRAG: true },
      });
      if (this.graph.nodes.has(`brand_${brandId}`)) {
        this.addEdge({ from: `brand_${brandId}`, to: nodeId, type: 'manufactures' });
      }
      if (categoryId && this.graph.nodes.has(`category_${categoryId}`)) {
        this.addEdge({ from: nodeId, to: `category_${categoryId}`, type: 'belongs_to' });
      }
    }
    return nodeId;
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
