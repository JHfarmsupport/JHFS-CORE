/**
 * Login-flowet mod en rigtig database. Selve passkey-kryptografien er erstattet af en "falsk" motor her
 * (den rigtige testes i browsertesten med en virtuel passkey).
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { byggApp } from "../src/app.js";
import { opretFirmaOgEjer } from "../src/auth/administration.js";
import type { GemtPasskey, PasskeyMotor } from "../src/auth/passkey-motor.js";
import { ADMIN_URL, nyTestDb, type TestDb } from "./testdb.js";

const ORIGIN = "https://core.test";

/** Falsk passkey: "signaturen" er bare sig:<credentialId>:<challenge>. */
const falskMotor: PasskeyMotor = {
  async tilmeldValg() {
    return { challenge: randomBytes(16).toString("base64url") } as never;
  },
  async bekraeftTilmelding(svar, challenge) {
    const r = svar as unknown as { id: string; response: { challenge: string } };
    if (r.response.challenge !== challenge) throw new Error("forkert challenge");
    return { credentialId: r.id, publicKey: new Uint8Array([1, 2, 3]), taeller: 0, transports: ["internal"] };
  },
  async loginValg() {
    return { challenge: randomBytes(16).toString("base64url") } as never;
  },
  async bekraeftLogin(svar, challenge, p: GemtPasskey) {
    const r = svar as unknown as { response: { signatur: string; taeller?: number } };
    if (r.response.signatur !== `sig:${p.credentialId}:${challenge}`) throw new Error("forkert signatur");
    return r.response.taeller ?? 0;
  },
};

