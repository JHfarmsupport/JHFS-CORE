import { describe, expect, it } from "vitest";
import { DatoFejl, dato, helligdage, paaskedag, plusDage, ugedag } from "../src/index.js";

describe("dato", () => {
  it("afviser datoer der ikke findes", () => {
    expect(() => dato("2026-02-29")).toThrow(DatoFejl);
    expect(() => dato("2026-13-01")).toThrow(DatoFejl);
    expect(() => dato("2/4-2026")).toThrow(DatoFejl);
    expect(dato("2028-02-29")).toBe("2028-02-29");
  });

  it("ugedag: mandag = 0, søndag = 6", () => {
    expect(ugedag(dato("2026-11-09"))).toBe(0);
    expect(ugedag(dato("2026-11-15"))).toBe(6);
  });

  it("plusDage over månedsskifte og nytår", () => {
    expect(plusDage(dato("2025-12-30"), 3)).toBe("2026-01-02");
  });
});

describe("helligdage", () => {
  it("påskedag kendte år", () => {
    expect(paaskedag(2024)).toBe("2024-03-31");
    expect(paaskedag(2025)).toBe("2025-04-20");
    expect(paaskedag(2026)).toBe("2026-04-05");
    expect(paaskedag(2027)).toBe("2027-03-28");
  });

  it("2026 – samme liste som i telefonsupport-arket", () => {
    const h = helligdage(2026, ["grundlovsdag"]);
    expect([...h.keys()].sort()).toEqual([
      "2026-01-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-05",
      "2026-04-06",
      "2026-05-14",
      "2026-05-24",
      "2026-05-25",
      "2026-06-05",
      "2026-12-25",
      "2026-12-26",
    ]);
  });

  it("store bededag findes ikke efter 2023", () => {
    expect([...helligdage(2023).values()]).toContain("Store bededag");
    expect([...helligdage(2025).values()]).not.toContain("Store bededag");
  });
});
