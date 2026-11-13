import { describe, expect, it } from "vitest";
import facit from "./fixtures/telefonsupport-2025-facit.json" with { type: "json" };
import {
  TELEFONSUPPORT_REGLER,
  TelefonsupportFejl,
  afregnAlle,
  afregnMaaned,
  dato,
  fraDele,
  gaeldendeRegel,
  kr,
  kvarterer,
  plus,
  tidstype,
  ugedag,
  type Opkald,
  type Oere,
} from "../src/index.js";

const regel2025 = gaeldendeRegel(TELEFONSUPPORT_REGLER, dato("2025-06-01")).vaerdi;
const regel2026 = gaeldendeRegel(TELEFONSUPPORT_REGLER, dato("2026-06-01")).vaerdi;
const min = (m: number) => m * 60;

const opkald = (o: Partial<Opkald> & Pick<Opkald, "dato" | "kl" | "sekunder">): Opkald => ({
  kundeId: "k1",
  besvaret: true,
  navn: "Test",
  ...o,
});

describe("kvarterer – Jens' egne eksempler", () => {
  it("2026: 2 minutters tolerance", () => {
    expect(kvarterer(min(31), regel2026)).toBe(2);
    expect(kvarterer(min(32), regel2026)).toBe(2);
    expect(kvarterer(min(33), regel2026)).toBe(3); // "33 min går op på 45 min"
    expect(kvarterer(min(17), regel2026)).toBe(1);
    expect(kvarterer(min(17) + 1, regel2026)).toBe(2);
  });

  it("2026: Stenbogård-fakturaen – 46 min = 3 kvarterer, 31 min = 2", () => {
    expect(kvarterer(min(46), regel2026)).toBe(3);
    expect(kvarterer(min(31), regel2026)).toBe(2);
  });

  it("mindst ét kvarter, også for et kort opkald", () => {
    expect(kvarterer(min(1), regel2026)).toBe(1);
    expect(kvarterer(23, regel2026)).toBe(1); // 23 sekunder
    expect(kvarterer(0, regel2026)).toBe(0);
  });

  it("2025: påbegyndt kvarter uden tolerance", () => {
    expect(kvarterer(min(15), regel2025)).toBe(1);
    expect(kvarterer(min(16), regel2025)).toBe(2);
    expect(kvarterer(min(31), regel2025)).toBe(3);
  });

  it("afviser halve sekunder og negative tider", () => {
    expect(() => kvarterer(1.5, regel2026)).toThrow(TelefonsupportFejl);
    expect(() => kvarterer(-1, regel2026)).toThrow(TelefonsupportFejl);
  });
});

describe("tidstype", () => {
  it("hverdag før 17 = normal, fra 17:00 = aften", () => {
    expect(tidstype({ dato: dato("2026-11-10"), kl: "16:59" }, regel2026)).toBe("normal");
    expect(tidstype({ dato: dato("2026-11-10"), kl: "17:00" }, regel2026)).toBe("aften");
  });

  it("lørdag og søndag = weekend, også om aftenen", () => {
    expect(tidstype({ dato: dato("2026-04-18"), kl: "20:42" }, regel2026)).toBe("weekend");
  });

  it("helligdage og grundlovsdag = weekend-takst", () => {
    expect(tidstype({ dato: dato("2026-04-02"), kl: "20:22" }, regel2026)).toBe("weekend"); // skærtorsdag
    expect(tidstype({ dato: dato("2026-06-05"), kl: "10:00" }, regel2026)).toBe("weekend"); // grundlovsdag
    expect(tidstype({ dato: dato("2026-12-24"), kl: "10:00" }, regel2026)).toBe("weekend"); // juleaften
    expect(tidstype({ dato: dato("2026-12-31"), kl: "10:00" }, regel2026)).toBe("weekend"); // nytårsaften
  });

  it("weekend er weekend hele døgnet – også morgen og aften", () => {
    expect(tidstype({ dato: dato("2026-04-18"), kl: "06:30" }, regel2026)).toBe("weekend");
    expect(tidstype({ dato: dato("2026-04-19"), kl: "21:15" }, regel2026)).toBe("weekend");
  });
});

