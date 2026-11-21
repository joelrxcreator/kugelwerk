-- Prozess-Verbesserungen
-- 1) Abholnummern laufen über den ganzen Markt durch (kein Neustart pro Tag -> keine doppelten Nummern Sa/So)
-- 2) Bezahlung auch nach Ablauf der Reservierung noch möglich (bis 4 Std.) – wer bezahlt hat, verliert nichts
-- 3) "Fertig" einer Druckplatte rückgängig machen
-- 4) Bestellschluss: keine Bestellungen, die erst nach Marktende fertig würden

alter table public.settings add column if not exists closing jsonb not null default '{"6":"21:00","0":"18:00"}'::jsonb;
-- Schlüssel = Wochentag (0 = Sonntag … 6 = Samstag), Wert = Uhrzeit Marktende (Europe/Berlin)

create or replace function public._next_number() returns int
language plpgsql set search_path = public as $$
declare nr int;
begin
  insert into public.day_counters(day, last) values (date '2000-01-01', 1)
    on conflict (day) do update set last = public.day_counters.last + 1
    returning last into nr;
  return nr;
end $$;

-- Marktende heute (oder null = kein Bestellschluss)
create or replace function public._closing_today() returns timestamptz
language plpgsql stable set search_path = public as $$
declare s public.settings; t text; d date := public._today();
begin
  select * into s from public.settings where id = 1;
  t := s.closing ->> extract(dow from d)::int::text;
  if t is null or t !~ '^\d{1,2}:\d{2}$' then return null; end if;
  return ((d::text || ' ' || t)::timestamp) at time zone 'Europe/Berlin';
end $$;

create or replace function public.public_info() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.settings; w1 timestamptz; cl timestamptz;
begin
  select * into s from public.settings where id = 1;
  w1 := public._schedule(1, false);
  cl := public._closing_today();
  return jsonb_build_object(
    'accepting', s.accepting,
    'sold_out', cl is not null and w1 > cl,
    'closing', cl,
    'price_single', s.price_single, 'price_bulk', s.price_bulk, 'bulk_from', s.bulk_from,
    'max_items', s.max_items, 'unpaid_ttl_min', s.unpaid_ttl_min,
    'variants', (select jsonb_agg(v) from jsonb_array_elements(s.variants) v where (v->>'active')::boolean),
    'wait_minutes', greatest(5, ceil(extract(epoch from (w1 - now()))/60)::int),
    'now', now()
  );
end $$;

