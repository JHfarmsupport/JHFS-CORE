/**
 * Handlinger der køres af administratoren fra kommandolinjen på serveren – ikke fra nettet.
 * Fx at oprette det første firma og ejeren, eller lave en ny tilmeldingskode.
 */
import pg from "pg";
import { medFirma } from "@jhfs/db";
import { fingeraftryk, nyNoegle } from "./krypto.js";

export const TILMELDING_GYLDIG_MINUTTER = 30;

export async function nyTilmeldingskode(appPool: pg.Pool, firmaId: string, brugerId: string): Promise<string> {
  const kode = nyNoegle();
  await medFirma(appPool, firmaId, async (db) => {
    await db.query(
      `insert into engangskode (firma_id, bruger_id, kode_hash, udloeber) values ($1, $2, $3, now() + make_interval(mins => $4))`,
      [firmaId, brugerId, fingeraftryk(kode), TILMELDING_GYLDIG_MINUTTER],
    );
    await db.query("insert into haendelse (firma_id, bruger_id, handling) values ($1, $2, 'tilmeldingskode_oprettet')", [firmaId, brugerId]);
  });
  return kode;
}

/** Opretter et firma og dets ejer. Bruger administrator-forbindelsen til selve firmaet (programmet må ikke oprette firmaer). */
export async function opretFirmaOgEjer(
  adminPool: pg.Pool,
  appPool: pg.Pool,
  ind: { firmanavn: string; cvr?: string; email: string; navn: string },
): Promise<{ firmaId: string; brugerId: string; kode: string }> {
  const f = await adminPool.query<{ id: string }>("insert into firma (navn, cvr) values ($1, $2) returning id", [ind.firmanavn, ind.cvr ?? null]);
  const firmaId = f.rows[0]!.id;
  const brugerId = await medFirma(appPool, firmaId, async (db) => {
    const b = await db.query<{ id: string }>("insert into bruger (firma_id, email, navn, rolle) values ($1, $2, $3, 'ejer') returning id", [
      firmaId,
      ind.email.trim().toLowerCase(),
      ind.navn,
    ]);
    return b.rows[0]!.id;
  });
  const kode = await nyTilmeldingskode(appPool, firmaId, brugerId);
  return { firmaId, brugerId, kode };
}
