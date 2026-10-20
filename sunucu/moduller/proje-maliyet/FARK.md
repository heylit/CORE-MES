# FARK: proje-maliyet

Taban: main 06144ea. Başvuru: kullanıcı kararları 194 a, 197 a, 198 a, 199 a, 180 (fiyatı yönetici ve müdür görür); kurgu
`arastirma/projeler/2026-10-19-proje-maliyet-yonetimi-kurgusu.md` ve taslak ekran (Projeler > Maliyet sekmesi). Önceki sistemde yok.

## Gelen
- Yeni salt okuma modülü (197 a, `oee`/`akis` kalıbı): kendi tablosu ve göçü yok, işlemi yok. Projeler emirleri okursa döngü olurdu (uretim-emirleri projeler'i ithal eder); hesap bu yüzden tepedeki bu modülde.
- Sözleşme `paylasilan/sozlesme/proje-maliyet.ts`. Toplayıcılara satır yok.
- Sunucu: tek uç `GET /proje-maliyet/:projeId` (`finans.maliyet-oku`). Tutar, gelir, katkı, sapma, kâr riski ve ceza ayrıca `siparisler.fiyat-oku` ister; yoksa null.
- Hesap kuralları PM-01..PM-12 (`kurallar.ts`, saf).
- İstemci: `ProjeMaliyeti` bileşeni (`istemci/src/moduller/proje-maliyet/disari.ts`); Projeler sekmesi bunu çizer. Kendi sayfası ve menüsü yok.
- 199 a defteri: göç `20261019093000_proje_maliyet_defteri.sql` (boş tablo, yalnız ekleme, iş emri başına tek satır), uç `POST /proje-maliyet/:projeId/dondur` (`finans.maliyet-oku`); ekran açılışta önce dondurur, bitmiş iş emri hesapta defterden okunur (PM-16, PM-17).
- Bağlanmamış kaynaklar (iş emri süreleri, fason, malzeme, bütçe) boş; ekranda uyarı satırı (UYUM-BORCU).
- 236 a: dondur ucu kalktı; defteri sunucu işi `proje-maliyet-defteri` (`isler.ts`, on dakikada bir) yazar, ekran yalnız okur. Göç `donduran_id` NOT NULL'ı kaldırır; boş donduran sunucu yazdı demektir. Kural PM-35.
- Bağlama (PM-B1, PM-B2 kapandı): iş emirleri ve süreler uretim-emirleri `projeninIsEmirleri` + `isEmriSureleri`, plan bitişi plan `canliSira`, fason satin-alma `isEmriFasonTutarlari`, ücretler finans `birimMaliyetleri` (bugünün kuruyla TRY). Kural PM-18.
- Genel gider (PM-B11 kapandı, 206 a, 211 a): yeni kalem `genel_gider` = (işleme + ayar) saati x finans `genelGiderOrani` saat başı tutarı (bugünün oranı; bitmiş iş emrinde oran `ucretler.genelGider` ile dondurulur). Kişi ve fason adımı yük almaz. Oran yoksa eksik `genel_gider_orani_yok`. Kural PM-21.
- Plan motoru için (Üretim emirleri 6c): `disari.ts` `isEmriTahminiMaliyetleri(db, idler)` → `Map<iş emri id, TL | null>`; işleme + ayar + fason planı, bugünün kuru ve ücretiyle. Plan bu modülü ithal etmez; bağı kablolama.ts'te 6c PR'ı kurar. Kural PM-23.
- Malzeme planı ve talaş (PM-B13 kapandı, 208 a, 214 a): emir başına kayıt; uretim-emirleri `emirlerinMalzemeIhtiyaci` brüt x satin-alma `malzemeKgFiyatlari` birim fiyatı - talaş (kütük kg - adet x malzemeler `malzemeMaliyetBilgileri` net kg, talaş kg fiyatıyla). İç yarımamul sayılmaz. Talaş verisi eksikse `talas_dusulmedi`. Gerçek sarf Stok disari'si gelince (PM-B3). Kural PM-25.
- Gerçek malzeme (PM-B3 kapandı, K6): stok `emirlerinNetSarfi` net sarfı x kg fiyatından birim fiyat - talaş; açık emirde talaş adedi son adımın sağlamı. `malzeme_bagli_degil` eksik verisi kaldırıldı. Kural PM-27.
- Bekleme finansmanı (PM-B12 kapandı, 212 a, 213 a, vade üretim bitişinden): yeni kalem `finansman`, proje düzeyinde tek kayıt (dondurulmaz, tahmini bitişe girmez). Faiz finans `faizGetir` TRY aylık yüzdesi, vade sipariş `odemeVadesiGun`. Yeni eksik verileri `faiz_yok`, `vade_yok` (vade yoksa üretim bitişine kadar). Kural PM-28, PM-29.
- Talaş ve amortisman (E-5, E-9): açık emirde gerçek talaş yalnız işlenen kütükten (ilk adımı geçen adet), bitmiş emirde hurda parçanın metali talaş (PM-31). Oran amortismanı içermiyorsa eksik `amortisman_dahil_degil` (PM-B14 ekranda görünür).
- Plan motoru için (227 a): `disari.ts` `uretimEmriMalzemeMaliyetleri(db, emirIdleri)` → `Map<emir id, TL | null>`, planlanan malzeme (PM-25, talaş düşülmüş). Malzeme okuması proje kaydıyla ortak yardımcıda.
- Kâr riski oranı (PM-B6 kapandı, 227 a): plan `karRiskiOraniGun` (müdürün bedel ayarı); `VARSAYILAN_KAR_RISKI_ORANI` kaldırıldı.
- Gelir (226 a, denetim #9, #10, #38): gelir sipariş ara toplamı değil, projenin emirlerinin bağlı sipariş satırlarından (emir adedi x birim fiyat x kur); iptal siparişin satırı sayılmaz; satırsız emir için yeni eksik `satirsiz_emir`. Maliyet tam değilse (bir kalem bilinmiyor ya da finansman hesaplanamıyor) katkı payı, katkı oranı ve kâr riski null. Kural PM-36, PM-37.
