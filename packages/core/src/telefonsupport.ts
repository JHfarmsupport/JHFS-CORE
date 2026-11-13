/**
 * Telefonsupport – afregning pr. kunde pr. måned.
 *
 * Reglen som Jens har bestemt den (se docs/regler/telefonsupport.md):
 *  - Alle opkald til samme kunde i samme måned lægges sammen – pr. tidstype.
 *  - Tidstyper: normal, efter kl. 17 (aften), weekend/helligdag.
 *  - Hver tidstype rundes op til påbegyndt kvarter. Fra 2026 med 2 minutters tolerance:
 *    op til 32 min = 2 kvarterer, 33 min = 3 kvarterer.
 *  - Er der overhovedet tid, er det mindst 1 kvarter.
 *  - Besvarede opkald under 1 minut tæller med deres sekunder.
 *  - Ubesvarede opkald tæller ikke.
 *
 * Alt regnes i hele sekunder og hele øre. Ingen kommatal.
 */
import { type Dato, maanedAf, ugedag } from "./dato.js";
import { type EkstraFridag, helligdage } from "./helligdage.js";
import { type Oere, NUL, gange, plus } from "./penge.js";
import { type Regel, gaeldendeRegel } from "./regler.js";

export type Tidstype = "normal" | "aften" | "weekend";

export interface TelefonsupportRegel {
  kvarterSekunder: number;
  /** Sekunder over et helt kvarter, der ikke udløser et nyt kvarter. 2025: 0, 2026: 120. */
  toleranceSekunder: number;
  /** Mindst ét kvarter hvis der er tid. */
  mindstEtKvarter: boolean;
  /** Fra hvilket klokkeslæt (minutter efter midnat) et opkald er "aften". 17:00 = 1020. */
  aftenFraMinut: number;
  /** 2025-grundlaget lagde aften og weekend sammen før afrunding. */
  aftenOgWeekendSamlet: boolean;
  ekstraFridage: readonly EkstraFridag[];
  priser: Record<Tidstype, Oere>;
  varenumre: Record<Tidstype, string>;
}

export interface Opkald {
  kundeId: string;
  dato: Dato;
  /** "HH:MM" */
  kl: string;
  /** Varighed i hele sekunder. */
  sekunder: number;
  besvaret: boolean;
  /** Navn som vist på fakturaen, fx "Kasper". */
  navn: string;
}

export interface Fakturalinje {
  tidstype: Tidstype;
  varenr: string;
  sekunder: number;
  kvarterer: number;
  stkPris: Oere;
  beloeb: Oere;
}

export interface Maanedsafregning {
  kundeId: string;
  maaned: string;
  regel: string;
  opkald: (Opkald & { tidstype: Tidstype })[];
  sekunder: Record<Tidstype, number>;
  linjer: Fakturalinje[];
  total: Oere;
}

export class TelefonsupportFejl extends Error {
  override name = "TelefonsupportFejl";
}

function minutterEfterMidnat(kl: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(kl);
  if (!m) throw new TelefonsupportFejl(`Ugyldigt klokkeslæt "${kl}"`);
  const t = Number(m[1]);
  const mi = Number(m[2]);
  if (t > 23 || mi > 59) throw new TelefonsupportFejl(`Ugyldigt klokkeslæt "${kl}"`);
  return t * 60 + mi;
}

export function tidstype(opkald: Pick<Opkald, "dato" | "kl">, regel: TelefonsupportRegel): Tidstype {
  const aar = Number(opkald.dato.slice(0, 4));
  if (helligdage(aar, regel.ekstraFridage).has(opkald.dato)) return "weekend";
  if (ugedag(opkald.dato) >= 5) return "weekend";
  if (minutterEfterMidnat(opkald.kl) >= regel.aftenFraMinut) return "aften";
  return "normal";
}

/** Antal kvarterer for en samlet tid. */
export function kvarterer(sekunder: number, regel: TelefonsupportRegel): number {
  if (!Number.isSafeInteger(sekunder) || sekunder < 0) {
    throw new TelefonsupportFejl(`Varighed skal være et positivt helt antal sekunder, fik ${sekunder}`);
  }
  if (sekunder === 0) return 0;
  const k = Math.ceil((sekunder - regel.toleranceSekunder) / regel.kvarterSekunder);
  return regel.mindstEtKvarter ? Math.max(1, k) : Math.max(0, k);
}

/** Afregner ét kundes opkald i én måned. Alle opkald skal være samme kunde og måned. */
export function afregnMaaned(opkald: readonly Opkald[], regler: readonly Regel<TelefonsupportRegel>[]): Maanedsafregning {
  const foerste = opkald[0];
  if (!foerste) throw new TelefonsupportFejl("Ingen opkald at afregne");
  const maaned = maanedAf(foerste.dato);
  for (const o of opkald) {
    if (o.kundeId !== foerste.kundeId || maanedAf(o.dato) !== maaned) {
      throw new TelefonsupportFejl("Opkald fra flere kunder eller måneder blandet sammen");
    }
  }
  // Reglen for måneden er den, der gælder den 1. i måneden.
  const regel = gaeldendeRegel(regler, `${maaned}-01` as Dato);
  const r = regel.vaerdi;

  const medType = opkald
    .filter((o) => o.besvaret && o.sekunder > 0)
    .map((o) => ({ ...o, tidstype: tidstype(o, r) }))
    .sort((a, b) => (a.dato + a.kl < b.dato + b.kl ? -1 : 1));

  const sek: Record<Tidstype, number> = { normal: 0, aften: 0, weekend: 0 };
  for (const o of medType) sek[o.tidstype] += o.sekunder;

  const linjer: Fakturalinje[] = [];
  const tilfoej = (t: Tidstype, s: number) => {
    const k = kvarterer(s, r);
    if (k > 0) linjer.push({ tidstype: t, varenr: r.varenumre[t], sekunder: s, kvarterer: k, stkPris: r.priser[t], beloeb: gange(r.priser[t], k) });
  };
  tilfoej("normal", sek.normal);
  if (r.aftenOgWeekendSamlet) {
    if (r.priser.aften !== r.priser.weekend) {
      throw new TelefonsupportFejl("Aften og weekend kan kun lægges sammen, når de har samme pris");
    }
    tilfoej("weekend", sek.aften + sek.weekend);
  } else {
    tilfoej("weekend", sek.weekend);
    tilfoej("aften", sek.aften);
  }

  return {
    kundeId: foerste.kundeId,
    maaned,
    regel: regel.navn,
    opkald: medType,
    sekunder: sek,
    linjer,
    total: linjer.reduce((s, l) => plus(s, l.beloeb), NUL),
  };
}

/** Grupperer alle opkald pr. kunde pr. måned og afregner hver for sig. */
export function afregnAlle(opkald: readonly Opkald[], regler: readonly Regel<TelefonsupportRegel>[]): Maanedsafregning[] {
  const grupper = new Map<string, Opkald[]>();
  for (const o of opkald) {
    if (!o.besvaret || o.sekunder <= 0) continue;
    const noegle = `${o.kundeId}|${maanedAf(o.dato)}`;
    const g = grupper.get(noegle);
    if (g) g.push(o);
    else grupper.set(noegle, [o]);
  }
  return [...grupper.keys()].sort().map((k) => afregnMaaned(grupper.get(k)!, regler));
}
