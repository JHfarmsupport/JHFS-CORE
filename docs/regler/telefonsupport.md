# Telefonsupport – regler

Kode: `packages/core/src/telefonsupport.ts` · Værdier: `packages/core/src/standardregler.ts`

## Fælles
- Pris: normal **250 kr** pr. kvarter, efter kl. 17 og weekend/helligdag **500 kr** pr. kvarter.
- Varenumre i e-conomic: `Tlfsup015` normal · `Tlfsup115` weekend/helligdag · `Tlfsup215` efter kl. 17.
- Alle opkald til samme kunde i samme måned lægges sammen pr. tidstype, og først derefter rundes der op.
- Flere kontakter hos samme kunde = samme kunde.
- Ubesvarede opkald tæller ikke. Er der tid, er det mindst 1 kvarter.
- Helligdage: de officielle + grundlovsdag.

## 2025 (sådan er Fakturagrundlag 2025 regnet)
- Påbegyndt kvarter uden tolerance (16 min = 2 kvarterer).
- Aften og weekend lagt sammen før afrunding.
- Kontrol: alle 205 linjer og totalen 114.750 kr genskabes præcist i testen.

## 2026 (Jens, 12/11-2026)
- 2 minutters tolerance: op til 32 min = 2 kvarterer, 33 min = 3 kvarterer (= 45 min).
- Besvarede opkald under 1 minut tæller med deres sekunder.
- Én samlet faktura pr. kunde for hele året, med en tekstblok og varelinjer pr. måned.

## Åbne spørgsmål til Jens
1. **Aften og weekend – hver for sig eller samlet?** 2025-arket lagde dem sammen før afrunding,
   men 2025-fakturaerne har dem på hver sin varelinje (Tlfsup115 og Tlfsup215). Koden kører lige nu
   "hver for sig" for 2026.
2. **Juleaften og nytårsaften** – helligdag (500 kr) eller normal?
