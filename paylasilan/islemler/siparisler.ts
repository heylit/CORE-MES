// Satış siparişi (soru 144 a): görmek, taslak yazmak, onaylamak (onay, kapatma, iptal). Rol dağılımı soru 139 tablosuyla gelir.
// siparisler.fiyat-oku: sipariş ve teklifte fiyat, tutar ve kârı görür (soru 180); siparisler.oku bunları açmaz.
// siparisler.iskonto-onayla: iskonto sınırını aşan teklif sürümünü onaylar; onaysız sürüm müşteriye gitmez (soru 291 a).
// siparisler.termin-dene: teklifi planın arkasına deneyip termini görür, satış ve deneme taslağı açar (soru 44, 65 a).
// siparisler.maliyet-oku: denemenin maliyet dökümünü (malzeme, işleme, ayar, fason, genel gider) görür; toplam fiyat-oku ile görünür (65 a).
export const SIPARISLER_ISLEMLERI = [
  'siparisler.oku', 'siparisler.yaz', 'siparisler.onayla', 'siparisler.fiyat-oku', 'siparisler.iskonto-onayla', 'siparisler.termin-dene', 'siparisler.maliyet-oku',
] as const;
