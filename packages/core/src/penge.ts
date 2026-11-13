/**
 * Penge i JHFS Core.
 *
 * Alle beløb gemmes og regnes som HELE ØRE (heltal). Aldrig kommatal.
 * 1.250,00 kr = 125000 øre. Det fjerner afrundingsfejl som 0,1 + 0,2 = 0,30000000000000004.
 *
 * Den eneste plads, hvor der rundes, er når der regnes en procentdel (fx moms).
 * Der rundes "halvt op" til nærmeste øre – samme som e-conomic.
 */

declare const oereBrand: unique symbol;
/** Et beløb i hele øre. Kan kun laves via funktionerne her, så man ikke kommer til at blande kr og øre. */
export type Oere = number & { readonly [oereBrand]: true };

export class PengeFejl extends Error {
  override name = "PengeFejl";
}

function sikkerHeltal(n: number, hvad: string): number {
  if (!Number.isSafeInteger(n)) {
    throw new PengeFejl(`${hvad} skal være et helt antal øre, fik ${n}`);
  }
  return n;
}

/** Laver et beløb ud fra et antal øre. */
export function oere(antal: number): Oere {
  return sikkerHeltal(antal, "Beløb") as Oere;
}

/** Laver et beløb ud fra hele kroner. Brug kun til faste satser som 250 kr. */
export function kr(kroner: number): Oere {
  return oere(sikkerHeltal(kroner, "Kroner") * 100);
}

export const NUL: Oere = oere(0);

export function plus(...beloeb: Oere[]): Oere {
  return oere(beloeb.reduce((sum, b) => sum + b, 0));
}

export function minus(a: Oere, b: Oere): Oere {
  return oere(a - b);
}

/** Beløb gange et HELT antal (fx 3 kvarterer á 250 kr). */
export function gange(beloeb: Oere, antal: number): Oere {
  return oere(beloeb * sikkerHeltal(antal, "Antal"));
}

/**
 * En procentdel af et beløb, rundet halvt op til nærmeste øre.
 * Procent angives i hundrededele procent (basispoint) for at undgå kommatal: 25 % = 2500.
 */
export function procentAf(beloeb: Oere, basispoint: number): Oere {
  sikkerHeltal(basispoint, "Basispoint");
  const raa = beloeb * basispoint;
  // Heltalsdivision med "halvt op" (væk fra nul for negative beløb, som en kreditnota).
  const tegn = raa < 0 ? -1 : 1;
  const abs = Math.abs(raa);
  const hel = Math.floor(abs / 10000);
  const rest = abs % 10000;
  return oere(tegn * (rest >= 5000 ? hel + 1 : hel));
}

/** "1.250,00 kr" – dansk visning. */
export function visKr(beloeb: Oere): string {
  const tegn = beloeb < 0 ? "-" : "";
  const abs = Math.abs(beloeb);
  const kroner = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const ore = (abs % 100).toString().padStart(2, "0");
  return `${tegn}${kroner},${ore} kr`;
}
