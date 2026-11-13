/**
 * API'et. Indtil login (passkey + to-faktor) er bygget, må det KUN køre lokalt / bag lukket adgang.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { NUL, TELEFONSUPPORT_REGLER, afregnAlle, dato, plus, visKr } from "@jhfs/core";

const OpkaldInd = z.object({
  kundeId: z.string().min(1),
  dato: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kl: z.string().regex(/^\d{2}:\d{2}$/),
  sekunder: z.number().int().nonnegative(),
  besvaret: z.boolean(),
  navn: z.string().min(1),
});

const BeregnInd = z.object({ opkald: z.array(OpkaldInd).max(10000) });

export function byggApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/sundhed", async () => ({ status: "ok" }));

  /** Beregner telefonsupport ud fra en liste opkald. Gemmer intet. */
  app.post("/telefonsupport/beregn", async (req, svar) => {
    const ind = BeregnInd.safeParse(req.body);
    if (!ind.success) {
      return svar.code(400).send({ fejl: "Ugyldige data", detaljer: ind.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    try {
      const opkald = ind.data.opkald.map((o) => ({ ...o, dato: dato(o.dato) }));
      const res = afregnAlle(opkald, TELEFONSUPPORT_REGLER);
      const totalOere = res.reduce((s, r) => plus(s, r.total), NUL);
      return { afregninger: res, totalOere, total: visKr(totalOere) };
    } catch (e) {
      return svar.code(400).send({ fejl: e instanceof Error ? e.message : "Ukendt fejl" });
    }
  });

  return app;
}
