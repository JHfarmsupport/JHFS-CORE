/**
 * Login-ruter: tilmelding af passkey, login, gendannelse, logud.
 *
 * Sikkerhed i korte træk:
 *  - Ingen kodeord. Kun passkey med Face ID/fingeraftryk/PIN.
 *  - Sessionsnøglen ligger i en cookie, som JavaScript ikke kan læse (httpOnly) og som kun sendes
 *    til Core selv (SameSite=Strict, __Host-). I databasen ligger kun et fingeraftryk af nøglen.
 *  - Alle ændringer kræver at kaldet kommer fra Core's egen adresse (Origin-tjek).
 *  - Udfordringer kan kun bruges én gang og kun i 5 minutter.
 *  - Højst 20 login-forsøg i minuttet pr. adresse.
 *  - Alt skrives i hændelsesloggen.
 */
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import pg from "pg";
import { z } from "zod";
import { medFirma, type FirmaKlient } from "@jhfs/db";
import { fingeraftryk, normaliserKode, nyGendannelseskode, nyNoegle } from "./krypto.js";
import type { GemtPasskey, PasskeyMotor } from "./passkey-motor.js";
import { TILMELDING_GYLDIG_MINUTTER } from "./administration.js";

export interface AuthIndstillinger {
  appPool: pg.Pool;
  motor: PasskeyMotor;
  /** Fx "https://core.jhfarmsupport.dk" */
  origin: string;
  /** false kun ved lokal udvikling over http. */
  sikkerCookie: boolean;
  sessionDage: number;
}

export interface IndloggetBruger {
  sessionId: string;
  brugerId: string;
  firmaId: string;
  rolle: string;
  navn: string;
  email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    bruger?: IndloggetBruger;
  }
}

const ANTAL_GENDANNELSESKODER = 10;

const Kode = z.object({ kode: z.string().min(10).max(200) });
const TilmeldSlut = z.object({
  kode: z.string().min(10).max(200),
  udfordringId: z.string().uuid(),
  svar: z.object({ id: z.string() }).passthrough(),
  navn: z.string().max(60).optional(),
});
const LoginSlut = z.object({ udfordringId: z.string().uuid(), svar: z.object({ id: z.string() }).passthrough() });
const Gendan = z.object({ kode: z.string().min(12).max(40) });

class LoginFejl extends Error {}

export function cookieNavn(sikker: boolean): string {
  return sikker ? "__Host-jhfs_session" : "jhfs_session";
}

async function log(db: FirmaKlient, firmaId: string, brugerId: string | null, handling: string, data: object = {}) {
  await db.query("insert into haendelse (firma_id, bruger_id, handling, data) values ($1, $2, $3, $4)", [firmaId, brugerId, handling, JSON.stringify(data)]);
}

