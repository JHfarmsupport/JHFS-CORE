/**
 * Moms – kun udregning til visning og kontrol.
 *
 * VIGTIGT: Core indberetter ALDRIG moms eller skat. Det gør Jens/revisor i e-conomic og på skat.dk.
 * Tallene her bruges til at vise "hvad kunden skal betale" og til at holde øje med kommende moms.
 */
import { type Oere, plus, procentAf } from "./penge.js";

/** Dansk moms: 25 % = 2500 basispoint. Ligger her som standard; den gældende sats hentes fra regler. */
export const DANSK_MOMS_BASISPOINT = 2500;

export interface MedMoms {
  ekskl: Oere;
  moms: Oere;
  inkl: Oere;
}

export function tilfoejMoms(ekskl: Oere, basispoint: number = DANSK_MOMS_BASISPOINT): MedMoms {
  const moms = procentAf(ekskl, basispoint);
  return { ekskl, moms, inkl: plus(ekskl, moms) };
}
