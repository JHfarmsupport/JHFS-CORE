/**
 * Ende-til-ende: rigtig browser (Chromium), rigtig passkey-kryptografi og rigtig database.
 * Browseren får en "virtuel passkey" – som en telefon med Face ID, der altid siger ja.
 */
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { byggApp } from "../src/app.js";
import { opretFirmaOgEjer } from "../src/auth/administration.js";
import { simpleWebAuthnMotor } from "../src/auth/passkey-motor.js";
import { ADMIN_URL, nyTestDb, type TestDb } from "./testdb.js";

const UDEN_BROWSER = process.env.SKIP_BROWSER === "1";

describe.skipIf(!ADMIN_URL || UDEN_BROWSER)("login i rigtig browser med passkey", () => {
  let db: TestDb;
  let app: FastifyInstance;
  let browser: Browser;
  let origin: string;

  beforeAll(async () => {
    db = await nyTestDb();
    // Porten skal kendes før motoren laves, fordi passkeys er bundet til adressen.
    const midlertidig = await byggApp();
    await midlertidig.listen({ port: 0, host: "127.0.0.1" });
    const port = (midlertidig.server.address() as AddressInfo).port;
    await midlertidig.close();
    origin = `http://localhost:${port}`;
    app = await byggApp({
      auth: {
        appPool: db.appPool,
        motor: simpleWebAuthnMotor({ rpId: "localhost", rpNavn: "JHFS Core", origin }),
        origin,
        sikkerCookie: false,
        sessionDage: 14,
      },
    });
    await app.listen({ port, host: "127.0.0.1" });
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await app?.close();
    await db?.ryd();
  });

  it("tilmeld passkey, se gendannelseskoder, log ud og log ind igen", async () => {
    const { kode } = await opretFirmaOgEjer(db.adminPool, db.appPool, { firmanavn: "Browsertest ApS", email: "jens@test.dk", navn: "Jens Test" });

    const ctx = await browser.newContext();
    const side = await ctx.newPage();
    const cdp = await ctx.newCDPSession(side);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
    });

    // Uden login sendes man til login-siden
    await side.goto(`${origin}/`);
    await expect.poll(() => side.url()).toBe(`${origin}/login`);

    // Tilmeld
    await side.goto(`${origin}/tilmeld#kode=${kode}`);
    expect(side.url()).toBe(`${origin}/tilmeld`); // koden er fjernet fra adresselinjen
    await side.fill("#enhed", "Test-iPhone");
    await side.click("#tilmeld-knap");
    await side.waitForSelector("#koder:not(.skjult)");
    const koder = await side.locator("#kode-liste div").allTextContents();
    expect(koder).toHaveLength(10);
    await side.click("#koder-gemt");
    await expect.poll(() => side.locator("#velkommen").textContent()).toBe("Velkommen, Jens Test");

    // Log ud
    await side.click("#logud-knap");
    await expect.poll(() => side.url()).toBe(`${origin}/login`);

    // Log ind igen med passkey
    await side.click("#login-knap");
    await expect.poll(() => side.locator("#velkommen").textContent()).toBe("Velkommen, Jens Test");

    await ctx.close();
  }, 60_000);

  it("en anden browser uden passkey kommer ikke ind", async () => {
    const ctx = await browser.newContext();
    const side = await ctx.newPage();
    const cdp = await ctx.newCDPSession(side);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
    });
    await side.goto(`${origin}/login`);
    await side.click("#login-knap");
    await expect.poll(() => side.locator("#login-fejl").textContent()).not.toBe("");
    expect(side.url()).toBe(`${origin}/login`);
    await ctx.close();
  }, 60_000);
});
