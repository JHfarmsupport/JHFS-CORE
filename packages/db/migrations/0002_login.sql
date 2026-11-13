-- 0002 Login
--
-- Login sker med passkey (Face ID / fingeraftryk / PIN på telefonen eller computeren).
-- En passkey er i sig selv to faktorer: noget du HAR (enheden) og noget du ER/VED (Face ID/PIN),
-- og den kan ikke snydes af en falsk login-side. Der findes ingen kodeord i Core.
--
-- Før login ved programmet ikke hvilket firma brugeren hører til. Derfor findes der nogle få,
-- snævre opslagsfunktioner ("security definer"), som kun returnerer det allermindste nødvendige.
-- Alt andet sker bagefter inden for firmaet med row-level security.
--
-- Koder og sessionsnøgler gemmes kun som SHA-256-fingeraftryk – aldrig i klartekst.

-- En e-mail kan kun høre til én bruger i hele systemet (login er uden firmavalg).
create unique index bruger_email_unik on bruger (lower(email));

create table passkey (
  id             uuid primary key default gen_random_uuid(),
  firma_id       uuid not null references firma(id),
  bruger_id      uuid not null references bruger(id),
  credential_id  text not null unique,
  public_key     bytea not null,
  taeller        bigint not null default 0 check (taeller >= 0),
  transports     text[] not null default '{}',
  navn           text not null default 'Passkey',
  oprettet       timestamptz not null default now(),
  sidst_brugt    timestamptz
);

create table session (
  id          uuid primary key default gen_random_uuid(),
  firma_id    uuid not null references firma(id),
  bruger_id   uuid not null references bruger(id),
  token_hash  bytea not null unique check (length(token_hash) = 32),
  oprettet    timestamptz not null default now(),
  udloeber    timestamptz not null,
  sidst_set   timestamptz not null default now(),
  afsluttet   timestamptz,
  ip          text,
  enhed       text
);

-- Engangskoder: bruges til at tilmelde en ny passkey (første gang, ny telefon, efter gendannelse).
create table engangskode (
  id         uuid primary key default gen_random_uuid(),
  firma_id   uuid not null references firma(id),
  bruger_id  uuid not null references bruger(id),
  kode_hash  bytea not null unique check (length(kode_hash) = 32),
  udloeber   timestamptz not null,
  brugt      timestamptz,
  oprettet   timestamptz not null default now()
);

-- Gendannelseskoder: printes/gemmes af brugeren. Én kode giver én ny engangskode – aldrig direkte adgang.
create table gendannelseskode (
  id         uuid primary key default gen_random_uuid(),
  firma_id   uuid not null references firma(id),
  bruger_id  uuid not null references bruger(id),
  kode_hash  bytea not null unique check (length(kode_hash) = 32),
  brugt      timestamptz,
  oprettet   timestamptz not null default now()
);

-- WebAuthn-udfordringer: tilfældige tal, der kun må bruges én gang og kun i 5 minutter.
-- Indeholder ingen firmadata, derfor ingen firma_id.
create table udfordring (
  id         uuid primary key default gen_random_uuid(),
  challenge  text not null,
  formaal    text not null check (formaal in ('login', 'tilmeld')),
  bruger_id  uuid references bruger(id),
  udloeber   timestamptz not null default now() + interval '5 minutes'
);

do $$
declare
  t text;
begin
  foreach t in array array['passkey', 'session', 'engangskode', 'gendannelseskode'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy eget_firma on %I using (firma_id = app_firma_id()) with check (firma_id = app_firma_id())',
      t
    );
  end loop;
end
$$;

grant select, insert, update on passkey, session, engangskode, gendannelseskode to jhfs_app;
grant delete on passkey, gendannelseskode to jhfs_app;
grant select, insert, delete on udfordring to jhfs_app;

-- ---------------------------------------------------------------------------
-- Opslag før login. Kun disse fire. Hver returnerer højst én række.
-- Funktionerne ejes af rollen jhfs_auth, som kun må læse præcis de tabeller, der skal bruges.
-- (Migrationer køres af database-administratoren, som kan oprette rollen.)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'jhfs_auth') then
    create role jhfs_auth nologin bypassrls;
  end if;
end
$$;
grant usage on schema public to jhfs_auth;
grant select on passkey, engangskode, gendannelseskode, bruger to jhfs_auth;
grant select, update (sidst_set) on session to jhfs_auth;

create function auth_passkey(p_credential_id text)
returns table (passkey_id uuid, bruger_id uuid, firma_id uuid, public_key bytea, taeller bigint, transports text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.bruger_id, p.firma_id, p.public_key, p.taeller, p.transports
  from passkey p
  where p.credential_id = p_credential_id
$$;

create function auth_session(p_token_hash bytea)
returns table (session_id uuid, bruger_id uuid, firma_id uuid, rolle text, navn text, email text)
language sql security definer set search_path = public as $$
  update session s set sidst_set = now()
  from bruger b
  where s.token_hash = p_token_hash
    and b.id = s.bruger_id
    and s.afsluttet is null
    and s.udloeber > now()
    and s.sidst_set > now() - interval '24 hours'
  returning s.id, s.bruger_id, s.firma_id, b.rolle, b.navn, b.email
$$;

create function auth_engangskode(p_kode_hash bytea)
returns table (engangskode_id uuid, bruger_id uuid, firma_id uuid, navn text, email text)
language sql stable security definer set search_path = public as $$
  select e.id, e.bruger_id, e.firma_id, b.navn, b.email
  from engangskode e join bruger b on b.id = e.bruger_id
  where e.kode_hash = p_kode_hash and e.brugt is null and e.udloeber > now()
$$;

create function auth_gendannelseskode(p_kode_hash bytea)
returns table (gendannelseskode_id uuid, bruger_id uuid, firma_id uuid)
language sql stable security definer set search_path = public as $$
  select g.id, g.bruger_id, g.firma_id
  from gendannelseskode g
  where g.kode_hash = p_kode_hash and g.brugt is null
$$;

alter function auth_passkey(text) owner to jhfs_auth;
alter function auth_session(bytea) owner to jhfs_auth;
alter function auth_engangskode(bytea) owner to jhfs_auth;
alter function auth_gendannelseskode(bytea) owner to jhfs_auth;

revoke all on function auth_passkey(text), auth_session(bytea), auth_engangskode(bytea), auth_gendannelseskode(bytea) from public;
grant execute on function auth_passkey(text), auth_session(bytea), auth_engangskode(bytea), auth_gendannelseskode(bytea) to jhfs_app;
