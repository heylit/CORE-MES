import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// CNC Kurulum Motoru tek sayfadır; içerik prototipin kendisidir ve yalıtılmış çerçevede açılır. Prototip kendi iç gezinmesini
// (kurulum, kütüphane, stok, takım ömrü, G-kod, hazırlık) taşır. Makinelerin çizimle eşleştirilmesi Çizim Merkezi'ndedir
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
