-- Eventi en la nube (Supabase)
-- Pega este script completo en Supabase → SQL Editor → New query → Run.
-- Se puede volver a correr: no borra datos.
--
-- Cada evento se guarda como un documento (jsonb) con un número de versión para que
-- dos personas guardando a la vez no se pisen. Las cuentas usan Supabase Auth y su
-- rol vive en `perfiles`. Los comprobantes van al bucket privado "comprobantes".

-- ─── Perfiles (una fila por cuenta) ─────────────────────────────────────────
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text not null default '',
  telefono text not null default '',
  rol text not null default 'participante' check (rol in ('admin', 'capturista', 'participante')),
  activo boolean not null default true,
  -- Capturista: eventos que puede trabajar; null = todos
  eventos text[],
  debe_cambiar_password boolean not null default false,
  creado date not null default current_date,
  notif_leidas_hasta text,
  notif_leidas text[] not null default '{}'
);

-- ─── Eventos ─────────────────────────────────────────────────────────────────
create table if not exists public.eventos (
  id text primary key,
  datos jsonb not null,
  version int not null default 1,
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);

-- ─── Ayudantes de permisos ───────────────────────────────────────────────────
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin' and activo)
$$;

-- Administrador, o capturista con ese evento asignado (o todos)
create or replace function public.es_staff_de(p_evento text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and activo
      and (rol = 'admin' or (rol = 'capturista' and (eventos is null or p_evento = any (eventos))))
  )
$$;

create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo and rol in ('admin', 'capturista'))
$$;

-- Últimos 10 dígitos de un teléfono (para vincular por WhatsApp)
create or replace function public.tel10(t text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 10
    then right(regexp_replace(t, '\D', '', 'g'), 10) end
$$;

-- Vincula a un participante con los registros de los eventos que tengan su mismo WhatsApp
create or replace function public.vincular_por_telefono(p_usuario uuid, p_tel text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := tel10(p_tel);
begin
  if t is null then return; end if;
  update eventos e set
    datos = jsonb_set(e.datos, '{personas}', coalesce((
      select jsonb_agg(case
        when coalesce(p->>'usuarioId', '') = '' and tel10(p->>'telefono') = t
        then p || jsonb_build_object('usuarioId', p_usuario::text) else p end order by n)
      from jsonb_array_elements(e.datos->'personas') with ordinality as x(p, n)), '[]'::jsonb)),
    version = e.version + 1, actualizado = now()
  where exists (
    select 1 from jsonb_array_elements(e.datos->'personas') p
    where coalesce(p->>'usuarioId', '') = '' and tel10(p->>'telefono') = t);
end $$;

-- ─── Al crear una cuenta: su perfil ──────────────────────────────────────────
-- La primera cuenta es el administrador; las demás entran como participantes
-- (el administrador les cambia el rol después).
create or replace function public.nuevo_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  perform pg_advisory_xact_lock(4242);
  primero := not exists (select 1 from perfiles);
  insert into perfiles (id, nombre, email, telefono, rol, debe_cambiar_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data->>'telefono', ''),
    case when primero then 'admin' else 'participante' end,
    coalesce((new.raw_user_meta_data->>'temporal')::boolean, false)
  );
  if not primero then perform vincular_por_telefono(new.id, new.raw_user_meta_data->>'telefono'); end if;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.nuevo_perfil();

-- Solo el administrador cambia rol, estado y eventos; y siempre queda un administrador activo
create or replace function public.cuidar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then
    new.rol := old.rol; new.activo := old.activo; new.eventos := old.eventos; new.email := old.email;
  end if;
  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from perfiles where id <> old.id and rol = 'admin' and activo) then
    raise exception 'Debe quedar al menos un administrador activo.';
  end if;
  return new;
end $$;

drop trigger if exists cuidar_perfil on public.perfiles;
create trigger cuidar_perfil before update on public.perfiles
  for each row execute function public.cuidar_perfil();

-- ─── Permisos por fila ───────────────────────────────────────────────────────
alter table public.perfiles enable row level security;
alter table public.eventos enable row level security;

drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select using (id = auth.uid() or es_admin());
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update using (id = auth.uid() or es_admin());

drop policy if exists eventos_ver on public.eventos;
create policy eventos_ver on public.eventos for select using (es_staff_de(id));
drop policy if exists eventos_crear on public.eventos;
create policy eventos_crear on public.eventos for insert with check (es_admin());
drop policy if exists eventos_editar on public.eventos;
create policy eventos_editar on public.eventos for update using (es_staff_de(id));
drop policy if exists eventos_borrar on public.eventos;
create policy eventos_borrar on public.eventos for delete using (es_admin());

-- ─── Participantes: solo ven lo suyo ─────────────────────────────────────────
-- Devuelve los eventos donde tiene registros, con únicamente sus registros y sus abonos.
create or replace function public.mis_eventos() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    e.datos
      || jsonb_build_object(
        'personas', (select coalesce(jsonb_agg(p), '[]') from jsonb_array_elements(e.datos->'personas') p
                     where p->>'usuarioId' = auth.uid()::text),
        'abonos', (select coalesce(jsonb_agg(a), '[]') from jsonb_array_elements(e.datos->'abonos') a
                   where a->>'personaId' in (select p->>'id' from jsonb_array_elements(e.datos->'personas') p
                                             where p->>'usuarioId' = auth.uid()::text)),
        'actividades', '[]'::jsonb, 'envios', '[]'::jsonb)
      || jsonb_build_object('_version', e.version)), '[]')
  from eventos e
  where exists (select 1 from perfiles where id = auth.uid() and activo)
    and exists (select 1 from jsonb_array_elements(e.datos->'personas') p where p->>'usuarioId' = auth.uid()::text)
$$;

-- Un participante envía un comprobante: queda por validar
create or replace function public.proponer_abono(p_evento text, p_abono jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Cuenta no válida.';
  end if;
  if not exists (
    select 1 from eventos e, jsonb_array_elements(e.datos->'personas') p
    where e.id = p_evento and p->>'id' = p_abono->>'personaId' and p->>'usuarioId' = auth.uid()::text
  ) then
    raise exception 'Ese registro no es tuyo.';
  end if;
  update eventos set
    datos = jsonb_set(datos, '{abonos}', jsonb_build_array(
      p_abono || jsonb_build_object('estado', 'pendiente', 'registradoPor', auth.uid()::text)) || (datos->'abonos')),
    version = version + 1, actualizado = now(), actualizado_por = auth.uid()
  where id = p_evento;
end $$;

revoke all on function public.vincular_por_telefono(uuid, text) from public, anon, authenticated;
grant execute on function public.mis_eventos() to authenticated;
grant execute on function public.proponer_abono(text, jsonb) to authenticated;

-- ─── Comprobantes (bucket privado) ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

drop policy if exists comprobantes_subir on storage.objects;
create policy comprobantes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes');
drop policy if exists comprobantes_ver on storage.objects;
create policy comprobantes_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and (owner = auth.uid() or public.es_staff()));
drop policy if exists comprobantes_borrar on storage.objects;
create policy comprobantes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'comprobantes' and public.es_admin());

-- ─── Cambios en vivo ─────────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.eventos;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.perfiles;
exception when duplicate_object then null; when undefined_object then null; end $$;
