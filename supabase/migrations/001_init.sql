-- Kugelwerk: Bestellungen für personalisierte Baumkugeln
-- Alle Tabellen sind per RLS gesperrt. Zugriff NUR über die Funktionen unten
-- (security definer). Kunden sehen nur Bestellungen, deren geheimen Schlüssel
-- sie besitzen; das Backoffice braucht eine Sitzung (Passwort-Login).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- Tabellen
create table public.settings (
  id               int primary key default 1 check (id = 1),
  pay_code         text not null,
  admin_pw_hash    text not null,
  printers         int  not null default 1 check (printers between 1 and 8),
  plate_minutes    int[] not null default '{19,32,45,57}',
  max_per_plate    int  not null default 4 check (max_per_plate between 1 and 12),
  extra_minutes    int  not null default 0,
  buffer_minutes   int  not null default 5,
  accepting        boolean not null default true,
  price_single     numeric(6,2) not null default 2.50,
  price_bulk       numeric(6,2) not null default 2.00,
  bulk_from        int  not null default 3,
  unpaid_ttl_min   int  not null default 30,
  max_items        int  not null default 10,
  variants         jsonb not null default '[
    {"key":"herzen","label":"Herzen","active":true},
    {"key":"sterne","label":"Sterne","active":true},
    {"key":"glanzsterne","label":"Glanzsterne","active":true},
    {"key":"schneeflocken","label":"Schneeflocken","active":true},
    {"key":"pfoten","label":"Pfoten","active":true}
  ]'::jsonb,
  updated_at       timestamptz not null default now()
);

create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  status       text not null default 'unbezahlt'
               check (status in ('unbezahlt','bezahlt','fertig','abgeholt','storniert','verfallen')),
  number       int,
  day          date,
  total        numeric(7,2) not null,
  item_count   int not null,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz,
  ready_at     timestamptz,
  picked_at    timestamptz,
  eta          timestamptz,
  pay_attempts int not null default 0,
  paid_by      text            -- 'code' | 'backoffice'
);
create index orders_status_idx on public.orders(status);
create unique index orders_day_number_idx on public.orders(day, number) where number is not null;

create table public.plates (
  id          uuid primary key default gen_random_uuid(),
  printer     int  not null default 1,
  status      text not null default 'druck' check (status in ('druck','fertig','abgebrochen')),
  minutes     int  not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  file_url    text            -- Stufe 2: erzeugte 3MF/STL
);

create table public.items (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references public.orders(id) on delete cascade,
  pos       int  not null,
  name      text not null,
  variant   text not null,
  status    text not null default 'wartet' check (status in ('wartet','druck','fertig')),
  plate_id  uuid references public.plates(id) on delete set null,
  est_end   timestamptz
);
create index items_order_idx on public.items(order_id);
create index items_status_idx on public.items(status);

create table public.day_counters (
  day  date primary key,
  last int not null default 0
);

create table public.admin_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.admin_login_attempts (
  at timestamptz not null default now()
);

alter table public.settings             enable row level security;
alter table public.orders               enable row level security;
alter table public.plates               enable row level security;
alter table public.items                enable row level security;
alter table public.day_counters         enable row level security;
alter table public.admin_sessions       enable row level security;
alter table public.admin_login_attempts enable row level security;
revoke all on all tables in schema public from anon, authenticated;

