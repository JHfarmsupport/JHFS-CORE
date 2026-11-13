/**
 * Datoer uden klokkeslæt og tidszone-bøvl.
 * En "Dato" er altid en tekst som "2026-04-02". Sammenligning virker direkte på teksten.
 */

export type Dato = string & { readonly __dato: true };

export class DatoFejl extends Error {
  override name = "DatoFejl";
}

export function dato(tekst: string): Dato {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst);
  if (!m) throw new DatoFejl(`Ugyldig dato "${tekst}" – brug ÅÅÅÅ-MM-DD`);
  const [, aar, md, dag] = m.map(Number) as [number, number, number, number];
  const d = new Date(Date.UTC(aar, md - 1, dag));
  if (d.getUTCFullYear() !== aar || d.getUTCMonth() !== md - 1 || d.getUTCDate() !== dag) {
    throw new DatoFejl(`Datoen "${tekst}" findes ikke`);
  }
  return tekst as Dato;
}

export function fraDele(aar: number, maaned: number, dag: number): Dato {
  return dato(`${aar}-${String(maaned).padStart(2, "0")}-${String(dag).padStart(2, "0")}`);
}

function tilUtc(d: Dato): Date {
  const [aar, md, dag] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(aar, md - 1, dag));
}

export function plusDage(d: Dato, dage: number): Dato {
  const u = tilUtc(d);
  u.setUTCDate(u.getUTCDate() + dage);
  return fraDele(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate());
}

/** 0 = mandag … 6 = søndag (dansk uge). */
export function ugedag(d: Dato): number {
  return (tilUtc(d).getUTCDay() + 6) % 7;
}

export const UGEDAGE = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"] as const;

export function aarAf(d: Dato): number {
  return Number(d.slice(0, 4));
}

/** "2026-04" */
export function maanedAf(d: Dato): string {
  return d.slice(0, 7);
}
