// Örnek veri hesapları (sunucu/moduller/kisiler/ornek-veri.ts). Parolayı hazirla.ts koşu başına üretir.
export const HESAPLAR = [
  'ornek.yonetici', 'ornek.mudur', 'ornek.planlama', 'ornek.operator1', 'ornek.operator2', 'ornek.kalite', 'ornek.depo',
  'ornek.satis', 'ornek.satinalma', 'ornek.muhasebe',
] as const;
export type Hesap = (typeof HESAPLAR)[number];
