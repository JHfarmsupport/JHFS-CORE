# JHFS Core – husregler for kode

JHFS Core er JH Farm Support ApS' eget virksomhedsprogram. Ejer: Jens Høj. Brugerfladen er på dansk.

## Penge og moms – ufravigelige regler
- Alle beløb er hele øre (`Oere` fra `@jhfs/core`). Aldrig kommatal, aldrig `number` for kroner.
- Afrunding sker kun ét sted: `procentAf` (halvt op). Ingen andre steder.
- Core indberetter ALDRIG moms eller skat og sender ALDRIG noget på Jens' vegne uden et ja-tryk.
- Bankadgang er kun læseadgang.
- Før en ny regnefunktion for penge kodes: skriv reglen med egne ord og få Jens' godkendelse.
- Jens' egne tal er facit. De ligger anonymiseret i `test/fixtures` og må aldrig rettes for at få en test til at passe.

## Regler
- Priser, afrundinger m.m. er regler med gyldighedsdatoer (`Regel<T>`). En regel ændres aldrig bagud – lav en ny med ny dato.
- Skriv i `begrundelse`, hvem der besluttede reglen og hvornår.

## Database
- Alt firmadata har `firma_id` og row-level security. Programmet taler kun med databasen via `medFirma()`.
- Programmet logger ind som en almindelig bruger, der er medlem af `jhfs_app` – aldrig som administrator.
- Migrationer i `packages/db/migrations` ændres aldrig efter de er kørt. Lav en ny.

## Login
- Kun passkeys. Ingen kodeord. Gendannelseskoder giver aldrig direkte adgang – kun lov til at oprette en ny passkey.
- Koder og sessionsnøgler gemmes kun som SHA-256-fingeraftryk.
- Alt der ændrer noget kræver Origin-tjek. Alt undtagen /sundhed, /auth/*, /login, /tilmeld og /static/* kræver login.
- Opslag før login sker kun via de fire `auth_*`-funktioner i migration 0002.

## Data og privatliv
- Ingen rigtige kundenavne, telefonnumre, CPR, kodeord eller nøgler i repoet. Brug anonymiseret testdata.
- `.env` kommer aldrig på GitHub.

## Arbejdsgang
- Arbejd på en gren, aldrig direkte på `main`. Alt går via pull request.
- `pnpm check` (typetjek + tests) skal være grøn før push.
- Testdatabase: `TEST_DATABASE_URL` skal pege på en Postgres 16, hvor brugeren må oprette databaser og roller.