describe.skipIf(!ADMIN_URL)("login med passkey", () => {
  let db: TestDb;
  let app: FastifyInstance;
  let firmaId: string;

  const post = (url: string, payload: object = {}, cookie?: string) =>
    app.inject({ method: "POST", url, payload, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) } });
  const cookieFra = (r: LightMyRequestResponse) => {
    const c = r.cookies.find((x) => x.name === "__Host-jhfs_session");
    return c ? `${c.name}=${c.value}` : undefined;
  };

  async function tilmeld(kode: string, credentialId: string) {
    const s = await post("/auth/tilmeld/start", { kode });
    expect(s.statusCode).toBe(200);
    const { udfordringId, valg } = s.json();
    return post("/auth/tilmeld/slut", { kode, udfordringId, svar: { id: credentialId, response: { challenge: valg.challenge } }, navn: "Testtelefon" });
  }

  async function login(credentialId: string, taeller?: number, snyd = false) {
    const s = await post("/auth/login/start");
    const { udfordringId, valg } = s.json();
    const signatur = snyd ? "forkert" : `sig:${credentialId}:${valg.challenge}`;
    return { udfordringId, svar: await post("/auth/login/slut", { udfordringId, svar: { id: credentialId, response: { signatur, taeller } } }) };
  }

  let gendannelseskoder: string[] = [];

  beforeAll(async () => {
    db = await nyTestDb();
    app = await byggApp({ auth: { appPool: db.appPool, motor: falskMotor, origin: ORIGIN, sikkerCookie: true, sessionDage: 14 } });
  });
  afterAll(async () => {
    await app?.close();
    await db?.ryd();
  });

  it("alt er lukket uden login", async () => {
    const side = await app.inject({ method: "GET", url: "/", headers: { accept: "text/html" } });
    expect(side.statusCode).toBe(302);
    expect(side.headers.location).toBe("/login");
    expect((await post("/telefonsupport/beregn", { opkald: [] })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/auth/mig" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/login" })).statusCode).toBe(200);
  });

  it("afviser kald fra en fremmed side (Origin-tjek)", async () => {
    const r = await app.inject({ method: "POST", url: "/auth/login/start", payload: {}, headers: { origin: "https://ond.example" } });
    expect(r.statusCode).toBe(403);
  });

  it("ejeren tilmelder sin første passkey og får 10 gendannelseskoder", async () => {
    const r = await opretFirmaOgEjer(db.adminPool, db.appPool, { firmanavn: "Testfirma ApS", email: "Ejer@Test.dk", navn: "Test Ejer" });
    firmaId = r.firmaId;
    const svar = await tilmeld(r.kode, "telefon-1");
    expect(svar.statusCode).toBe(200);
    gendannelseskoder = svar.json().gendannelseskoder;
    expect(gendannelseskoder).toHaveLength(10);
    expect(gendannelseskoder[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const cookie = cookieFra(svar)!;
    const c = svar.cookies[0]!;
    expect(c.httpOnly).toBe(true);
    expect(c.secure).toBe(true);
    expect(c.sameSite).toBe("Strict");

    const mig = await app.inject({ method: "GET", url: "/auth/mig", headers: { cookie } });
    expect(mig.json()).toEqual({ navn: "Test Ejer", email: "ejer@test.dk", rolle: "ejer" });

    // Samme tilmeldingskode kan ikke bruges igen
    expect((await post("/auth/tilmeld/start", { kode: r.kode })).statusCode).toBe(401);
  });

  it("login med passkey giver adgang", async () => {
    const { svar } = await login("telefon-1");
    expect(svar.statusCode).toBe(200);
    const cookie = cookieFra(svar)!;
    const r = await post("/telefonsupport/beregn", { opkald: [] }, cookie);
    expect(r.statusCode).toBe(200);
  });

  it("forkert signatur, ukendt passkey og genbrugt udfordring afvises", async () => {
    expect((await login("telefon-1", undefined, true)).svar.statusCode).toBe(401);
    expect((await login("ukendt-nøgle")).svar.statusCode).toBe(401);
    const { udfordringId } = await login("telefon-1");
    const igen = await post("/auth/login/slut", { udfordringId, svar: { id: "telefon-1", response: { signatur: "x" } } });
    expect(igen.statusCode).toBe(401);
  });

  it("en tæller der går baglæns afvises (kopieret nøgle)", async () => {
    expect((await login("telefon-1", 5)).svar.statusCode).toBe(200);
    expect((await login("telefon-1", 3)).svar.statusCode).toBe(401);
    expect((await login("telefon-1", 6)).svar.statusCode).toBe(200);
  });

  it("logud gør sessionen ugyldig", async () => {
    const cookie = cookieFra((await login("telefon-1", 7)).svar)!;
    expect((await app.inject({ method: "GET", url: "/auth/mig", headers: { cookie } })).statusCode).toBe(200);
    await post("/auth/logud", {}, cookie);
    expect((await app.inject({ method: "GET", url: "/auth/mig", headers: { cookie } })).statusCode).toBe(401);
  });

  it("gendannelseskode giver kun lov til at oprette en ny passkey – og virker kun én gang", async () => {
    const kode = gendannelseskoder[0]!.toLowerCase().replace(/-/g, " ");
    const g = await post("/auth/gendan", { kode });
    expect(g.statusCode).toBe(200);
    const { tilmeldingskode } = g.json();
    expect(g.cookies).toHaveLength(0); // ingen adgang endnu
    const ny = await tilmeld(tilmeldingskode, "ny-telefon");
    expect(ny.statusCode).toBe(200);
    expect(ny.json().gendannelseskoder).toBeNull(); // 9 koder tilbage
    expect((await post("/auth/gendan", { kode })).statusCode).toBe(401);
  });

  it("udløbne tilmeldingskoder virker ikke", async () => {
    const r = await opretFirmaOgEjer(db.adminPool, db.appPool, { firmanavn: "Andet ApS", email: "anden@test.dk", navn: "Anden" });
    await db.adminPool.query("update engangskode set udloeber = now() - interval '1 minute' where firma_id = $1", [r.firmaId]);
    expect((await post("/auth/tilmeld/start", { kode: r.kode })).statusCode).toBe(401);
  });

  it("databasen indeholder kun fingeraftryk – aldrig selve nøglerne", async () => {
    const { svar } = await login("telefon-1", 8);
    const token = svar.cookies.find((c) => c.name === "__Host-jhfs_session")!.value;
    const alt = await db.adminPool.query("select token_hash from session where firma_id = $1", [firmaId]);
    for (const r of alt.rows) expect(Buffer.from(r.token_hash).toString("base64url")).not.toBe(token);
    const koder = await db.adminPool.query("select kode_hash from gendannelseskode");
    for (const r of koder.rows) expect(r.kode_hash).toHaveLength(32);
  });

  it("alt er skrevet i hændelsesloggen", async () => {
    const h = await db.adminPool.query<{ handling: string }>("select handling from haendelse where firma_id = $1 order by id", [firmaId]);
    const handlinger = h.rows.map((r) => r.handling);
    expect(handlinger).toContain("tilmeldingskode_oprettet");
    expect(handlinger).toContain("passkey_tilmeldt");
    expect(handlinger).toContain("login");
    expect(handlinger).toContain("logud");
    expect(handlinger).toContain("gendannelseskode_brugt");
  });

  it("sikkerheds-headers er sat", async () => {
    const r = await app.inject({ method: "GET", url: "/login" });
    expect(r.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["strict-transport-security"]).toBeDefined();
  });
});
