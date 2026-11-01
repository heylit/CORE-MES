import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// CNC Kurulum Motoru tek sayfadır; ekran kendi sekmelerini (kurulum, hazırlık, kütüphane, ham malzeme, G-kod, takım ömrü)
// çizer ve `/cnc-kurulum/yeni` altında açılır, kök adres oraya düşer. Makinelerin çizimle eşleştirilmesi Çizim Merkezi'ndedir
// (paylasilan/sayfalar/cizimler.ts, "CNC makineleri").
export const CNC_KURULUM_SAYFALARI = [
  { yol: '/cnc-kurulum', islem: 'sayfa.cnc-kurulum', baslik: 'CNC Kurulum Motoru', simge: 'rotate', grup: 'Üretim', sira: 40 },
] as const satisfies readonly SayfaTanimi[];

export const CNC_KURULUM_IKINCI_MENU = {
  kok: '/cnc-kurulum',
  baslik: 'CNC Kurulum Motoru',
  simge: 'rotate',
  cerceveli: true,
  gruplar: [{ maddeler: [
    { anahtar: 'ana-sayfa', baslik: 'CNC Kurulum Motoru', yol: '/cnc-kurulum', simge: 'rotate', islem: 'sayfa.cnc-kurulum' },
  ] }],
} as const satisfies IkinciMenuTanimi;
