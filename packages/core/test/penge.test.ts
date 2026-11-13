import { describe, expect, it } from "vitest";
import { PengeFejl, gange, kr, minus, oere, plus, procentAf, tilfoejMoms, visKr } from "../src/index.js";

describe("penge i hele øre", () => {
  it("kr laver øre", () => {
    expect(kr(250)).toBe(25000);
  });

  it("afviser kommatal, så man ikke kommer til at regne i kroner med decimaler", () => {
    expect(() => oere(0.1)).toThrow(PengeFejl);
    expect(() => kr(12.5)).toThrow(PengeFejl);
    expect(() => gange(kr(250), 1.5)).toThrow(PengeFejl);
  });

  it("plus, minus og gange", () => {
    expect(plus(kr(250), kr(500), oere(1))).toBe(75001);
    expect(minus(kr(100), oere(1))).toBe(9999);
    expect(gange(kr(250), 8)).toBe(kr(2000));
  });

  it("viser dansk format", () => {
    expect(visKr(oere(9225000))).toBe("92.250,00 kr");
    expect(visKr(oere(5))).toBe("0,05 kr");
    expect(visKr(oere(-125050))).toBe("-1.250,50 kr");
  });
});

describe("procent og moms", () => {
  it("25 % moms af hele kroner", () => {
    expect(tilfoejMoms(kr(92000))).toEqual({ ekskl: kr(92000), moms: kr(23000), inkl: kr(115000) });
  });

  it("runder halvt op til nærmeste øre", () => {
    // 25 % af 0,02 kr = 0,005 kr -> 0,01 kr
    expect(procentAf(oere(2), 2500)).toBe(1);
    // 25 % af 0,01 kr = 0,0025 kr -> 0,00 kr
    expect(procentAf(oere(1), 2500)).toBe(0);
    // Kreditnota: -0,02 kr -> -0,01 kr
    expect(procentAf(oere(-2), 2500)).toBe(-1);
  });

  it("totalen 2026-forslaget: 92.250 kr + moms = 115.312,50 kr", () => {
    expect(visKr(tilfoejMoms(kr(92250)).inkl)).toBe("115.312,50 kr");
  });
});
