import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const TAKVIM_SAYFALARI = [
  { yol: '/takvim', islem: 'sayfa.takvim', baslik: 'Takvim', simge: 'calendar', grup: 'Planlama', sira: 8 },
] as const satisfies readonly SayfaTanimi[];

// Üç görünüm aynı okumadır (takvim.oku): takvim (ay, hafta, gündem), tablo ve kanban.
export const TAKVIM_IKINCI_MENU = {
  kok: '/takvim',
  baslik: 'Takvim',
  simge: 'calendar',
  gruplar: [
    { maddeler: [
      { anahtar: 'takvim', baslik: 'Takvim', yol: '/takvim', simge: 'calendar', islem: 'takvim.oku' },
      { anahtar: 'tablo', baslik: 'Tablo', yol: '/takvim/tablo', simge: 'list', islem: 'takvim.oku' },
      { anahtar: 'kanban', baslik: 'Kanban', yol: '/takvim/kanban', simge: 'kanban', islem: 'takvim.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
