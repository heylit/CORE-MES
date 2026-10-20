import type { SayfaTanimi } from '../sayfa-tanimi.ts';

export const KUYRUK_SAYFALARI = [
  { yol: '/kuyruk', islem: 'sayfa.kuyruk', baslik: 'Kuyruk', simge: 'layers', grup: 'Üretim', sira: 30 },
] as const satisfies readonly SayfaTanimi[];
