-- Eventi en la nube (Supabase)
-- Pega este script completo en Supabase → SQL Editor → New query → Run.
-- Se puede volver a correr: no borra datos. Después corre también eventi_push.sql.
--
-- Cada cuenta que se registra sola crea su propia ORGANIZACIÓN y queda como su administrador.
-- Todo (eventos, personas, abonos, usuarios) pertenece a una organización y nadie ve lo de otra.
-- Los usuarios que da de alta un administrador entran a SU organización mediante una invitación.
--
-- Cada evento se guarda como un documento (jsonb) con un número de versión para que dos
-- personas guardando a la vez no se pisen. Los comprobantes van al bucket privado "comprobantes",
-- en carpetas con el id del evento.

-- ─── Organizaciones ──────────────────────────────────────────────────────────
create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default '',
  creado timestamptz not null default now()
);

-- ─── Perfiles (una fila por cuenta) ─────────────────────────────────────────
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text not null default '',
  telefono text not null default '',
  rol text not null default 'participante',
  activo boolean not null default true,
  -- Capturista y auditor: eventos asignados; null = todos
  eventos text[],
  debe_cambiar_password boolean not null default false,
  creado date not null default current_date,
  notif_leidas_hasta text,
  notif_leidas text[] not null default '{}'
);
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('admin', 'capturista', 'auditor', 'participante'));
alter table public.perfiles add column if not exists org uuid references public.organizaciones(id) on delete cascade;

-- ─── Eventos ─────────────────────────────────────────────────────────────────
create table if not exists public.eventos (
  id text primary key,
  datos jsonb not null,
  version int not null default 1,
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);
alter table public.eventos add column if not exists org uuid references public.organizaciones(id) on delete cascade;

-- Lo que ya existía antes de las organizaciones queda junto en una sola
do $$
declare o uuid;
begin
  if exists (select 1 from perfiles where org is null) or exists (select 1 from eventos where org is null) then
    select id into o from organizaciones order by creado limit 1;
    if o is null then insert into organizaciones (nombre) values ('Mi organización') returning id into o; end if;
    update perfiles set org = o where org is null;
    update eventos set org = o where org is null;
  end if;
end $$;
alter table public.perfiles alter column org set not null;
alter table public.eventos alter column org set not null;
create index if not exists perfiles_org on public.perfiles (org);
create index if not exists eventos_org on public.eventos (org);

-- ─── Invitaciones: así entra alguien a una organización que ya existe ───────
create table if not exists public.invitaciones (
  token uuid primary key default gen_random_uuid(),
  org uuid not null references public.organizaciones(id) on delete cascade,
  email text not null,
  rol text not null check (rol in ('admin', 'capturista', 'auditor', 'participante')),
  eventos text[],
  temporal boolean not null default false,
  creado timestamptz not null default now(),
  usada timestamptz
);

-- ─── Ayudantes de permisos ───────────────────────────────────────────────────
-- La organización de quien está usando la app
create or replace function public.mi_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org from perfiles where id = auth.uid() and activo
$$;
alter table public.eventos alter column org set default public.mi_org();

-- Administrador (de su propia organización)
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin' and activo)
$$;

-- Puede cambiar un evento: administrador, o capturista con ese evento asignado (o todos), de la misma organización
create or replace function public.es_staff_de(p_evento text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles f join eventos e on e.id = p_evento and e.org = f.org
    where f.id = auth.uid() and f.activo
      and (f.rol = 'admin' or (f.rol = 'capturista' and (f.eventos is null or p_evento = any (f.eventos))))
  )
$$;

-- Puede ver un evento completo: el equipo que lo trabaja y el auditor (solo lectura), de la misma organización
create or replace function public.es_lector_de(p_evento text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles f join eventos e on e.id = p_evento and e.org = f.org
    where f.id = auth.uid() and f.activo
      and (f.rol = 'admin' or (f.rol in ('capturista', 'auditor') and (f.eventos is null or p_evento = any (f.eventos))))
  )
$$;

-- Participante con un registro en ese evento
create or replace function public.participa_en(p_evento text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from eventos e, jsonb_array_elements(e.datos->'personas') p
    where e.id = p_evento and e.org = mi_org() and p->>'usuarioId' = auth.uid()::text
  )
