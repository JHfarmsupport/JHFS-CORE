/**
 * JH Farm Supports regler – startværdier.
 *
 * Senere ligger reglerne i databasen pr. firma og kan ændres af Jens med en ja-knap.
 * Her står de som udgangspunkt, så de kan testes. Hver ændring = ny regel med ny dato.
 */
import { dato } from "./dato.js";
import { kr } from "./penge.js";
import type { Regel } from "./regler.js";
import type { TelefonsupportRegel } from "./telefonsupport.js";

const faelles = {
  kvarterSekunder: 15 * 60,
  mindstEtKvarter: true,
  aftenFraMinut: 17 * 60,
  priser: { normal: kr(250), aften: kr(500), weekend: kr(500) },
  varenumre: { normal: "Tlfsup015", weekend: "Tlfsup115", aften: "Tlfsup215" },
} as const;

export const TELEFONSUPPORT_REGLER: readonly Regel<TelefonsupportRegel>[] = [
  {
    navn: "Telefonsupport 2025",
    gyldigFra: dato("2025-01-01"),
    gyldigTil: dato("2025-12-31"),
    begrundelse:
      "Sådan er Fakturagrundlag 2025 regnet: påbegyndt kvarter uden tolerance, aften og weekend lagt sammen før afrunding. Grundlovsdag talt som helligdag.",
    vaerdi: {
      ...faelles,
      toleranceSekunder: 0,
      aftenOgWeekendSamlet: true,
      ekstraFridage: ["grundlovsdag"],
    },
  },
  {
    navn: "Telefonsupport 2026",
    gyldigFra: dato("2026-01-01"),
    begrundelse:
      "Jens 12/11-2026: 2 minutters tolerance (33 min = 45 min), opkald under 1 min tæller, én samlet faktura pr. kunde for året. Grundlovsdag som helligdag som i 2025. ÅBENT: skal aften og weekend rundes hver for sig (som varelinjerne på 2025-fakturaerne) eller samlet (som i 2025-arket)?",
    vaerdi: {
      ...faelles,
      toleranceSekunder: 2 * 60,
      aftenOgWeekendSamlet: false,
      ekstraFridage: ["grundlovsdag"],
    },
  },
];
