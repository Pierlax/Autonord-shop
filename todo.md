# Autonord Service - UX/UI Improvements TODO

Based on Sirio website analysis, implement the following improvements:

## Header & Navigation
- [x] Add WhatsApp floating button for quick contact
- [x] Add newsletter popup/banner with discount offer
- [x] Add brand logos section (Milwaukee, Makita, Bosch, etc.)

## Homepage
- [x] Add promotional banners carousel (like Sirio's 3-banner hero)
- [x] Add "Categorie in evidenza" section with lifestyle images
- [x] Add "Offerte" / Promo section with discount badges on products
- [x] Add B2B dedicated section with CTA
- [x] Add Newsletter signup section with discount incentive
- [x] Improve trust indicators bar with better icons and layout

## Product Display
- [x] Add discount percentage badges on product cards
- [x] Improve product card hover effects
- [x] Add "Novità" badge for new products

## Footer
- [x] Add more payment method icons (PayPal, Visa, Mastercard, etc.)
- [x] Add social media links with icons
- [x] Improve footer layout with multiple columns

## Previously Completed
- [x] Basic homepage layout
- [x] Navigation menu
- [x] Product cards with stock badges
- [x] Cart feedback with toast
- [x] Chi Siamo page
- [x] Contatti page
- [x] Privacy Policy page
- [x] Termini e Condizioni page
- [x] Spedizioni e Resi page
- [x] Garanzia Prodotti page
- [x] Noleggio & Assistenza page


## Brand & Vendor Improvements
- [x] Download and add brand logos (Milwaukee, Makita, Bosch, DeWalt, Hilti, Metabo)
- [x] Fix vendor name display to show brand instead of legal company name


## Blog & Content Strategy (They Ask You Answer)
- [x] Review TAYA principles from PDF
- [x] Create /app/blog/page.tsx (article list)
- [x] Create /app/blog/[slug]/page.tsx (article detail)
- [x] Create BlogCard component
- [x] Setup blog data structure (using TypeScript instead of MDX for simplicity)
- [x] Create Big 5 Article 1: Costi/Prezzi - "Quanto costa attrezzare un furgone da elettricista"
- [x] Create Big 5 Article 2: Problemi - "5 motivi per cui il tassellatore si surriscalda"
- [x] Create Big 5 Article 3: Confronti - "Milwaukee M18 vs Makita 40V"
- [x] Create Big 5 Article 4: Recensioni - "I 3 migliori avvitatori a impulsi per gommisti"
- [x] Create Big 5 Article 5: Migliori - "Chi produce i migliori dischi diamantati"
- [x] Add FAQ section to ProductPage with Schema Markup
- [x] Add "Related Articles" section to ProductPage
- [x] Add "Risorse Utili" section to Footer


## Improved Blog Articles (Research-Based)
- [x] Research Milwaukee OneKey Resources for technical insights
- [x] Research Reddit r/Construction discussions for real professional opinions
- [x] Rewrite Milwaukee M18 vs Makita 40V article with authentic insights
- [x] Create new Milwaukee vs DeWalt comparison article (merged into main comparison)
- [x] Update articles with real quotes and experiences from professionals
- [x] Download professional tool images (Milwaukee, Makita, DeWalt)
- [x] Create comparison charts and infographics (tables in articles)
- [x] Add hero images for each blog article
- [x] Include product photography in articles


## TAYA Refactoring (They Ask You Answer)
- [x] TASK 1: Move Blog to primary navigation as "GUIDE E CONFRONTI"
- [x] TASK 2: Redesign Hero with trust-based copy
- [x] TASK 2: Add "Big 5" section on homepage with 3 cards
- [x] TASK 3: Create ExpertReview component for product pages
- [x] TASK 3: Add Pro/Contro honest reviews to products
- [x] TASK 3: Improve "Su Ordinazione" label clarity
- [x] TASK 4: Verify Big 5 articles are complete (already done)


## Homepage Logo Update
- [x] Replace "THEY ASK, YOU ANSWER" badge with Autonord Service logo in hero section


## Integration from Current Autonord Website
- [x] Add real company address to footer (Lungobisagno d'Istria 34 - 16141 Genova)
- [x] Add P.IVA to footer (02579430990)
- [x] Create dedicated Yanmar section (exclusive dealer for Genova)
- [x] Add Yanmar miniescavatori to rental page with images
- [x] Add EU funding badge (PR FESR Liguria 2021-2027)
- [ ] Expand brand logos to include more partners (50+ brands)
- [x] Update About page with authentic company description
- [ ] Add "Abbigliamento Antinfortunistico" category


## Official Logo Integration
- [x] Download official Autonord Service logo from current website
- [x] Replace text logo with official logo in header
- [x] Replace text logo with official logo in homepage hero


## Final TAYA Elements
- [x] Implement unified search (products + blog articles)
- [x] Add video support in product gallery (YouTube/HTML5)
- [x] Create Team Trust section with photo and technician name
- [x] Add "Expert Take" micro-copy to product cards in carousel


## Shopify Product Enrichment Agent
- [x] Create /api/webhooks/enrich-product endpoint
- [x] Implement Shopify webhook HMAC verification
- [x] Create AI content generation with OpenAI (description, pro/contro, FAQ)
- [x] Implement Shopify Admin API integration for metafields
- [x] Add "AI-Enhanced" tag to processed products
- [x] Create types and utility functions
- [x] Document environment variables needed


## Image Search & Upload Feature
- [x] Research image search APIs (Google Images, Bing, SerpAPI, etc.)
- [x] Implement image search function to find product images by SKU/title/brand
- [x] Add Shopify Admin API image upload functionality
- [x] Integrate image search into enrichment webhook
- [x] Add fallback logic if no images found
- [x] Update documentation with image search feature


## Switch from OpenAI to Claude
- [x] Replace OpenAI SDK with Anthropic SDK
- [x] Update ai-enrichment.ts to use Claude API
- [x] Update package.json dependencies
- [x] Update documentation with ANTHROPIC_API_KEY


## Footer Updates
- [x] Remove EU funding badge (PR FESR Liguria)
- [x] Improve payment methods layout


## Blog Researcher Agent
- [x] Research search APIs (Exa.ai, Tavily) for forum scraping
- [x] Create search module for Reddit/forum scanning
- [x] Create analysis module to identify pain points
- [x] Create article drafting module with Claude
- [x] Create Shopify Blog API integration for draft creation
- [x] Create notification system (email/webhook)
- [x] Create Vercel Cron Job endpoint
- [x] Document environment variables and setup


## Quality Upgrade - Claude Opus
- [x] Upgrade Product Enrichment to Claude Opus
- [x] Enhance prompts with examples and anti-robot instructions
- [x] Upgrade Blog Researcher to Claude Opus
- [x] Add variability and Italian cultural context
- [x] Add quality control checks


## Autonomous TAYA Developer Agent
- [x] Create TAYA_RULES.md with They Ask You Answer principles
- [x] Create taya-improver.ts script using Claude API native tools
- [x] Create GitHub Action workflow for automated execution
- [x] Add documentation for the agent



## Queue System Implementation (Vercel Timeout Fix)
- [x] Research Upstash Redis/QStash for queue implementation
- [x] Create queue infrastructure module
- [x] Refactor webhook to add jobs to queue (not process immediately)
- [x] Create worker endpoint to process jobs from queue
- [x] Add rate limiting (handled by QStash automatically)
- [x] Update documentation with new architecture


## GO-LIVE Product Enrichment End-to-End
### A) Product Enrichment Agent
- [x] Fix webhook route with Claude SDK (@anthropic-ai/sdk)
- [x] HMAC signature verification
- [x] Idempotency check (AI-Enhanced tag or metafield)
- [x] TAYA prompt with Marco persona
- [x] Rate limit and retry with backoff (QStash handles this)

### B) Shopify Metafields
- [x] Save custom.pros (list)
- [x] Save custom.cons (list)
- [x] Save custom.faqs (JSON)
- [x] Save custom.ai_description (text)
- [x] Update body_html with formatted description
- [x] Add AI-Enhanced tag

### C) Frontend PDP
- [x] Update Storefront API query for metafields
- [x] Create ProsConsSection component
- [x] Create FAQAccordion component
- [x] Update ExpertReview component with AI data support
- [x] Add fallback for missing metafields

### D) Logging & Observability
- [x] Log productId, handle, duration, outcome
- [x] Error handling with meaningful messages
- [x] Structured logging utility (lib/logging.ts)

### E) Documentation
- [x] Update GO_LIVE_CHECKLIST.md
- [x] Push all changes to GitHub (commit 9e5a131)


## ATTIVAZIONE AGENTI AI - Checklist Operativa

### FASE 1: Anthropic API Key
- [ ] Ottenere API key da console.anthropic.com
- [ ] Aggiungere ANTHROPIC_API_KEY su Vercel

### FASE 2: QStash (Upstash)
- [ ] Creare account su upstash.com
- [ ] Creare QStash instance
- [ ] Aggiungere QSTASH_TOKEN su Vercel
- [ ] Aggiungere QSTASH_CURRENT_SIGNING_KEY su Vercel
- [ ] Aggiungere QSTASH_NEXT_SIGNING_KEY su Vercel

### FASE 3: Webhook Shopify
- [ ] Andare su Shopify Admin → Settings → Notifications → Webhooks
- [ ] Creare webhook products/create
- [ ] Creare webhook products/update
- [ ] Copiare SHOPIFY_WEBHOOK_SECRET su Vercel

### FASE 4: Cron Job Blog Researcher
- [ ] Verificare vercel.json ha cron configurato
- [ ] Deploy su Vercel per attivare cron

### FASE 5: Test Product Enrichment
- [ ] Creare prodotto test su Shopify
- [ ] Verificare webhook ricevuto
- [ ] Verificare job in QStash
- [ ] Verificare metafields popolati
- [ ] Verificare frontend mostra dati AI

### FASE 6: Test Blog Researcher
- [ ] Trigger manuale cron endpoint
- [ ] Verificare draft creato su Shopify Blog
- [ ] Verificare notifica ricevuta

### FASE 7: TAYA Improver
- [ ] Eseguire localmente con ANTHROPIC_API_KEY
- [ ] Verificare PR creata su GitHub

## TAYA Director - Central Orchestrator

### Architettura
- [x] Creare lib/taya-director/ con struttura moduli
- [x] Definire tipi e interfacce (QualityScore, DirectorDecision, etc.)

### Supervisor Module (The Editor)
- [x] Implementare valutazione qualità contenuti TAYA
- [x] Creare scoring system (tayaCompliance, readability, uniqueness, actionability)
- [x] Implementare logica "bocciato → riprova" via QStash

### Strategist Module (The Planner)
- [x] Implementare analisi gap catalogo/contenuti
- [x] Creare prioritizzazione (alto traffico, categorie vuote, etc.)
- [x] Implementare commissioning articoli a Agente 2

### Orchestrator Module (The Coordinator)
- [x] Implementare coordinamento agenti via QStash
- [x] Aggiungere rate limiting intelligente
- [x] Creare logging decisioni

### Cron Endpoint
- [x] Creare /api/cron/taya-director/route.ts
- [x] Configurare esecuzione notturna in vercel.json (2:00 AM)

### Documentazione
- [x] Creare docs/TAYA_DIRECTOR.md con architettura e guida


## Agente 2 Upgrade - Fonti e Ricerca

### Whitelist Fonti
- [x] Configurare priorità protoolreviews.com
- [x] Configurare priorità toolguyd.com
- [x] Configurare priorità tooltalk.com

### Sentiment Analysis Forum
- [x] Implementare ricerca reddit.com/r/Tools
- [x] Implementare ricerca plcforum.it
- [x] Implementare ricerca forum-macchine.it
- [x] Query pattern: "[Prodotto] problemi", "[Prodotto] guasto", "opinioni [Prodotto]"

### Struttura Articolo Obbligatoria
- [x] Tabella comparativa con dati numerici
- [x] Sezione "Cosa dicono nei cantieri"
- [x] Sezione "Il Verdetto di Autonord"

### Pacchetto Lancio (5 Articoli) - Script pronto
- [x] Articolo 1: Milwaukee M18 FUEL vs Makita 40V XGT
- [x] Articolo 2: DeWalt vs Milwaukee - Trapani a percussione
- [x] Articolo 3: Batterie Milwaukee - Cause e soluzioni
- [x] Articolo 4: Hilti TE 30-A36 - Vale il prezzo premium?
- [x] Articolo 5: Come scegliere avvitatore per elettricisti

*Nota: Script pronto in scripts/generate-launch-articles.ts - eseguire dopo configurazione ANTHROPIC_API_KEY*


## Agente 1 Upgrade - Fonti Scheda Prodotto

### Gerarchia Fonti Dati Tecnici
- [x] Configurare priorità: Sito Ufficiale > Manuale PDF > Retailer
- [x] Implementare risoluzione conflitti (vince Sito Ufficiale)
- [x] Mapping URL siti ufficiali per brand (8 brand configurati)

### Parere Autonord & Pro/Contro
- [x] Implementare ricerca recensioni 3-4 stelle Amazon
- [x] Implementare ricerca Reddit r/Tools "problem" / "issue"
- [x] Sintesi automatica problemi ricorrenti

### Accessori Consigliati
- [x] Analisi competitor (Fixami, Rotopino, Toolnation, Amazon)
- [x] Estrazione accessori correlati con motivazione

### Safety Check
- [x] Logging dati incerti/conflittuali (generateSafetyLog)
- [x] Flag "verifica manuale richiesta" (dataQuality.manualCheckRequired)
- [x] Omissione automatica dati non verificabili


## CLaRa-Inspired Improvements

### Idea 1: Simple QA + Complex QA
- [x] Creare modulo two-phase-qa.ts per Agente 1
- [x] Implementare estrazione fatti atomici (Simple QA)
- [x] Implementare ragionamento relazionale (Complex QA)
- [x] Esportato da lib/shopify/

### Idea 2: Verification & Regeneration
- [x] Creare lib/taya-director/verifier.ts
- [x] Implementare checkFactCoverage()
- [x] Implementare checkFactualConsistency()
- [x] Implementare regenerateWithFeedback()
- [x] Implementare verifyAndRegenerateLoop()
- [x] Esportato da lib/taya-director/

### Idea 3: Query Expansion
- [x] Creare lib/blog-researcher/query-expander.ts
- [x] Implementare espansione query con Claude (AI)
- [x] Implementare espansione query con template (fallback)
- [x] Generare varianti: technical, problem, comparison, forum, review, howto
- [x] Implementare prioritizzazione per tipo articolo
- [x] Esportato da lib/blog-researcher/

### Idea 4: Weighted Source Fusion
- [x] Creare lib/shopify/source-fusion.ts
- [x] Implementare raggruppamento fatti simili (groupFactsByKey)
- [x] Implementare calcolo confidence score (calculateConfidence)
- [x] Implementare rilevamento conflitti (detectConflicts)
- [x] Implementare flag "needsVerification"
- [x] Implementare generateFusionReport() per logging


## Gap Analysis Fixes (Trinità Filosofica - Jan 2026)

### P1 - Critical Gaps
- [x] GAP 2: Add competitor price comparison to product pages
- [x] GAP 6: Add Quick Summary block at top of product pages
- [x] GAP 9: Add 3 JTBD Dimensions (Functional/Emotional/Social) to ExpertReview

### P2 - High Priority Gaps
- [x] GAP 4: Create "Best X for Y" pages (Best drills for electricians, etc.)
- [x] GAP 10: Add "4 Forces of Progress" content to product pages
- [x] GAP 3: Create systematic "Problems" content for each brand

### P3 - Medium Priority Gaps
- [x] GAP 5: Optimize product page length with collapsible sections
- [x] GAP 7: Improve mobile UX (tap-friendly FAQs, responsive tables)
- [x] GAP 8: Add TL;DR to blog articles

### P4-P5 - Lower Priority Gaps
- [x] GAP 1: Complete Big 5 content coverage
- [x] GAP 11: Add Job Stories format to products
- [x] GAP 12: Add "What are you using now?" section
- [x] GAP 13: Sync pragmatic-truth.ts with frontend components
- [x] GAP 14: Improve AI compliance with TAYA principles
- [x] GAP 15: Add Voice of Customer system (feedback form)

## Dispensa Piena - Knowledge Base Fixes (2026-01-16)

- [x] Create data/competitor-benchmarks.json with Big Three data
- [x] Create data/agent-memory.json with Brand Notes and verified facts
- [x] Create lib/shopify/benchmark-loader.ts module
- [x] Modify universal-rag.ts to load benchmarks as mandatory context
- [x] Fix sentiment.ts with multi-strategy fallback (SerpAPI → Exa → Google → DuckDuckGo)
- [x] Update query-expander.ts with TAYA shadow queries for problems

## Code Cleanup (January 2026)

- [x] Remove test-shopify.js from root (unused test file)
- [x] Remove ai-enrichment-v2.ts (superseded by v3)
- [x] Update ai-enrichment-v3.ts re-exports (remove v2 reference)
- [x] Replace console.log with structured logger in all production files (293 → 0)
- [x] Migrate route.ts from ai-enrichment.ts to ai-enrichment-v3.ts
- [x] Remove ai-enrichment.ts (V1) - fully deprecated
- [x] Create lib/logger.ts universal logger module