$$;

-- Ese id de evento todavía no existe en ninguna organización (mira más allá de lo que uno puede ver)
create or replace function public.evento_libre(p_evento text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from eventos where id = p_evento)
$$;

create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo and rol in ('admin', 'capturista', 'auditor'))
$$;

-- Últimos 10 dígitos de un teléfono (para vincular por WhatsApp)
create or replace function public.tel10(t text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 10
    then right(regexp_replace(t, '\D', '', 'g'), 10) end
$$;

-- Vincula a un participante con los registros que tengan su mismo WhatsApp, solo dentro de su organización
create or replace function public.vincular_por_telefono(p_usuario uuid, p_tel text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := tel10(p_tel); o uuid := (select org from perfiles where id = p_usuario);
begin
  if t is null or o is null then return; end if;
  update eventos e set
    datos = jsonb_set(e.datos, '{personas}', coalesce((
      select jsonb_agg(case
        when coalesce(p->>'usuarioId', '') = '' and tel10(p->>'telefono') = t
        then p || jsonb_build_object('usuarioId', p_usuario::text) else p end order by n)
      from jsonb_array_elements(e.datos->'personas') with ordinality as x(p, n)), '[]'::jsonb)),
    version = e.version + 1, actualizado = now()
  where e.org = o and exists (
    select 1 from jsonb_array_elements(e.datos->'personas') p
    where coalesce(p->>'usuarioId', '') = '' and tel10(p->>'telefono') = t);
end $$;

-- El administrador prepara la entrada de un usuario nuevo a su organización
create or replace function public.crear_invitacion(p_email text, p_rol text, p_eventos text[], p_temporal boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not es_admin() then raise exception 'Solo el administrador puede crear usuarios.'; end if;
  insert into invitaciones (org, email, rol, eventos, temporal)
  values (mi_org(), lower(trim(p_email)), p_rol, case when p_rol in ('capturista', 'auditor') then p_eventos end, coalesce(p_temporal, false))
  returning token into t;
  return t;
end $$;

-- ─── Al crear una cuenta: su perfil ──────────────────────────────────────────
-- Con una invitación válida (mismo correo, sin usar, de los últimos 7 días) entra a esa organización
-- con el rol que le dieron. Sin invitación, se crea una organización nueva y la cuenta es su administrador.
create or replace function public.nuevo_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invitaciones;
  o uuid;
  nombre text := coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''), split_part(new.email, '@', 1));
  tel text := coalesce(new.raw_user_meta_data->>'telefono', '');
begin
  select * into inv from invitaciones
  where token::text = coalesce(new.raw_user_meta_data->>'invitacion', '')
    and email = lower(coalesce(new.email, '')) and usada is null and creado > now() - interval '7 days';
  if found then
    update invitaciones set usada = now() where token = inv.token;
    insert into perfiles (id, org, nombre, email, telefono, rol, eventos, debe_cambiar_password)
    values (new.id, inv.org, nombre, lower(coalesce(new.email, '')), tel, inv.rol, inv.eventos, inv.temporal);
    if inv.rol = 'participante' then perform vincular_por_telefono(new.id, tel); end if;
  else
    insert into organizaciones (nombre)
    values (coalesce(nullif(trim(new.raw_user_meta_data->>'organizacion'), ''), nombre))
    returning id into o;
    insert into perfiles (id, org, nombre, email, telefono, rol)
    values (new.id, o, nombre, lower(coalesce(new.email, '')), tel, 'admin');
  end if;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.nuevo_perfil();

-- Solo el administrador de la organización cambia rol, estado y eventos; nadie cambia de organización;
-- y cada organización conserva al menos un administrador activo
create or replace function public.cuidar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.org := old.org; new.id := old.id;
  if not (es_admin() and old.org = mi_org()) then
    new.rol := old.rol; new.activo := old.activo; new.eventos := old.eventos; new.email := old.email;
  end if;
  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from perfiles where id <> old.id and org = old.org and rol = 'admin' and activo) then
    raise exception 'Debe quedar al menos un administrador activo.';
  end if;
  return new;
end $$;

drop trigger if exists cuidar_perfil on public.perfiles;
create trigger cuidar_perfil before update on public.perfiles
  for each row execute function public.cuidar_perfil();

