// Satış siparişi (soru 144 a): görmek, taslak yazmak, onaylamak (onay, kapatma, iptal). Rol dağılımı soru 139 tablosuyla gelir.
// siparisler.fiyat-oku: sipariş ve teklifte fiyat, tutar ve kârı görür (soru 180); siparisler.oku bunları açmaz.
// siparisler.iskonto-onayla: iskonto sınırını aşan teklif sürümünü onaylar; onaysız sürüm müşteriye gitmez (soru 291 a).
export const SIPARISLER_ISLEMLERI = ['siparisler.oku', 'siparisler.yaz', 'siparisler.onayla', 'siparisler.fiyat-oku', 'siparisler.iskonto-onayla'] as const;
