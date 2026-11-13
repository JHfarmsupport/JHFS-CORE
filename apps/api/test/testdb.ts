/** Opretter en frisk testdatabase med programmets egen (ikke-administrator) bruger. */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { migrer } from "@jhfs/db";

export const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL && process.env.CI) throw new Error("TEST_DATABASE_URL skal være sat i testkørslen");

export interface TestDb {
  adminPool: pg.Pool;
  appPool: pg.Pool;
  ryd: () => Promise<void>;
}

export async function nyTestDb(): Promise<TestDb> {
  const navn = `jhfs_test_${randomBytes(4).toString("hex")}`;
  const appBruger = `jhfs_web_${randomBytes(4).toString("hex")}`;
  const kode = randomBytes(12).toString("hex");
  const k = new pg.Client({ connectionString: ADMIN_URL });
  await k.connect();
  await k.query(`create database ${navn}`);
  await k.end();
  const url = new URL(ADMIN_URL!);
  url.pathname = `/${navn}`;
  await migrer(url.toString());
  const adminPool = new pg.Pool({ connectionString: url.toString() });
  await adminPool.query(`create role ${appBruger} login password '${kode}' in role jhfs_app`);
  const appUrl = new URL(url.toString());
  appUrl.username = appBruger;
  appUrl.password = kode;
  const appPool = new pg.Pool({ connectionString: appUrl.toString() });
  return {
    adminPool,
    appPool,
    ryd: async () => {
      await appPool.end();
      await adminPool.end();
      const k2 = new pg.Client({ connectionString: ADMIN_URL });
      await k2.connect();
      await k2.query(`drop database if exists ${navn} with (force)`);
      await k2.query(`drop role if exists ${appBruger}`);
      await k2.end();
    },
  };
}
