/**
 * Endpoint per accodare la generazione di 15 articoli blog
 * Usa QStash per evitare timeout
 * POST /api/cron/generate-all-articles
 */

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const QSTASH_TOKEN = process.env.QSTASH_TOKEN!;
const CRON_SECRET = process.env.CRON_SECRET;
const SHOPIFY_STORE = 'autonord-service.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

// Use production URL
const BASE_URL = 'https://autonord-shop.vercel.app';

interface ArticlePlan {
  id: number;
  category: string;
  title: string;
  topic: string;
  imageQuery: string;
  featured?: boolean;
}

const ARTICLES_PLAN: ArticlePlan[] = [
  {
    id: 1,
    category: "Prezzi e Costi",
    title: "Quanto Costa Davvero Attrezzare un Furgone da Elettricista? Guida ai Prezzi 2026",
    topic: "Costi reali per allestire un furgone da elettricista professionista con tutti gli utensili necessari. Includi: lista completa utensili, prezzi per fascia (entry-level, medio, professionale), costi nascosti, come risparmiare senza compromettere la qualità.",
    imageQuery: "electrician van tools equipment professional",
    featured: true
  },
  {
    id: 2,
    category: "Prezzi e Costi",
    title: "Milwaukee M18: Quanto Costa Costruire un Kit Completo? Analisi Prezzi 2026",
    topic: "Analisi dettagliata dei costi per costruire un kit Milwaukee M18 completo. Confronta: kit base vs kit professionale, prezzi singoli utensili vs combo kit, quando conviene comprare separatamente, strategie per costruire il kit gradualmente.",
    imageQuery: "Milwaukee M18 FUEL power tools kit red"
  },
  {
    id: 3,
    category: "Prezzi e Costi",
    title: "Batterie Originali vs Compatibili: Vale la Pena Risparmiare?",
    topic: "Confronto onesto tra batterie originali e compatibili per Milwaukee, Makita, DeWalt. Test reali: durata cicli, capacità effettiva, sicurezza, garanzia. Quando le compatibili sono ok e quando è meglio evitarle.",
    imageQuery: "power tool batteries Milwaukee Makita comparison"
  },
  {
    id: 4,
    category: "Confronti",
    title: "Milwaukee vs Makita vs DeWalt: Il Confronto Definitivo per Professionisti 2026",
    topic: "Confronto imparziale dei tre giganti. Analizza: ecosistema batterie, assistenza in Italia, prezzi medi, punti di forza e debolezza di ciascuno, quale scegliere per ogni mestiere (elettricista, idraulico, carpentiere, meccanico).",
    imageQuery: "Milwaukee Makita DeWalt power tools comparison",
    featured: true
  },
  {
    id: 5,
    category: "Confronti",
    title: "Makita 40V XGT vs 18V LXT: Vale la Pena l'Upgrade?",
    topic: "Guida per chi ha già Makita 18V LXT e valuta il 40V XGT. Quando conviene: potenza necessaria, compatibilità, costi di transizione, utensili disponibili. Casi d'uso specifici dove il 40V fa davvero la differenza.",
    imageQuery: "Makita XGT 40V vs LXT 18V tools"
  },
  {
    id: 6,
    category: "Confronti",
    title: "Hilti vs Milwaukee: Chi Vince nel Cantiere Pesante?",
    topic: "Confronto per lavori industriali pesanti. Analizza: tassellatori, demolitori, sistemi di ancoraggio, assistenza e noleggio, costo totale di proprietà. Quando Hilti vale il premium e quando Milwaukee basta.",
    imageQuery: "Hilti Milwaukee construction heavy duty tools"
  },
  {
    id: 7,
    category: "Confronti",
    title: "I 5 Migliori Tassellatori SDS-Plus per Muratori 2026",
    topic: "Classifica dei migliori tassellatori SDS-Plus. Per ogni modello: specifiche, prezzo, pro e contro reali, per chi è adatto. Include: Bosch GBH, Milwaukee M18 CHX, Makita HR2470, DeWalt DCH273, Hilti TE 4-A22.",
    imageQuery: "SDS Plus rotary hammer drill professional"
  },
  {
    id: 8,
    category: "Problemi e Soluzioni",
    title: "Batteria Milwaukee che Non Si Carica: 7 Cause e Soluzioni",
    topic: "Guida troubleshooting completa. Cause: temperatura, celle danneggiate, contatti sporchi, caricatore difettoso, firmware. Soluzioni step-by-step, quando è riparabile e quando va sostituita, come prevenire.",
    imageQuery: "Milwaukee M18 battery charger troubleshooting"
  },
  {
    id: 9,
    category: "Problemi e Soluzioni",
    title: "Perché il Tuo Avvitatore Perde Potenza? Diagnosi e Soluzioni",
    topic: "Diagnosi perdita potenza avvitatori. Cause: batteria degradata, carboncini consumati, ingranaggi usurati, elettronica. Test da fare, manutenzione preventiva, quando riparare vs sostituire.",
    imageQuery: "impact driver repair maintenance power tools"
  },
  {
    id: 10,
    category: "Problemi e Soluzioni",
    title: "Come Prolungare la Vita delle Batterie al Litio: Guida Completa",
    topic: "Best practices per batterie Li-Ion. Cosa fare: cicli di carica ottimali, temperatura di stoccaggio, quando ricaricare. Cosa evitare: scarica completa, caldo/freddo estremo, carica notturna. Miti da sfatare.",
    imageQuery: "lithium battery power tools care maintenance"
  },
  {
    id: 11,
    category: "Problemi e Soluzioni",
    title: "Tassellatore che Si Surriscalda: Cause e Prevenzione",
    topic: "Perché i tassellatori si surriscaldano. Cause: punte spuntate, pressione eccessiva, mancanza lubrificazione, ventilazione bloccata. Prevenzione, manutenzione SDS, quando fermarsi, danni da evitare.",
    imageQuery: "rotary hammer drill overheating maintenance"
  },
  {
    id: 12,
    category: "Guide Pratiche",
    title: "Come Scegliere il Primo Kit di Utensili Cordless: Guida per Chi Inizia",
    topic: "Guida per principianti. Errori comuni da evitare, quale brand scegliere, utensili essenziali vs nice-to-have, budget realistici per fascia, come costruire il kit gradualmente, combo kit vs acquisti singoli.",
    imageQuery: "cordless power tools starter kit beginner"
  },
  {
    id: 13,
    category: "Guide Pratiche",
    title: "Milwaukee M12 vs M18: Quale Sistema Scegliere?",
    topic: "Guida alla scelta tra M12 compatto e M18 potente. Casi d'uso: M12 per elettricisti e spazi stretti, M18 per potenza. Utensili disponibili solo in un sistema, strategia dual-system, costi comparati.",
    imageQuery: "Milwaukee M12 M18 tools comparison compact"
  },
  {
    id: 14,
    category: "Recensioni",
    title: "I 5 Migliori Avvitatori a Impulsi per Meccanici e Gommisti 2026",
    topic: "Classifica avvitatori a impulsi 1/2 pollice per officine. Modelli: Milwaukee M18 FHIWF12, Makita DTW1002, DeWalt DCF899, Ingersoll Rand W7152. Per ogni modello: coppia, velocità, ergonomia, prezzo, verdetto.",
    imageQuery: "impact wrench mechanic automotive 1/2 inch",
    featured: true
  },
  {
    id: 15,
    category: "Recensioni",
    title: "Smerigliatrici Angolari a Batteria: Le Migliori del 2026",
    topic: "Confronto smerigliatrici 115/125mm cordless. Modelli: Milwaukee M18 CAG125X, Makita DGA504, DeWalt DCG405, Bosch GWS 18V-10. Analisi: potenza vs cablate, autonomia, sicurezza, per quale uso.",
    imageQuery: "cordless angle grinder 125mm professional"
  }
];

