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
- Masraf bağı (K18 a, 1818): tamamlanmış ya da iptal projeye bağ kurulmaz (PM-45); kaldırma `projeler.yaz` ucunda ayrıca `finans.maliyet-oku` ister ve silinen bağı `proje_maliyet_masraf_kaldirma` iz tablosuna yazar (göç 20261101221200, boş tablo, yalnız ekleme; PM-46).
- Kâr riski oranı (PM-B6 kapandı, 227 a): plan `karRiskiOraniGun` (müdürün bedel ayarı); `VARSAYILAN_KAR_RISKI_ORANI` kaldırıldı.
- Gelir (226 a, denetim #9, #10, #38): gelir sipariş ara toplamı değil, projenin emirlerinin bağlı sipariş satırlarından (emir adedi x birim fiyat x kur); iptal siparişin satırı sayılmaz; satırsız emir için yeni eksik `satirsiz_emir`. Maliyet tam değilse (bir kalem bilinmiyor ya da finansman hesaplanamıyor) katkı payı, katkı oranı ve kâr riski null. Kural PM-36, PM-37.
- Bütçe (PM-B4 kapandı, 1818): proje bütçesi `projeGetir`'den okunur, hedef odur; döviz bütçe bugünün kuruyla TRY, kuru yoksa eksik `butce_kuru_yok`. Kural PM-43.
- Ekran uyarıları (1818): emirsiz projede yeni eksik `is_emri_yok`, vade uyarısı yalnız iş varken (PM-44); gelir kartının başlığı "Proje geliri" (değer siparişin tamamı değil, projenin emir payıdır, PM-36); üretim gerçekleşeni bilinmezken masraf "dahil" yazılmaz.
- PM-7 (D5 a, 1818): plan tarihi olmayan kayıtta yeni eksik `plan_tarihi_yok`; defter işi bütün projeleri dolaşmak yerine uretim-emirleri `bitenIsEmirleri` ile defterde olmayan biten iş emirlerini bulur, `emirlerinProjeleri` ile yalnız o projeleri hesaplar (PM-47).
- PM-1 (PM-1 a, 1818): işçilik planı yokken yeni eksik `iscilik_plani_yok`; katkı payı kartı ve kâr riski boş tutar yerine "İşçilik planı yok" yazar, sayı uydurulmaz; plan girilince hesaplanır (PM-48).
- Proje masrafı kategorileri (2599 a): `PROJE_MASRAF_KATEGORILERI` yalnız lojistik, pazarlama, diğer gider. Mal alımı (malzeme sarftan, fason siparişten girer), personel (işçilik saatten), kira ve enerji (genel gider) projeye yeni bağlanamaz; ikinci kez sayılmasın diye. Var olan bağlar silinmez (PM-41).
- Sayılmayan bağ (2599-a2): masraf satırına `sayilmaz` eklendi; türü artık listede olmayan bağ ve bağdan sonra siparişe bağlanan belge (2611 ön bakışı) toplama ve farka girmez, tabloda ve CSV'de "Sayılıyor" sütunu; ekranda "Sayılmıyor" rozetiyle ve açıklamayla görünür, kaldırma mevcut yoldan (PM-49). Veri silinmez, göç yok.

## 2663 (2661 a): gizli genel gider oranı
- Finans `genelGiderOrani` gizli ayda gerçek oranı `gizli: true` ile verir (2594 b); hesap gerçek oranla sürer, cevap `genelGiderGizliMaskesi` ile tek yerde maskelenir. Cevaba `genelGiderGizli` eklendi (sözleşme `.strict()`).
- Maskelenen alanlar oran oynatılarak bulundu (genel-gider-gizli.test.ts); bekleme finansmanı genel gideri tabana almadığı için (FINANSMAN_TABANI) kalır.
- Sapan iş emirleri gizli ayda boş döner: sıralama da toplamdan türer. VARSAYIM; geri alma düşük (genel gidersiz sapmayla liste döndürülebilir, ayrı karar).
- Defter: dondurulan satırın `ucretler.genelGider.gizli` alanı okunur; gizlilik dondurma anındakidir. VARSAYIM; geri alma düşük.
- Göç `20261110003323_proje_maliyet_taban_genel_gider_gizli.sql` (Veri 2663): varsayılanlı boolean, veri dönüşmez. Taban gerçek değerle saklanır, okumada plan ve genel gider kalemi gizli.
- İstemci: "Gizli" bayraktan gelir (`gizli.ts` `gizliVeyaDeger`), açıklama satırı bilgi rozetli ve kilit simgeli; haftalık birikim yerine boş durum metni; kalem kırılımında not (Arayüz K1-K6).

## 2720-2 (2613 2/2): gerçekleşen malzeme sipariş fiyatıyla
- Gerçekleşen malzeme (PM-27) birim fiyatını emrin, yoksa projenin bağlı satın alma siparişinden alır (`satin-alma/disari.ts` `siparisBirimFiyatlari`, 2720-1); bağlı sipariş yoksa son alış (2727, PM-52). Plan ve talaş kg fiyatı değişmedi. Saf kural `gercekBilesenFiyatlari` (PM-51).
- Miktar emre çıkan net sarftır; siparişin tamamı yazılmaz (artan mal stokta kalır, 2637 a ile çift sayılmaz). VARSAYIM (Maliyet okuması); geri alma orta.
- Göç, uç, sözleşme ve eksik kodu değişmedi.

## 2727 (2613-3 a): siparişsiz çıkış son alışla
- Bağlı siparişi olmayan çıkış, çıkış anındaki son alışla fiyatlanır (`stok/disari.ts` `emirSarfSonAlisTutarlari`, 2727-1; 2707 emirsiz çıkışla aynı tanım). Son alışı yoksa bilinmiyor (null, `birim_maliyet_eksik`); liste fiyatına düşülmez. Kural PM-52.
- Çiftin tutarı doğrudan kullanılır, birim fiyata çevrilip yeniden çarpılmaz (Maliyet N1). Talaş liste kg fiyatından düşülmeye devam eder. Plan değişmedi.
- VARSAYIM: emrin ya da projenin siparişi varsa çıkışın tamamı sipariş fiyatıyla (PM-51) fiyatlanır, kısmen siparişsiz çıkış ayrılmaz; geri alma orta. Fire dahil net sarf son alışla.
- Göç, uç, sözleşme ve eksik kodu değişmedi.

## 2739 (2733 a): kısmi siparişte siparişe kadar sipariş fiyatı
- Sipariş yalnız teslim alınan net miktarına kadar fiyatlar (satin-alma `teslimMiktari`, 2739-1). Çift başına sırayla emrin siparişi, projenin siparişi (projede kalan teslim, emirlere ilk sarf zamanı sırasıyla; stok `ilkZaman`, 2739-2), kalan fazla son alıştan orantıyla, kuruşa yuvarlanır. Kural PM-53. Fazla yoksa sonuç PM-51 ile aynı.
- 2720-2'de emrin siparişi çıkışın tamamını fiyatlıyordu ve proje siparişinin miktar sınırı yoktu; ikisi de değişti.
- Düzeltme: son alışı bilinmeyen siparişsiz ya da fazla çift artık `birim_maliyet_eksik` yazar (2727'de tutar null olup kod yazılmıyordu).
- VARSAYIM (Maliyet tarifi): proje siparişi emirlere ilk sarf zamanı, eşitse emir no sırasıyla dağılır; emrin siparişi önce, proje siparişi sonra, son alış en son. Geri alma orta.
- Göç, uç ve eksik kodu değişmedi; sözleşme alanları sağlayıcılarda (2739-1, 2739-2).
