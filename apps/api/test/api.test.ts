import { describe, expect, it } from "vitest";
import { byggApp } from "../src/app.js";

describe("API", () => {
  it("sundhed", async () => {
    const r = await byggApp().inject({ method: "GET", url: "/sundhed" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "ok" });
  });

  it("beregner telefonsupport", async () => {
    const r = await byggApp().inject({
      method: "POST",
      url: "/telefonsupport/beregn",
      payload: {
        opkald: [
          { kundeId: "k1", dato: "2026-03-03", kl: "10:00", sekunder: 33 * 60, besvaret: true, navn: "Kasper" },
          { kundeId: "k1", dato: "2026-03-07", kl: "12:00", sekunder: 5 * 60, besvaret: true, navn: "Kasper" },
        ],
      },
    });
    expect(r.statusCode).toBe(200);
    // 33 min normal = 3 kvarterer á 250 + 5 min weekend = 1 kvarter á 500
    expect(r.json().total).toBe("1.250,00 kr");
  });

  it("afviser ugyldige data med en forståelig fejl", async () => {
    const r = await byggApp().inject({
      method: "POST",
      url: "/telefonsupport/beregn",
      payload: { opkald: [{ kundeId: "k1", dato: "2026-02-30", kl: "10:00", sekunder: 60, besvaret: true, navn: "X" }] },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().fejl).toMatch(/findes ikke/);
  });

  it("afviser kommatal i sekunder", async () => {
    const r = await byggApp().inject({
      method: "POST",
      url: "/telefonsupport/beregn",
      payload: { opkald: [{ kundeId: "k1", dato: "2026-03-03", kl: "10:00", sekunder: 1.5, besvaret: true, navn: "X" }] },
    });
    expect(r.statusCode).toBe(400);
  });
});
