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
