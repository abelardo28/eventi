# Eventi

App web (adaptada al celular e instalable como PWA) para organizar eventos y llevar el control de pagos y abonos por persona o familia, actividades (rifas, loterías) y recordatorios.

## Qué hace hoy

- Eventos con conceptos (Inscripción, Hospedaje, Transporte…) y fechas de pago por porcentaje. Los conceptos se agregan, editan y quitan al crear el evento y después (solo el administrador); al cambiar un monto se puede recalcular a quienes pagan por tarifa sin tocar los montos ajustados a mano. Un concepto con abonos no se puede borrar.
- Cada persona o familia tiene **sus propios conceptos y montos**. Los conceptos con tarifa se calculan por adulto y menor (2 adultos + 2 menores de hospedaje a $2,500 / $1,500 = $8,000) y el monto se puede ajustar a mano.
- Avance general, por concepto y por persona, con lo vencido y lo que debería llevarse a la fecha.
- Abonos con forma de pago y comprobante (foto o PDF; las fotos se reducen antes de guardarse).
- Actividades con movimientos de gasto e ingreso y su ganancia.
- Recordatorios: configuración de días de aviso, cola de envíos y botón que abre WhatsApp con el mensaje listo (`wa.me`). Los textos de WhatsApp (próximo y vencido) y de la notificación push se editan por evento con variables `{nombre}`, `{concepto}`, `{monto}`, `{fecha}`, `{estado}`, `{evento}` y vista previa en vivo.
- **Notificaciones** (campana arriba a la derecha): comprobante enviado por un participante (al personal del evento), pago registrado (al participante y al administrador), pago validado o rechazado con su motivo, pagos por vencer y vencidos, y un resumen diario para el personal. Se pueden activar los avisos del sistema en el dispositivo; con la app cerrada llegarán cuando haya servidor (Web Push).
- **Importar desde Excel** (.xlsx, administrador): hojas *Conceptos*, *Personas* (una columna por concepto con el monto que le toca), *Pagos* y *Gastos*. Reconoce encabezados comunes, muestra una vista previa con las filas que no entendió y no duplica si se importa el mismo archivo otra vez. Hay una plantilla descargable.

- **Cuentas y roles:** iniciar sesión, registrarse y gestión de usuarios.
  - *Administrador:* todo, incluidos usuarios, eventos, conceptos y borrar registros.
  - *Capturista:* registra y valida abonos, agrega y edita personas, registra gastos e ingresos y manda recordatorios en los eventos asignados. No borra.
  - *Participante:* ve su estado de cuenta y envía comprobantes, que quedan **por validar** y no cuentan hasta que se aprueban.
  - La primera cuenta creada es administradora; los registros nuevos entran como participantes y se vinculan solos si su WhatsApp coincide con el de una persona del evento. Las cuentas que crea el administrador reciben contraseña temporal y deben cambiarla al entrar.
  - Cuentas de prueba (contraseña `demo1234`): `admin@eventi.demo`, `capturista@eventi.demo`, `luis@eventi.demo`.

Hay dos modos:

- **Solo este dispositivo** (si `src/nube.config.ts` está vacío): datos y cuentas en `localStorage`, contraseñas con PBKDF2. Sirve para probar; no es seguridad real.
- **En la nube** (con la URL y la *publishable/anon key* de Supabase en `src/nube.config.ts`): cuentas con Supabase Auth, cada evento como documento `jsonb` con número de versión (si dos personas guardan a la vez, el cambio se reaplica sobre la versión nueva), comprobantes en el bucket privado `comprobantes` y permisos por fila. Los participantes solo reciben sus registros y abonos (`mis_eventos()`) y envían comprobantes con `proponer_abono()`. El esquema completo está en `supabase/eventi_nube.sql` (se pega en el SQL Editor y se puede volver a correr). En *Mi cuenta → Subir datos de este dispositivo* el administrador sube lo que tenía guardado localmente.

## Cómo correrla

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm test         # pruebas de la lógica de pagos
npm run build    # genera dist/ (sitio estático)
```

Cada push a `main` se publica solo en GitHub Pages (`.github/workflows/pages.yml`; en el repositorio, *Settings > Pages > Source: GitHub Actions*).

`dist/` también se puede publicar en cualquier hosting estático (Vercel, Netlify, Cloudflare Pages, GitHub Pages). Usa rutas con `#`, así que no necesita configuración de redirecciones.

## Estructura

```
src/domain/     Tipos, cálculos, permisos por rol y contraseñas (funciones puras) + pruebas
src/data/       Guardado (repo.ts), datos de ejemplo, contexto de la app
src/pages/      Inicio, evento (pestañas) y ficha de persona
src/sheets/     Formularios en hoja inferior
src/ui/         Componentes base, íconos y logo
public/         Manifest, service worker e íconos de la PWA
supabase/       Esquema de Supabase (eventi_nube.sql)
```

## Siguientes pasos

1. **Conectar el proyecto de Supabase:** correr `supabase/eventi_nube.sql`, desactivar *Confirm email* (para que las cuentas que crea el administrador entren de inmediato), poner la *Site URL* del sitio publicado y llenar `src/nube.config.ts`.
2. **Recordatorios automáticos:** una tarea programada diaria (Supabase cron / Edge Function) que recorra la cola (`cola()` en `src/domain/calc.ts`) y envíe por la API de WhatsApp Business (Meta Cloud API o Twilio). Requiere plantillas de mensaje aprobadas por Meta.
3. **Notificaciones push:** Web Push con claves VAPID, suscripción desde la PWA y envío desde la misma tarea programada.
