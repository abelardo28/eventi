/**
 * Proyecto de Supabase donde se guardan los datos compartidos.
 * La "publishable/anon key" es pública por diseño: los permisos los cuida la base de datos (supabase/eventi_nube.sql).
 * Vacío = la app guarda todo solo en este dispositivo. VITE_SIN_NUBE=1 fuerza el modo local (demo);
 * VITE_SUPABASE_URL / VITE_SUPABASE_KEY apuntan a otro proyecto (pruebas).
 */
const PROYECTO = {
  url: 'https://kymqjitszaekattsgcfb.supabase.co',
  key: 'sb_publishable_ctVDWVUjH8nSKfdsc3_WUg_rbv3ERmt',
}

const env = import.meta.env
export const NUBE = env.VITE_SIN_NUBE ? { url: '', key: '' }
  : { url: env.VITE_SUPABASE_URL ?? PROYECTO.url, key: env.VITE_SUPABASE_KEY ?? PROYECTO.key }
