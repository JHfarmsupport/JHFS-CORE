# JHFS Core

JH Farm Support ApS' eget virksomhedsprogram: sager, dagssedler, lager, RTK-abonnementer, telefonsupport,
fakturering til e-conomic, bankafstemning, Kompas (likviditet) og meget mere.

## Status

**Fase 0 – fundament** (i gang)

| Del | Status |
|---|---|
| Penge i hele øre, moms, danske helligdage | ✅ med tests |
| Regler med gyldighedsdatoer | ✅ med tests |
| Telefonsupport-afregning | ✅ testet mod alle 205 linjer i Fakturagrundlag 2025 |
| Database med adskillelse mellem firmaer | ✅ testet mod rigtig Postgres |
| API-skelet, alt lukket bag login | ✅ |
| Automatisk testkørsel på GitHub | ✅ |
| Login med passkey (Face ID / fingeraftryk), gendannelseskoder | ✅ testet i rigtig browser |
| Server, HTTPS, firewall og krypteret backup med ugentlig test | ✅ klar – se docs/drift/server.md |

## Opbygning

```
packages/core   Regnelogik: penge, moms, regler, telefonsupport. Ingen database, ingen internet.
packages/db     Database: migrationer, row-level security, medFirma()
apps/api        API (Fastify)
docs/           Regler og beslutninger skrevet med ord
```

## Kom i gang (udvikler)

```bash
pnpm install
pnpm db:up                     # starter Postgres i Docker
cp .env.example .env
pnpm db:migrate
pnpm check                     # typetjek + alle tests
pnpm dev:api
```

Første gang: se `docs/drift/foerste-login.md`.
