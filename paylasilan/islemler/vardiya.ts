// Okuma uçları oturumla açılır. Geçmiş tarihli giriş ayrı işlemdir: geçmiş kapasiteyi değiştirir. Planlı duruş ayrı işlemdir:
// vardiya tanımını yazmayan kişi de (Arkon amiri, kendi iş merkezinde) duruş girer (kart #519).
// Vardiya tanımı, kapalı günler ve kişi, departman ve tesis vardiyası İK'nın da işidir (2452-1 a); üretim matrisi ve fazla mesai `vardiya.yaz`'dadır.
export const VARDIYA_ISLEMLERI = ['vardiya.yaz', 'vardiya.gecmis-yaz', 'vardiya.durus-yaz', 'vardiya.tanim-yaz'] as const;