-- ─── Permisos por fila ───────────────────────────────────────────────────────
alter table public.organizaciones enable row level security;
alter table public.perfiles enable row level security;
alter table public.eventos enable row level security;
alter table public.invitaciones enable row level security; -- sin políticas: solo las funciones la usan

drop policy if exists org_ver on public.organizaciones;
create policy org_ver on public.organizaciones for select using (id = mi_org());
drop policy if exists org_editar on public.organizaciones;
create policy org_editar on public.organizaciones for update using (id = mi_org() and es_admin()) with check (id = mi_org());

drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select using (id = auth.uid() or (es_admin() and org = mi_org()));
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update using (id = auth.uid() or (es_admin() and org = mi_org()));

drop policy if exists eventos_ver on public.eventos;
create policy eventos_ver on public.eventos for select using (es_lector_de(id));
drop policy if exists eventos_crear on public.eventos;
create policy eventos_crear on public.eventos for insert with check (es_admin() and org = mi_org());
drop policy if exists eventos_editar on public.eventos;
create policy eventos_editar on public.eventos for update using (es_staff_de(id)) with check (org = mi_org());
drop policy if exists eventos_borrar on public.eventos;
create policy eventos_borrar on public.eventos for delete using (es_admin() and org = mi_org());

-- ─── Participantes: solo ven lo suyo ─────────────────────────────────────────
-- Devuelve los eventos de su organización donde tiene registros, con únicamente sus registros y sus abonos.
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
  where e.org = mi_org()
    and exists (select 1 from jsonb_array_elements(e.datos->'personas') p where p->>'usuarioId' = auth.uid()::text)
$$;

-- Un participante envía un comprobante: queda por validar
create or replace function public.proponer_abono(p_evento text, p_abono jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if mi_org() is null then raise exception 'Cuenta no válida.'; end if;
  if not exists (
    select 1 from eventos e, jsonb_array_elements(e.datos->'personas') p
    where e.id = p_evento and e.org = mi_org() and p->>'id' = p_abono->>'personaId' and p->>'usuarioId' = auth.uid()::text
  ) then
    raise exception 'Ese registro no es tuyo.';
  end if;
  update eventos set
    datos = jsonb_set(datos, '{abonos}', jsonb_build_array(
      p_abono || jsonb_build_object('estado', 'pendiente', 'registradoPor', auth.uid()::text)) || (datos->'abonos')),
    version = version + 1, actualizado = now(), actualizado_por = auth.uid()
  where id = p_evento;
end $$;

-- ─── Acceso de la app (los proyectos nuevos de Supabase no lo dan solo) ────
grant usage on schema public to anon, authenticated;
grant select, update on public.organizaciones to authenticated;
grant select, update on public.perfiles to authenticated;
grant select, insert, update, delete on public.eventos to authenticated;
grant execute on function public.mi_org(), public.es_admin(), public.es_staff_de(text), public.es_lector_de(text),
  public.participa_en(text), public.evento_libre(text), public.es_staff(), public.tel10(text), public.mis_eventos(), public.proponer_abono(text, jsonb),
  public.crear_invitacion(text, text, text[], boolean) to authenticated;
revoke all on function public.vincular_por_telefono(uuid, text) from public, anon, authenticated;

-- ─── Comprobantes (bucket privado, una carpeta por evento) ───────────────────
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

drop policy if exists comprobantes_subir on storage.objects;
create policy comprobantes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and (
    public.es_staff_de(split_part(name, '/', 1)) or public.participa_en(split_part(name, '/', 1))
    -- un evento que el administrador está por crear (todavía no existe en ninguna organización)
    or (public.es_admin() and public.evento_libre(split_part(name, '/', 1)))));
drop policy if exists comprobantes_ver on storage.objects;
create policy comprobantes_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and (owner = auth.uid() or public.es_lector_de(split_part(name, '/', 1))));
drop policy if exists comprobantes_borrar on storage.objects;
create policy comprobantes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'comprobantes' and public.es_admin() and public.es_lector_de(split_part(name, '/', 1)));

-- ─── Cambios en vivo ─────────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.eventos;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.perfiles;
exception when duplicate_object then null; when undefined_object then null; end $$;
