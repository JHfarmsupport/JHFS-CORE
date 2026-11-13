/**
 * Den ENESTE måde programmet må tale med databasen på: inden for et firma.
 *
 * medFirma() åbner en transaktion, skifter til rollen jhfs_app (som er bundet af row-level security)
 * og sætter hvilket firma der arbejdes for. Alt hvad der sker inde i funktionen kan kun se det firma.
 */
import pg from "pg";

export type FirmaKlient = Pick<pg.PoolClient, "query">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function medFirma<T>(pool: pg.Pool, firmaId: string, arbejde: (db: FirmaKlient) => Promise<T>): Promise<T> {
  if (!UUID.test(firmaId)) throw new Error("Ugyldigt firma-id");
  const klient = await pool.connect();
  try {
    await klient.query("begin");
    await klient.query("set local role jhfs_app");
    await klient.query("select set_config('app.firma_id', $1, true)", [firmaId]);
    const resultat = await arbejde(klient);
    await klient.query("commit");
    return resultat;
  } catch (e) {
    await klient.query("rollback");
    throw e;
  } finally {
    klient.release();
  }
}
