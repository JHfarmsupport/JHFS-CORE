-- 0001 Fundament
--
-- Princip:
--  * Alle tabeller med firmadata har firma_id, og row-level security (RLS) sørger for,
--    at et firma ALDRIG kan se et andet firmas data – heller ikke hvis koden har en fejl.
--  * Programmet kører som rollen jhfs_app, som ikke kan slå RLS fra.
--  * Hvert kald sætter "app.firma_id" for sin transaktion. Er den ikke sat, ser man intet.
--  * Penge gemmes som heltal i øre (bigint). Ingen kommatal.
--  * Hændelsesloggen kan kun skrives til – aldrig rettes eller slettes.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'jhfs_app') then
    create role jhfs_app nologin;
  end if;
end
$$;

-- Hjælpefunktion: det firma, den aktuelle transaktion arbejder for.
create or replace function app_firma_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.firma_id', true), '')::uuid
$$;

create table firma (
  id         uuid primary key default gen_random_uuid(),
  navn       text not null check (length(trim(navn)) > 0),
  cvr        text check (cvr ~ '^[0-9]{8}$'),
  oprettet   timestamptz not null default now()
);

create table bruger (
  id         uuid primary key default gen_random_uuid(),
  firma_id   uuid not null references firma(id),
  email      text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  navn       text not null,
  rolle      text not null check (rolle in ('ejer', 'medarbejder', 'revisor')),
  oprettet   timestamptz not null default now(),
  unique (firma_id, email)
);

create table kunde (
  id                uuid primary key default gen_random_uuid(),
  firma_id          uuid not null references firma(id),
  kundenr           integer not null check (kundenr > 0),
  navn              text not null check (length(trim(navn)) > 0),
  economic_kundenr  bigint,
  oprettet          timestamptz not null default now(),
  unique (firma_id, kundenr),
  unique (firma_id, economic_kundenr)
);

create table kontakt (
  id         uuid primary key default gen_random_uuid(),
  firma_id   uuid not null references firma(id),
  kunde_id   uuid references kunde(id),
  navn       text not null,
  telefon    text,
  oprettet   timestamptz not null default now()
);

create table opkald (
  id          uuid primary key default gen_random_uuid(),
  firma_id    uuid not null references firma(id),
  kontakt_id  uuid references kontakt(id),
  dato        date not null,
  kl          time(0) not null,
  retning     text not null check (retning in ('ind', 'ud')),
  sekunder    integer not null check (sekunder >= 0),
  besvaret    boolean not null,
  -- Hvor opkaldet kom fra (screenshot, Uni-tel, manuelt) og en nøgle, så samme opkald ikke kan komme ind to gange.
  kilde       text not null,
  kilde_ref   text not null,
  oprettet    timestamptz not null default now(),
  unique (firma_id, kilde, kilde_ref)
);

-- Regler med gyldighedsperiode. To regler for samme område må aldrig gælde samme dag.
create table regel (
  id           uuid primary key default gen_random_uuid(),
  firma_id     uuid not null references firma(id),
  omraade      text not null,
  navn         text not null,
  gyldig_fra   date not null,
  gyldig_til   date,
  vaerdi       jsonb not null,
  begrundelse  text not null,
  oprettet     timestamptz not null default now(),
  check (gyldig_til is null or gyldig_til >= gyldig_fra),
  exclude using gist (
    firma_id with =,
    omraade with =,
    daterange(gyldig_fra, gyldig_til, '[]') with &&
  )
);

-- Hændelseslog: hvem gjorde hvad hvornår. Kun indsæt.
create table haendelse (
  id         bigint generated always as identity primary key,
  firma_id   uuid not null references firma(id),
  tidspunkt  timestamptz not null default now(),
  bruger_id  uuid references bruger(id),
  handling   text not null,
  data       jsonb not null default '{}'::jsonb
);

-- RLS på alle firmatabeller
do $$
declare
  t text;
begin
  foreach t in array array['bruger', 'kunde', 'kontakt', 'opkald', 'regel', 'haendelse'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy eget_firma on %I using (firma_id = app_firma_id()) with check (firma_id = app_firma_id())',
      t
    );
  end loop;
end
$$;

-- Firma-tabellen: man kan kun se sit eget firma.
alter table firma enable row level security;
alter table firma force row level security;
create policy eget_firma on firma using (id = app_firma_id());

-- Rettigheder for programmet
grant usage on schema public to jhfs_app;
grant select on firma to jhfs_app;
grant select, insert, update, delete on bruger, kunde, kontakt, opkald, regel to jhfs_app;
grant select, insert on haendelse to jhfs_app;
grant usage on all sequences in schema public to jhfs_app;
grant execute on function app_firma_id() to jhfs_app;
