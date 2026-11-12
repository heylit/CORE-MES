import type { SayfaTanimi } from '../sayfa-tanimi.ts';

// 3068: geçişin başında Logo'daki kayıtları CORE'a almak ya da bağlamak için. Sayfa işlemi yalnız görünürlüktür; veriyi sekmenin
// sahibi modülün işlemleri açar (malzemeler okuma ve yazma).
export const LOGO_SAYFALARI = [
  { yol: '/logo-gecisi', islem: 'sayfa.logo-gecisi', baslik: 'Logo geçişi', simge: 'login', grup: 'Tanımlar', sira: 60 },
] as const satisfies readonly SayfaTanimi[];
