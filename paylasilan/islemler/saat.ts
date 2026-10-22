// Saatten uyarı üstlenme (kart #86, karar 79 a): kişi uyarıyı "ben bakıyorum" diye üstlenir; uyarıyı kapatmaz, kaynakta kapanır.
// saat.oku: emir listesini ve Fabrika Haritası'nı açmayan role yalnız saat okumasını verir (Soru 111 b: vardiya sorumlusu, bakım).
export const SAAT_ISLEMLERI = ['saat.oku', 'saat.uyari-ustlen'] as const;
