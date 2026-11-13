/**
 * API'et og de få sider, der findes indtil videre.
 *
 * Med login slået til (altid i drift) er ALT lukket, undtagen:
 *  /sundhed, /auth/*, /login, /tilmeld og /static/*
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { NUL, TELEFONSUPPORT_REGLER, afregnAlle, dato, plus, visKr } from "@jhfs/core";
import { registrerAuth, type AuthIndstillinger } from "./auth/ruter.js";

const OpkaldInd = z.object({
  kundeId: z.string().min(1),
  dato: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kl: z.string().regex(/^\d{2}:\d{2}$/),
  sekunder: z.number().int().nonnegative(),
  besvaret: z.boolean(),
  navn: z.string().min(1),
});

const BeregnInd = z.object({ opkald: z.array(OpkaldInd).max(10000) });

const OFFENTLIGE = [/^\/sundhed$/, /^\/auth\//, /^\/login$/, /^\/tilmeld$/, /^\/static\//];

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const require = createRequire(import.meta.url);

const STATISKE: Record<string, { fil: string; type: string }> = {
  "/login": { fil: join(PUBLIC, "login.html"), type: "text/html; charset=utf-8" },
  "/tilmeld": { fil: join(PUBLIC, "tilmeld.html"), type: "text/html; charset=utf-8" },
  "/": { fil: join(PUBLIC, "forside.html"), type: "text/html; charset=utf-8" },
  "/static/stil.css": { fil: join(PUBLIC, "stil.css"), type: "text/css; charset=utf-8" },
  "/static/login.js": { fil: join(PUBLIC, "login.js"), type: "text/javascript; charset=utf-8" },
  "/static/webauthn.js": {
    fil: join(dirname(require.resolve("@simplewebauthn/browser")), "..", "dist", "bundle", "index.umd.min.js"),
    type: "text/javascript; charset=utf-8",
  },
};

export interface AppIndstillinger {
  /** Login. Skal altid være med, undtagen i rene regne-tests. */
  auth?: AuthIndstillinger;
}

export async function byggApp(ind: AppIndstillinger = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 1024 * 1024 });

  // Sikkerheds-headers på alle svar
  app.addHook("onSend", async (_req, svar) => {
    svar.header("X-Content-Type-Options", "nosniff");
    svar.header("Referrer-Policy", "no-referrer");
    svar.header("X-Frame-Options", "DENY");
    svar.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    if (ind.auth?.sikkerCookie) svar.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  });

  if (ind.auth) {
    await registrerAuth(app, ind.auth);
    // Alt andet kræver login
    app.addHook("preHandler", async (req, svar) => {
      const sti = req.url.split("?")[0] ?? "";
      if (OFFENTLIGE.some((r) => r.test(sti)) || req.bruger) return;
      if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) return svar.redirect("/login");
      return svar.code(401).send({ fejl: "Log ind først" });
    });
  }

  app.get("/sundhed", async () => ({ status: "ok" }));

  for (const [sti, { fil, type }] of Object.entries(STATISKE)) {
    app.get(sti, async (_req, svar) => svar.type(type).header("Cache-Control", "no-store").send(await readFile(fil)));
  }

  /** Beregner telefonsupport ud fra en liste opkald. Gemmer intet. */
  app.post("/telefonsupport/beregn", async (req, svar) => {
    const data = BeregnInd.safeParse(req.body);
    if (!data.success) {
      return svar.code(400).send({ fejl: "Ugyldige data", detaljer: data.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    try {
      const opkald = data.data.opkald.map((o) => ({ ...o, dato: dato(o.dato) }));
      const res = afregnAlle(opkald, TELEFONSUPPORT_REGLER);
      const totalOere = res.reduce((s, r) => plus(s, r.total), NUL);
      return { afregninger: res, totalOere, total: visKr(totalOere) };
    } catch (e) {
      return svar.code(400).send({ fejl: e instanceof Error ? e.message : "Ukendt fejl" });
    }
  });

  return app;
}
