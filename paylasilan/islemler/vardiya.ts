// Okuma uçları oturumla açılır. Geçmiş tarihli giriş ayrı işlemdir: geçmiş kapasiteyi değiştirir. Planlı duruş ayrı işlemdir:
// vardiya tanımını yazmayan kişi de (Arkon amiri, kendi iş merkezinde) duruş girer (kart #519).
export const VARDIYA_ISLEMLERI = ['vardiya.yaz', 'vardiya.gecmis-yaz', 'vardiya.durus-yaz'] as const;
