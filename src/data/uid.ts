export const uid = (prefijo: string) =>
  prefijo + '_' + (globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10))
