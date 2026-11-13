/**
 * Regler med gyldighedsperiode.
 *
 * En regel ændres aldrig "bagud". Ændrer Jens en pris eller en afrunding, laves en NY regel
 * med en ny "gyldigFra"-dato. Så kan gamle fakturaer altid regnes præcis som dengang.
 */
import type { Dato } from "./dato.js";

export interface Regel<T> {
  navn: string;
  gyldigFra: Dato;
  /** Til og med. Tom = gælder stadig. */
  gyldigTil?: Dato;
  /** Hvem bestemte reglen og hvornår – vises i ændringsloggen. */
  begrundelse: string;
  vaerdi: T;
}

export class RegelFejl extends Error {
  override name = "RegelFejl";
}

/** Finder den ene regel, der gælder på datoen. Fejler hvis der er ingen eller flere. */
export function gaeldendeRegel<T>(regler: readonly Regel<T>[], paa: Dato): Regel<T> {
  const fundne = regler.filter((r) => r.gyldigFra <= paa && (r.gyldigTil === undefined || paa <= r.gyldigTil));
  if (fundne.length === 0) throw new RegelFejl(`Ingen regel gælder den ${paa}`);
  if (fundne.length > 1) {
    throw new RegelFejl(`${fundne.length} regler gælder samtidig den ${paa}: ${fundne.map((r) => r.navn).join(", ")}`);
  }
  return fundne[0]!;
}

/** Tjekker at regler ikke overlapper. Køres i tests og når en regel gemmes. */
export function tjekIngenOverlap<T>(regler: readonly Regel<T>[]): void {
  const sorteret = [...regler].sort((a, b) => (a.gyldigFra < b.gyldigFra ? -1 : 1));
  for (let i = 1; i < sorteret.length; i++) {
    const forrige = sorteret[i - 1]!;
    const denne = sorteret[i]!;
    if (forrige.gyldigTil === undefined || forrige.gyldigTil >= denne.gyldigFra) {
      throw new RegelFejl(`Reglerne "${forrige.navn}" og "${denne.navn}" overlapper`);
    }
  }
}
