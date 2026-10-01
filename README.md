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

Los datos y las cuentas se guardan **solo en el navegador** (`localStorage`, contraseñas con PBKDF2) mientras no haya servidor. Esto sirve para probar, pero no es seguridad real: quien tenga el dispositivo puede leer los datos. La seguridad real llega con Supabase Auth y las políticas de `supabase/migrations/0002_roles.sql`.

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
src/domain/     Tipos, cálculos, permisos por rol y contraseñas (funciones puras) + pruebas
src/data/       Guardado (repo.ts), datos de ejemplo, contexto de la app
src/pages/      Inicio, evento (pestañas) y ficha de persona
src/sheets/     Formularios en hoja inferior
src/ui/         Componentes base, íconos y logo
public/         Manifest, service worker e íconos de la PWA
supabase/       Esquema de base de datos para la siguiente etapa
```

## Siguientes pasos

1. **Cuentas y datos en la nube:** crear un proyecto de Supabase, aplicar `supabase/migrations/` (0001 y 0002) y escribir un `Repositorio` que use Supabase en lugar de `localStorage` (`src/data/repo.ts`). Los comprobantes van al bucket privado `comprobantes`.
2. **Recordatorios automáticos:** una tarea programada diaria (Supabase cron / Edge Function) que recorra la cola (`cola()` en `src/domain/calc.ts`) y envíe por la API de WhatsApp Business (Meta Cloud API o Twilio). Requiere plantillas de mensaje aprobadas por Meta.
3. **Notificaciones push:** Web Push con claves VAPID, suscripción desde la PWA y envío desde la misma tarea programada.