describe("afregning pr. kunde pr. måned", () => {
  it("lægger alle opkald i måneden sammen før afrunding", () => {
    // To opkald á 5 min = 10 min = 1 kvarter (ikke 2)
    const a = afregnMaaned(
      [opkald({ dato: dato("2026-03-03"), kl: "10:00", sekunder: min(5) }), opkald({ dato: dato("2026-03-10"), kl: "11:00", sekunder: min(5) })],
      TELEFONSUPPORT_REGLER,
    );
    expect(a.linjer).toEqual([
      { tidstype: "normal", varenr: "Tlfsup015", sekunder: min(10), kvarterer: 1, stkPris: kr(250), beloeb: kr(250) },
    ]);
    expect(a.total).toBe(kr(250));
  });

  it("ubesvarede opkald tæller ikke", () => {
    const a = afregnMaaned(
      [opkald({ dato: dato("2026-03-03"), kl: "10:00", sekunder: min(5) }), opkald({ dato: dato("2026-03-03"), kl: "10:10", sekunder: 0, besvaret: false })],
      TELEFONSUPPORT_REGLER,
    );
    expect(a.opkald).toHaveLength(1);
  });

  it("2026: normal, aften og weekend på hver sin varelinje", () => {
    const a = afregnMaaned(
      [
        opkald({ dato: dato("2026-04-01"), kl: "09:00", sekunder: min(3) }),
        opkald({ dato: dato("2026-04-01"), kl: "19:46", sekunder: min(5) }),
        opkald({ dato: dato("2026-04-04"), kl: "12:00", sekunder: min(11) }),
      ],
      TELEFONSUPPORT_REGLER,
    );
    expect(a.linjer.map((l) => [l.varenr, l.kvarterer])).toEqual([
      ["Tlfsup015", 1],
      ["Tlfsup115", 1],
      ["Tlfsup215", 1],
    ]);
    expect(a.total).toBe(kr(1250));
  });

  it("nægter at blande kunder", () => {
    expect(() =>
      afregnMaaned(
        [opkald({ dato: dato("2026-03-03"), kl: "10:00", sekunder: 60 }), opkald({ kundeId: "k2", dato: dato("2026-03-03"), kl: "10:00", sekunder: 60 })],
        TELEFONSUPPORT_REGLER,
      ),
    ).toThrow(TelefonsupportFejl);
  });

  it("afregnAlle grupperer pr. kunde og måned", () => {
    const res = afregnAlle(
      [
        opkald({ dato: dato("2026-03-03"), kl: "10:00", sekunder: min(5) }),
        opkald({ dato: dato("2026-04-03"), kl: "10:00", sekunder: min(5) }),
        opkald({ kundeId: "k2", dato: dato("2026-03-04"), kl: "10:00", sekunder: min(5) }),
      ],
      TELEFONSUPPORT_REGLER,
    );
    expect(res.map((r) => `${r.kundeId} ${r.maaned}`)).toEqual(["k1 2026-03", "k1 2026-04", "k2 2026-03"]);
  });
});

/**
 * FACIT: Fakturagrundlag 2025.
 * Hver linje i Jens' ark genskabes med opkald af de rigtige tidstyper og skal give præcis samme beløb.
 */
describe("facit: Fakturagrundlag 2025 – alle 205 linjer", () => {
  function foersteDagMed(aar: number, md: number, betingelse: (d: ReturnType<typeof fraDele>) => boolean) {
    for (let dag = 1; dag <= 28; dag++) {
      const d = fraDele(aar, md, dag);
      if (betingelse(d)) return d;
    }
    throw new Error("ingen dag fundet");
  }

  const linjer = facit.linjer;
  let total: Oere = kr(0);

  it.each(linjer)("linje $linje ($maaned): $beloebKr kr", (l) => {
    const [aar, md] = l.maaned.split("-").map(Number) as [number, number];
    const hverdag = foersteDagMed(aar, md, (d) => ugedag(d) < 5 && tidstype({ dato: d, kl: "10:00" }, regel2025) === "normal");
    const loerdag = foersteDagMed(aar, md, (d) => ugedag(d) === 5);
    const liste: Opkald[] = [];
    if (l.normal) liste.push(opkald({ dato: hverdag, kl: "10:00", sekunder: min(l.normal) }));
    if (l.aften) liste.push(opkald({ dato: hverdag, kl: "18:00", sekunder: min(l.aften) }));
    if (l.weekend) liste.push(opkald({ dato: loerdag, kl: "12:00", sekunder: min(l.weekend) }));
    const a = afregnMaaned(liste, TELEFONSUPPORT_REGLER);
    expect(a.regel).toBe("Telefonsupport 2025");
    expect(a.total).toBe(kr(l.beloebKr));
    total = plus(total, a.total);
  });

  it("totalen er 114.750 kr", () => {
    expect(linjer).toHaveLength(205);
    expect(total).toBe(kr(facit.total_kr));
    expect(facit.total_kr).toBe(114750);
  });
});