-- Startwerte (Code + Passwort werden danach separat gesetzt, nie im Repo)
insert into public.settings (pay_code, admin_pw_hash)
values (lpad((floor(random()*9000)+1000)::int::text, 4, '0'),
        extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')));

-- ---------------------------------------------------------------- Hilfen
create or replace function public._sha(p text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(coalesce(p,''), 'sha256'), 'hex')
$$;

create or replace function public._plate_min(n int) returns int
language sql stable set search_path = public as $$
  select coalesce(s.plate_minutes[least(greatest(n,1), array_length(s.plate_minutes,1))], 20)
  from public.settings s where s.id = 1
$$;

create or replace function public._today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Berlin')::date $$;

create or replace function public._expire_unpaid() returns void
language sql set search_path = public as $$
  update public.orders o set status = 'verfallen'
  where o.status = 'unbezahlt'
    and o.created_at < now() - make_interval(mins => (select unpaid_ttl_min from public.settings where id = 1));
$$;

-- Plant alle wartenden Kugeln auf die Drucker (FIFO, Platten bis max_per_plate)
-- und schreibt die geschätzte Fertigzeit pro Kugel + Bestellung.
-- p_extra > 0: gibt zurück, wann eine NEUE Bestellung mit so vielen Kugeln fertig wäre.
create or replace function public._schedule(p_extra int default 0, p_write boolean default true)
returns timestamptz
language plpgsql set search_path = public as $$
declare
  s        public.settings;
  free     timestamptz[];
  p        record;
  it       record;
  idx      int;
  best     int;
  chunk    uuid[] := '{}';
  st       timestamptz;
  en       timestamptz;
  extra_left int := greatest(p_extra, 0);
  extra_end  timestamptz := null;
  n        int;
begin
  select * into s from public.settings where id = 1;
  free := array_fill(now(), array[s.printers]);

  for p in select * from public.plates where status = 'druck' order by started_at loop
    idx := least(greatest(p.printer, 1), s.printers);
    en  := greatest(p.started_at + make_interval(mins => p.minutes), now() + interval '2 minutes');
    free[idx] := greatest(free[idx], en);
    if p_write then
      update public.items set est_end = en where plate_id = p.id and status = 'druck';
    end if;
  end loop;

  -- wartende Kugeln in Reihenfolge der Bezahlung
  for it in
    select i.id from public.items i join public.orders o on o.id = i.order_id
    where i.status = 'wartet' and o.status = 'bezahlt'
    order by o.paid_at, o.id, i.pos
  loop
    chunk := chunk || it.id;
    if array_length(chunk,1) >= s.max_per_plate then
      best := 1;
      for idx in 1..s.printers loop if free[idx] < free[best] then best := idx; end if; end loop;
      en := free[best] + make_interval(mins => public._plate_min(array_length(chunk,1)));
      free[best] := en;
      if p_write then update public.items set est_end = en where id = any(chunk); end if;
      chunk := '{}';
    end if;
  end loop;

  -- Rest-Platte zusammen mit der hypothetischen neuen Bestellung planen
  loop
    n := coalesce(array_length(chunk,1),0);
    exit when n = 0 and extra_left = 0;
    while n < s.max_per_plate and extra_left > 0 loop
      n := n + 1; extra_left := extra_left - 1;
    end loop;
    best := 1;
    for idx in 1..s.printers loop if free[idx] < free[best] then best := idx; end if; end loop;
    en := free[best] + make_interval(mins => public._plate_min(n));
    free[best] := en;
    if p_write and coalesce(array_length(chunk,1),0) > 0 then
      update public.items set est_end = en where id = any(chunk);
    end if;
    if n > coalesce(array_length(chunk,1),0) then extra_end := en; end if;
    chunk := '{}';
  end loop;

  if p_write then
    update public.orders o set eta = sub.e
    from (
      select i.order_id, max(coalesce(i.est_end, now()))
               + make_interval(mins => s.buffer_minutes + s.extra_minutes) as e
      from public.items i join public.orders o2 on o2.id = i.order_id
      where o2.status = 'bezahlt'
      group by i.order_id
    ) sub
    where o.id = sub.order_id and o.eta is distinct from sub.e;
  end if;

  if extra_end is not null then
    return extra_end + make_interval(mins => s.buffer_minutes + s.extra_minutes);
  end if;
  return null;
end $$;

create or replace function public._check_session(p_session text) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.admin_sessions
                 where token_hash = public._sha(p_session) and expires_at > now()) then
    raise exception 'not_authorized' using errcode = '28000';
  end if;
end $$;

