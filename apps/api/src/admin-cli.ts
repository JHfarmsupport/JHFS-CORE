/**
 * Administration fra kommandolinjen på serveren.
 *
 *   opret-ejer --firma "JH Farm Support ApS" --cvr 12345678 --email mail@firma.dk --navn "Jens Høj"
 *   ny-kode --email mail@firma.dk        (ny tilmeldingskode, fx til ny telefon)
 *
 * Udskriver et link, der virker i 30 minutter og kun én gang.
 */
import { parseArgs } from "node:util";
import pg from "pg";
import { nyTilmeldingskode, opretFirmaOgEjer } from "./auth/administration.js";
import { laesIndstillinger } from "./indstillinger.js";

const [kommando, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: { firma: { type: "string" }, cvr: { type: "string" }, email: { type: "string" }, navn: { type: "string" } },
});

const cfg = laesIndstillinger();
const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error("DATABASE_URL (administrator) mangler");
const adminPool = new pg.Pool({ connectionString: adminUrl, max: 2 });
const appPool = new pg.Pool({ connectionString: cfg.appDatabaseUrl, max: 2 });
const link = (kode: string) => `${cfg.origin}/tilmeld#kode=${kode}`;

try {
  if (kommando === "opret-ejer") {
    if (!values.firma || !values.email || !values.navn) throw new Error("Brug: opret-ejer --firma ... --email ... --navn ... [--cvr ...]");
    const r = await opretFirmaOgEjer(adminPool, appPool, { firmanavn: values.firma, email: values.email, navn: values.navn, ...(values.cvr ? { cvr: values.cvr } : {}) });
    console.log(`Firma og ejer oprettet.\nÅbn dette link på din telefon inden 30 minutter:\n\n  ${link(r.kode)}\n`);
  } else if (kommando === "ny-kode") {
    if (!values.email) throw new Error("Brug: ny-kode --email ...");
    const b = await adminPool.query<{ id: string; firma_id: string }>("select id, firma_id from bruger where lower(email) = lower($1)", [values.email]);
    const bruger = b.rows[0];
    if (!bruger) throw new Error("Ingen bruger med den e-mail");
    const kode = await nyTilmeldingskode(appPool, bruger.firma_id, bruger.id);
    console.log(`Åbn dette link inden 30 minutter:\n\n  ${link(kode)}\n`);
  } else {
    console.log("Kommandoer: opret-ejer, ny-kode");
  }
} finally {
  await adminPool.end();
  await appPool.end();
}
