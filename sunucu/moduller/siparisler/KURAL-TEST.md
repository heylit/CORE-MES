# Kural -> test: siparisler

| Kural | Test |
|---|---|
| SIP-01 firma müşteri ya da iki yönlü; olmayan ve yeni seçilen pasif firma reddedilir (`siparisler_siparis_firma`) | `kurallar.test.ts` `SIP-01 ...`, `siparisler.test.ts` `SIP-01 ...` |
| SIP-02 satıra yalnız aktif mamul, yarı mamul, ticari mal girer | `kurallar.test.ts` `SIP-02 ...`, `siparisler.test.ts` `SIP-02 ...` |
| SIP-03 içerik yalnız taslakta değişir; onaylı kayıt değişmez | `kurallar.test.ts` `SIP-03 ...`, `siparisler.test.ts` `SIP-03 ve sürüm ...` |
| SIP-04 durum geçişleri (onayla, kapat, iptal); iptal nedeni zorunlu (`siparisler_siparis_iptal_nedeni`) | `kurallar.test.ts` `SIP-04 ...`, `siparisler.test.ts` `SIP-04 ...` |
| SIP-05 sürüm denetimi (409) ve olmayan kayıt (404) | `SIP-03 ve sürüm ...` |
| SIP-06 tutarlar sunucuda: satır tutarı iki ondalık, KDV ara toplamdan | `tutarlar sunucuda ...` |
| SIP-07 termin sipariş tarihinden önce olamaz (`siparisler_siparis_tarih_sirasi`, şema) | `SIP-07 ...` |
| SIP-08 müşteri sipariş no aynı firmada iptal dışı tekil (`siparisler_siparis_musteri_no_tekil`) | `SIP-08 ...` |
| SIP-09 gecikme cezası (%/gün) ve tavanı (%) boş olabilir, 0-100 (`siparisler_siparis_gecikme_ceza_orani`, `_ceza_tavani_orani`); plan satır tutarıyla disari'den okur (177-179 a) | `SIP-09 ...` |
| SIP-12 ödeme vadesi (gün) boş olabilir, 0-365 tam gün (`siparisler_siparis_odeme_vadesi_gun`); proje maliyeti finansmanı disari'den okur, boşsa eksik sayar; plan vadeyi okumaz (205 a) | `SIP-12 ...` |
| SIP-13 emir açılırken siparişin satırları sıra ile disari'den okunur; satır özeti birim fiyatı da verir (emir payı = birim fiyat × emir adedi), fiyatsız satırda null (224, 225) | `SIP-13 ...` |
| SIP-14 sipariş açılınca (tekliften dönüşüm dahil) `siparisler.onayla` sahiplerine "onay bekliyor" bildirimi gider; açan almaz (bildirim merkezi) | `SIP-14 ...` |
| SIP-15 (E-24) her sipariş ucu işlemi olmayana 403, salt okuyana (kalite) yazma 403, planlamaya onay/kapat/iptal 403; olmayan siparişe okuma ve her komut 404; ret kaydı değiştirmez | `SIP-15 ...` |
| SIP-16 (287 b) disari taslakSiparisAc: müşteri, termin ve kalemle fiyatsız taslak; sipariş tarihi tesis günü, KDV verilmezse 20; doğrulama uçla aynı sözleşmeden (400), ret kayıt bırakmaz | `SIP-16 ...` (disari.test.ts) |
| SIP-17 (286 b) disari siparisOnaylandiDinle: dinleyici onayla aynı işlemde siparişi ve onaylayanı alır; reddi onayı geri alır, hatası çağırana döner; kapat ve iptal olay vermez | `SIP-17 ...` (disari.test.ts) |
| SIP-09 numara SS-yıl-sıra, yıl başına sayaç, tekil (`siparisler_siparis_no_tek`) | `kurallar.test.ts` `numara ...`, `siparisler.test.ts` `numara ...` |
| TKL-03 talep satırları yalnız ilk sürümden önce değişir | `kurallar.test.ts` `TKL-03 ...`, `teklif.test.ts` `TKL-03 ve TKL-04 ...` |
| TKL-04 sürümde her talep satırına tam bir fiyat | `kurallar.test.ts` `TKL-04 ...`, `teklif.test.ts` `TKL-03 ve TKL-04 ...` |
| TKL-05 teklif geçişleri (sürüm, revizyon, kabul, red, sipariş); red notlu (`siparisler_teklif_red_notlu`) | `kurallar.test.ts` `TKL-05 ...`, `teklif.test.ts` `TKL-05 ...`, `red notla ...` |
| TKL-06 kartsız satır siparişe dönüşmez; red ve siparişte kart bağlanmaz | `kurallar.test.ts` `TKL-06 ...`, `teklif.test.ts` `TKL-05 ve TKL-06 ...` |
| TKL-07 kabul edilen sürümün iskontolu fiyatıyla taslak sipariş; teklif siparişe bağlanır (`siparisler_teklif_siparis_tek`) | `teklif.test.ts` `TKL-05 ve TKL-06 ...` |
| TKL-08 verilen sürüm ve fiyat değişmez (`yalniz_ekleme`) | `verilen sürüm değişmez ...` |
| TKL-09 (E-24) her teklif ucu işlemi olmayana ve salt okuyana 403; olmayan teklife okuma ve her komut 404; ret kaydı değiştirmez | `teklif.test.ts` `TKL-09 ...` |
| TKL-10 (254 a) disari `teklifDurumlari` toplu okur: tek sorgu, yinelenen tek, olmayan haritada yok, boş dizide sorgu yok | `teklif.test.ts` `TKL-10 ...` |
| TKL-11 (291 a) iskontosu %10'u aşan sürüm 'onay-bekliyor'a düşer, müdüre bildirim gider; bekleyen teklif kabul edilmez, revizyon istenmez (422); onayı yalnız `siparisler.iskonto-onayla` verir (403), onaylayan ve an sürümde görünür; eşit oran onaysız geçer; yeni sürüm ya da red açık | `TKL-11 ...` (kurallar.test.ts, teklif.test.ts) |
| TKL-12 (293) `siparisler.iskonto-dort-goz` açıkken sürümü veren kendi iskontosunu onaylayamaz (422), başka yetkili onaylar; kapalıyken (varsayılan) veren de onaylar | `TKL-12 ...` (kurallar.test.ts, teklif.test.ts) |
| TKL-13 (44, 64 a, 62 a, 48 b) teklifin kartlı kalemleri tek denemede yerleşir; plan termini en geç kalemin, yerleşmeyen varsa yok; kartsız kalem plansız; istenen termin varsa termin odur; motor kayıtsızsa "cozucu-yok" | `kurallar.test.ts` `TKL-13 ...`, `teklif-deneme.test.ts` `motor kayıtsızken ...`, `TKL-13 deneme ...` |
| TKL-14 maliyet aynı yerleşimden: malzeme, işlem (ayar dahil, motorun tek tutarı), fason, tezgâh saatine genel gider (finans); biri bilinmiyorsa toplam null | `kurallar.test.ts` `TKL-14 ...` |
| TKL-15 (63 b) istenen termin başka siparişi geciktirirse satış taslağı ve teklif plancı onayı bekler, bildirim gider; onayı yalnız `plan.yaz` verir; iskonto ve termin onayı ayrı, ikisi bitmeden teklif verilmez | `kurallar.test.ts` `TKL-15 ...`, `teklif-deneme.test.ts` `TKL-15 ...` |
| TKL-16 (180, 65 a) termin `siparisler.termin-dene` olana; maliyet toplamı fiyat ya da maliyet görene; döküm ve genel gider oranı yalnız `siparisler.maliyet-oku`; plan taslaklı sürüm termin deneme ister | `kurallar.test.ts` `TKL-16 ...`, `teklif-deneme.test.ts` `TKL-13 deneme ...`, `TKL-09 yetki ...` |
| TKL-17 (49) satış taslağı geçerliliğe kadar yer tutar, yalnız istenen termin değişince yeniden yerleşir; geçerlilik geçince "satış denemesi" olur ve kilit vermez; elle sürüm, red ve siparişe dönüşüm yeri kaldırır; deneme taslağı yer tutmaz; teklif başına tek yer (`siparisler_teklif_plan_taslagi_tek_yer`) | `kurallar.test.ts` `TKL-17 ...`, `teklif-deneme.test.ts` `TKL-17 ...`, `plan taslağı veritabanında ...` |
| TKL-18 motor (Reçete ve Rota `teklifDene`) sonucu teklif satırlarına sırayla eşlenir; kayan siparişin gecikmesi anla, termini günle; yer tutan satış taslağı motora kalem termini ve adım başına makine ve başlangıçla gider | `kurallar.test.ts` `TKL-18 ...`, `teklif-deneme.test.ts` `TKL-15 ...` |
| TKL-19 plan denemesi şeridi motorun plan verisiyle gelir; sipariş emir noyla, satış taslağı teklif noyla, bu teklif "Bu teklif" adıyla; motor vermezse null | `kurallar.test.ts` `TKL-19 ...`, `teklif-deneme.test.ts` `TKL-19 ...` |
| TKL-20 adet değişirse: yarım, aynı, iki ve dört kat arkaya eklenerek ayrı denenir; çarpan 1 dışı tam adede yuvarlanır (en az 1); aynı adet tekrarlanmaz; maliyet denemedeki görünüşle; `siparisler.termin-dene` | `kurallar.test.ts` `TKL-20 ...`, `teklif-deneme.test.ts` `TKL-20 ...` |
| TKL-21 atölyedeki satış taslakları: yer tutan, onay bekleyen, son 30 günde süresi dolan; kalkan yok; kâr ve tutar yalnız `siparisler.fiyat-oku`; `siparisler.oku` | `teklif-deneme.test.ts` `TKL-21 ...` |
| Yetki: okuma `siparisler.oku`, taslak `siparisler.yaz`, onay/kapat/iptal `siparisler.onayla`; teklif okuma `oku`, bütün teklif yazmaları `yaz` | `siparisler.test.ts` ve `teklif.test.ts` `yetki: ...` |
| disari.ts sözleşmesi | `disari: ...` |