export async function registrerAuth(app: FastifyInstance, cfg: AuthIndstillinger): Promise<void> {
  const navn = cookieNavn(cfg.sikkerCookie);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  const loginGraense = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  // --- Origin-tjek på alt der ændrer noget ---
  app.addHook("onRequest", async (req, svar) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin !== cfg.origin) {
      return svar.code(403).send({ fejl: "Ugyldig afsender" });
    }
  });

  // --- Find den indloggede bruger ud fra cookien ---
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[navn];
    if (!token || token.length > 100) return;
    const r = await cfg.appPool.query<{ session_id: string; bruger_id: string; firma_id: string; rolle: string; navn: string; email: string }>(
      "select * from auth_session($1)",
      [fingeraftryk(token)],
    );
    const s = r.rows[0];
    if (s) req.bruger = { sessionId: s.session_id, brugerId: s.bruger_id, firmaId: s.firma_id, rolle: s.rolle, navn: s.navn, email: s.email };
  });

  async function nySession(db: FirmaKlient, req: FastifyRequest, svar: FastifyReply, firmaId: string, brugerId: string) {
    const token = nyNoegle();
    await db.query(
      `insert into session (firma_id, bruger_id, token_hash, udloeber, ip, enhed)
       values ($1, $2, $3, now() + make_interval(days => $4), $5, $6)`,
      [firmaId, brugerId, fingeraftryk(token), cfg.sessionDage, req.ip, (req.headers["user-agent"] ?? "").slice(0, 200)],
    );
    svar.setCookie(navn, token, {
      httpOnly: true,
      secure: cfg.sikkerCookie,
      sameSite: "strict",
      path: "/",
      maxAge: cfg.sessionDage * 24 * 60 * 60,
    });
  }

  async function tagUdfordring(id: string, formaal: "login" | "tilmeld", brugerId: string | null): Promise<string> {
    const r = await cfg.appPool.query<{ challenge: string }>(
      `delete from udfordring where id = $1 and formaal = $2 and bruger_id is not distinct from $3 and udloeber > now() returning challenge`,
      [id, formaal, brugerId],
    );
    const c = r.rows[0]?.challenge;
    if (!c) throw new LoginFejl("Udfordringen er udløbet – prøv igen");
    return c;
  }

  async function gemUdfordring(challenge: string, formaal: "login" | "tilmeld", brugerId: string | null): Promise<string> {
    await cfg.appPool.query("delete from udfordring where udloeber < now()");
    const r = await cfg.appPool.query<{ id: string }>("insert into udfordring (challenge, formaal, bruger_id) values ($1, $2, $3) returning id", [
      challenge,
      formaal,
      brugerId,
    ]);
    return r.rows[0]!.id;
  }

  async function findEngangskode(kode: string) {
    const r = await cfg.appPool.query<{ engangskode_id: string; bruger_id: string; firma_id: string; navn: string; email: string }>(
      "select * from auth_engangskode($1)",
      [fingeraftryk(kode)],
    );
    const e = r.rows[0];
    if (!e) throw new LoginFejl("Koden er ugyldig eller udløbet. Bed om en ny.");
    return e;
  }

  const fejlHaandtering = (svar: FastifyReply, e: unknown) => {
    if (e instanceof LoginFejl) return svar.code(401).send({ fejl: e.message });
    app.log.warn(e);
    return svar.code(401).send({ fejl: "Det lykkedes ikke. Prøv igen." });
  };

  // --- Tilmelding af ny passkey ---
  app.post("/auth/tilmeld/start", loginGraense, async (req, svar) => {
    const ind = Kode.safeParse(req.body);
    if (!ind.success) return svar.code(400).send({ fejl: "Mangler kode" });
    try {
      const e = await findEngangskode(ind.data.kode);
      const eksisterende = await medFirma(cfg.appPool, e.firma_id, async (db) =>
        (await db.query<{ credential_id: string; transports: string[] }>("select credential_id, transports from passkey where bruger_id = $1", [e.bruger_id])).rows,
      );
      const valg = await cfg.motor.tilmeldValg(
        { id: e.bruger_id, navn: e.navn, email: e.email },
        eksisterende.map((p): GemtPasskey => ({ credentialId: p.credential_id, publicKey: new Uint8Array(), taeller: 0, transports: p.transports })),
      );
      const udfordringId = await gemUdfordring(valg.challenge, "tilmeld", e.bruger_id);
      return { udfordringId, valg, navn: e.navn };
    } catch (e) {
      return fejlHaandtering(svar, e);
    }
  });

  app.post("/auth/tilmeld/slut", loginGraense, async (req, svar) => {
    const ind = TilmeldSlut.safeParse(req.body);
    if (!ind.success) return svar.code(400).send({ fejl: "Ugyldige data" });
    try {
      const e = await findEngangskode(ind.data.kode);
      const challenge = await tagUdfordring(ind.data.udfordringId, "tilmeld", e.bruger_id);
      const ny = await cfg.motor.bekraeftTilmelding(ind.data.svar as never, challenge);
      const koder = await medFirma(cfg.appPool, e.firma_id, async (db) => {
        const brugt = await db.query("update engangskode set brugt = now() where id = $1 and brugt is null", [e.engangskode_id]);
        if (brugt.rowCount !== 1) throw new LoginFejl("Koden er allerede brugt");
        await db.query(
          "insert into passkey (firma_id, bruger_id, credential_id, public_key, taeller, transports, navn) values ($1, $2, $3, $4, $5, $6, $7)",
          [e.firma_id, e.bruger_id, ny.credentialId, Buffer.from(ny.publicKey), ny.taeller, ny.transports, ind.data.navn?.trim() || "Passkey"],
        );
        // Første passkey (eller efter gendannelse uden koder tilbage): lav nye gendannelseskoder.
        const tilbage = await db.query<{ n: string }>("select count(*) as n from gendannelseskode where bruger_id = $1 and brugt is null", [e.bruger_id]);
        let nye: string[] | undefined;
        if (Number(tilbage.rows[0]!.n) === 0) {
          await db.query("delete from gendannelseskode where bruger_id = $1", [e.bruger_id]);
          nye = Array.from({ length: ANTAL_GENDANNELSESKODER }, nyGendannelseskode);
          for (const k of nye) {
            await db.query("insert into gendannelseskode (firma_id, bruger_id, kode_hash) values ($1, $2, $3)", [
              e.firma_id,
              e.bruger_id,
              fingeraftryk(normaliserKode(k)),
            ]);
          }
        }
        await log(db, e.firma_id, e.bruger_id, "passkey_tilmeldt", { navn: ind.data.navn ?? "Passkey", nyeGendannelseskoder: Boolean(nye) });
        await nySession(db, req, svar, e.firma_id, e.bruger_id);
        return nye;
      });
      return { ok: true, gendannelseskoder: koder ?? null };
    } catch (e) {
      return fejlHaandtering(svar, e);
    }
  });

  // --- Login ---
  app.post("/auth/login/start", loginGraense, async () => {
    const valg = await cfg.motor.loginValg();
    const udfordringId = await gemUdfordring(valg.challenge, "login", null);
    return { udfordringId, valg };
  });

  app.post("/auth/login/slut", loginGraense, async (req, svar) => {
    const ind = LoginSlut.safeParse(req.body);
    if (!ind.success) return svar.code(400).send({ fejl: "Ugyldige data" });
    try {
      const challenge = await tagUdfordring(ind.data.udfordringId, "login", null);
      const r = await cfg.appPool.query<{ passkey_id: string; bruger_id: string; firma_id: string; public_key: Buffer; taeller: string; transports: string[] }>(
        "select * from auth_passkey($1)",
        [ind.data.svar.id],
      );
      const p = r.rows[0];
      if (!p) throw new LoginFejl("Passkey er ikke kendt");
      const gammelTaeller = Number(p.taeller);
      const nyTaeller = await cfg.motor.bekraeftLogin(ind.data.svar as never, challenge, {
        credentialId: ind.data.svar.id,
        publicKey: new Uint8Array(p.public_key),
        taeller: gammelTaeller,
        transports: p.transports,
      });
      // En tæller der går baglæns kan betyde en kopieret nøgle. (iPhone-passkeys bruger altid 0.)
      if (gammelTaeller > 0 && nyTaeller <= gammelTaeller) throw new LoginFejl("Passkey afvist");
      await medFirma(cfg.appPool, p.firma_id, async (db) => {
        await db.query("update passkey set taeller = $2, sidst_brugt = now() where id = $1", [p.passkey_id, nyTaeller]);
        await log(db, p.firma_id, p.bruger_id, "login", { ip: req.ip });
        await nySession(db, req, svar, p.firma_id, p.bruger_id);
      });
      return { ok: true };
    } catch (e) {
      return fejlHaandtering(svar, e);
    }
  });

  // --- Gendannelse: gendannelseskode -> engangskode til ny passkey (aldrig direkte adgang) ---
  app.post("/auth/gendan", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req, svar) => {
    const ind = Gendan.safeParse(req.body);
    if (!ind.success) return svar.code(400).send({ fejl: "Ugyldig kode" });
    try {
      const r = await cfg.appPool.query<{ gendannelseskode_id: string; bruger_id: string; firma_id: string }>("select * from auth_gendannelseskode($1)", [
        fingeraftryk(normaliserKode(ind.data.kode)),
      ]);
      const g = r.rows[0];
      if (!g) throw new LoginFejl("Koden er ugyldig eller allerede brugt");
      const kode = nyNoegle();
      await medFirma(cfg.appPool, g.firma_id, async (db) => {
        const brugt = await db.query("update gendannelseskode set brugt = now() where id = $1 and brugt is null", [g.gendannelseskode_id]);
        if (brugt.rowCount !== 1) throw new LoginFejl("Koden er allerede brugt");
        await db.query(
          "insert into engangskode (firma_id, bruger_id, kode_hash, udloeber) values ($1, $2, $3, now() + make_interval(mins => $4))",
          [g.firma_id, g.bruger_id, fingeraftryk(kode), TILMELDING_GYLDIG_MINUTTER],
        );
        await log(db, g.firma_id, g.bruger_id, "gendannelseskode_brugt", { ip: req.ip });
      });
      return { tilmeldingskode: kode };
    } catch (e) {
      return fejlHaandtering(svar, e);
    }
  });

  // --- Logud og "hvem er jeg" ---
  app.post("/auth/logud", async (req, svar) => {
    const b = req.bruger;
    if (b) {
      await medFirma(cfg.appPool, b.firmaId, async (db) => {
        await db.query("update session set afsluttet = now() where id = $1", [b.sessionId]);
        await log(db, b.firmaId, b.brugerId, "logud");
      });
    }
    svar.clearCookie(navn, { path: "/", secure: cfg.sikkerCookie, httpOnly: true, sameSite: "strict" });
    return { ok: true };
  });

  app.get("/auth/mig", async (req, svar) => {
    if (!req.bruger) return svar.code(401).send({ fejl: "Ikke logget ind" });
    const { navn: n, email, rolle } = req.bruger;
    return { navn: n, email, rolle };
  });
}
