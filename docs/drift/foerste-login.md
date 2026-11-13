# Første login

Core har ingen kodeord. Man logger ind med en **passkey**: Face ID, fingeraftryk eller PIN på telefonen
eller computeren. En passkey er to-faktor i sig selv (noget du har + noget du er/ved), og den virker ikke
på falske login-sider.

## Opsætning på serveren (én gang)

1. Database-administratoren kører migrationerne:
   ```bash
   DATABASE_URL=postgres://postgres:...@localhost/jhfs pnpm db:migrate
   ```
2. Opret programmets egen database-bruger (aldrig administrator):
   ```sql
   create role jhfs_web login password '<langt tilfældigt kodeord>' in role jhfs_app;
   ```
3. Sæt miljøvariabler (i `.env`, som aldrig kommer på GitHub):
   ```
   ORIGIN=https://core.jhfarmsupport.dk
   DATABASE_APP_URL=postgres://jhfs_web:...@localhost/jhfs
   DATABASE_URL=postgres://postgres:...@localhost/jhfs   # kun til administration
   ```

## Opret firma og ejer

```bash
pnpm --filter @jhfs/api admin opret-ejer --firma "JH Farm Support ApS" --email mail@jhfarmsupport.dk --navn "Jens Høj"
```

Kommandoen udskriver et link. Åbn det på telefonen inden 30 minutter → "Opret passkey" → Face ID.
Derefter vises **10 gendannelseskoder**. Print dem og læg dem et sikkert sted.

## Ny telefon eller computer

- Har du stadig adgang: (kommer) "Tilføj enhed" inde i Core.
- Indtil da: `pnpm --filter @jhfs/api admin ny-kode --email mail@jhfarmsupport.dk` → åbn linket på den nye enhed.

## Mistet telefonen

På login-siden: "Mistet din telefon? Brug en gendannelseskode". Hver kode virker én gang og giver kun lov
til at oprette en ny passkey – aldrig direkte adgang. Når alle koder er brugt, laves der 10 nye ved næste tilmelding.

## Sessioner

- Du er logget ind i op til 14 dage på samme enhed. Har du ikke brugt Core i 24 timer, skal du logge ind igen.
- "Log ud" lukker sessionen med det samme.
