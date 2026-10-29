import type { SayfaTanimi } from '../sayfa-tanimi.ts';

export const URETIM_EMIRLERI_SAYFALARI = [
  // Salt okunur emir izleme (kart #1191): emirler yalnız Reçete ve Rota'da açılır, iptal edilir ve düzenlenir; burada listelenir.
  { yol: '/uretim-emirleri', islem: 'sayfa.uretim-emirleri', baslik: 'Üretim Emirleri', simge: 'list', grup: 'Üretim', sira: 10, aramaUcu: '/uretim-emirleri/ara', aramaIslemi: 'uretim-emirleri.ara-istasyon' },
] as const satisfies readonly SayfaTanimi[];
