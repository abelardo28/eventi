-- Una fecha de pago puede cobrar un porcentaje o un monto fijo por registro.
-- Si algún pago de un concepto es monto fijo, el último pago (por fecha) cubre lo que falte y guarda pct = 0.
alter table public.cuotas drop constraint if exists cuotas_pct_check;
alter table public.cuotas add column monto numeric(12,2) check (monto is null or monto > 0);
alter table public.cuotas add constraint cuotas_pct_check check (pct between 0 and 100);