-- JSON einer Bestellung für Kunden
create or replace function public._order_json(o public.orders) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'number', o.number, 'total', o.total,
    'created_at', o.created_at, 'paid_at', o.paid_at, 'ready_at', o.ready_at,
    'picked_at', o.picked_at, 'eta', o.eta,
    'expires_at', o.created_at + make_interval(mins => (select unpaid_ttl_min from public.settings where id=1)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'name', i.name, 'variant', i.variant, 'status', i.status,
                'started_at', pl.started_at, 'minutes', pl.minutes) order by i.pos)
              from public.items i left join public.plates pl on pl.id = i.plate_id
              where i.order_id = o.id), '[]'::jsonb),
    -- wie viele Kugeln anderer Kunden noch vor dieser Bestellung warten
    'ahead', case when o.status = 'bezahlt' then
       (select count(*) from public.items i2 join public.orders o3 on o3.id = i2.order_id
        where i2.status = 'wartet' and o3.status = 'bezahlt'
          and (o3.paid_at, o3.id) < (o.paid_at, o.id)) else 0 end
  )
$$;

-- ---------------------------------------------------------------- Kunden-API
create or replace function public.public_info() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.settings; w1 timestamptz;
begin
  select * into s from public.settings where id = 1;
  w1 := public._schedule(1, false);
  return jsonb_build_object(
    'accepting', s.accepting,
    'price_single', s.price_single, 'price_bulk', s.price_bulk, 'bulk_from', s.bulk_from,
    'max_items', s.max_items, 'unpaid_ttl_min', s.unpaid_ttl_min,
    'variants', (select jsonb_agg(v) from jsonb_array_elements(s.variants) v where (v->>'active')::boolean),
    'wait_minutes', greatest(5, ceil(extract(epoch from (w1 - now()))/60)::int),
    'now', now()
  );
end $$;

