/**
 * Sikkerhedstest: Et firma må aldrig kunne se eller ændre et andet firmas data.
 * Kører mod en rigtig Postgres (TEST_DATABASE_URL). I GitHub-testkørslen er den altid med.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { medFirma, migrer } from "../src/index.js";

const admin = process.env.TEST_DATABASE_URL;
if (!admin && process.env.CI) throw new Error("TEST_DATABASE_URL skal være sat i testkørslen");

describe.skipIf(!admin)("adskillelse mellem firmaer (row-level security)", () => {
  const dbNavn = `jhfs_test_${randomBytes(4).toString("hex")}`;
  let url: string;
  /** Administrator – kun til at oprette testdata. */
  let adminPool: pg.Pool;
  /** Programmets egen forbindelse: en almindelig login-bruger uden administratorrettigheder. */
  let pool: pg.Pool;
  const appBruger = `jhfs_web_${randomBytes(4).toString("hex")}`;
  const appKode = randomBytes(12).toString("hex");
  let jhfs: string;
  let mekaniker: string;

  beforeAll(async () => {
    const k = new pg.Client({ connectionString: admin });
    await k.connect();
    await k.query(`create database ${dbNavn}`);
    await k.end();
    const u = new URL(admin!);
    u.pathname = `/${dbNavn}`;
    url = u.toString();
    await migrer(url);
    adminPool = new pg.Pool({ connectionString: url });
    await adminPool.query(`create role ${appBruger} login password '${appKode}' in role jhfs_app`);
    const appUrl = new URL(url);
    appUrl.username = appBruger;
    appUrl.password = appKode;
    pool = new pg.Pool({ connectionString: appUrl.toString() });
    // Opret to firmaer som administrator
    const f = await adminPool.query<{ id: string }>(
      "insert into firma (navn, cvr) values ('JH Farm Support ApS', '12345678'), ('Mekanikeren ApS', null) returning id",
    );
    jhfs = f.rows[0]!.id;
    mekaniker = f.rows[1]!.id;
    await adminPool.query("insert into kunde (firma_id, kundenr, navn) values ($1, 1, 'Testgården I/S'), ($2, 1, 'Værkstedskunde')", [jhfs, mekaniker]);
  });

  afterAll(async () => {
    await pool?.end();
    await adminPool?.end();
    const k = new pg.Client({ connectionString: admin });
    await k.connect();
    await k.query(`drop database if exists ${dbNavn} with (force)`);
    await k.query(`drop role if exists ${appBruger}`);
    await k.end();
  });

  it("hvert firma ser kun sine egne kunder", async () => {
    const a = await medFirma(pool, jhfs, (db) => db.query<{ navn: string }>("select navn from kunde"));
    const b = await medFirma(pool, mekaniker, (db) => db.query<{ navn: string }>("select navn from kunde"));
    expect(a.rows.map((r) => r.navn)).toEqual(["Testgården I/S"]);
    expect(b.rows.map((r) => r.navn)).toEqual(["Værkstedskunde"]);
  });

  it("kan ikke se andre firmaer i firma-tabellen", async () => {
    const r = await medFirma(pool, mekaniker, (db) => db.query<{ navn: string }>("select navn from firma"));
    expect(r.rows.map((x) => x.navn)).toEqual(["Mekanikeren ApS"]);
  });

  it("kan ikke oprette data i et andet firmas navn", async () => {
    await expect(
      medFirma(pool, mekaniker, (db) => db.query("insert into kunde (firma_id, kundenr, navn) values ($1, 2, 'Snyd')", [jhfs])),
    ).rejects.toThrow(/row-level security/);
  });

  it("kan ikke flytte en kunde over til et andet firma", async () => {
    await expect(medFirma(pool, jhfs, (db) => db.query("update kunde set firma_id = $1", [mekaniker]))).rejects.toThrow(/row-level security/);
  });

  it("uden firma sat ser man ingenting", async () => {
    const k = await pool.connect();
    try {
      await k.query("begin");
      await k.query("set local role jhfs_app");
      const r = await k.query("select * from kunde");
      expect(r.rows).toHaveLength(0);
      await k.query("rollback");
    } finally {
      k.release();
    }
  });

  it("programmet kan ikke slå sikkerheden fra eller blive administrator", async () => {
    await expect(medFirma(pool, jhfs, (db) => db.query("alter table kunde disable row level security"))).rejects.toThrow();
    await expect(medFirma(pool, jhfs, (db) => db.query("set local role postgres"))).rejects.toThrow(/permission denied/);
    await expect(medFirma(pool, jhfs, (db) => db.query("select * from schema_migration"))).rejects.toThrow(/permission denied/);
  });

  it("hændelsesloggen kan ikke rettes eller slettes", async () => {
    await medFirma(pool, jhfs, (db) => db.query("insert into haendelse (firma_id, handling) values ($1, 'test')", [jhfs]));
    await expect(medFirma(pool, jhfs, (db) => db.query("update haendelse set handling = 'snyd'"))).rejects.toThrow(/permission denied/);
    await expect(medFirma(pool, jhfs, (db) => db.query("delete from haendelse"))).rejects.toThrow(/permission denied/);
  });

  it("to regler for samme område kan ikke gælde samme dag", async () => {
    const ny = (fra: string, til: string | null) =>
      medFirma(pool, jhfs, (db) =>
        db.query(
          "insert into regel (firma_id, omraade, navn, gyldig_fra, gyldig_til, vaerdi, begrundelse) values ($1, 'telefonsupport', 'x', $2, $3, '{}', 'test')",
          [jhfs, fra, til],
        ),
      );
    await ny("2025-01-01", "2025-12-31");
    await ny("2026-01-01", null);
    await expect(ny("2026-06-01", null)).rejects.toThrow(/exclusion constraint/);
  });

  it("samme opkald kan ikke komme ind to gange", async () => {
    const ind = () =>
      medFirma(pool, jhfs, (db) =>
        db.query(
          "insert into opkald (firma_id, dato, kl, retning, sekunder, besvaret, kilde, kilde_ref) values ($1, '2026-03-03', '10:00', 'ind', 300, true, 'screenshot', 'IMG_0001#1')",
          [jhfs],
        ),
      );
    await ind();
    await expect(ind()).rejects.toThrow(/duplicate key/);
  });

  it("en ændret migration bliver opdaget", async () => {
    await adminPool.query("update schema_migration set kontrolsum = 'forkert' where navn = '0001_fundament.sql'");
    await expect(migrer(url)).rejects.toThrow(/er ændret/);
  });
});
