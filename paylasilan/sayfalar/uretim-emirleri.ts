import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const URETIM_EMIRLERI_SAYFALARI = [
  // Salt okunur emir izleme (kart #1191): emirler yalnız Reçete ve Rota'da açılır, iptal edilir ve düzenlenir; burada listelenir.
  { yol: '/uretim-emirleri', islem: 'sayfa.uretim-emirleri', baslik: 'Üretim Emirleri', simge: 'list', grup: 'Üretim', sira: 10, aramaUcu: '/uretim-emirleri/ara', aramaIslemi: 'uretim-emirleri.ara-istasyon' },
] as const satisfies readonly SayfaTanimi[];

// Kapanış onayları (1081 b, 1073 a): ayrı sayfa; emir ayrıntısı değişmez. Kuyruğu kalite, müdür ve planlama görür (1078 teyit).
export const URETIM_EMIRLERI_IKINCI_MENU = {
  kok: '/uretim-emirleri',
  baslik: 'Üretim Emirleri',
  simge: 'list',
  gruplar: [
    {
      maddeler: [
        { anahtar: 'emirler', baslik: 'Emirler', yol: '/uretim-emirleri', simge: 'list', islem: 'sayfa.uretim-emirleri' },
        { anahtar: 'kapanis', baslik: 'Kapanış onayları', yol: '/uretim-emirleri/kapanis', simge: 'clipboard-check', islem: 'uretim-emirleri.kapanis-oku', okur: ['/kapanislar'] },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
