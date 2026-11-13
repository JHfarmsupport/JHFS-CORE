/**
 * Danske helligdage.
 *
 * De officielle helligdage udregnes ud fra påsken. Store bededag er afskaffet fra 2024.
 * Jens' firma regner desuden nogle "ekstra" dage som helligdag i telefonsupport
 * (fx grundlovsdag) – de styres af reglerne, ikke hårdkodet her.
 */
import { type Dato, fraDele, plusDage } from "./dato.js";

/** Påskedag (gregoriansk, Meeus/Jones/Butcher). */
export function paaskedag(aar: number): Dato {
  const a = aar % 19;
  const b = Math.floor(aar / 100);
  const c = aar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maaned = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return fraDele(aar, maaned, dag);
}

export type EkstraFridag = "grundlovsdag" | "juleaften" | "nytaarsaften";

/** Alle helligdage i et år som { dato: navn }. */
export function helligdage(aar: number, ekstra: readonly EkstraFridag[] = []): Map<Dato, string> {
  const p = paaskedag(aar);
  const liste: [Dato, string][] = [
    [fraDele(aar, 1, 1), "Nytårsdag"],
    [plusDage(p, -3), "Skærtorsdag"],
    [plusDage(p, -2), "Langfredag"],
    [p, "Påskedag"],
    [plusDage(p, 1), "2. påskedag"],
    [plusDage(p, 39), "Kristi himmelfartsdag"],
    [plusDage(p, 49), "Pinsedag"],
    [plusDage(p, 50), "2. pinsedag"],
    [fraDele(aar, 12, 25), "1. juledag"],
    [fraDele(aar, 12, 26), "2. juledag"],
  ];
  if (aar < 2024) liste.push([plusDage(p, 26), "Store bededag"]);
  if (ekstra.includes("grundlovsdag")) liste.push([fraDele(aar, 6, 5), "Grundlovsdag"]);
  if (ekstra.includes("juleaften")) liste.push([fraDele(aar, 12, 24), "Juleaften"]);
  if (ekstra.includes("nytaarsaften")) liste.push([fraDele(aar, 12, 31), "Nytårsaften"]);
  return new Map(liste);
}
