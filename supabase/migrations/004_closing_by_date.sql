-- Bestellschluss nur an den Markttagen (Datum -> Uhrzeit Marktende, Europe/Berlin)
update public.settings set closing = '{"2026-12-05":"21:00","2026-12-06":"18:00"}'::jsonb where id = 1;
alter table public.settings alter column closing set default '{}'::jsonb;
create or replace function public._closing_today() returns timestamptz
language plpgsql stable set search_path = public as $$
declare s public.settings; t text; d date := public._today();
begin
  select * into s from public.settings where id = 1;
  t := s.closing ->> d::text;
  if t is null or t !~ '^\d{1,2}:\d{2}$' then return null; end if;
  return ((d::text || ' ' || t)::timestamp) at time zone 'Europe/Berlin';
end $$;
revoke execute on function public._closing_today() from public, anon, authenticated;
