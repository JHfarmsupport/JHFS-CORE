import pg from "pg";
import { byggApp } from "./app.js";
import { simpleWebAuthnMotor } from "./auth/passkey-motor.js";
import { laesIndstillinger } from "./indstillinger.js";

const cfg = laesIndstillinger();
const appPool = new pg.Pool({ connectionString: cfg.appDatabaseUrl, max: 10 });

const app = await byggApp({
  auth: {
    appPool,
    motor: simpleWebAuthnMotor({ rpId: cfg.rpId, rpNavn: "JHFS Core", origin: cfg.origin }),
    origin: cfg.origin,
    sikkerCookie: cfg.sikkerCookie,
    sessionDage: cfg.sessionDage,
  },
});

const adr = await app.listen({ port: cfg.port, host: cfg.host });
console.log(`JHFS Core kører på ${adr} (offentlig adresse: ${cfg.origin})`);
