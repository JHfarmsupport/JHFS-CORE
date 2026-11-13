import { byggApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
// Lytter kun på localhost, indtil login er bygget.
const host = process.env.HOST ?? "127.0.0.1";

byggApp()
  .listen({ port, host })
  .then((adr) => console.log(`JHFS Core API kører på ${adr}`))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
