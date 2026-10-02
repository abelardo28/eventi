-- Ganancia de actividades abonada a conceptos: el abono guarda de qué actividad salió el dinero.
alter table public.abonos drop constraint if exists abonos_metodo_check;
alter table public.abonos add constraint abonos_metodo_check
  check (metodo in ('Efectivo','Transferencia','Depósito','Actividad'));
alter table public.abonos add column actividad_id uuid references public.actividades(id) on delete set null;
alter table public.abonos add constraint abonos_actividad_metodo
  check ((metodo = 'Actividad') = (actividad_id is not null));
