# Kural - test eşlemesi (proje-maliyet)

| Kural | Tanım | Test |
|---|---|---|
| PM-01 | Süre x saat maliyeti; işçilik kişi başına katılım x saat maliyeti; eksikte null | kurallar.test.ts "PM-01" |
| PM-02 | Tamamlanma: bitmiş 1, açık sağlam/adet, sayımsız 0 | kurallar.test.ts "PM-02" |
| PM-03 | Planı ya da gerçeği bilinmeyen kalem toplamlara girmez | kurallar.test.ts "PM-03" |
| PM-04 | Kayıt toplamı; bugüne kadarki plan = plan x tamamlanma | kurallar.test.ts "PM-04, PM-12" |
| PM-05 | Kalem kırılımı ve sapma oranı; kayıt yoksa null | kurallar.test.ts "PM-05"; proje-maliyet.test.ts "PM-15" |
| PM-06 | Haftalık birikimli eğri, pazartesiden, boşluksuz | kurallar.test.ts "PM-06" |
| PM-07 | Tahmini bitiş | kurallar.test.ts "PM-07, PM-08" |
| PM-08 | Gecikme günü = tahmini bitiş - termin, en az 0 | kurallar.test.ts "PM-07, PM-08" |
| PM-09 | Kâr riski = katkı x günlük oran x gün (194 a; oran plan bedel ayarından, 227 a); zararda 0 | kurallar.test.ts "PM-09" |
| PM-10 | Gecikme cezası tavanla; tavan boşsa %10 (plan motoruyla aynı) | kurallar.test.ts "PM-10" |
| PM-11 | En çok sapan 5 iş emri ve nedeni | kurallar.test.ts "PM-11" |
| PM-12 | Hedef = bütçe ya da plan; katkı = gelir - (gerçek + kalan plan); maliyet tam değilse katkı ve oranları null (#10) | kurallar.test.ts "PM-04, PM-12" |
| PM-13 | `finans.maliyet-oku` yoksa 403; girişsiz 401; olmayan proje 404 | proje-maliyet.test.ts "PM-13" |
| PM-14 | `siparisler.fiyat-oku` yoksa tutar, gelir, katkı, sapma, kâr riski null | proje-maliyet.test.ts "PM-14"; ProjeMaliyeti.test.tsx |
| PM-15 | Bağlanmamış kaynakta maliyet null ve eksik bildirilir | proje-maliyet.test.ts "PM-15"; ProjeMaliyeti.test.tsx |
| PM-16 | Yalnız bitmiş, bitiş zamanı bilinen, defterde olmayan iş emri dondurulur (199 a) | kurallar.test.ts "PM-16" |
| PM-17 | Defterdeki bitmiş iş emri defterden okunur, açık iş güncel fiyatla | kurallar.test.ts "PM-17" |
| PM-18 | Dondur ucu yok (236 a): ekran deftere yazamaz, 404 | proje-maliyet.test.ts "PM-18" |
| PM-19 | Defter yalnız ekleme; aynı iş emri ikinci kez yazılmaz; ücretler satırda | proje-maliyet.test.ts "PM-19"; ekran yalnız okur: ProjeMaliyeti.test.tsx |
| PM-18 (kural) | İş emri kaydı: plan rota süresi x istasyon saat maliyeti, gerçek ölçülen süre; başlamamış iş 0, ayar olayı yoksa ayar null, işçilik planı null; fason siparişten | kurallar.test.ts "PM-18" |
| PM-20 | Projenin iş emri bağlı: istasyon maliyeti yoksa eksik bildirilir; varsa plan 900, gerçek 0 | proje-maliyet.test.ts "PM-20" |
| PM-21 (kural) | Genel gider (206 a): makine ya da makinesi atanmamış istasyon adımına (işleme + ayar) saati x saat başı oran; kişi ve fason adımı yük almaz; oran ya da süre yoksa null. H8: kural tek yerde (`genelGiderYukAlir`, `genelGiderTutari`), `disari.ts` ile teklif maliyetine de verilir | kurallar.test.ts "PM-21", "H8 tek genel gider kuralı" |
| PM-22 | Finans oranı girilince genel gider kalemi toplama girer; oran yoksa `genel_gider_orani_yok` ve kalem toplam dışı | proje-maliyet.test.ts "PM-20", "PM-22"; kurallar.test.ts "H8 genel gider eksikleri" |
| PM-23 (kural) | Tahmini iş emri maliyeti = işleme + ayar + fason planı; işçilik ve genel gider girmez; biri bilinmiyorsa null | kurallar.test.ts "PM-23" |
| PM-24 | `disari.ts` `isEmriTahminiMaliyetleri`: istasyon ücretiyle 900; ücret yoksa null; bulunmayan iş emri haritada yok | proje-maliyet.test.ts "PM-24" |
| PM-25 (kural) | Malzeme planı = Σ brüt x birim fiyat - talaş; talaş = kütük kg - adet x net kg (en az 0), kg ağırlıklı talaş fiyatı; fiyat yoksa null, talaş verisi eksikse düşülmez | kurallar.test.ts "PM-25" |
| PM-26 | Emir başına malzeme kaydı: bileşensiz ve sarfsız 0; fiyatsız bileşende plan, fiyatsız sarfta gerçek null ve `birim_maliyet_eksik` | proje-maliyet.test.ts "PM-26" |
| PM-27 | Gerçek malzeme = stok `emirlerinNetSarfi` net sarfı x birim fiyat - talaş (PM-25 kuralı); iç yarımamul sayılmaz | proje-maliyet.test.ts "PM-26" |
| PM-28 (kural) | Günlük faiz = aylık yüzde / 100 x 12 / 365; faiz yoksa null | kurallar.test.ts "PM-29" |
| PM-29 (kural) | Bekleme finansmanı = taban (dahil malzeme, işleme, ayar, fason, işçilik; genel gider değil) x günlük faiz x kaydın gününden tahsilata gün; plan tahsilatı en geç plan tarihi + vade; gerçekte açık projede bugün, bitmişte en geç gerçek tarih + vade, bugünle sınırlı; faiz ya da plan tarihi yoksa o taraf null | kurallar.test.ts "PM-29" |
| PM-30 | TL faizi yoksa `faiz_yok`, vadesiz siparişte `vade_yok`; plan tarihi yoksa finansman planı null, başlamamış işte gerçek 0 | proje-maliyet.test.ts "PM-30" |
| PM-31 (kural) | Gerçek talaş (E-5): açık emirde yalnız ilk adımı geçen adet işlenmiş ve parçada sayılır; bitmiş emirde bütün kütük işlenmiş, parçada son adımın sağlamı kalır (hurda metali talaş) | kurallar.test.ts "PM-31" |
| PM-32 | Genel gider oranı amortismanı içermiyorsa `amortisman_dahil_degil` bildirilir (E-9) | proje-maliyet.test.ts "PM-22", "PM-32"; kurallar.test.ts "H8 genel gider eksikleri" |
| PM-33 | `disari.ts` `uretimEmriMalzemeMaliyetleri`: emrin planlanan malzemesi PM-25 kuralıyla; bileşensiz 0, fiyatsız null, bulunmayan emir yok | proje-maliyet.test.ts "PM-33" |
| PM-34 | Kâr riski oranı plan bedel ayarından (`karRiskiOraniGun`); sabit 0,3 kalktı (227 a) | proje-maliyet.test.ts "PM-34" |
| PM-35 | Defteri sunucu işi yazar (236 a): biten iş emri yazılır, donduran boş; ikinci tur yazmaz; açık iş emri ve ekran açılışı yazmaz | proje-maliyet.test.ts "PM-35" |
| PM-36 | Proje geliri = emir adedi x sipariş satırı birim fiyatı; faturalanan kısım fatura kuruyla, kalanı bugünün kuruyla (226 a, 225, 1398 a); iptal siparişin satırı 0; bağlı emir, fiyat ya da kur yoksa null | kurallar.test.ts "PM-36" |
| PM-37 | Aynı siparişin iki projesi kendi payını alır (#9); satırsız emir `satirsiz_emir`; eksik maliyette katkı null (#10); iptal sipariş gelir değil (#38) | proje-maliyet.test.ts "PM-37" |
| PM-38 | Kur farkı = faturalanan kısmın bugünün kuruyla değeri eksi fatura kuruyla değeri; gelire eklenmez, ayrı kart (1398 a); TL kesilen fatura sipariş para birimine belge günü kuruyla çevrilir; fiyat yetkisi yoksa null | kurallar.test.ts "PM-38", proje-maliyet.test.ts "PM-38" |
| PM-39 | Faturalanan oran = (fatura - iade) / sipariş KDV hariç tutarı, en çok 1; faturalar siparişe bağlı olduğundan siparişin bütün satırlarına aynı oranla dağılır (1398 a, varsayım); belge tutarı ya da sipariş tutarı bilinmezse gelir bilinmez (`kur_yok`) | kurallar.test.ts "PM-39" |
| PM-40 | Taban (934, 936 a): elle alınır, iş emri olmayan projede alınmaz (422); ilk taban gerekçesiz, yenileme gerekçeli (`proje_maliyet_taban_yenileme_gerekceli`); sıra tekil (eşzamanlı ikinci alış 409); yalnız ekleme; içerik o anki plan (toplam, kalem, toplama girmeyen kalem, iş emri sayısı), kişi ve zaman sunucudan | kurallar.test.ts "PM-40"; taban-masraf.test.ts "PM-40", "tekrar koruması"; ProjeMaliyeti.test.tsx |
| PM-41 | Masraf bağı (911 b, 940 c): yalnız iptal edilmemiş, satın almaya bağlı olmayan, proje masrafı türündeki gider belgesi (faiz, vergi, kredi, kur farkı girmez); bir belge tek projede (409); görev aynı projeden (bileşik yabancı anahtar, 409); olmayan belge ve proje 404 | kurallar.test.ts "PM-41"; taban-masraf.test.ts "PM-41"; ProjeMaliyeti.test.tsx |
| PM-42 | Son gerçekleşen = üretim gerçekleşeni + iptal dışı masraf (KDV hariç TL); tahmini son = son gerçekleşen + kalan plan; fark = tahmini son - taban planı; bilinmeyen taraf null; bağdan sonra iptal edilen belge listede kalır, toplama girmez | kurallar.test.ts "PM-42"; taban-masraf.test.ts "PM-40", "PM-41" |
| 940 c yetki | Taban, masraf bağı ve seçici `projeler.yaz`; seçicide tutar yalnız `finans.maliyet-oku` olana; maliyet okuması `finans.maliyet-oku` | taban-masraf.test.ts "940 c yetki" |