create or replace function public.estimate(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e timestamptz; cl timestamptz;
begin
  e := public._schedule(least(greatest(p_count,1), 40), false);
  cl := public._closing_today();
  return jsonb_build_object('eta', e, 'minutes', greatest(5, ceil(extract(epoch from (e - now()))/60)::int),
                            'too_late', cl is not null and e > cl, 'closing', cl);
end $$;

-- Bestellschluss in create_order prüfen (Wrapper um die bestehende Logik)
create or replace function public.create_order(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.settings; tok text; oid uuid; n int; it jsonb; nm text; vr text; k int := 0; tot numeric; cl timestamptz;
begin
  select * into s from public.settings where id = 1;
  if not s.accepting then raise exception 'not_accepting'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'bad_items'; end if;
  n := jsonb_array_length(p_items);
  if n < 1 or n > s.max_items then raise exception 'bad_count'; end if;
  cl := public._closing_today();
  if cl is not null and public._schedule(n, false) > cl then raise exception 'sold_out'; end if;
  if (select count(*) from public.orders where status = 'unbezahlt'
      and created_at > now() - interval '10 minutes') >= 120 then
    raise exception 'busy';
  end if;
  tot := n * case when n >= s.bulk_from then s.price_bulk else s.price_single end;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into public.orders (token_hash, total, item_count) values (public._sha(tok), tot, n) returning id into oid;
  for it in select * from jsonb_array_elements(p_items) loop
    k := k + 1;
    nm := regexp_replace(btrim(coalesce(it->>'name','')), '\s+', ' ', 'g');
    vr := coalesce(it->>'variant','');
    if char_length(nm) < 1 or char_length(nm) > 16
       or nm !~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ'' .&-]+$' or nm !~ '[A-Za-zÀ-ÖØ-öø-ÿĀ-žẞ]' then
      raise exception 'bad_name:%', k;
    end if;
    if not exists (select 1 from jsonb_array_elements(s.variants) v where v->>'key' = vr and (v->>'active')::boolean) then
      raise exception 'bad_variant:%', k;
    end if;
    insert into public.items (order_id, pos, name, variant) values (oid, k, nm, vr);
  end loop;
  return jsonb_build_object('token', tok, 'order', public._order_json((select o from public.orders o where o.id = oid)));
end $$;

create or replace function public.confirm_payment(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; s public.settings; nr int;
begin
  perform public._expire_unpaid();
  select * into s from public.settings where id = 1;
  select * into o from public.orders where token_hash = public._sha(p_token) for update;
  if not found then raise exception 'not_found'; end if;
  -- verfallene Bestellungen dürfen bis 4 Std. nach dem Vormerken noch bezahlt werden
  if not (o.status = 'unbezahlt' or (o.status = 'verfallen' and o.created_at > now() - interval '4 hours')) then
    return public._order_json(o);
  end if;
  if o.pay_attempts >= 8 then raise exception 'locked'; end if;
  if btrim(coalesce(p_code,'')) <> s.pay_code then
    update public.orders set pay_attempts = pay_attempts + 1 where id = o.id;
    raise exception 'wrong_code';
  end if;
  nr := public._next_number();
  update public.orders set status = 'bezahlt', paid_at = now(), number = nr, day = public._today(), paid_by = 'code'
    where id = o.id;
  perform public._schedule(0, true);
  return public._order_json((select x from public.orders x where x.id = o.id));
end $$;

create or replace function public.lookup_number(p_number int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where number = p_number order by paid_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('number', o.number, 'status', o.status, 'eta', o.eta, 'item_count', o.item_count);
end $$;

create or replace function public.admin_set_order_status(p_session text, p_order uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; nr int;
begin
  perform public._check_session(p_session);
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;

  if p_status = 'bezahlt' and o.status in ('unbezahlt','verfallen') then
    nr := public._next_number();
    update public.orders set status = 'bezahlt', paid_at = now(), number = nr, day = public._today(), paid_by = 'backoffice'
      where id = o.id;
  elsif p_status = 'abgeholt' then
    update public.orders set status = 'abgeholt', picked_at = now() where id = o.id;
  elsif p_status = 'fertig' then
    update public.items set status = 'fertig' where order_id = o.id;
    update public.orders set status = 'fertig', ready_at = coalesce(ready_at, now()), picked_at = null where id = o.id;
  elsif p_status = 'storniert' then
    update public.items set status = 'wartet', plate_id = null where order_id = o.id and status = 'druck';
    update public.orders set status = 'storniert' where id = o.id;
  elsif p_status = 'zurueck' then
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

-- versehentlich "Fertig" geklickt -> Platte wieder in den Druck
create or replace function public.admin_reopen_plate(p_session text, p_plate uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._check_session(p_session);
  update public.plates set status = 'druck', finished_at = null where id = p_plate and status = 'fertig';
  update public.items set status = 'druck' where plate_id = p_plate and status = 'fertig';
  update public.orders o set status = 'bezahlt', ready_at = null
    where o.status = 'fertig' and exists (select 1 from public.items i where i.order_id = o.id and i.plate_id = p_plate);
  perform public._schedule(0, true);
end $$;

-- Backoffice-Liste: abgelaufene (letzte 4 Std.) mit anzeigen, damit man sie noch als bezahlt markieren kann
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
    'closing', public._closing_today(),
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
         or (o.status = 'verfallen' and o.created_at > now() - interval '4 hours')
         or (o.status in ('abgeholt','storniert') and coalesce(o.picked_at, o.paid_at, o.created_at) > now() - interval '18 hours')
    ), '[]'::jsonb),
    'plates', coalesce((select jsonb_agg(to_jsonb(p) order by p.started_at)
      from public.plates p where p.status = 'druck'
         or (p.status = 'fertig' and p.finished_at > now() - interval '3 hours')), '[]'::jsonb),
    'stats', jsonb_build_object(
      'today_orders', (select count(*) from public.orders where day = public._today() and status <> 'storniert'),
      'today_items',  (select coalesce(sum(item_count),0) from public.orders where day = public._today() and status <> 'storniert'),
      'today_revenue',(select coalesce(sum(total),0) from public.orders where day = public._today() and status <> 'storniert'))
  );
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
    closing        = coalesce(p_patch->'closing', closing),
    updated_at     = now()
  where id = 1;
  perform public._schedule(0, true);
end $$;

revoke execute on function public._next_number(), public._closing_today() from public, anon, authenticated;
grant execute on function public.admin_reopen_plate(text, uuid) to anon;
revoke execute on function public.admin_reopen_plate(text, uuid) from public, authenticated;
