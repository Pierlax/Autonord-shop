/**
 * Worker per rigenerare un singolo prodotto
 * Chiamato da QStash
 * 
 * FLUSSO:
 * 1. Mantiene i dati originali (SKU, titolo, vendor, prezzo)
 * 2. Cerca sul sito ufficiale del brand (Milwaukee, Makita, etc.) usando lo SKU
 * 3. Estrae immagine e info dalla pagina ufficiale
 * 4. Claude arricchisce la descrizione con le info trovate
 * 5. Crea il prodotto su Shopify
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

interface ProductPayload {
  sku: string;
  title: string;
  vendor: string;
  productType: string;
  price: string;
  compareAtPrice: string | null;
  barcode: string | null;
  inventoryQuantity: number;
  tags: string[];
}

// ============================================
// STEP 1: CERCA SUL SITO UFFICIALE DEL BRAND
// ============================================

interface BrandSearchResult {
  brand: string;
  productUrl: string | null;
  imageUrl: string | null;
  officialTitle: string | null;
  officialDescription: string | null;
  specs: string | null;
}

async function searchOnOfficialBrandSite(sku: string, title: string, vendor: string): Promise<BrandSearchResult> {
  // Determina il brand
  let brand = 'Milwaukee';
  if (vendor.toLowerCase().includes('makita')) brand = 'Makita';
  else if (vendor.toLowerCase().includes('dewalt')) brand = 'DeWalt';
  else if (vendor.toLowerCase().includes('bosch')) brand = 'Bosch';
  else if (vendor.toLowerCase().includes('hilti')) brand = 'Hilti';
  else if (vendor.toLowerCase().includes('hikoki')) brand = 'HiKOKI';
  else if (sku.startsWith('49')) brand = 'Milwaukee';
  
  const result: BrandSearchResult = {
    brand,
    productUrl: null,
    imageUrl: null,
    officialTitle: null,
    officialDescription: null,
    specs: null
  };
  
  if (!SERPAPI_API_KEY) {
    console.log('SERPAPI_API_KEY not set');
    return result;
  }
  
  try {
    // Cerca la pagina prodotto sul sito ufficiale usando lo SKU
    const brandSites: Record<string, string> = {
      'Milwaukee': 'site:milwaukeetool.eu OR site:milwaukeetool.com',
      'Makita': 'site:makita.it OR site:makita.com',
      'DeWalt': 'site:dewalt.it OR site:dewalt.com',
      'Bosch': 'site:bosch-professional.com',
      'Hilti': 'site:hilti.it OR site:hilti.com',
      'HiKOKI': 'site:hikoki-powertools.it'
    };
    
    const siteFilter = brandSites[brand] || '';
    const searchQuery = `${sku} ${siteFilter}`;
    
    console.log(`Searching official site: ${searchQuery}`);
    
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(searchQuery)}&num=3&hl=it&gl=it&api_key=${SERPAPI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.organic_results && data.organic_results.length > 0) {
      const firstResult = data.organic_results[0];
      result.productUrl = firstResult.link;
      result.officialTitle = firstResult.title;
      result.officialDescription = firstResult.snippet;
      
      console.log(`Found official page: ${result.productUrl}`);
      
      // Cerca l'immagine dalla pagina ufficiale
      const imageUrl = await searchImageFromOfficialPage(sku, brand, result.productUrl);
      if (imageUrl) {
        result.imageUrl = imageUrl;
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('Error searching official site:', error);
    return result;
  }
}

async function searchImageFromOfficialPage(sku: string, brand: string, productUrl: string | null): Promise<string | null> {
  if (!SERPAPI_API_KEY) return null;
  
  try {
    // Cerca immagini con lo SKU specifico
    const searchQuery = `${brand} ${sku} product`;
    
    console.log(`Searching image: ${searchQuery}`);
    
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&num=10&safe=active&api_key=${SERPAPI_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.images_results && data.images_results.length > 0) {
      // Priorità ai domini ufficiali del brand
      const brandDomains: Record<string, string[]> = {
        'Milwaukee': ['milwaukeetool.eu', 'milwaukeetool.com', 'milwaukee'],
        'Makita': ['makita.it', 'makita.com', 'makita'],
        'DeWalt': ['dewalt.it', 'dewalt.com', 'dewalt'],
        'Bosch': ['bosch-professional.com', 'bosch'],
        'Hilti': ['hilti.it', 'hilti.com', 'hilti'],
        'HiKOKI': ['hikoki-powertools.it', 'hikoki']
      };
      
      const preferredDomains = brandDomains[brand] || [];
      
      // Filtra immagini valide
      const validImages = data.images_results.filter((img: any) => {
        if (!img.original) return false;
        const imgUrl = img.original.toLowerCase();
        
        // Escludi immagini non valide
        if (imgUrl.includes('placeholder')) return false;
        if (imgUrl.includes('logo') && !imgUrl.includes('product')) return false;
        if (imgUrl.includes('icon')) return false;
        if (imgUrl.includes('banner')) return false;
        if (imgUrl.includes('avatar')) return false;
        
        // Deve essere un formato immagine valido
        if (!imgUrl.match(/\.(jpg|jpeg|png|webp)/i)) return false;
        
        return true;
      });
      
      // Prima cerca nei domini ufficiali del brand
      for (const domain of preferredDomains) {
        const found = validImages.find((img: any) => 
          img.original?.toLowerCase().includes(domain)
        );
        if (found?.original) {
          console.log(`Found official brand image: ${found.original}`);
          return found.original;
        }
      }
      
      // Poi cerca in altri domini affidabili
      const trustedDomains = ['cdn.shopify.com', 'amazon', 'ferramenta', 'bricoman', 'leroymerlin', 'wurth'];
      for (const domain of trustedDomains) {
        const found = validImages.find((img: any) => 
          img.original?.toLowerCase().includes(domain)
        );
        if (found?.original) {
          console.log(`Found trusted domain image: ${found.original}`);
          return found.original;
        }
      }
      
      // Altrimenti prendi la prima immagine valida
      if (validImages.length > 0) {
        console.log(`Found image: ${validImages[0].original}`);
        return validImages[0].original;
      }
    }
    
    return null;
    
  } catch (error) {
    console.error('Error searching for image:', error);
    return null;
  }
}

// ============================================
// STEP 2: GENERAZIONE SCHEDA CON CLAUDE
// ============================================

const PRODUCT_SYSTEM_PROMPT = `Sei Marco, il tecnico senior di Autonord Service a Genova. Scrivi schede prodotto per l'e-commerce.

## REGOLE FONDAMENTALI:
1. **MANTIENI IL TITOLO ORIGINALE** - Puliscilo solo se duplicato (es. "ACCETTA 40 CM ACCETTA 40 CM" → "Accetta 40 cm")
2. **NON INVENTARE** - Usa SOLO le informazioni fornite dalla ricerca
3. **SE NON SAI, SCRIVI "Contattaci"** - Mai inventare specifiche tecniche
4. **USA LE INFO UFFICIALI** - Se hai trovato info dal sito ufficiale, usale

## STRUTTURA JSON DA RESTITUIRE:
{
  "cleanTitle": "Titolo pulito (rimuovi duplicati, mantieni sostanza)",
  "shortDescription": "Max 160 caratteri per SEO",
  "bodyHtml": "Descrizione HTML (vedi sotto)",
  "metaTitle": "Max 60 caratteri",
  "metaDescription": "Max 160 caratteri",
  "tags": ["tag1", "tag2"],
  "productType": "Categoria (es. Accette, Adattatori, Accessori)"
}

## FORMATO bodyHtml:
<h2>Descrizione</h2>
<p>[2-3 frasi basate sulle info trovate dal sito ufficiale. Se non ci sono info, scrivi "Prodotto professionale [brand]. Contattaci per specifiche dettagliate."]</p>

<h3>Caratteristiche</h3>
<ul>
<li>[Caratteristica 1 dal sito ufficiale]</li>
<li>[Caratteristica 2]</li>
</ul>

<h3>Codice Prodotto</h3>
<p>SKU: [sku] | Brand: [brand]</p>

## IMPORTANTE:
- Il titolo deve essere LEGGIBILE ma fedele all'originale
- Se hai info dal sito ufficiale Milwaukee/Makita/etc, usale!
- NON inventare funzionalità o specifiche

Restituisci SOLO il JSON valido.`;

async function generateProductContent(
  sku: string,
  originalTitle: string,
  brandInfo: BrandSearchResult,
  price: string
): Promise<any> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  
  const officialInfo = brandInfo.officialTitle || brandInfo.officialDescription 
    ? `\n\n**Informazioni dal sito ufficiale ${brandInfo.brand}:**
Titolo: ${brandInfo.officialTitle || 'N/A'}
Descrizione: ${brandInfo.officialDescription || 'N/A'}
URL: ${brandInfo.productUrl || 'N/A'}`
    : '\n\nNessuna informazione trovata dal sito ufficiale.';
  
  const userPrompt = `Genera la scheda prodotto per:

**SKU:** ${sku}
**Titolo originale:** ${originalTitle}
**Brand:** ${brandInfo.brand}
**Prezzo:** €${price}
${officialInfo}

RICORDA: 
- Pulisci il titolo SOLO se duplicato
- Usa le informazioni dal sito ufficiale se disponibili
- Se non ci sono info, scrivi "Contattaci per specifiche"`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: userPrompt }],
    system: PRODUCT_SYSTEM_PROMPT
  });
  
  const content = response.content[0];
  if (content.type === 'text') {
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }
  }
  
  // Fallback
  return {
    cleanTitle: cleanTitle(originalTitle),
    shortDescription: `${brandInfo.brand} ${cleanTitle(originalTitle)} - SKU ${sku}`,
    bodyHtml: `<h2>Descrizione</h2><p>Prodotto professionale ${brandInfo.brand}. Contattaci per specifiche dettagliate al 010 7456076.</p><h3>Codice Prodotto</h3><p>SKU: ${sku} | Brand: ${brandInfo.brand}</p>`,
    metaTitle: `${cleanTitle(originalTitle)} | ${brandInfo.brand}`,
    metaDescription: `${brandInfo.brand} ${cleanTitle(originalTitle)}. SKU ${sku}. Disponibile presso Autonord Service Genova.`,
    tags: [brandInfo.brand, 'Utensili'],
    productType: 'Accessori'
  };
}

function cleanTitle(title: string): string {
  // Rimuovi duplicati (es. "ACCETTA 40 CM ACCETTA 40 CM" → "Accetta 40 Cm")
  const words = title.split(' ');
  const halfLength = Math.floor(words.length / 2);
  
  const firstHalf = words.slice(0, halfLength).join(' ').toLowerCase();
  const secondHalf = words.slice(halfLength).join(' ').toLowerCase();
  
  let cleanedTitle = title;
  if (firstHalf === secondHalf && halfLength > 0) {
    cleanedTitle = words.slice(0, halfLength).join(' ');
  }
  
  return cleanedTitle
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// STEP 3: CREAZIONE PRODOTTO SU SHOPIFY
// ============================================

async function createShopifyProduct(
  product: ProductPayload,
  generatedContent: any,
  imageUrl: string | null,
  brand: string
): Promise<any> {
  const productInput: any = {
    title: generatedContent.cleanTitle,
    descriptionHtml: generatedContent.bodyHtml || '',
    vendor: brand,
    productType: generatedContent.productType || 'Accessori',
    tags: Array.from(new Set([brand, ...(generatedContent.tags || []), 'AI-Enhanced'])),
    status: 'ACTIVE',
    seo: {
      title: generatedContent.metaTitle,
      description: generatedContent.metaDescription
    }
  };
  
  const mutation = `
    mutation CreateProduct($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const media = imageUrl ? [{
    originalSource: imageUrl,
    mediaContentType: 'IMAGE',
    alt: generatedContent.cleanTitle
  }] : [];
  
  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: mutation,
      variables: { input: productInput, media }
    })
  });
  
  const result = await response.json();
  
  if (result.data?.productCreate?.product) {
    const productId = result.data.productCreate.product.id;
    
    // Crea variante con SKU e prezzo originali
    await createProductVariant(productId, product);
    
    // Pubblica su Online Store
    await publishProduct(productId);
  }
  
  return result;
}

async function createProductVariant(productId: string, product: ProductPayload): Promise<void> {
  const getVariantQuery = `
    query GetProduct($id: ID!) {
      product(id: $id) {
        variants(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  `;
  
  const getResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: getVariantQuery,
      variables: { id: productId }
    })
  });
  
  const getData = await getResponse.json();
  const variantId = getData.data?.product?.variants?.edges?.[0]?.node?.id;
  
  if (!variantId) return;
  
  const updateMutation = `
    mutation UpdateVariant($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
          sku
          price
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: updateMutation,
      variables: {
        input: {
          id: variantId,
          sku: product.sku,
          price: product.price,
          barcode: product.barcode,
          inventoryPolicy: 'CONTINUE'
        }
      }
    })
  });
}

async function publishProduct(productId: string): Promise<void> {
  const getPublicationsQuery = `
    query {
      publications(first: 10) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  
  const pubResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query: getPublicationsQuery })
  });
  
  const pubData = await pubResponse.json();
  const onlineStore = pubData.data?.publications?.edges?.find(
    (e: any) => e.node.name === 'Online Store'
  );
  
  if (!onlineStore) return;
  
  const publishMutation = `
    mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: publishMutation,
      variables: {
        id: productId,
        input: [{ publicationId: onlineStore.node.id }]
      }
    })
  });
}

// ============================================
// MAIN HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const payload: ProductPayload = await request.json();
    
    console.log(`\n🔄 Processing: ${payload.sku} - ${payload.title}`);
    
    // STEP 1: Cerca sul sito ufficiale del brand
    console.log('   🌐 Searching official brand site...');
    const brandInfo = await searchOnOfficialBrandSite(
      payload.sku,
      payload.title,
      payload.vendor
    );
    console.log(`   ✅ Brand: ${brandInfo.brand}`);
    if (brandInfo.productUrl) {
      console.log(`   ✅ Official page found: ${brandInfo.productUrl}`);
    }
    if (brandInfo.imageUrl) {
      console.log(`   ✅ Image found`);
    }
    
    // STEP 2: Genera contenuto con Claude
    console.log('   🤖 Generating content...');
    const generatedContent = await generateProductContent(
      payload.sku,
      payload.title,
      brandInfo,
      payload.price
    );
    console.log(`   ✅ Title: ${generatedContent.cleanTitle}`);
    
    // STEP 3: Crea prodotto su Shopify
    console.log('   📤 Creating on Shopify...');
    const result = await createShopifyProduct(
      payload,
      generatedContent,
      brandInfo.imageUrl,
      brandInfo.brand
    );
    
    if (result.data?.productCreate?.product) {
      console.log(`   ✅ Created: ${result.data.productCreate.product.handle}`);
      return NextResponse.json({
        success: true,
        product: result.data.productCreate.product,
        sku: payload.sku,
        imageFound: !!brandInfo.imageUrl
      });
    } else {
      console.error('   ❌ Shopify errors:', result.data?.productCreate?.userErrors);
      return NextResponse.json({
        success: false,
        error: 'Failed to create product',
        details: result.data?.productCreate?.userErrors
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Worker error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Product regeneration worker',
    description: 'POST with product payload to regenerate a single product'
  });
}
