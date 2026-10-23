# Kural -> test: idari-isler

| Kural | Test |
|---|---|
| IDR-01 talebi her personel kendi adına açar; açan ve zaman sunucudan; yer boş olamaz, kategori listeden | `idari-isler.test.ts` `IDR-01 ...`, `IDR-01 red ...`; istemci `Talep aç ...` |
| IDR-02 durum geçişleri: yeni -> yapılıyor (üstlen) -> yeni (bırak); yeni ya da yapılıyor -> kapandı / reddedildi; son durumdan geçiş yok; sürüm 409 | `kurallar.test.ts` `IDR-02 ...`, `idari-isler.test.ts` `IDR-02 akış ...`, `IDR-02 red ...` |
| IDR-03 yalnız açan, yalnız yeni talebi geri çeker | `kurallar.test.ts` `IDR-03 ...`, `idari-isler.test.ts` `IDR-03 ...`; istemci `yeni talep geri çekilir` |
| IDR-04 red nedeni zorunlu (`idari_isler_talep_red_nedeni`) | `IDR-04 ...`, `kısıtlar ...`; istemci `reddetmek neden ister ...` |
| IDR-05 personel yalnız kendi taleplerini görür; pano ve Bugün yalnız `oku` | `IDR-05 ...`, `IDR-05 pano ve Bugün ...`; istemci `... kökte kendi taleplerini görür` |
| IDR-07 başkasına atama yalnız etkin kişiye | `IDR-07 ...` |
| IDR-08 numara Sistem Ayarları kalıbından (varsayılan TT-yıl-sıra), ortak sayaç, dolu numara atlanır, tekil | `idari-isler.test.ts` `IDR-08 ...` |
| IDR-09 Bugün sırası: acil, yeni, yapılan; grupta eski önce | `kurallar.test.ts` `IDR-09 ...` |
| IDR-10 Bugün: yeni talepler ve kişinin üstlendikleri | `kurallar.test.ts` `IDR-10 ...`, `idari-isler.test.ts` `IDR-10 Bugün ...` |
| Yapılan talep üstlenensiz olamaz (`idari_isler_talep_yapiliyor_ustlenen`) | `kısıtlar ...` |
| IDR-11 sonraki tarih sıklıktan (gün, hafta, ay, yıl); ay sonu taşmaz | `kurallar.test.ts` `IDR-11 ...`, `kontroller.test.ts` `IDR-13 yapıldı ...` |
| IDR-12 grup: süresi geçti, 30 gün içinde, daha sonra; kalan gün tesis gününden | `kurallar.test.ts` `IDR-12 ...`, `kontroller.test.ts` `IDR-12 ...`; istemci `kalemler üç grupta ...` |
| IDR-13 kayıt: yapılma bugünden sonra olamaz; atıkta miktar (>0) ve birim zorunlu, başka türde yasak; sıklıksız kalemde sonraki tarih girilir ve yapılmadan sonradır; kayıt yalnız eklenir | `kurallar.test.ts` `IDR-13 ...`, `kontroller.test.ts` `IDR-13 ...`, `kısıtlar ...`; istemci `atık teslimi ...`, `sözleşme yenilemede ...` |
| IDR-14 Bugün'e süresi geçen ve 7 gün içindeki kalem düşer; periyodik sayacı süresi geçenleri sayar | `kurallar.test.ts` `IDR-14 ...`, `IDR-09 ...`, `kontroller.test.ts` `IDR-14 ...`; istemci `Bugün süresi geçen kalemi ...` |
| IDR-15 biten kalem listeden çıkar, değişmez (`idari_isler_kontrol_bitis_butun`) | `kontroller.test.ts` `IDR-15 ...` |
| Kalem firması etkin tedarikçi olmalı; sıklık sayı ve birimle birlikte (`idari_isler_kontrol_siklik_butun`) | `kontroller.test.ts` `ekleme reddi ...`, `firma seçenekleri ...`; istemci `kalem ekleme ...` |
| Menü sayaçları yetkiye göre | `menü sayaçları ...`; istemci `menu.test.ts` |
| Tekrar koruması | `tekrar koruması ...`; istemci `Talep aç ...` (istek kimliği başlığı) |
| IDR-16 sayı = kadro - izinli + fazla mesai + ziyaretçi + düzeltme; kayıt hesabı taşır (`idari_isler_yemek_bildirimi_hesap`), yalnız eklenir | `kurallar.test.ts` `IDR-16 ...`, `yemek.test.ts` `IDR-16 ...`, `düzeltme ...`; istemci `kadro, izinli ve fazla mesai sistemden gelir ...` |
| IDR-17 bildirim bugün ile 7 gün sonrası arasında; düzeltme gerekçeli (`idari_isler_yemek_bildirimi_gerekce`); değişen kadro ya da izinli reddedilir; sayı eksi olmaz | `kurallar.test.ts` `IDR-17 ...`, `yemek.test.ts` `IDR-17 ret ...`, `ileri gün ...` |
| IDR-18 kadro o gün vardiyası başlayan tekil kişiler; izinli yalnız kadrodakilerden; fazla mesai İK kaydı olan tekil kişiler, izinde olan sayılmaz; ekranın gördüğü sayı sunucununkiyle aynı değilse ret | `kurallar.test.ts` `IDR-18 ...` (test veritabanında vardiya kadrosu yok, uç testi kadroyu 0 görür) |
| Yemek sayacı: bildirme işlemi olana bugün bildirilmediyse 1 | `yemek.test.ts` `IDR-16 ...`; `idari-isler.test.ts` `menü sayaçları ...` |
| IDR-19 muayene ve sigorta 30 gün içinde ya da geçmişse, bakıma 1000 km kaldıysa uyarı; pasif araçta yok | `kurallar.test.ts` `IDR-19 ...`, `arac.test.ts` `IDR-20 ekleme ...`, `IDR-22 ...`; istemci `uyarı şeridi ...` |
| IDR-20 plaka "34 ABC 123" biçiminde, il 01-81, tekil (`idari_isler_arac_plaka_tek`) | `kurallar.test.ts` `IDR-20 ...`, `arac.test.ts` `IDR-20 ...`, `ret ...`, `tekrar koruması ve tekil plaka ...` |
| IDR-21 km geriye yazılmaz | `kurallar.test.ts` `IDR-21 ...`, `arac.test.ts` `IDR-21 ...` |
| IDR-22 Bugün'e geçmiş ya da 7 gün içindeki tarih ve geçmiş km uyarısı düşer; filo sayacı geçmiş uyarılı araçlar | `kurallar.test.ts` `IDR-22 ...`, `IDR-09 ...`, `arac.test.ts` `IDR-22 ...` |
| IDR-23 görev geçişleri: bekliyor -> onaylandi -> yolda -> tamamlandi; red ve geri çekme araç çıkmadan; durum bütünlüğü kısıtlarla | `kurallar.test.ts` `IDR-23 ...`, `gorev.test.ts` `IDR-23 akış ...`, `IDR-24 ve IDR-23 ret ...`, `tutarlılık kısıtları ...` |
| IDR-24 talep bugün ile 60 gün sonrası arasında; dönüş gidişten önce değil; en çok 30 gün | `kurallar.test.ts` `IDR-24 ...`, `gorev.test.ts` `IDR-24 ve IDR-23 ret ...` |
| IDR-25 pasif ya da serviste araç verilmez; aynı araç kesişen tarihlerde iki onaylı ya da yoldaki görevde olmaz | `kurallar.test.ts` `IDR-25 ...`, `gorev.test.ts` `IDR-25 ...` |
| IDR-26 çıkış km aracın km'sinden, dönüş km çıkıştan küçük değil; araç km'si ve durumu görevle yazılır | `kurallar.test.ts` `IDR-26 ...`, `gorev.test.ts` `IDR-23 akış ...` |
| Görev sayaçları: onay bekleyen (oku), kişinin açık talepleri (arac-talebi-ac) | `gorev.test.ts` `IDR-23 akış ...`; `idari-isler.test.ts` `menü sayaçları ...` |
| IDR-27 masraf tutarı sıfırdan büyük, en çok iki kuruş basamaklı, en çok 9.999.999.999,99; tarih bugünden ileri değil | `kurallar.test.ts` `IDR-27 ...`, `masraf.test.ts` `IDR-27 akış ...`, `IDR-27 ret ...`, `tablo kısıtı ...` |
| IDR-28 masraf değişmez; gerekçeyle bir kez iptal edilir, iptal yıl toplamına girmez; iptal alanları birlikte | `masraf.test.ts` `IDR-28 ...`, `tablo kısıtı ...` |
| IDR-29 demirbaş değeri yoksa null; varsa sıfırdan büyük, en çok iki kuruş basamaklı | `kurallar.test.ts` `IDR-29 ...`, `zimmet.test.ts` `IDR-29, IDR-30 ve IDR-31 ret ...` |
| IDR-30 yalnız boştaki demirbaş etkin kişiye zimmetlenir; bir demirbaş tek kişide; zimmetli durum elle değişmez; hurda son durum | `kurallar.test.ts` `IDR-30 ...`, `zimmet.test.ts` `IDR-30 ve IDR-31 akış ...`, `IDR-30: zimmetli ...`, `tablo kısıtı ...` |
| IDR-31 iade ileri ve verilişten önce olmaz; sağlam boşa, hasarlı bakıma, kayıp kayba; iade bir kez | `kurallar.test.ts` `IDR-31 ...`, `zimmet.test.ts` `IDR-31 ...`, `IDR-29, IDR-30 ve IDR-31 ret ...` |
| IDR-32 İK kopyası: iptalsiz kayıt demirbaş ve zimmet olur, kişisiz personel adla gelir ve bir kez kişiye bağlanır, ikinci çalışma kopyalamaz | `zimmet.test.ts` `244 kopya göçü ...` (İK DROP göçüyle kalkar), `IDR-32: kişisiz (adla) zimmet ...` |
