-- Eventi: esquema inicial para cuando los datos pasen del navegador a la nube (Supabase / Postgres).
-- Refleja src/domain/types.ts. Cada evento pertenece a un organizador (auth.users).

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  organizador_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  fecha date not null,
  fin date,
  lugar text not null default '',
  -- Recordatorios
  aviso_dias_antes int not null default 3 check (aviso_dias_antes between 1 and 15),
  aviso_hora time not null default '09:00',
  aviso_whatsapp boolean not null default true,
  aviso_push boolean not null default false,
  aviso_repetir_vencidos boolean not null default true,
  aviso_cada_dias int not null default 3,
  creado_en timestamptz not null default now()
);

create table public.conceptos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nombre text not null,
  base numeric(12,2) not null check (base >= 0),
  tarifa_adulto numeric(12,2),   -- null = mismo monto para todos
  tarifa_menor numeric(12,2),
  orden int not null default 0
);

-- Fechas de pago del concepto; cada cargo se reparte con estos porcentajes.
create table public.cuotas (
  id uuid primary key default gen_random_uuid(),
  concepto_id uuid not null references public.conceptos(id) on delete cascade,
  fecha date not null,
  pct int not null check (pct between 1 and 100)
);

create table public.personas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'Persona' check (tipo in ('Persona','Familia')),
  telefono text not null default '',
  -- Si la persona instala la app y acepta notificaciones:
  usuario_id uuid references auth.users(id) on delete set null
);

-- Lo que le toca pagar a cada persona/familia de cada concepto.
create table public.cargos (
  persona_id uuid not null references public.personas(id) on delete cascade,
  concepto_id uuid not null references public.conceptos(id) on delete cascade,
  monto numeric(12,2) not null check (monto >= 0),
  adultos int,
  menores int,
  cantidad int,
  primary key (persona_id, concepto_id)
);

create table public.abonos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas(id) on delete cascade,
  concepto_id uuid not null references public.conceptos(id) on delete restrict,
  monto numeric(12,2) not null check (monto > 0),
  fecha date not null default current_date,
  metodo text not null check (metodo in ('Efectivo','Transferencia','Depósito')),
  comprobante_path text,          -- ruta en el bucket "comprobantes"
  creado_en timestamptz not null default now()
);

create table public.actividades (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nombre text not null,
  detalle text not null default '',
  estado text not null default 'En curso' check (estado in ('En curso','Terminada'))
);

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  tipo text not null check (tipo in ('gasto','ingreso')),
  monto numeric(12,2) not null check (monto > 0),
  fecha date not null default current_date,
  nota text not null default ''
);

create table public.envios (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas(id) on delete cascade,
  concepto_id uuid not null references public.conceptos(id) on delete cascade,
  canal text not null check (canal in ('WhatsApp','Push')),
  enviado_en timestamptz not null default now(),
  estado text not null default 'enviado'
);

create index on public.conceptos (evento_id);
create index on public.personas (evento_id);
create index on public.abonos (persona_id, concepto_id);
create index on public.actividades (evento_id);

-- Seguridad: cada organizador solo ve y edita sus propios eventos.
create or replace function public.es_mi_evento(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from eventos where id = eid and organizador_id = auth.uid())
$$;

alter table public.eventos enable row level security;
alter table public.conceptos enable row level security;
alter table public.cuotas enable row level security;
alter table public.personas enable row level security;
alter table public.cargos enable row level security;
alter table public.abonos enable row level security;
alter table public.actividades enable row level security;
alter table public.movimientos enable row level security;
alter table public.envios enable row level security;

create policy "propios" on public.eventos for all using (organizador_id = auth.uid()) with check (organizador_id = auth.uid());
create policy "propios" on public.conceptos for all using (es_mi_evento(evento_id)) with check (es_mi_evento(evento_id));
create policy "propios" on public.personas for all using (es_mi_evento(evento_id)) with check (es_mi_evento(evento_id));
create policy "propios" on public.actividades for all using (es_mi_evento(evento_id)) with check (es_mi_evento(evento_id));
create policy "propios" on public.cuotas for all
  using (exists (select 1 from conceptos c where c.id = concepto_id and es_mi_evento(c.evento_id)))
  with check (exists (select 1 from conceptos c where c.id = concepto_id and es_mi_evento(c.evento_id)));
create policy "propios" on public.cargos for all
  using (exists (select 1 from personas p where p.id = persona_id and es_mi_evento(p.evento_id)))
  with check (exists (select 1 from personas p where p.id = persona_id and es_mi_evento(p.evento_id)));
create policy "propios" on public.abonos for all
  using (exists (select 1 from personas p where p.id = persona_id and es_mi_evento(p.evento_id)))
  with check (exists (select 1 from personas p where p.id = persona_id and es_mi_evento(p.evento_id)));
create policy "propios" on public.envios for all
  using (exists (select 1 from personas p where p.id = persona_id and es_mi_evento(p.evento_id)))
  with check (exists (select 1 from personas p where p.id = persona_id and es_mi_evento(p.evento_id)));
create policy "propios" on public.movimientos for all
  using (exists (select 1 from actividades a where a.id = actividad_id and es_mi_evento(a.evento_id)))
  with check (exists (select 1 from actividades a where a.id = actividad_id and es_mi_evento(a.evento_id)));

-- Comprobantes: bucket privado; la ruta empieza con el id del evento.
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false) on conflict do nothing;
create policy "comprobantes propios" on storage.objects for all
  using (bucket_id = 'comprobantes' and es_mi_evento(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'comprobantes' and es_mi_evento(((storage.foldername(name))[1])::uuid));
