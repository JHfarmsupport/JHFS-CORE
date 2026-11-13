import { describe, expect, it } from "vitest";
import { RegelFejl, TELEFONSUPPORT_REGLER, dato, gaeldendeRegel, tjekIngenOverlap, type Regel } from "../src/index.js";

const r = (navn: string, fra: string, til?: string): Regel<number> => ({
  navn,
  gyldigFra: dato(fra),
  ...(til ? { gyldigTil: dato(til) } : {}),
  begrundelse: "test",
  vaerdi: 1,
});

describe("regler med gyldighedsperiode", () => {
  it("finder den regel der gælder på datoen", () => {
    const regler = [r("gammel", "2025-01-01", "2025-12-31"), r("ny", "2026-01-01")];
    expect(gaeldendeRegel(regler, dato("2025-06-01")).navn).toBe("gammel");
    expect(gaeldendeRegel(regler, dato("2025-12-31")).navn).toBe("gammel");
    expect(gaeldendeRegel(regler, dato("2026-01-01")).navn).toBe("ny");
  });

  it("fejler hvis ingen regel gælder", () => {
    expect(() => gaeldendeRegel([r("ny", "2026-01-01")], dato("2025-01-01"))).toThrow(RegelFejl);
  });

  it("fejler hvis to regler gælder samtidig", () => {
    const regler = [r("a", "2026-01-01"), r("b", "2026-06-01")];
    expect(() => gaeldendeRegel(regler, dato("2026-07-01"))).toThrow(RegelFejl);
    expect(() => tjekIngenOverlap(regler)).toThrow(RegelFejl);
  });

  it("JH Farm Supports telefonsupport-regler overlapper ikke", () => {
    expect(() => tjekIngenOverlap(TELEFONSUPPORT_REGLER)).not.toThrow();
  });
});
