#!/bin/bash
# Køres kun første gang databasen oprettes.
# Opretter programmets egen database-bruger (jhfs_web), som er medlem af jhfs_app og IKKE administrator.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v kode="$JHFS_WEB_KODE" <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'jhfs_app') then
    create role jhfs_app nologin;
  end if;
end
$$;
select format('create role jhfs_web login password %L in role jhfs_app', :'kode') \gexec
SQL