create or replace function public.estimate(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e timestamptz;
begin
  e := public._schedule(least(greatest(p_count,1), 40), false);
  return jsonb_build_object('eta', e, 'minutes', greatest(5, ceil(extract(epoch from (e - now()))/60)::int));
end $$;

create or replace function public.create_order(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s      public.settings;
  tok    text;
  oid    uuid;
  n      int;
  it     jsonb;
  nm     text;
  vr     text;
  k      int := 0;
  tot    numeric;
begin
  select * into s from public.settings where id = 1;
  if not s.accepting then raise exception 'not_accepting'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'bad_items'; end if;
  n := jsonb_array_length(p_items);
  if n < 1 or n > s.max_items then raise exception 'bad_count'; end if;

  -- Schutz gegen Überflutung: max. 120 offene Bestellungen in 10 Minuten
  if (select count(*) from public.orders where status = 'unbezahlt'
      and created_at > now() - interval '10 minutes') >= 120 then
    raise exception 'busy';
  end if;

  tot := n * case when n >= s.bulk_from then s.price_bulk else s.price_single end;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into public.orders (token_hash, total, item_count)
  values (public._sha(tok), tot, n) returning id into oid;

  for it in select * from jsonb_array_elements(p_items) loop
    k  := k + 1;
    nm := regexp_replace(btrim(coalesce(it->>'name','')), '\s+', ' ', 'g');
    vr := coalesce(it->>'variant','');
    if char_length(nm) < 1 or char_length(nm) > 16
       or nm !~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ'' .&-]+$' or nm !~ '[A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ]' then
      raise exception 'bad_name:%', k;
    end if;
    if not exists (select 1 from jsonb_array_elements(s.variants) v
                   where v->>'key' = vr and (v->>'active')::boolean) then
      raise exception 'bad_variant:%', k;
    end if;
    insert into public.items (order_id, pos, name, variant) values (oid, k, nm, vr);
  end loop;

  return jsonb_build_object('token', tok, 'order',
           public._order_json((select o from public.orders o where o.id = oid)));
end $$;

create or replace function public.get_orders(p_tokens text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._expire_unpaid();
  if coalesce(array_length(p_tokens,1),0) > 30 then raise exception 'too_many'; end if;
  return coalesce((
    select jsonb_agg(public._order_json(o) || jsonb_build_object('token', t) order by o.created_at desc)
    from unnest(p_tokens) t join public.orders o on o.token_hash = public._sha(t)
  ), '[]'::jsonb);
end $$;

create or replace function public.confirm_payment(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; s public.settings; nr int; d date;
begin
  perform public._expire_unpaid();
  select * into s from public.settings where id = 1;
  select * into o from public.orders where token_hash = public._sha(p_token) for update;
  if not found then raise exception 'not_found'; end if;
  if o.status <> 'unbezahlt' then
    return public._order_json(o);   -- schon bezahlt (oder verfallen): einfach Stand zurückgeben
  end if;
  if o.pay_attempts >= 8 then raise exception 'locked'; end if;
  if btrim(coalesce(p_code,'')) <> s.pay_code then
    update public.orders set pay_attempts = pay_attempts + 1 where id = o.id;
    raise exception 'wrong_code';
  end if;
  d := public._today();
  insert into public.day_counters(day, last) values (d, 1)
    on conflict (day) do update set last = public.day_counters.last + 1
    returning last into nr;
  update public.orders set status = 'bezahlt', paid_at = now(), number = nr, day = d, paid_by = 'code'
    where id = o.id;
  perform public._schedule(0, true);
  return public._order_json((select x from public.orders x where x.id = o.id));
end $$;

create or replace function public.cancel_order(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'storniert'
  where token_hash = public._sha(p_token) and status = 'unbezahlt';
  return found;
end $$;

create or replace function public.lookup_number(p_number int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where day = public._today() and number = p_number;
  if not found then return null; end if;
  return jsonb_build_object('number', o.number, 'status', o.status, 'eta', o.eta, 'item_count', o.item_count);
end $$;

-- ---------------------------------------------------------------- Backoffice-API
create or replace function public.admin_login(p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  delete from public.admin_login_attempts where at < now() - interval '15 minutes';
  if (select count(*) from public.admin_login_attempts) >= 10 then raise exception 'too_many_attempts'; end if;
  if not exists (select 1 from public.settings where id = 1
                 and admin_pw_hash = extensions.crypt(coalesce(p_password,''), admin_pw_hash)) then
    insert into public.admin_login_attempts default values;
    raise exception 'wrong_password';
  end if;
  tok := encode(gen_random_bytes(32), 'hex');
  delete from public.admin_sessions where expires_at < now();
  insert into public.admin_sessions(token_hash, expires_at) values (public._sha(tok), now() + interval '60 days');
  return tok;
end $$;

create or replace function public.admin_logout(p_session text) returns void
language sql security definer set search_path = public as $$
  delete from public.admin_sessions where token_hash = public._sha(p_session);
$$;

create or replace function public.admin_state(p_session text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.settings;
begin
  perform public._check_session(p_session);
  perform public._expire_unpaid();
  perform public._schedule(0, true);
  select * into s from public.settings where id = 1;
  return jsonb_build_object(
    'now', now(),
    'settings', to_jsonb(s) - 'admin_pw_hash',
    'wait_minutes', greatest(5, ceil(extract(epoch from (public._schedule(1,false) - now()))/60)::int),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'status', o.status, 'number', o.number, 'day', o.day, 'total', o.total,
        'item_count', o.item_count, 'created_at', o.created_at, 'paid_at', o.paid_at,
        'ready_at', o.ready_at, 'picked_at', o.picked_at, 'eta', o.eta, 'paid_by', o.paid_by,
        'items', (select jsonb_agg(jsonb_build_object('id', i.id, 'pos', i.pos, 'name', i.name,
                    'variant', i.variant, 'status', i.status, 'plate_id', i.plate_id, 'est_end', i.est_end)
                    order by i.pos) from public.items i where i.order_id = o.id)
      ) order by coalesce(o.paid_at, o.created_at))
      from public.orders o
      where o.status in ('unbezahlt','bezahlt','fertig')
         or (o.status in ('abgeholt','storniert') and coalesce(o.picked_at, o.paid_at, o.created_at) > now() - interval '18 hours')
    ), '[]'::jsonb),
    'plates', coalesce((select jsonb_agg(to_jsonb(p) order by p.started_at)
      from public.plates p where p.status = 'druck'
         or (p.status = 'fertig' and p.finished_at > now() - interval '3 hours')), '[]'::jsonb),
    'stats', jsonb_build_object(
      'today_orders', (select count(*) from public.orders where day = public._today()),
      'today_items',  (select coalesce(sum(item_count),0) from public.orders where day = public._today() and status <> 'storniert'),
      'today_revenue',(select coalesce(sum(total),0) from public.orders where day = public._today() and status <> 'storniert'))
  );
end $$;

create or replace function public.admin_start_plate(p_session text, p_item_ids uuid[], p_printer int default 1)
returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; n int;
begin
  perform public._check_session(p_session);
  select count(*) into n from public.items i join public.orders o on o.id = i.order_id
    where i.id = any(p_item_ids) and i.status = 'wartet' and o.status = 'bezahlt';
  if n = 0 then raise exception 'no_items'; end if;
  insert into public.plates(printer, minutes) values (greatest(p_printer,1), public._plate_min(n)) returning id into pid;
  update public.items i set status = 'druck', plate_id = pid
    from public.orders o
    where o.id = i.order_id and i.id = any(p_item_ids) and i.status = 'wartet' and o.status = 'bezahlt';
  perform public._schedule(0, true);
  return pid;
end $$;

create or replace function public.admin_finish_plate(p_session text, p_plate uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_session(p_session);
  update public.plates set status = 'fertig', finished_at = now() where id = p_plate and status = 'druck';
  update public.items set status = 'fertig', est_end = now() where plate_id = p_plate and status = 'druck';
  update public.orders o set status = 'fertig', ready_at = now()
    where o.status = 'bezahlt'
      and not exists (select 1 from public.items i where i.order_id = o.id and i.status <> 'fertig');
  perform public._schedule(0, true);
end $$;

create or replace function public.admin_cancel_plate(p_session text, p_plate uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_session(p_session);
  update public.plates set status = 'abgebrochen', finished_at = now() where id = p_plate and status = 'druck';
  update public.items set status = 'wartet', plate_id = null where plate_id = p_plate and status = 'druck';
  perform public._schedule(0, true);
end $$;

create or replace function public.admin_set_plate_minutes(p_session text, p_plate uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_session(p_session);
  update public.plates set minutes = greatest(1, least(p_minutes, 600)) where id = p_plate;
  perform public._schedule(0, true);
end $$;

create or replace function public.admin_set_order_status(p_session text, p_order uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; nr int; d date;
begin
  perform public._check_session(p_session);
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;

  if p_status = 'bezahlt' and o.status in ('unbezahlt','verfallen') then
    d := public._today();
    insert into public.day_counters(day, last) values (d, 1)
      on conflict (day) do update set last = public.day_counters.last + 1 returning last into nr;
    update public.orders set status = 'bezahlt', paid_at = now(), number = nr, day = d, paid_by = 'backoffice'
      where id = o.id;
  elsif p_status = 'abgeholt' then
    update public.orders set status = 'abgeholt', picked_at = now() where id = o.id;
  elsif p_status = 'fertig' then
    update public.items set status = 'fertig' where order_id = o.id;
    update public.orders set status = 'fertig', ready_at = coalesce(ready_at, now()), picked_at = null where id = o.id;
  elsif p_status = 'storniert' then
    update public.items set status = 'wartet', plate_id = null where order_id = o.id and status = 'druck';
    update public.orders set status = 'storniert' where id = o.id;
  elsif p_status = 'zurueck' then  -- versehentlich "abgeholt"/"storniert" rückgängig
    if o.paid_at is null then
      update public.orders set status = 'unbezahlt', created_at = now() where id = o.id;
    elsif exists (select 1 from public.items where order_id = o.id and status <> 'fertig') then
      update public.orders set status = 'bezahlt', picked_at = null where id = o.id;
    else
      update public.orders set status = 'fertig', picked_at = null where id = o.id;
    end if;
  else
    raise exception 'bad_status';
  end if;
  perform public._schedule(0, true);
end $$;

create or replace function public.admin_update_item(p_session text, p_item uuid, p_name text, p_variant text)
returns void
language plpgsql security definer set search_path = public as $$
declare nm text := regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g');
begin
  perform public._check_session(p_session);
  if char_length(nm) < 1 or char_length(nm) > 24 then raise exception 'bad_name'; end if;
  update public.items set name = nm, variant = coalesce(nullif(p_variant,''), variant) where id = p_item;
end $$;

create or replace function public.admin_update_settings(p_session text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_session(p_session);
  update public.settings set
    pay_code       = coalesce(nullif(regexp_replace(p_patch->>'pay_code','\D','','g'),''), pay_code),
    printers       = coalesce((p_patch->>'printers')::int, printers),
    plate_minutes  = coalesce((select array_agg(greatest(1,least(600,(x)::int))) from jsonb_array_elements_text(p_patch->'plate_minutes') x), plate_minutes),
    max_per_plate  = coalesce((p_patch->>'max_per_plate')::int, max_per_plate),
    extra_minutes  = coalesce((p_patch->>'extra_minutes')::int, extra_minutes),
    buffer_minutes = coalesce((p_patch->>'buffer_minutes')::int, buffer_minutes),
    accepting      = coalesce((p_patch->>'accepting')::boolean, accepting),
    price_single   = coalesce((p_patch->>'price_single')::numeric, price_single),
    price_bulk     = coalesce((p_patch->>'price_bulk')::numeric, price_bulk),
    bulk_from      = coalesce((p_patch->>'bulk_from')::int, bulk_from),
    unpaid_ttl_min = coalesce((p_patch->>'unpaid_ttl_min')::int, unpaid_ttl_min),
    max_items      = coalesce((p_patch->>'max_items')::int, max_items),
    variants       = coalesce(p_patch->'variants', variants),
    updated_at     = now()
  where id = 1;
  perform public._schedule(0, true);
end $$;

create or replace function public.admin_change_password(p_session text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._check_session(p_session);
  if char_length(coalesce(p_new,'')) < 8 then raise exception 'too_short'; end if;
  update public.settings set admin_pw_hash = extensions.crypt(p_new, extensions.gen_salt('bf'))
    where id = 1 and admin_pw_hash = extensions.crypt(coalesce(p_old,''), admin_pw_hash);
  if not found then raise exception 'wrong_password'; end if;
  delete from public.admin_sessions where token_hash <> public._sha(p_session);
end $$;

-- Datenschutz: abgeschlossene Bestellungen (abgeholt/storniert/verfallen) endgültig löschen
create or replace function public.admin_purge(p_session text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._check_session(p_session);
  delete from public.orders where status in ('abgeholt','storniert','verfallen');
  get diagnostics n = row_count;
  delete from public.plates p where p.status <> 'druck'
    and not exists (select 1 from public.items i where i.plate_id = p.id);
  return n;
end $$;

-- ---------------------------------------------------------------- Rechte
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.public_info(), public.estimate(int), public.create_order(jsonb), public.get_orders(text[]),
  public.confirm_payment(text,text), public.cancel_order(text), public.lookup_number(int),
  public.admin_login(text), public.admin_logout(text), public.admin_state(text),
  public.admin_start_plate(text,uuid[],int), public.admin_finish_plate(text,uuid),
  public.admin_cancel_plate(text,uuid), public.admin_set_plate_minutes(text,uuid,int),
  public.admin_set_order_status(text,uuid,text), public.admin_update_item(text,uuid,text,text),
  public.admin_update_settings(text,jsonb), public.admin_change_password(text,text,text),
  public.admin_purge(text)
to anon;
