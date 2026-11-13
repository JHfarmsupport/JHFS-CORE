/** Indstillinger fra miljøvariabler. Mangler noget vigtigt, starter programmet ikke. */
export interface Indstillinger {
  appDatabaseUrl: string;
  origin: string;
  rpId: string;
  sikkerCookie: boolean;
  sessionDage: number;
  port: number;
  host: string;
}

export function laesIndstillinger(env: NodeJS.ProcessEnv = process.env): Indstillinger {
  const mangler = (n: string): never => {
    throw new Error(`Miljøvariablen ${n} mangler`);
  };
  const origin = env.ORIGIN ?? mangler("ORIGIN");
  const url = new URL(origin);
  const lokal = url.hostname === "localhost";
  if (url.protocol !== "https:" && !lokal) throw new Error("ORIGIN skal være https, undtagen på localhost");
  return {
    appDatabaseUrl: env.DATABASE_APP_URL ?? mangler("DATABASE_APP_URL"),
    origin: url.origin,
    rpId: url.hostname,
    sikkerCookie: url.protocol === "https:",
    sessionDage: Number(env.SESSION_DAGE ?? 14),
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "127.0.0.1",
  };
}
