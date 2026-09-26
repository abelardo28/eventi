-- Eventi: cuentas con rol (administrador, capturista, participante) y permisos en la base de datos.
-- Refleja src/domain/permisos.ts. Reemplaza la política "un organizador por evento" de 0001.

create type public.rol as enum ('admin', 'capturista', 'participante');

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  telefono text not null default '',
  rol public.rol not null default 'participante',
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Capturista: eventos asignados (sin filas = todos)
create table public.capturista_eventos (
  usuario_id uuid references public.perfiles(id) on delete cascade,
  evento_id uuid references public.eventos(id) on delete cascade,
  primary key (usuario_id, evento_id)
);

alter table public.abonos
  add column estado text not null default 'validado' check (estado in ('validado','pendiente','rechazado')),
  add column registrado_por uuid references public.perfiles(id),
  add column validado_por uuid references public.perfiles(id),
  add column motivo_rechazo text;

-- La primera cuenta es administradora; las demás, participantes.
create or replace function public.nuevo_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, telefono, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), coalesce(new.raw_user_meta_data->>'telefono', ''),
          case when exists (select 1 from perfiles) then 'participante' else 'admin' end);
  return new;
end $$;
create trigger al_registrarse after insert on auth.users for each row execute function public.nuevo_perfil();

create or replace function public.mi_rol() returns public.rol
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create or replace function public.trabaja_en(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case mi_rol()
    when 'admin' then true
    when 'capturista' then not exists (select 1 from capturista_eventos where usuario_id = auth.uid())
                         or exists (select 1 from capturista_eventos where usuario_id = auth.uid() and evento_id = eid)
    else false end
$$;

create or replace function public.es_mi_registro(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from personas where id = pid and usuario_id = auth.uid())
$$;

-- Quitar políticas de 0001
do $$ declare t text; begin
  foreach t in array array['eventos','conceptos','cuotas','personas','cargos','abonos','actividades','movimientos','envios'] loop
    execute format('drop policy if exists "propios" on public.%I', t);
  end loop;
end $$;
drop policy if exists "comprobantes propios" on storage.objects;

alter table public.perfiles enable row level security;
alter table public.capturista_eventos enable row level security;

-- Perfiles: cada quien ve el suyo; el administrador gestiona todos.
create policy "ver perfil" on public.perfiles for select using (id = auth.uid() or mi_rol() = 'admin');
create policy "admin perfiles" on public.perfiles for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "admin asignaciones" on public.capturista_eventos for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- Eventos, conceptos y cuotas: el administrador edita; capturistas ven los suyos; participantes ven los de sus registros.
create policy "ver" on public.eventos for select using (trabaja_en(id) or exists (select 1 from personas p where p.evento_id = id and p.usuario_id = auth.uid()));
create policy "admin" on public.eventos for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "ver" on public.conceptos for select using (trabaja_en(evento_id) or exists (select 1 from personas p where p.evento_id = conceptos.evento_id and p.usuario_id = auth.uid()));
create policy "admin" on public.conceptos for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "ver" on public.cuotas for select using (exists (select 1 from conceptos c where c.id = concepto_id));
create policy "admin" on public.cuotas for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

-- Personas y cargos: capturista agrega y edita (no borra); participante ve lo suyo.
create policy "ver" on public.personas for select using (trabaja_en(evento_id) or usuario_id = auth.uid());
create policy "capturar" on public.personas for insert with check (trabaja_en(evento_id));
create policy "editar" on public.personas for update using (trabaja_en(evento_id)) with check (trabaja_en(evento_id));
create policy "borrar" on public.personas for delete using (mi_rol() = 'admin');
create policy "ver" on public.cargos for select using (exists (select 1 from personas p where p.id = persona_id and (trabaja_en(p.evento_id) or p.usuario_id = auth.uid())));
create policy "capturar" on public.cargos for all
  using (exists (select 1 from personas p where p.id = persona_id and trabaja_en(p.evento_id)))
  with check (exists (select 1 from personas p where p.id = persona_id and trabaja_en(p.evento_id)));

-- Abonos: capturista registra y valida; participante envía como pendiente; solo el administrador borra.
create policy "ver" on public.abonos for select using (exists (select 1 from personas p where p.id = persona_id and (trabaja_en(p.evento_id) or p.usuario_id = auth.uid())));
create policy "capturar" on public.abonos for insert with check (exists (select 1 from personas p where p.id = persona_id and trabaja_en(p.evento_id)));
create policy "proponer" on public.abonos for insert with check (es_mi_registro(persona_id) and estado = 'pendiente' and registrado_por = auth.uid());
create policy "validar" on public.abonos for update using (exists (select 1 from personas p where p.id = persona_id and trabaja_en(p.evento_id)));
create policy "borrar" on public.abonos for delete using (mi_rol() = 'admin');

-- Actividades: el administrador crea; capturista registra movimientos.
create policy "ver" on public.actividades for select using (trabaja_en(evento_id));
create policy "admin" on public.actividades for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');
create policy "ver" on public.movimientos for select using (exists (select 1 from actividades a where a.id = actividad_id and trabaja_en(a.evento_id)));
create policy "capturar" on public.movimientos for insert with check (exists (select 1 from actividades a where a.id = actividad_id and trabaja_en(a.evento_id)));
create policy "admin" on public.movimientos for all using (mi_rol() = 'admin') with check (mi_rol() = 'admin');

create policy "ver" on public.envios for select using (exists (select 1 from personas p where p.id = persona_id and trabaja_en(p.evento_id)));
create policy "enviar" on public.envios for insert with check (exists (select 1 from personas p where p.id = persona_id and trabaja_en(p.evento_id)));

-- Comprobantes: ruta "<evento_id>/<persona_id>/<archivo>".
create policy "ver comprobantes" on storage.objects for select using (
  bucket_id = 'comprobantes' and (trabaja_en(((storage.foldername(name))[1])::uuid) or es_mi_registro(((storage.foldername(name))[2])::uuid)));
create policy "subir comprobantes" on storage.objects for insert with check (
  bucket_id = 'comprobantes' and (trabaja_en(((storage.foldername(name))[1])::uuid) or es_mi_registro(((storage.foldername(name))[2])::uuid)));
create policy "borrar comprobantes" on storage.objects for delete using (bucket_id = 'comprobantes' and mi_rol() = 'admin');
