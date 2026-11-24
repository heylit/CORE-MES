import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const TAKIMHANE_SAYFALARI = [
  { yol: '/takimhane', islem: 'sayfa.takimhane', baslik: 'Takımhane', simge: 'takim', grup: 'Stok', sira: 20 },
] as const satisfies readonly SayfaTanimi[];

// Sayfayı gören herkes genel bakışı okur; çıkış, iade ve başlangıç stoğu stok işlemleriyle açılır (yeni işlem açılmadı, kart 3613 Risk bakışı).
export const TAKIMHANE_IKINCI_MENU = {
  kok: '/takimhane',
  baslik: 'Takımhane',
  simge: 'takim',
  gruplar: [
    { maddeler: [
      { anahtar: 'genel', baslik: 'Genel bakış', yol: '/takimhane', simge: 'gauge', islem: 'sayfa.takimhane' },
      { anahtar: 'emirler', baslik: 'Emir takımları', yol: '/takimhane/emirler', simge: 'clipboard-check', islem: 'sayfa.takimhane' },
    ] },
    { baslik: 'Depo', maddeler: [
      { anahtar: 'cikis-iade', baslik: 'Çıkış ve iade', yol: '/takimhane/cikis-iade', simge: 'rotate', islem: 'takimhane.cikis-iade' },
      { anahtar: 'baslangic', baslik: 'Başlangıç stoğu', yol: '/takimhane/baslangic', simge: 'upload', islem: 'stok.giris' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
