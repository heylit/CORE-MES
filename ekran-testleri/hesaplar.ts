// Örnek veri hesapları (sunucu/moduller/kisiler/ornek-veri.ts). Parolayı hazirla.ts koşu başına üretir.
export const HESAPLAR = ['ornek.yonetici', 'ornek.mudur', 'ornek.planlama', 'ornek.operator1', 'ornek.kalite', 'ornek.depo'] as const;
export type Hesap = (typeof HESAPLAR)[number];
