-- Eventi: rol "Auditor" (solo consulta)
-- Para proyectos que ya corrieron eventi_nube.sql. Pégalo en SQL Editor → New query → Run.
-- Se puede volver a correr.

-- 1) El rol nuevo es válido
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('admin', 'capturista', 'auditor', 'participante'));

-- 2) El auditor ve los eventos asignados (o todos), pero no los puede cambiar
create or replace function public.es_lector_de(p_evento text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and activo
      and (rol = 'admin' or (rol in ('capturista', 'auditor') and (eventos is null or p_evento = any (eventos))))
  )
$$;
grant execute on function public.es_lector_de(text) to authenticated;

drop policy if exists eventos_ver on public.eventos;
create policy eventos_ver on public.eventos for select using (es_lector_de(id));
-- (editar, crear y borrar siguen limitados al administrador y al capturista)

-- 3) Y puede abrir los comprobantes
create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo and rol in ('admin', 'capturista', 'auditor'))
$$;
