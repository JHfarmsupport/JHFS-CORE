/**
 * Kører database-migrationer i rækkefølge. Hver migration køres én gang, i sin egen transaktion.
 * En migration der allerede er kørt, må aldrig ændres – lav en ny i stedet.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MAPPE = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrer(forbindelse: string, log: (t: string) => void = () => {}): Promise<string[]> {
  const klient = new pg.Client({ connectionString: forbindelse });
  await klient.connect();
  const koert: string[] = [];
  try {
    await klient.query(`create table if not exists schema_migration (
      navn text primary key, kontrolsum text not null, koert timestamptz not null default now())`);
    const tidligere = new Map(
      (await klient.query<{ navn: string; kontrolsum: string }>("select navn, kontrolsum from schema_migration")).rows.map((r) => [r.navn, r.kontrolsum]),
    );
    const filer = (await readdir(MAPPE)).filter((f) => f.endsWith(".sql")).sort();
    for (const fil of filer) {
      const sql = await readFile(join(MAPPE, fil), "utf8");
      const sum = createHash("sha256").update(sql).digest("hex");
      const gammel = tidligere.get(fil);
      if (gammel) {
        if (gammel !== sum) throw new Error(`Migrationen ${fil} er ændret efter den er kørt. Lav en ny migration i stedet.`);
        continue;
      }
      log(`Kører ${fil}`);
      await klient.query("begin");
      try {
        await klient.query(sql);
        await klient.query("insert into schema_migration (navn, kontrolsum) values ($1, $2)", [fil, sum]);
        await klient.query("commit");
      } catch (e) {
        await klient.query("rollback");
        throw e;
      }
      koert.push(fil);
    }
  } finally {
    await klient.end();
  }
  return koert;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Sæt DATABASE_URL");
    process.exit(1);
  }
  migrer(url, console.log)
    .then((k) => console.log(k.length ? `Færdig: ${k.length} migration(er)` : "Databasen er opdateret"))
    .catch((e: unknown) => {
      console.error(e);
      process.exit(1);
    });
}