async function getBlogId(): Promise<string> {
  const query = `query { blogs(first: 1) { edges { node { id handle } } } }`;
  
  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query })
  });
  
  const data = await response.json();
  return data.data?.blogs?.edges[0]?.node?.id || 'gid://shopify/Blog/90210009430';
}

export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('🚀 Queueing blog article generation...');
  
  try {
    // Get blog ID
    const blogId = await getBlogId();
    console.log(`📚 Blog ID: ${blogId}`);
    
    // Initialize QStash client
    const qstash = new Client({ token: QSTASH_TOKEN });
    
    let queued = 0;
    let failed = 0;
    
    for (const article of ARTICLES_PLAN) {
      try {
        const payload = {
          ...article,
          blogId
        };
        
        // Queue the article generation with delay to avoid rate limiting
        // Each article gets a 60-second delay from the previous one
        await qstash.publishJSON({
          url: `${BASE_URL}/api/workers/generate-article`,
          body: payload,
          delay: queued * 60 // 60 seconds between each article
        });
        
        console.log(`✅ Queued [${article.id}/15]: ${article.title}`);
        queued++;
        
      } catch (error) {
        console.error(`❌ Failed to queue [${article.id}]: ${error}`);
        failed++;
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Queued ${queued} articles for generation, ${failed} failed to queue`,
      queued,
      failed,
      estimatedCompletionMinutes: queued * 1.5 // ~90 seconds per article
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to queue article generation',
    articlesPlanned: ARTICLES_PLAN.length,
    categories: Array.from(new Set(ARTICLES_PLAN.map(a => a.category)))
  });
}
