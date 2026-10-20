import type { SayfaTanimi } from '../sayfa-tanimi.ts';

// Operatör ekranı Arkon MES'tedir; bu sayfa bekletiliyor: adresi ve yetkisi durur, menüde görünmez.
export const TERMINAL_SAYFALARI = [
  { yol: '/terminal', islem: 'sayfa.terminal', baslik: 'Terminal', simge: 'play', grup: 'Üretim', sira: 20, menudeGizli: true },
] as const satisfies readonly SayfaTanimi[];
