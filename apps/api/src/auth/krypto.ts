import { createHash, randomBytes, randomInt } from "node:crypto";

/** Tilfældig nøgle i URL-sikker tekst. 32 bytes = 256 bit. */
export function nyNoegle(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 – det er kun dette fingeraftryk, der gemmes i databasen. */
export function fingeraftryk(tekst: string): Buffer {
  return createHash("sha256").update(tekst, "utf8").digest();
}

// Uden 0/O, 1/I/L så koderne kan læses op og skrives af uden fejl.
const TEGN = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Gendannelseskode som "K7QM-3RXT-9HWA" (ca. 59 bit). */
export function nyGendannelseskode(): string {
  const dele: string[] = [];
  for (let d = 0; d < 3; d++) {
    let del = "";
    for (let i = 0; i < 4; i++) del += TEGN[randomInt(TEGN.length)];
    dele.push(del);
  }
  return dele.join("-");
}

/** Gør en indtastet gendannelseskode ens: store bogstaver, uden mellemrum og bindestreger. */
export function normaliserKode(kode: string): string {
  return kode.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
