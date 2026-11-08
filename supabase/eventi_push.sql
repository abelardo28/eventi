-- Eventi: avisos push (llegan aunque la app esté cerrada)
-- Corre este script DESPUÉS de eventi_nube.sql, en Supabase → SQL Editor → New query → Run.
-- Se puede volver a correr. Necesita la función "eventi-push" (supabase/functions/eventi-push).
--
-- Cómo funciona: cuando cambia un evento, la base compara los abonos de antes y de después
-- y deja en `push_cola` un aviso por cada persona a quien le toca enterarse. Luego llama a
-- la función eventi-push, que los manda a los dispositivos registrados en `push_suscripciones`.

create extension if not exists pg_net with schema extensions;

-- ─── Dispositivos que aceptaron avisos ───────────────────────────────────────
create table if not exists public.push_suscripciones (
  endpoint text primary key,
  usuario uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  creado timestamptz not null default now()
);
alter table public.push_suscripciones enable row level security;

-- ─── Avisos por mandar ───────────────────────────────────────────────────────
create table if not exists public.push_cola (
  id bigserial primary key,
  usuario uuid not null,
  titulo text not null,
  texto text not null default '',
  ruta text not null default '/notificaciones',
  etiqueta text,
  creado timestamptz not null default now(),
  enviado timestamptz
);
alter table public.push_cola enable row level security;

-- ─── Configuración: llaves de la función (las crea ella misma) y su dirección ─
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid jsonb,
  publica text,
  funcion text
);
alter table public.push_config enable row level security;
-- Sin políticas: solo la función (con su llave de servicio) lee estas tres tablas.

insert into public.push_config (id, funcion)
values (1, 'https://kymqjitszaekattsgcfb.supabase.co/functions/v1/eventi-push')
on conflict (id) do update set funcion = excluded.funcion;

-- ─── La app registra o quita este dispositivo ────────────────────────────────
create or replace function public.guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text) returns void
language sql security definer set search_path = public as $$
  insert into push_suscripciones (endpoint, usuario, p256dh, auth)
  select p_endpoint, auth.uid(), p_p256dh, p_auth where auth.uid() is not null
  on conflict (endpoint) do update set usuario = excluded.usuario, p256dh = excluded.p256dh, auth = excluded.auth, creado = now()
$$;

create or replace function public.quitar_suscripcion(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_suscripciones where endpoint = p_endpoint and usuario = auth.uid()
$$;

grant execute on function public.guardar_suscripcion(text, text, text), public.quitar_suscripcion(text) to authenticated;

-- ─── Qué avisar cuando cambia un evento ──────────────────────────────────────
create or replace function public.dinero(n numeric) returns text
language sql immutable as $$
  select '$' || case when n = trunc(n) then to_char(n, 'FM999,999,999,990') else to_char(n, 'FM999,999,999,990.00') end
$$;

create or replace function public.avisos_de_evento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a jsonb; v jsonb; p jsonb;
  quien uuid; dueno uuid; validador uuid;
  base text; ruta text; persona text;
  nuevos int := 0;
begin
  for a in select x from jsonb_array_elements(coalesce(new.datos->'abonos', '[]')) x loop
    v := null; p := null;
    select x into v from jsonb_array_elements(coalesce(old.datos->'abonos', '[]')) x where x->>'id' = a->>'id';
    if v is not null and coalesce(v->>'estado', 'validado') = coalesce(a->>'estado', 'validado') then continue; end if;
    if a->>'origen' = 'importado' then continue; end if;

    select x into p from jsonb_array_elements(coalesce(new.datos->'personas', '[]')) x where x->>'id' = a->>'personaId';
    if p is null then continue; end if;
    persona := p->>'nombre';
    dueno := nullif(p->>'usuarioId', '')::uuid;
    quien := nullif(a->>'registradoPor', '')::uuid;
    validador := nullif(a->>'validadoPor', '')::uuid;
    ruta := '/e/' || new.id || '/p/' || (p->>'id');
    base := dinero((a->>'monto')::numeric) || ' de ' || coalesce(
      (select c->>'nombre' from jsonb_array_elements(coalesce(new.datos->'conceptos', '[]')) c where c->>'id' = a->>'conceptoId'), 'un concepto');

    if v is null and a->>'estado' = 'pendiente' then
      -- Un participante envió un comprobante: al administrador y a los capturistas del evento
      insert into push_cola (usuario, titulo, texto, ruta, etiqueta)
      select f.id, persona || ' envió un comprobante', base || ' · falta validarlo', ruta, 'reg:' || (a->>'id')
      from perfiles f
      where f.activo and f.id is distinct from quien
        and (f.rol = 'admin' or (f.rol = 'capturista' and (f.eventos is null or new.id = any (f.eventos))));
      nuevos := nuevos + 1;

    elsif v is null and coalesce(a->>'estado', 'validado') = 'validado' and coalesce(a->>'metodo', '') <> 'Actividad' then
      -- Alguien del equipo registró un pago: al participante dueño del registro y a los administradores
      insert into push_cola (usuario, titulo, texto, ruta, etiqueta)
      select f.id,
        case when f.id = dueno then 'Se registró tu pago' else 'Se registró un pago' end,
        case when f.id = dueno then base || ' · ' || lower(coalesce(a->>'metodo', '')) else persona || ' · ' || base end,
        ruta, 'reg:' || (a->>'id')
      from perfiles f
      where f.activo and f.id is distinct from quien and (f.id = dueno or f.rol = 'admin');
      nuevos := nuevos + 1;

    elsif v is not null and a->>'estado' in ('validado', 'rechazado') and v->>'estado' = 'pendiente' then
      -- Se validó o rechazó un comprobante: al participante (y a quien lo envió, si fue otra persona)
      insert into push_cola (usuario, titulo, texto, ruta, etiqueta)
      select f.id,
        case when a->>'estado' = 'validado' then 'Tu pago fue validado' else 'Tu comprobante fue rechazado' end,
        case when a->>'estado' = 'validado' then base || ' ya cuenta en tu saldo'
             else base || ' · ' || coalesce(nullif(a->>'motivoRechazo', ''), 'sin motivo') || '. Puedes enviarlo de nuevo.' end,
        ruta, 'res:' || (a->>'id')
      from perfiles f
      where f.activo and f.id is distinct from validador and (f.id = dueno or f.id = quien);
      nuevos := nuevos + 1;
    end if;
  end loop;

  if nuevos > 0 then
    begin
      perform net.http_post(url := (select funcion from push_config where id = 1), body := '{}'::jsonb,
                            headers := '{"Content-Type": "application/json"}'::jsonb);
    exception when others then null; -- Sin pg_net o sin función: el aviso queda en la cola
    end;
  end if;
  return new;
end $$;

drop trigger if exists avisos_de_evento on public.eventos;
create trigger avisos_de_evento after update on public.eventos
  for each row when (old.datos->'abonos' is distinct from new.datos->'abonos')
  execute function public.avisos_de_evento();

revoke all on function public.avisos_de_evento(), public.dinero(numeric) from public, anon, authenticated;
