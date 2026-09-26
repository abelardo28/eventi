# Eventi

App web (adaptada al celular e instalable como PWA) para organizar eventos y llevar el control de pagos y abonos por persona o familia, actividades (rifas, loterías) y recordatorios.

## Qué hace hoy

- Eventos con conceptos (Inscripción, Hospedaje, Transporte…) y fechas de pago por porcentaje.
- Cada persona o familia tiene **sus propios conceptos y montos**. Los conceptos con tarifa se calculan por adulto y menor (2 adultos + 2 menores de hospedaje a $2,500 / $1,500 = $8,000) y el monto se puede ajustar a mano.
- Avance general, por concepto y por persona, con lo vencido y lo que debería llevarse a la fecha.
- Abonos con forma de pago y comprobante (foto o PDF; las fotos se reducen antes de guardarse).
- Actividades con movimientos de gasto e ingreso y su ganancia.
- Recordatorios: configuración de días de aviso, cola de envíos y botón que abre WhatsApp con el mensaje listo (`wa.me`).

Los datos se guardan **solo en el navegador** (`localStorage`) mientras no haya servidor.

## Cómo correrla

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm test         # pruebas de la lógica de pagos
npm run build    # genera dist/ (sitio estático)
```

`dist/` se puede publicar en cualquier hosting estático (Vercel, Netlify, Cloudflare Pages, GitHub Pages). Usa rutas con `#`, así que no necesita configuración de redirecciones.

## Estructura

```
src/domain/     Tipos y cálculos puros (plan de pagos, vencidos, recordatorios) + pruebas
src/data/       Guardado (repo.ts), datos de ejemplo, contexto de la app
src/pages/      Inicio, evento (pestañas) y ficha de persona
src/sheets/     Formularios en hoja inferior
src/ui/         Componentes base, íconos y logo
public/         Manifest, service worker e íconos de la PWA
supabase/       Esquema de base de datos para la siguiente etapa
```

## Siguientes pasos

1. **Cuentas y datos en la nube:** crear un proyecto de Supabase, aplicar `supabase/migrations/0001_inicial.sql` y escribir un `Repositorio` que use Supabase en lugar de `localStorage` (`src/data/repo.ts`). Los comprobantes van al bucket privado `comprobantes`.
2. **Recordatorios automáticos:** una tarea programada diaria (Supabase cron / Edge Function) que recorra la cola (`cola()` en `src/domain/calc.ts`) y envíe por la API de WhatsApp Business (Meta Cloud API o Twilio). Requiere plantillas de mensaje aprobadas por Meta.
3. **Notificaciones push:** Web Push con claves VAPID, suscripción desde la PWA y envío desde la misma tarea programada.
4. **Acceso para participantes:** enlace para que cada persona vea su estado de cuenta y suba sus comprobantes.
