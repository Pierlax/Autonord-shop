# TAYA Rules - They Ask You Answer

Queste sono le regole che il codice del sito Autonord Service deve rispettare per aderire alla filosofia "They Ask You Answer" di Marcus Sheridan.

---

## REGOLA 1: Trasparenza sui Prezzi

**I prezzi devono essere sempre visibili.**

- ❌ MAI nascondere i prezzi dietro "Richiedi preventivo" (tranne per prodotti B2B specifici)
- ❌ MAI usare "Prezzo su richiesta" senza una ragione valida
- ✅ Mostrare sempre il prezzo con "+ IVA" per B2B
- ✅ Se il prezzo varia, spiegare PERCHÉ varia e dare un range

**Verifica nel codice:**
- Ogni ProductCard deve mostrare `formattedPrice`
- Se `isB2B === true`, mostrare "Richiedi Preventivo" con spiegazione del perché

---

## REGOLA 2: Pro e Contro Onesti

**Ogni prodotto deve avere una sezione "Pro & Contro" onesta.**

- ❌ MAI solo punti positivi
- ❌ MAI usare linguaggio generico ("ottima qualità", "eccellente prodotto")
- ✅ Almeno 2-3 PRO specifici e tecnici
- ✅ Almeno 1-2 CONTRO reali e onesti
- ✅ I contro devono essere utili, non banali ("costa di più" non è un contro utile)

**Verifica nel codice:**
- Il componente `ExpertReview` deve esistere in ogni pagina prodotto
- I metafield `taya_pros` e `taya_cons` devono essere popolati

---

## REGOLA 3: Contenuti Educativi in Primo Piano

**La navigazione deve dare priorità ai contenuti educativi.**

- ❌ MAI nascondere il blog in fondo al menu
- ❌ MAI chiamarlo solo "Blog" (troppo generico)
- ✅ Usare nomi come "Guide e Confronti", "Risorse", "Impara"
- ✅ Il link deve essere tra i primi 3 elementi della navigazione principale
- ✅ Homepage deve avere una sezione dedicata agli articoli "Big 5"

**Verifica nel codice:**
- Nel componente Header/Navigation, "Guide e Confronti" deve essere visibile
- Homepage deve avere `Big5Section` o simile

---

## REGOLA 4: Niente "Corporate Fluff"

**Il linguaggio deve essere diretto e umano, mai aziendalese.**

- ❌ MAI usare: "leader di settore", "soluzioni innovative", "eccellenza", "a 360 gradi"
- ❌ MAI usare: "siamo lieti di", "non esitate a contattarci"
- ❌ MAI iniziare con "Benvenuti nel nostro sito"
- ✅ Parlare come parlerebbe un tecnico esperto a un collega
- ✅ Usare "tu" invece di "voi" o forme impersonali
- ✅ Essere specifici: numeri, dati, esempi concreti

**Verifica nel codice:**
- Cercare e rimuovere le frasi vietate in tutti i file `.tsx`
- I testi devono contenere dati specifici, non aggettivi vuoti

---

## REGOLA 5: Domande Frequenti Reali

**Le FAQ devono rispondere a domande che i clienti fanno davvero.**

- ❌ MAI FAQ generiche copiate da template
- ❌ MAI domande che nessuno farebbe ("Perché scegliere noi?")
- ✅ Domande pratiche: "Quanto dura la batteria?", "Posso usarlo sotto la pioggia?"
- ✅ Domande scomode: "Perché costa più della concorrenza?"
- ✅ Almeno 3 FAQ per prodotto

**Verifica nel codice:**
- Componente `ProductFAQ` deve esistere
- Le FAQ devono avere Schema.org markup per SEO

---

## REGOLA 6: Confronti Diretti

**Non aver paura di confrontare prodotti, anche con la concorrenza.**

- ❌ MAI evitare di nominare i concorrenti
- ❌ MAI dire "il nostro prodotto è migliore" senza prove
- ✅ Confronti tabellari con specifiche tecniche
- ✅ Dichiarare quando un concorrente è migliore in qualcosa
- ✅ Spiegare per CHI è meglio ogni opzione

**Verifica nel codice:**
- Articoli di tipo "Confronto" devono avere tabelle comparative
- Le tabelle devono includere almeno: prezzo, specifiche chiave, pro/contro

---

## REGOLA 7: Disponibilità e Stock Chiari

**Lo stato di disponibilità deve essere immediatamente visibile.**

- ❌ MAI nascondere che un prodotto è esaurito
- ❌ MAI mostrare "Disponibile" se non lo è
- ✅ Badge colorati: Verde (disponibile), Arancione (ultime unità), Giallo (su ordinazione)
- ✅ Tempi di consegna stimati sempre visibili
- ✅ Quantità disponibile se < 10 unità

**Verifica nel codice:**
- `StockStatus` component deve mostrare quantità reale
- Colori devono seguire la convenzione (emerald/orange/amber)

---

## REGOLA 8: Call-to-Action Oneste

**I pulsanti devono dire esattamente cosa succede.**

- ❌ MAI "Clicca qui" o "Scopri di più" generici
- ❌ MAI CTA ingannevoli che portano a form invece che a info
- ✅ "Acquista Ora" se porta al checkout
- ✅ "Richiedi Preventivo" se apre un form
- ✅ "Leggi la Guida Completa" se porta a un articolo

**Verifica nel codice:**
- Tutti i `<button>` e `<Link>` devono avere testo descrittivo
- Il comportamento deve corrispondere al testo

---

## REGOLA 9: Contatti Sempre Accessibili

**Il cliente deve poter contattarti in massimo 2 click da qualsiasi pagina.**

- ❌ MAI nascondere il numero di telefono
- ❌ MAI solo form di contatto senza alternative
- ✅ Telefono visibile in header o footer
- ✅ WhatsApp floating button
- ✅ Email cliccabile (mailto:)
- ✅ Indirizzo fisico con link a Google Maps

**Verifica nel codice:**
- Header o Footer deve contenere telefono
- `WhatsAppButton` component deve esistere
- Link a Maps nell'indirizzo

---

## REGOLA 10: Mobile-First con Sostanza

**L'esperienza mobile deve essere completa, non ridotta.**

- ❌ MAI nascondere informazioni su mobile "per risparmiare spazio"
- ❌ MAI menu hamburger che nasconde tutto
- ✅ Sticky CTA per acquisto su mobile
- ✅ Immagini ottimizzate ma non pixelate
- ✅ Testi leggibili senza zoom (min 16px)

**Verifica nel codice:**
- `StickyMobileCTA` deve esistere nelle pagine prodotto
- Font-size base deve essere almeno `text-base` (16px)
- Immagini devono usare `next/image` con ottimizzazione

---

## Come Usare Queste Regole

Quando analizzi il codice:

1. **Leggi** il file o componente
2. **Verifica** contro ogni regola applicabile
3. **Identifica** UNA violazione (la più grave)
4. **Correggi** con una modifica minimale ma efficace
5. **Spiega** perché la modifica migliora l'aderenza TAYA

### Priorità delle Violazioni

1. **Critica**: Prezzi nascosti, informazioni false
2. **Alta**: Mancanza di Pro/Contro, linguaggio corporate
3. **Media**: FAQ generiche, CTA vaghe
4. **Bassa**: Ottimizzazioni mobile, micro-copy

---

*Regole basate su "They Ask You Answer" di Marcus Sheridan, adattate per e-commerce B2B di elettroutensili.*
