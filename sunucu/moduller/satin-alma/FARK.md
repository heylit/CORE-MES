# FARK: satin-alma, değere dahil olmayan stok Stok'un değer gruplarıyla (228 a; 19.10.2026)

- Kg stok değeri bakiyeyi stok/disari degerGrubuToplamlari'ndan alır (kablolama çözücüsü); kullanılabilir grubu değeri verir.
- "Değere dahil olmayan" kartı tek toplam ve grup kırılımı gösterir: kalite bekleyen, hurda, fason, yolda, diğer. Üretimde ve kalan kartları kaldırıldı.
- Satın almadaki kalan hesabı (stokKirilimi) kaldırıldı; tanım tek yerde, Stok'ta. Göç ve yetki değişikliği yok.

# FARK: satin-alma, stok değeri yalnız kullanılabilir stoktan (228 a; 19.10.2026)

- Kg fiyatları sayfasındaki stok değeri kartları ve sütunu yalnız kullanılabilir stoku sayar: raf, kabul, zemin konumunda, statüsüz, kalite durumu serbest ya da şartlı (stok/disari stokMiktarlari.kullanilabilir).
- Üretimdeki stok ve kalanı (hurda, fason, yolda, karantina, istasyon, kalite bekleyen ya da red) iki ayrı kartta görünür, değere girmez. Kalanın satır satır kırılımı Stok disari'den verince gelir.
- Stok modülünde değişiklik yok: kalan = toplam − kullanılabilir − üretimde (`kurallar.ts` stokKirilimi). Göç ve yetki değişikliği yok.

# FARK: satin-alma, kg fiyatları sayfasında hammadde stok değeri (SAT-77; 19.10.2026)

- `GET /satin-alma-kg-fiyatlari` cevabına `stokDegeri`: hammadde stok değeri güncel kg fiyatıyla ve ortalama alış fiyatıyla, satır başına kg fiyatıyla tutar, fiyatsız stoklu kalem sayısı. Yalnız `finans.oku` olana (Stok ekranıyla aynı), değilse null ve ekranda çizilmez.
- Stok miktarı `disari.ts` `stokMiktariCozucusu` ile gelir; bağ `sunucu/kablolama.ts`'te `stok/disari` `stokMiktarlari` ile (stok satın almayı ithal ettiği için döngü olmaz; koordinatör kararı b). Bağ yoksa tutarlar boş.
- Yeni uç, işlem, rol x işlem, göç ve paket yok.

# FARK: satin-alma, kg fiyatını maliyet okuyan da görür (215 a; 19.10.2026)

- `GET /satin-alma-kg-fiyatlari`, `/gecmis`, `/malzemeler`: yetki `satin-alma.oku`, `satin-alma.yaz` ya da `finans.maliyet-oku`. Fiyat girişi (`/ekle`) yalnız `satin-alma.yaz`. Yeni işlem, rol x işlem, göç ve paket yok.
- Menüdeki "Kg fiyatları" maddesi `satin-alma.oku` ister; bugün maliyet okuyan iki rol (müdür, muhasebe/finans) satın almayı zaten okuyor.

# FARK: satin-alma, malzeme kg fiyatları ve talaş fiyatı (SAT-77, 214 a; 19.10.2026)

- Yeni boş tablo `satin_alma_kg_fiyati` (göç `20261019095200`): kalite + form başına kg fiyatı, talaş satış fiyatı (boş olabilir, 214 a), para birimi, geçerlilik, giren kişi; yalnız eklenir.
- Uçlar: `GET /satin-alma-kg-fiyatlari` (güncel fiyatlar + fiyatı olmayan kaliteler), `GET /satin-alma-kg-fiyatlari/gecmis`, `POST /satin-alma-kg-fiyatlari/ekle` (tek ya da toplu). Mevcut yetkiler; yeni işlem ve rol x işlem yok.
- `GET /satin-alma-kg-fiyatlari/malzemeler?nolar=1,2` (en çok 200): malzeme ekranının köprüsü birim fiyatı buradan okur; cevap `{ malzemeler: [{ malzemeNo, kaliteKodu, form, kgFiyati, paraBirimi, tryKgFiyati, gecerlilik, birimFiyati, tryBirimFiyati, talasKgFiyati, tryTalasKgFiyati }] }`, fiyatı olmayan malzeme listede yok. Yetki şimdilik `satin-alma.oku`/`yaz`; `finans.maliyet-oku` eklenmesi onay bekliyor.
- Ekran: ikinci menüde "Kg fiyatları"; arama, tek fiyat, Excel/CSV yapıştırma, satıra basınca geçmiş, fiyatı olmayan kaliteler listesi.
- `disari.ts` `malzemeKgFiyatlari(db, malzemeNolar)`: malzemenin uygulanan kg fiyatı (forma özel, yoksa kalitenin formsuz fiyatı), stok biriminin birim fiyatı ve talaş fiyatı, TRY karşılıklarıyla. Malzeme bilgisi yalnız Malzemeler `disari` üzerinden. Stok değeri ve malzeme kartındaki birim fiyat o modüllerin sahiplerince bağlanır.

# FARK: satin-alma, iş emri başına fason tutarı (proje maliyeti isteği, 197 a; 19.10.2026)

- `disari.ts` `isEmriFasonTutarlari(db, isEmriIdleri)`: iş emrine bağlı sipariş satırlarının KDV hariç tutarı, para birimi başına bir satır. İskonto satıra düşer; nakliye ve diğer masraf teklif başınadır, dağıtılmaz. İptal talep sayılmaz; tutar sipariş edilen miktarladır, teslimle değişmez.
- Salt okuma. Göç, uç, rol x işlem ve paket yok.

# FARK: satin-alma, ekran borcu (borç 16, 19, 28; 19.10.2026)

- `merkez/styles.css`: sıralama, toplu teklif ve deneme tablosu kırılımları pencereye değil kendi kabına bakar (`@container`); kabuk menüsü açıkken tablette masaüstü düzeni kalmıyor. Ekranın düzeni ve akışı değişmedi.
- Yeni test `menu.test.ts`: ikinci menü rotaları ve rol setleri.
- 360/768/1280 ekran denemesi yapıldı; sonuç UYUM-BORCU 16 ve 28'de. Göç, uç, rol x işlem ve paket yok.

# FARK: satin-alma, siparişe bağlı iş emri silinmez (karar 143 a; 19.10.2026)

- Davranış zaten kısıttaydı: `satin_alma_siparis_satiri_is_emri` (NO ACTION) bağlı iş emrinin silinmesini reddeder. Yeni test bunu sabitler: bağlıyken silme reddedilir, bağ kalır; bağ kaldırılınca silinir.
- Göç, uç, rol x işlem ve paket yok. Üretim emirlerinden özel ileti istendi (BASKA-MODUL-ISTEKLERI). UYUM-BORCU 41 KAPANDI.

# FARK: satin-alma, askıdaki tedarikçiye sipariş verilmez (SAT-76, karar 87; 19.10.2026)

- `POST /satin-alma-talepleri/:id/kaydet`: yeni siparişin teklif firması `satin_alma_tedarikci.durum = 'askida'` ise 422; ileti tedarikçinin adını ve ne yapılacağını yazar, ekran sunucu iletisini gösterir (`tasiyici.ts` `hata`).
- Yeni sipariş: talep siparişe girerken bütün siparişler; siparişteyken eklenen ya da teklifinin firması değişen sipariş (`yeniSiparisFirmalari`). Var olan sipariş tedarikçi sonradan askıya alınsa da düzenlenir. Onay (Portal ve satın alma ekranı, `satin-alma.onayla`) siparişi açmaz; denetim sipariş anındadır.
- Sorgu `askidakiTedarikciler`. Göç, rol x işlem ve paket yok. Testler: `kurallar.test.ts` SAT-76, `satin-alma.test.ts` SAT-76.
- VARSAYIM: iptalden siparişe geri dönüş yeni sipariş sayılır (tedarikçi askıdaysa reddedilir). Geri alma: ucuz.
- VARSAYIM: askıdaki tedarikçiden teklif almak ve karar vermek serbest kalır; yalnız sipariş reddedilir. Geri alma: ucuz.

# FARK: satin-alma, tür denetimi katalog ve tam talep uçlarında da (SAT-75, ara inceleme bulgusu; 14.10.2026)

- `POST /satin-alma-katalogu/kaydet`: yeni bağ ya da kart değişikliği satın alınabilir kart ister (`satinAlinabilirKartReddi`: fiziksel tür ya da alınan hizmet); verilen hizmet 400.
- `POST /satin-alma-talepleri/ac` ve `/:id/kaydet`: kaleme yeni bağlanan katalog kaleminin kartı aynı kurala uyar. Bağı değişmeyen kalem denetlenmez (eski veri düzenlenebilir kalır).
- Sorgu `katalogMalzemeNolari`. Testler: `kurallar.test.ts` #375 (SAT-75 satırları), `satin-alma.test.ts` "SAT-75: katalog ve tam talep". Mutasyon: talep denetimi kapatılınca test düşüyor.
- VARSAYIM: tam talepte tür alanı yoktur; aynı talepte fiziksel kalem ve alınan hizmet birlikte olabilir. Geri alma: ucuz.

# FARK: satin-alma, ticari mal talepte seçilir (kart #1218; 14.10.2026)

- Malzemelere yedinci tür `ticari_mal` geldi (#1224). `TALEPTE_SECILEN_TURLER`e eklendi: malzeme talebinde ve seçenek listesinde ticari mal kartı seçilir, hizmet talebinde seçilmez (SAT-75). Göç, rol x işlem ve paket yok. Test: `kurallar.test.ts` #375.

# FARK: satin-alma, talepte Malzeme / Hizmet türü ve açılır kart listesi (kart #1192; 14.10.2026)

- Kullanıcı isteği 14.10.2026: Taleplerim'deki satın alma talebinde kalem Malzemeler ve Hizmetler listesinden kolay seçilsin; talebe Malzeme ve Hizmet türü gelsin. Göç, rol x işlem ve yeni paket yok.
- Sözleşme: `TALEP_TURLERI` (`malzeme`, `hizmet`); `malzemeSecenekleriSorgusu` `tur` alır (varsayılan `malzeme`) ve `ara` boş olabilir (boş arama listenin ilk sayfası); `hizliAcGovdesi` `tur` alır (varsayılan `malzeme`).
- Kural SAT-75 `talepKartiReddi(kart, tur)` + `TALEP_TURU_KARTLARI`: malzeme talebi fiziksel kartları (`TALEPTE_SECILEN_TURLER`), hizmet talebi yalnız alınan hizmet kartını seçer; öbür tür 400 (`kartTuruTalepteYok`). Seçenek listesi aynı süzgeçle gelir (malzemelerin `malzemeAra` `turler` ve `hizmetYonu`).
- Kartsız (adıyla yazılan) hizmet kaleminin kategorisi `Hizmet` yazılır (`KARTSIZ_KATEGORI`); kartlıda kategori karttan.
- Ekran (`TalepAc.tsx`): formun başında Malzeme / Hizmet seçimi (tür değişince kalemler boşalır); kalem alanı açılır aranabilir liste (odaklanınca ilk kartlar, yazdıkça kod, ad ya da kart no'suyla daralır; ok tuşları ve Enter; satırda kod, ad, kategori, birim).
- Testler: sunucu `#1192` (liste ve hızlı açma, izinli ve reddedilen), kural testi; istemci `#1192` iki test.
## Bu turda varsayılanlar
1. Tür talep başınadır, kalem başına değil; karışık talep iki talep olarak açılır. Geri alma: orta (ekran ve gövde).
2. Kategori adıyla arama yok: malzemelerin araması yalnız kod, ad ve no'ya bakar; istek BASKA-MODUL-ISTEKLERI.md "Malzemeler"de. Kategori listede görünür.
3. Birimsiz hizmet kartı talepte seçilmez (var olan `kartBirimsiz` kuralı). Geri alma: ucuz.
4. Tür ayrı sütunda saklanmaz; kartlı kalemde karttan, kartsızda kategoriden okunur. Geri alma: ucuz (göçsüz).

# FARK: satin-alma, dış operasyonlar üretim emirlerine bağlandı (kart #878, #542 U3; 12.10.2026)

- Kullanıcı onayı 12.10.2026 13:36 ("Yaz"). Liste üretim emirlerinin `fasonIsEmirleri` işlevinden gelir (#838): açık emirlerin bitmemiş fason iş emirleri; firma adı finanstan. `dis-operasyon-gecici.ts` silindi; uç her zaman `hazir: true` döner. Göç ve rol değişikliği yok.
- Varsayımlar: termin ilk gidiş günü (İstanbul) artı termin günüdür; planlanan gidiş plan bağlanana kadar boştur. Sayfadan firma ve termin yazımı (U2) bu turda yok.

# FARK: satin-alma, numaralar numara kuralından (kart #855; 12.10.2026)

- Kullanıcı onayı 12.10.2026 12:50 ("Yaz, göçler onaylı"). Talep, sipariş ve katalog kodu Sistem ayarlarındaki numara kuralından (`satin-alma.talep-no`, `-siparis-no`, `-katalog-kodu`; `ayarlar/disari.ts` `numaraAl`). Varsayılan kalıplar bugünkü biçimi verir; kalıp değişince eski numarayla çakışan numara atlanır.
- Göç `20261012145457_satin_alma_numara_kurallari.sql`: talep numarası hesaplanan sütun olmaktan çıkar (var olan numaralar satırda kalır), zorunlu ve tekil; yıl ve sıra boş olabilir. Sipariş ve katalog numarasının sabit biçim kısıtı genel kısıta döner.
- Talep ve sipariş numarası Logo fiş numarası olduğu için en çok 16 karakter; uzun kalıp kayıt açtırmaz (422, "numara kuralını kısaltın").
- Varsayımlar: eski yıllık sayaç tabloları ve yıl/sıra sütunları kalır, yazılmaz; katalog kodu en çok 40 karakter; talep formundaki taslak numara istemci tahmini olarak kaldı.

# FARK: satin-alma, Logo siparişinin kalanını kapat (kart #830, #205 karar 2-b; 12.10.2026)

- Göç `20261012132500_satin_alma_siparis_kapatma.sql` (kullanıcı onayı 12.10.2026 13:24): `satin_alma_siparis` boş olabilen `logo_kapatma_durumu` (bekliyor, gonderildi, hata) ve `logo_kapatma_hata`. Var olan siparişler değişmez.
- `POST /satin-alma-talepleri/:id/siparis-kapat` (`satin-alma.yaz`, gerekçe zorunlu): Logo'ya gitmiş, teslim kalanı olan siparişin kalanı kapatılır ve Logo kapatma kuyruğuna girer. Kapatılan siparişe teslim yazılmaz, mal kabul listesinde çıkmaz, içeriği değişmez, teslimi tamam sayılır. Talep iptalinde gitmemiş kapatma düşer; geç gelen kapatma sonucu yok sayılır.
- `disari.ts`: `logoyaKapatmaGidecekSiparisler` (Logo kayıt ve satır numaralarıyla), `siparisLogoKapatmaSonucu` (yetki denetlemez). Ekranda "Kalanı kapat" düğmesi ve Logo rozetinde kapatma durumu.
- Varsayımlar: kapatma geri alınmaz; düğme yalnız Logo'daki açık siparişte çıkar.

# FARK: satin-alma, talep fişi ve karşılama Logo'ya (kart #790, #205 S3 b; 12.10.2026)

- Göç `20261012124100_satin_alma_logo_talep.sql` (kullanıcı onayı 12.10.2026 11:37): talep ve kaleme tekil `sayi_id`, talebe `logo_kayit_no`, `logo_gonderim_durumu`, `logo_hata`; kaleme `logo_satir_ref`; sipariş satırına `logo_karsilama_ref`, `logo_karsilama_durumu`, `logo_karsilama_hata`. Var olan kayıtların Logo durumu boş kalır.
- Karar bu kayıtta onaylanınca talep fişi Logo kuyruğuna girer (`talepFisiGiderMi`); iptal edilen talebin gitmemiş fişi kuyruktan çıkar.
- Karşılama kuyruğu türetilir: sipariş satırı ve talep kalemi Logo'da satır numarası almışsa, siparişin iptali kuyrukta değilse ve kartın stok kodu varsa satır gelir; hata kuyrukta kalır.
- `disari.ts`: `logoyaGidecekTalepler`, `talepLogoSonucu`, `logoyaGidecekKarsilamalar` (Logo sipariş kayıt numarasıyla), `karsilamaLogoSonucu` (yetki denetlemez).
- Varsayımlar: fiş tarihi talebin açıldığı gün (İstanbul). Fiş gittikten sonra eklenen kalem ve değişen miktar Logo'daki fişe ve karşılamaya gitmez; gönderilmiş fişin iptali yok (Logo'dan istenmedi). Talep fişinin durumu ekranda görünmez.

# FARK: satin-alma, açık Satın Alma ekranı kendini yeniler (Taleplerim, 12.10.2026)

- Açık Satın Alma ekranı 30 saniyede bir ve sekmeye dönülünce sunucudan yenilenir: başka kişinin Taleplerim ya da ana sayfadan açtığı talep sayfa değiştirmeden görünür. Kullanıcı yazarken, pencere açıkken ya da geri al beklerken yenilenmez. Varsayım: 30 saniye.

# FARK: satin-alma, siparişin Logo'ya gönderimi (kart #780, #205 karar 1; 12.10.2026)

- Göç `20261012111100_satin_alma_logo_siparis.sql` (kullanıcı onayı 12.10.2026): `satin_alma_siparis` tekil `id` ve `logo_*` sütunları (gönderim, iptal, düzenleme), satıra `logo_satir_ref`. Var olan siparişin Logo durumu boş kalır, kendiliğinden gitmez.
- Talep siparişe geçince siparişleri Logo kuyruğuna girer (S1 a); kayıtsız tedarikçinin siparişi "hata". Logo'ya gitmiş siparişin satırı, miktarı, birim fiyatı, iskontosu ya da termini değişince düzenleme kuyruğuna girer (S2 b); tedarikçisi ve para birimi değişmez, sipariş karardan çıkmaz; irsaliyesi gelmiş (teslimi olan) Logo siparişinin içeriği değişmez. İptalde Logo'daki kaydın iptali kuyruğa girer, bekleyen düzenleme düşer; Logo'da kaydı olan sipariş iptalden geri alınmaz.
- `disari.ts`: `logoyaGidecekSiparisler`, `siparisLogoSonucu`, `logoyaIptalGidecekSiparisler`, `siparisLogoIptalSonucu`, `logoyaGuncellemeGidecekSiparisler` (Logo kayıt ve satır numaralarıyla; kaldırılan satırların numaraları `kaldirilanSatirRefleri` listesinde, düzenleme gidince boşalır), `siparisLogoGuncellemeSonucu` (yetki denetlemez). Sözleşme `siparisCikisSemasi.logo`; ekranda sipariş numarasının yanında Logo rozeti.
- Varsayım: sipariş tarihi boşsa Logo'ya gönderim günü (İstanbul). Kuyruk okunup sonuç yazılana kadar yapılan değişiklik Logo'ya gitmeyebilir (logo oturumuna bildirildi). Açılışta siparişler eklenme sırasıyla gelir (önceden sırasızdı).

# FARK: satin-alma, iş kutusu özet panosu ve stok için ortalama alış fiyatı (12.10.2026)

- İş kutusunun üstünde sayı şeridi (onay bekleyen, açık talep, açık sipariş tutarı, geciken teslim, bu ay harcama); altında yapılacaklar ve tedarikçi teslim başarımı. Özet ucu `acikSiparisTutari` verir (TL; kuru bilinmeyen açık sipariş varsa boş).
- Stok isteği (kullanıcı kararı 12.10.2026, stok değeri ağırlıklı ortalama): `disari.ts` `ortalamaAlisFiyatlari(db, malzemeNolar)` istenen her malzeme için pozitif teslimlerin TRY birim fiyatı, teslim miktarıyla ağırlıklı; teslimi yoksa fiyat boş. Kur kuralı son alış fiyatındakiyle aynı; iskonto ve masraf dağıtılmaz; geri alma kaydı girmez.

# FARK: satin-alma, depo panosunda mal kabul bekleyen satır (rol panoları incelemesi, 11.10.2026)

- Depo (`stok.giris`) ana sayfada "Mal kabul bekleyen sipariş satırı" kartını görür; sayı satın almanın teslim bekleyen satır sayısıdır, kart stoktaki Mal kabul'e gider. Özet ucu bu sayıyı `stok.giris` olana da verir; öteki sayılar depoya null.
- Stok isteği (stok değeri): `disari.ts` `sonAlisFiyatlari(db, malzemeNolar)` malzeme no -> son teslim alınan sipariş satırının teklif birim fiyatı, para birimi, TRY karşılığı, teslim zamanı. Göç yok. Varsayımlar: iskonto ve masraf dağıtılmaz; TRY karşılığı sabit kur, yoksa teklif kuru (güncel kur satın almada yok, finansta); geri alma kaydı son teslim sayılmaz.
- Varsayım: yönetici iki kartı da görür (satın alma ve depo). Geri alma: kart kaydı ve `panoOzeti`.

# FARK: satin-alma, ayarlar Sistem Ayarları'nda da (kart #587, kullanıcı madde 8)

- `istemci/src/moduller/satin-alma/ayar-ekranlari.tsx`: satın almanın Ayarlar ekranı (`AyarlarSayfasi`) Sistem Ayarları'nda "Satın Alma" başlığıyla da görünür (`satin-alma.ayar`, sıra 20). Ekran ve uçlar aynı; modül sayfasındaki yerinde kalır.

# FARK: satin-alma, dış operasyonlar iskeleti (kart #542; taban main 270cc94)

Kullanıcı: D1 a, D4 a (11.10.2026 15:08) ve "yaz" (15:46). Liste: bagla/dis-operasyon-sayfasi.md, Yazım bölümü madde 2.
## Eklenen
- Göç `20261011194500_satin_alma_siparis_is_emri.sql`: `satin_alma_siparis_satiri.is_emri_id` (boş olabilir, `uretim_emirleri_is_emri`'ne yabancı anahtar; bağlı iş emri silinemez).
- Uç `GET /satin-alma-dis-operasyonlar` (`satin-alma.oku` ya da `yaz`); sözleşme `disOperasyonlarCevabi`. Kaynak geçici karşılık (boş, `hazir: false`; UYUM-BORCU 40).
- Kural `gecikmeGunu` (termin yoksa null; dönüş yoksa bugüne, varsa ilk dönüşe kadar; İstanbul günü).
- İkinci menüde "Dış operasyonlar" (`satin-alma.oku`) ve sayfa (`dis-operasyon/DisOperasyonlar.tsx`): emir, adım, ürün, firma, planlanan gidiş, gidiş, termin, ilk dönüş, adetler, gecikme.
## Bu turda varsayılanlar
1. Sayfa satın almayı okuyana görünür; yeni işlem yok. Geri alma: menü maddesi ve uç yetkisi.
2. Bağlı iş emri silinemez (yabancı anahtar varsayılanı). Geri alma: yeni göçle `ON DELETE SET NULL`.
3. Gecikme ilk dönüşe göre (D3 b). Geri alma: `gecikmeGunu`.

# FARK: satin-alma, demo bulguları (kart #544)

- Siparişte adı ya da diğer adı katalogla eşleşen bağsız kalem bağlanır (`kataloglaEslesenleriBagla`); ekran eşleşmiş gösterip sunucu "kart bekliyor" diye reddetmez. Kart bekleme iletisi Malzemeler'deki iki adımı söyler.
- Talep formu listede olmayan birimi kapanmadan reddeder (`birimReddi`, BR1 iletisiyle aynı); ret sonrası girilenler kaybolmaz.
- Stokun mal kabul listesi (`siparisSatirlari` kimliksiz) net teslimi miktara ulaşan satırı vermez; kimlikle okuma değişmedi (geri alma ve fazla teslim o satıra yazılır). Fazla teslim reddedilmez (TS1, kullanıcı kararı).
- Onaylanıp sipariş bekleyen talep başlıkta ve listelerde "Onaylandı, sipariş bekliyor" görünür (`durumEtiketi`; kayıttaki durum değişmez).
- Sipariş numarasını TMI verir: `SP-yıl-sıra`, yıl İstanbul saatine göre, sayaç `satin_alma_siparis_sayaci` (kullanıcı kararı 2a). Numara siparişin ilk kaydında verilir, sonra değişmez; istemci yazamaz. Elle girilen alan "Logo / tedarikçi no" olarak kalır (`siparis_no`). Stokun mal kabul listesi TMI numarasını, yoksa Logo numarasını görür.
- Var olan siparişler göçte numara alır (kullanıcı kararı "553a"): yıl sipariş tarihinden, yoksa talebin açılışından; yıl içinde sipariş tarihi ve talep numarası sırasıyla (`20261011174600_satin_alma_siparis_no_eski.sql`, dolu tabloya UPDATE). Geri alma: `no` sütunu boşaltılır, sayaç silinir.
- KD-019: "Siparişteki kalemi değiştir" penceresinde "Değiştir" artık çalışıyor; seçilen kalem pencere kapanmadan okunuyor (önceden kapanınca alan yok olduğu için istek hiç gitmiyordu).
- Sabit kur yoksa geçmiş satırı "kurlar sabitlendi:" diye boş bitmez. Talep formu ve eşleşmeyen kalem ipucu, açık kartın Malzemeler'de "Kataloğa ekle" ile geldiğini söyler.

# FARK: satin-alma, ana sayfa pano kartları (kart #489, dal 162-satin-alma-uyum-puk99r; taban main 354009a)

Kullanıcı: "yaz" (11.10.2026, kalan yedi modülün pano kartları). Tablo: ortak-arayuz/rol-panolari.md.
## Eklenen
- Uç `GET /satin-alma/ozet` (oturum; sayı işleme göre sunucuda süzülür, yetkisiz sayı null). Sözleşme `satinAlmaOzetiCevabi`.
- Kartlar (`ana-sayfa.tsx`): Bana düşen işler: onay bekleyen talepler (`satin-alma.onayla`), açık talepler ve teslim beklenen sipariş satırı (`satin-alma.yaz`); Özet: açık sipariş (`satin-alma.oku` ya da `yaz`). Talep aç ve Taleplerim yerinde.
- Testler: sunucu #489 pano, istemci `ana-sayfa.test.tsx`.
## Bu turda varsayılanlar
1. Onay bekleyen: onaydaki talepte son onay kaydı "onay" değil; onaylanıp sipariş bekleyen sayılmaz (menü sayacı bütün onaydakileri sayar). Geri alma: `panoSayilari`.
2. Açık talep menüdeki tanımdır (taslak, teklif isteniyor, değerlendirme, onayda). Geri alma: `panoSayilari`.
3. Teslim bekleyen satır ve açık sipariş yalnız "sipariş verildi" talepte, net teslimi miktarın altında kalan satırdan sayılır. Geri alma: `panoSayilari`.
4. Kartlar satın alma sayfasına gider (onay: Onaylar, açık talep: Talepler, ötekiler: İş kutusu); süzgeç adresi yok. Geri alma: kart `yol`.

# FARK: satin-alma, şirket adının esası (A7, kart #514, dal 514-sirket-adi; taban main 1637f9f)

Kullanıcı: 5-b "şirket adının esası Satın Alma", 1-a "ikinci ekran salt okunur" ve "a7yaz" (11.10.2026).
## Eklenen
- Uç `GET /satin-alma-ayarlari/sirket-adi` (`oturum`): yalnız şirket adı döner, boşsa `null` (SAT-72, `sirketAdiGorunumu`). Sözleşme `sirketAdiCevabi`.
- Finans ekranı adı bu uçtan gösterir (finans istemcisi); finans sunucusu satın almayı ithal etmez (satın alma finansı ithal ediyor, döngü olurdu).
- Ayarlar ekranında etiket "Şirket adı — teklif isteğinde, siparişte ve Finans'ta", en çok 120 karakter (sütun kısıtıyla aynı).
## Bu turda varsayılanlar
1. Şirket adı gizli değildir; oturumu olan herkes okur. Geri alma: uç yetkisi.

# FARK: satin-alma, sipariş-fatura bağı D6 b (kart #162, dal 162-satin-alma-uyum-puk99r; taban main 6382ca2)

Kullanıcı: "Evet olsun" (D6 b) ve "Yaz" (11.10.2026). Finans tarafı #480 ile birleşti (`alisBelgeleri`, `belgeSiparisBagla`).
## Eklenen
- Uçlar `GET /satin-alma-siparis-faturalari` ve `POST /satin-alma-talepleri/:id/siparis-faturasi` (ikisi `satin-alma.yaz`; yazma tekrar korumalı). Sözleşme `siparisFaturalariSorgusu`, `siparisFaturasiGovdesi`, `siparisFaturalariCevabi`.
- Kural `siparisFaturaFirmasi`: yalnız sipariş verilmiş ya da teslim alınmış talepte, var olan siparişte ve kayıtlı tedarikçide.
- Servis: başka siparişe bağlı fatura üstüne bağlanmaz; bağlı faturayı yeniden bağlamak değişiklik değildir; bağ ve kaldırma geçmişe yazılır. Aynı faturaya eşzamanlı bağ kilitle sıralanır (`faturaBagKilidi`).
- Ekran: sipariş panelinde "Faturalar" düğmesi; siparişin tedarikçisinin alış faturaları belge no, tarih ve açıklamayla listelenir, "Bağla" ve "Kaldır". Tutar gösterilmez (FNS-48).
- Testler: sunucu D6 b (bağ, kaldırma, başka sipariş, yanlış firma, satış faturası, siparişsiz talep, eşzamanlı bağ, yinelenen istek, 403), kural D6 b, taşıyıcı D6 b.
## Bu turda varsayılanlar
1. Yetki `satin-alma.yaz`; yeni işlem ve göç yok. Geri alma: uç tanımı.
2. Bir siparişe birden çok fatura bağlanır; bir fatura tek siparişe bağlıdır (finansın sütunu). Geri alma: yok, finansın şeması.
3. Seçici finansın son 200 alış faturasını gösterir. Geri alma: finansın `alisBelgeleri` sınırı.

# FARK: satin-alma, sistem denetimi S-03, S-07, S-09 (kart #162, dal 162-satin-alma-uyum-puk99r)

Kullanıcı: "Yaz" (11.10.2026); bulgular `/mnt/project-files/denetim/sistem-denetimi-2026-10-11.md` öneri 5.
- S-03: merkez ekranının `uid` işlevi `crypto.randomUUID` yerine ortak `yeniIstekKimligi()` kullanır; düz http ile açılan kurum içi sunucuda ekran çökmez.
- S-07: yazma kuyruğu sonucu bilinmeyen hatada (ağ, zaman aşımı, 5xx) değişikliği atmaz; kuyrukta tutar, üst çubukta "Kaydedilmedi; bağlantı dönünce gönderilecek" gösterir, bağlantı dönünce ya da 2, 5, 15, 30 sn beklemeyle yeniden gönderir. Yeniden yükleme bekleyen değişikliği ekrandan silmez. Sunucunun reddettiği (4xx) değişiklikte davranış aynı: ileti, ekran sunucudaki hâle döner.
- S-09: tekrar korumalı yazım (talep açma, katalog kaydı) yeniden gönderimde aynı gövde ve aynı istek kimliğiyle gider. Sürümlü kayıtta en yeni hâl gider.
- Kapsam dışı: sekme kapanırken henüz gitmemiş değişiklik kaybolabilir (kalıcı yerel kuyruk ayrı iş).

# FARK: satin-alma, firma türü kuralı finanstan (kart #162, dal 162-satin-alma-uyum-puk99r)

- Tedarikçi olabilme kuralının tür yanı artık finansın `tedarikciOlabilirMi(tur)` (finans/disari.ts, #471) çağrısıdır; satın almadaki kopya (`tur !== 'musteri'`) kalktı. Aktiflik yine `firmaOzeti.aktif` ile denetlenir. Davranış aynı: tedarikçi ve ikisi geçer, müşteri geçmez.

# FARK: satin-alma, uyum borcu 36-39 (kart #162, dal 162-satin-alma-borc-36-39)

Kullanıcı: "Devam et bitir hepsini" (10.10.2026); #407 bağımsız denetiminin borçları.

## Değişen
- Siparişteyken siparişli kalemin miktar ve birimi kaydetle değişmez, kalem silinmez; teslimli kalem onaya geri alınsa da değişmez (36).
- Kullanıcı kararı (10.10.2026, "kayıtlı ve onaylı bir şekilde izin versin"): siparişteki kalem yeni komutla değişir,
  `POST /satin-alma-talepleri/:id/siparis-kalemi-degistir` (işlem `satin-alma.onayla`, gerekçe zorunlu, sürümlü). Sipariş satırı kimliği korunur,
  hareket yazılır (eski ve yeni miktar, birim, gerekçe, kişi). Miktar teslim alınandan aşağı inmez; teslimli kalemin birimi değişmez.
  Ekranda sipariş panelinde ve onay sayfasında "Kalemi değiştir" düğmesi. VARSAYIM: onay, onay yetkilisinin kendisinin değiştirmesidir (ikinci kişi onayı yok).
- Geçmiş tarihli döviz teklifine bugünün kuru gönderilmez; kur boşsa sunucu o günün kurunu finanstan alır ya da ister (37).
- Finansın para birimi yalnız hiç kaydedilmemiş ayarlara önerilir; kaldırılan para birimi geri gelmez (38). Kullanıcı kararı (10.10.2026): önerilen
  ve teklifle eklenen para biriminin faizi teslim edilen ekranın varsayılanıdır (`VARSAYILAN_AYLIK_FAIZ`: USD 0,4, EUR 0,3, GBP 0,4), 0 değil.
- Kararlı talepte talep edenin cevaplarını ölçen uç testi (39).

# FARK: satin-alma, ekran-sunucu uyumsuzlukları (kart #162, dal 162-satin-alma-akis-c; taban main 6d14403)

Kullanıcı kararları S4a, S5a, S6b, SA3 a uygulama eksiği, karar veren adı, birim metni, toplu teklif kuru (09.10.2026; kart #162 yorumu).

## Değişen
- S4a, SAT-07: `GECISLER.teklif_isteniyor` listesine `onayda` eklendi. Ekran karar kaydında teklif isteniyor durumundaki talebi onaya gönderiyordu, sunucu 422 verip kararı kaybettiriyordu. Taslaktan doğrudan onaya geçiş hâlâ reddedilir. Ekran değişmedi.
- S5a, SAT-41: yeni teklif ya da firması değişen teklif, finansta aktif tedarikçi firmayla kurulmazsa 422 (`ILETILER.firmaPasif`); tek `firmaOzetleri` çağrısı, `tedarikciOlabilir` kuralı. Eski teklifin sonradan pasifleşen firması korunur (aynı talep yeniden kaydedilince reddedilmez). Ekran: `Supplier.active` sözleşmedeki `firmaAktif`ten gelir; teklif ve toplu giriş tedarikçi seçiminde ve teklif isteme listesinde pasif firmanın adı yanında " (pasif)" yazar (yeni stil yok).
- S6b: ekranda kalem adı bir malzeme kartıyla eşleşince birim zaten kart birimine çevriliyordu; yazılan birim farklıysa artık `Birim kartla aynı yapıldı: <kart birimi>` bildirimi çıkar. Uyarı yalnız ekrandadır; sipariş verilmiş talepte kalem birimi ve miktarı değiştirilip kaydedilirse sipariş satırı yeniden yazılır (önceden de böyleydi, UYUM-BORCU 36). Hızlı talepte sunucu zaten kart birimini yazar (değişmedi).
- S7: toplu teklif girişinde kuru girilmemiş ve finansta güncel kuru olmayan döviz teklifi kaydedilmez; tek teklif formuyla aynı ileti (`Teklif günündeki kuru girin.`) gösterilir, girdiler silinmez. Kur kuralı tek yerde (`calc.ts` `kurEksik`, `kaydedilecekKur`).
- Karar veren adı: `kararCikisSemasi`ne yalnız çıkış alanı `kararVerenAdi` (kişi tablosundan, yoksa boş) eklendi; gövde şeması değişmedi. Ekranda `award.by` artık kişi no değil ad (yoksa boş). `satinAlmaIzi` kararın bütün alanlarını karşılaştırmayı sürdürür, yalnız `kararVerenAdi`yi dışarıda bırakır: çıkış alanı karşılaştırmaya girseydi onay yetkilisinin kaydı satın alma işi sayılıp 403 olurdu.
- Birim metni (BR1): talep açılırken ve kaydedilirken `birim` doluysa `satin_alma_birim`de aranır (`sorgular.ts` `birimVarMi`); yoksa 422 `ILETILER.birimYok`. Önceden yabancı anahtar ihlali genel 409 iletisi verirdi. Kısıt `satin_alma_talep_birim_fkey` aynen kalır.
- SA3a tamamlama: talep ac/kaydet, teklifte ve sabit kurda geçen para biriminin `satin_alma_kur` satırını yazmadan önce ekler (`sorgular.ts` `paraBirimleriniEkle`, kural `kullanilanParaBirimleri`; göç yok). Ayarlar hiç kaydedilmemiş kurulumda USD teklifi artık FK 409 almaz. UYUM-BORCU 35 kapandı.
- SA3a (uygulama eksiği, kural aynı): `ayarlariKur` finansta kuru olup `satin_alma_kur` listesinde olmayan para birimlerini (yalnız USD, EUR, GBP'den) `aylikFaizYuzdesi: '0'` ile cevaba ekler; yeni kurulumda yalnız TRY görünüyordu. Kural `kurallar.ts` `finanstanEklenenKurlar`. Ekran eklenen satırı finans kuruyla gösterir; kayıtlı faizi olmayan para biriminin ekrandaki varsayılan faizi (USD 0,4, EUR 0,3, GBP 0,4) sunucunun 0'ıyla değişir (S8 sorusu açık). Yan etki: finansta kuru olan para birimi ayarlardan kaldırılsa da listeye geri gelir (UYUM-BORCU 38).

# FARK: satin-alma, kod değerlendirme düzeltmeleri (kart #162, dal 162-satin-alma-uyum-puk99r)

Kullanıcı kararı: kod değerlendirme bulguları KD-010, KD-011, KD-012 düzeltilsin (09.10.2026, "al, yaz").

## Değişen
- Hızlı talep formu komut kimliğini başarıya ya da form değişene kadar korur; ağ kopup elle yeniden gönderilen talep ikinci kez açılmaz (KD-010).
- Hızlı talepte miktar Türkçe okunur: "1.000" bin, "1.250,5" bin iki yüz elli buçuk; okunamayan miktar gönderilmez (KD-011). VARSAYIM: "3.5" otuz beş okunur, stokla aynı; ipucu "Ondalık için virgül".
- Katalog kalemi ekleme işlem sonuna kadar kilitle sıralanır; aynı yeni kart eşzamanlı hızlı talepte tek kaleme bağlanır, kod çakışmaz (KD-012). Göç yok.

# FARK: satin-alma, ana sayfadan talep (kart #375, dal 375-ana-sayfa-talep)

Kullanıcı kararı "TALEP AÇMA ANA SAYFADAN" ve AS1-AS3 a (09.10.2026).

## Eklenen
- Uçlar `GET /satin-alma-taleplerim`, `POST /satin-alma-talepleri/hizli-ac` (göç yok; talep satın almanın talep kaydıdır).
- Kurallar `talepKartiReddi`, `hizliKalemReddi`, `hizliBaslik`, `kartsizSiparisReddi`, `talebim`, `TALEPTE_SECILEN_TURLER`.
- Ekran: `talep/TalepAc.tsx`, `talep/Taleplerim.tsx` (ana sayfa kartları, #172 birleşince `ana-sayfa.tsx` ile bağlanır); iş kutusunda "kart bekliyor" uyarısı.

## Değişen
- Talep eden teklif, fiyat, tedarikçi ve kararı görmez (seçilen dahil); geçmişte yalnız kendi yazdığı, onay notu yok. Açma ve kaydetme cevapları da böyle.
- `GET /satin-alma-acilis` yalnız talep açabilene kapalı (403); bütçe, onay limiti ve kur talep edene gitmez.
- Kart bekleyen kalemle sipariş verilmez (422). Kart araması yalnız talepte seçilebilen türleri getirir (hizmet kapalı).

# FARK: satin-alma, bağlama tur 1, akış C (kart #162, dal 162-satin-alma-bagla)

Dışarıdaki yazım bu hâlden başlar. Kullanıcı kararları SA1 a, SA2 b, SA3 a, SA4 a, SA5 a, SH1 a, teslim aşımı (09.10.2026).

## Eklenen
- Göç `20261009021000_satin_alma_tedarikci_firma.sql`: `satin_alma_tedarikci.firma_id` -> `finans_firma(id)`; firması olmayan tedarikçi varsa sayıp durur.
- Göç `20261009022000_satin_alma_teslim.sql`: `satin_alma_teslim` (yalnız ekleme); `disari.ts` `teslimIsle`, `teslimGeriAl` (stok çağırır).
- Göç `20261009023000_satin_alma_kur_finanstan.sql`: kursuz döviz teklifi varsa sayıp durur; `satin_alma_kur.kur` düşer, döviz teklifinde kur zorunlu.
- Göç `20261009024000_satin_alma_katalog_malzeme_bagi.sql`: kartsız katalog kalemi varsa sayıp durur; `malzeme_no` zorunlu, `malzeme_katalog_karti(no)`ya bağlı.
- Uç `GET /satin-alma-malzeme-secenekleri` (aktif kart arama, kataloğa bağlıysa katalog kimliği).
- Kurallar `fazlaTeslim`, `teklifKuru`, `katalogKartiReddi`, `kartKopyasi`; sözleşmede sipariş satırı `fazlaTeslim`.

## Değişen
- Firma bilgisi finanstan (`../finans/disari.ts`); tedarikçide il, telefon, e-posta, sürüm finansın.
- Güncel kur finanstan; ayarlar kur almaz, gösterir. Döviz teklifi kendi gününün kurunu saklar; finansta yoksa teklifte girilir.
- Ekran: onay ve sipariş düğmeleri duruma göre; teslimde "fazla teslim" etiketi; Ayarlar ve üst kur çubuğunda kur salt okunur.
- SAT-56 metni Karar 10'a uydu.
- Katalog kaydı ad, kategori, birim almaz, `malzemeNo` alır; kod, ad, kategori, birim karttan okunur (SAT-58 değişti). Talep kaydı kataloğa kalem açmaz;
  eşleşmeyen kalem serbest metin kalır. Ekran: "Kataloğa ekle" kart arar; "Kataloğa bağla" yeni kalem açmaz; talep formunda kart isteme yolu.

## Silinen
- `firma-gecici.ts`, `teslim-bilgisi.ts`.

# FARK: satin-alma, Aşama 1 tur 4: kullanıcının dış değişiklikleri (kart #162, dal 162-satin-alma-4; taban main 669022c)

Teslim `satin-alma-teslim 08.10.26 14.33` (ON-PAKET sürüm 6, kit 5eb9481) depodaki ilk oturtmanın (20a96ea) değişmiş hâlidir. Depodaki sürüm esas
kaldı; yalnız kullanıcının dışarıda yaptığı değişiklikler (tanı raporundaki U1-U10) üç yollu birleştirmeyle (taban 20a96ea, main, teslim) uygulandı.
Kullanıcı kararları SA1-SA4 (08.10.2026). Proje işleri korundu: okuma yetkisi (#273), tekrar koruması, fiyat denetim eki (#305), geçici firma karşılığı.

## Eklenen
- Göç `20261008133000_satin_alma_teslim_stokta.sql`: siparişin teslim sütunları (`teslim_tarihi`, `kalite`, `teslim_alan_kisi_id`) düşer, `satin_alma_siparis_satiri`
  açılır, katalogda `malzeme_id` yerine `malzeme_no integer` (yabancı anahtarsız, SA4), siparişe `beklenen_teslim >= siparis_tarihi` kısıtı. Teslim bilgisi dolu
  sipariş ya da `malzeme_id` dolu katalog kaydı varsa göç sayıyı yazıp durur, hiçbir şey değişmez (SA3; test `teslim-stokta-goc.test.ts`).
- `disari.ts` `siparisSatirlari` (stok için fiyatsız), `teslim-bilgisi.ts` (stok `teslimAlinanlar`, rota/kalite `gkkSonuclari` geçici karşılıkları, boş döner).
- `GET /satin-alma-menu-sayaclari` ve kullanıcının 7 maddelik sayaçlı ikinci menüsü, madde başına rota (SA1).
- Kurallar: `ondalikKiyas`, `ondalikTopla`, `teslimDurumu`, `gkkKalitesi`, `gorunenDurum`; "teslim alındı" türetilir, `siparis_verildi` yazılır.

## Değişen
- Paylaştırma çubukları "Karşılaştır ve karar ver" içinde (ekran, kullanıcının yaptığı gibi).
- Sözleşme: sipariş satırları ve teslim durumu, katalog `malzemeNo`.

## Silinen
- Teslim alma: `satin-alma.teslim-al` işlemi, `GET /satin-alma-teslimleri`, `POST /satin-alma-siparisleri/teslim-al`, depo ekranı (`merkez/depo.ts`).
- Projenin 11 maddelik menüsü ve `gorunumler.ts` (SA1). "Taleplerim" yok.
- Yedek, içe aktarma, örnek veri ve TCMB işleyicileri (UYUM-BORCU 20).

## Uygulanmayanlar
- Ayrı `firmalar` modülüne bağ (`../firmalar/disari.ts`, `REFERENCES firma`, `/firmalar/ac` testleri, V-35): firma finansta, `firma-gecici.ts` kalır (SA2).
- Ç5 tablette sol ikinci menü (U8): ortak arayüz listesine gitti.
- Teslim göçü olduğu gibi girmedi: tablolar main'de kurulu; fark yeni damgalı göçle geldi.

## Bu modül şunları varsaydı
- Taban, depodaki ilk oturtmadır (20a96ea): 10 dosya ona birebir eşit, proje turlarının izi teslimde yok.
- Göç eski `malzeme_id` dolu kaydı da sayar (anlamı değişen sütun sessizce silinmesin; UYUM-BORCU 27).
- Teslimin "olmayan malzeme numarası reddedilir" testi sütun türü denetimine çevrildi; anahtar Aşama 2'de gelince geri döner.
- ON-PAKET ve KURAL-TEST teslimdeki hâliyle alındı; KURAL-TEST'teki test adları teslimin adlarıdır.

# FARK: satin-alma, teklif fiyat denetim kaydı (kart #162, dal 162-satin-alma-3; taban main 6ec840a)

Kullanıcı onayı "SF yaz", "SFc a" (08.10.2026; kart #162 yorumu).

## Eklenen
- `kurallar.ts` `fiyatIzleri(eski, yeni)` ve `FIYAT_IZI_SINIRI` (100): fiyatı ya da para birimi değişen her teklif ve kalem için ek satırı.
- `servis.ts` `talepAc` ve `talepKaydet` zorunlu iz yazıcısı alır; satırlar yazmadan sonra okunan hâlden kurulur.
- Testler: kural (6), API (3): kayıtta satırlar, not ve adların yokluğu, her saklanan fiyatın izi, kesilme satırı.
- `sunucu/cekirdek/uygulama.test.ts` `TAM_DENETLENMEYEN_UCLAR`: bu modülün iki satırı (ayrı commit; dar istisna, kullanıcı kararı SFc a).

## Değişen
- `POST /satin-alma-talepleri/ac` ve `/:id/kaydet`: `denetim: 'govdesiz'` + `denetimEki`. Gövde denetim kaydına artık girmez (önce tam girerdi).
- UYUM-BORCU 13 kapandı, 23 (B5 dokunma hedefleri) eklendi; CEKIRDEK-ISTEKLERI Ç2 kapandı.

## Silinen
- Yok.

## Bu turda varsayılanlar (kullanıcı kabul etti)
1. Kayıtsız tedarikçide firma kimliği boş; elle yazılan ad kayda girmez.
2. 100 satırı aşan kayıtta ilk satır `{ kesildi: true, toplam: N, yazilan: 99 }`, ardından ilk 99 değişiklik.
3. Durum ve karar ek satıra girmez.
4. Para birimi değişip fiyat aynı kalırsa satır yazılır ve `oncekiParaBirimi` taşır. Fiyat metni saklanan sade biçimdir (`11.50` -> `11.5`).

# FARK: satin-alma, Aşama 1 2. tur (kart #162, dal 162-satin-alma-2; taban main 0561064)

Kullanıcı onayı "yaz hepsi" (08.10.2026; kart #162 yorumu).

## Eklenen
- `firma-gecici.ts` `firmaOzetleri(db, idler) => Map<id, FirmaOzeti>` (finansta olmayan kimlik haritada yok); `firmaKaynagi`'nda tekil özetin yerinde.
- `sorgular.ts`: `tedarikcileriOku`, `tedarikciKategorileriOku`, `degerlendirmeleriOku` isteğe bağlı `firmaId` alır (tek tedarikçi okuması).
- Testler: açılış ucu tanımı okuma yetkisini taşır; açılış kimliksiz 401 ve depo 200; firma özetleri toplu okunur (açılış tek çağrı, kayıt yalnız kendi firması).

## Değişen
- `GET /satin-alma-acilis` yetkisi `'oturum'` -> `{ biri: SATIN_ALMA_ISLEMLERI }` (çekirdeğin okuma yetkisi). Rol süzmesi serviste kalır.
- `servis.ts` `tedarikcileriKur`: tedarikçi başına `firmaOzeti` döngüsü yerine tek `firmaOzetleri` çağrısı; `tedarikciKaydet` yalnız kaydedilen tedarikçiyi kurar.
- Firma verisini uydurma kayıtlardan ölçen beş testin adı "[uydurma firma]" ile başlar (atlanmaz).
- BASKA-MODUL-ISTEKLERI (finans): tekil `firmaOzeti` yerine toplu `firmaOzetleri`. UYUM-BORCU 3 ve 22.

## Silinen
- `firma-gecici.ts` `firmaOzeti` (tekil); `kurallar.ts` `satinAlmaKullanicisiMi` ve `servis.ts` `acilis` içindeki elle yetki denetimi.

## Bu turda varsayılanlar
1. "Okuma uçlarını çekirdek kalıbına bağla" okuma yetkisi (`{ biri }`) demektir. Açılışı kaynaklara ve sayfalı listeye bölmek ekranı değiştirir; borçta (UYUM-BORCU 22). Geri alma: uç tanımı.
2. Finansın toplu özet imzası `firmaOzetleri(db, idler) => Map` (BASKA-MODUL-ISTEKLERI). Geri alma: `firma-gecici.ts` ve `servis.ts` tek çağrı.
3. "Gerçek firma kaydını ölçmeyen test" = firma adını, şehrini, aktifliğini ya da aramasını uydurma kayıtlardan ölçen test; geçici karşılık testi işaretlenmedi (uydurma kayıt kullanmaz).

# FARK: satin-alma, Aşama 1 1. tur (kart #162, dal 162-satin-alma-uyum; taban main 4a70288)

## Eklenen
- `paylasilan/sayfalar/satin-alma.ts` `SATIN_ALMA_IKINCI_MENU` (11 madde, 6 grup); `istemci/.../satin-alma/gorunumler.ts` (madde -> ekran seti ve sayfa).
- `GET /satin-alma-firma-secenekleri` (`satin-alma.yaz`), sözleşme `firmaSecenekleriSorgusu`, `firmaSecenekleriCevabi`.
- Tekrar koruması: `talepleri/ac`, `katalogu/kaydet`, `siparisleri/teslim-al`; istemci `korumali` (`tasiyici.ts`).
- Testler: SAT-41 (iki), SAT-42, geçici karşılık, tekrar koruması (sunucu); `gorunumler.test.ts`, `korumali.test.ts` (istemci).
- Belgeler: CEKIRDEK-ISTEKLERI, BASKA-MODUL-ISTEKLERI, KURAL-TEST, GUVENLIK-DENETIMI, ON-PAKET, UYGULA, bu dosya.

## Değişen
- Dört ana menü sayfası tek sayfa: `/satin-alma`; bölümler `/satin-alma/<bölüm>`. Prototipin menüsü gizli, kabuk çizer. Sayfa işlemleri
  `sayfa.satin-alma-taleplerim`, `-onaylari`, `-teslimleri` kalktı (hiçbir role verilmemişti).
- `firma-gecici.ts`: eski `firmaAktifMi` kalktı, finansın adları geldi (`firmaAdlari`, `firmaVarMi`, `firmaAra` ve firma özeti; özet 2. turda toplu `firmaOzetleri` oldu, yukarıda); finans yokken firma yok (önce her firma aktif sayılıyordu).
- Tedarikçi formu: firma finanstan aranıp seçilir, firma alanları salt okunur; ekran `/firmalar/*` çağırmaz. Teklifteki "yeni tedarikçi" -> "kayıtsız tedarikçi (adla)".
- `ILETILER.firmaPasif`: "Tedarikçi, finansta kayıtlı aktif bir firma olmalı."

## Silinen
- İstemcide yerel `FirmalarUclari` tipi ve firma sürüm haritası; `TaleplerimSayfasi`, `OnaylarSayfasi`, `TeslimlerSayfasi` dışa açımları.

## Değişen onaylı kararlar
- Kullanıcı kararı 7 ("her ekran seti ayrı sayfadır") yerine Aşama 1 1. tur emri: tek sayfa, ikinci menü. Kullanıcı kararı S1: firma finansta açılır, burada seçilir.

## Bu modül şunları varsaydı
1. Finansın dört fonksiyonunun imzası BASKA-MODUL-ISTEKLERI.md'deki gibidir; `firmaVarMi` yalnız aktif firmada true. Geri alma: `firma-gecici.ts` ve `servis.ts` ithali.
2. Menü maddesinin işlemi: satın almacı bölümü `oku`, onay `onayla`, talep `talep-ac`, depo `teslim-al`, ayarlar `ayar`. Geri alma: menü verisi.
3. Kök adres, kişinin görebildiği ilk bölüme açılır (talep eden kökte kendi taleplerini görür). Geri alma: `adrestekiGorunum`.
4. Ayrıntı sayfası (talep, malzeme, tedarikçi) adres değiştirmez; adres açıldığı bölümde kalır. Geri alma: `merkezGorunumu`.
5. Menü sayaçları bu turda yok (prototip menüsündeki sayılar görünmez). Geri alma: `sayacUcu` ucu.
6. Finans yokken firma yok sayılır, yeni tedarikçi eklenemez. Geri alma: geçici karşılık.
7. Kayıtsız tedarikçinin teklifi adla kaydedilir (`firma_id` boş); tedarikçi kaydı açılmaz.
8. Denetim kaydı S2 çekirdek gelene kadar değişmez (gövde tam).

# FARK: satin-alma, ödeme planı ve sipariş takibi (kart #1124, dal 1124-satin-alma-odeme-plani; taban main 00c55e1)

Kullanıcı: "yaz" (13.10.2026). Finans ve stok tarafı aynı dalda (yalnız yeni tablo, `disari.ts` ve okuma ucu; o modüllerin ekranlarına dokunulmadı).
## Eklenen
- Uçlar `GET /satin-alma-talepleri/:id/siparis-takibi` (`satin-alma.oku` ya da `yaz`) ve `POST /satin-alma-talepleri/:id/odeme-plani` (`satin-alma.yaz`, talep sürümüyle). Sözleşme `odemePlaniSatiri`, `odemePlaniGovdesi`, `siparisTakibiCevabi`.
- SAT-73 `odemePlaniHedefi`: plan yalnız siparişi verilmiş talebin, finansta kayıtlı tedarikçili siparişine; firma ve para birimi tekliften. Plan değişikliği talebin sürümünü artırır ve geçmişe yazılır.
- SAT-74 `varsayilanOdemePlani` + `siparisOdemeKosullari`: siparişe çevrilirken planı olmayan her siparişe tekliften plan kurulur (avans sipariş tarihinde; kalan beklenen teslimden, yoksa sipariş tarihinden vade günü sonra; banka havalesi; KDV hariç sipariş toplamı, numeric).
- Plan finansın `finans_siparis_odemesi` tablosundadır (`siparisOdemePlaniYaz`, `siparisPlanlari`); satın alma kopya tutmaz.
- Ekran: sipariş ve teslim sekmesinde "Sipariş takibi" paneli: "Mal kabul: irsaliye girildi" (irsaliye no, tarih, mal kabul no; stokun `GET /stok/siparis-irsaliyeleri` ucundan) ve "Finans: fatura girildi" (fatura no, tarih, vade) satırları; altında ödeme planı tablosu ve "Ödeme planını düzenle" penceresi (satır ekle, kaldır, tekliften yeniden kur). Faturası bağlanmış siparişte düzenleme düğmesi yok.
- Testler: sunucu SAT-73/74 (iki test), istemci `takip.test.ts` (iki test).
## Bu turda varsayılanlar
1. Tutar KDV hariç tahmindir; gerçek tutar ve vade faturadan gelir. Geri alma: ucuz (`siparisOdemeKosullari`).
2. Kalan ödemenin vadesi beklenen teslim + vade günü; ödeme şekli varsayılan banka. Geri alma: ucuz (`varsayilanOdemePlani`).
3. İrsaliye tarihi mal kabulün kayıt zamanıdır (stokta ayrı irsaliye tarihi yok).
4. Takip siparişi gören herkese (satın alma okuyan ve yazan) görünür; stokun ucu son-partiler kalıbıyla satın almaya açık.
5. Sipariş sonradan karardan çıkarsa planı da silinir (yabancı anahtar ON DELETE CASCADE).

# FARK: satin-alma, teslim yöntemi (kart #1310, dal 1310-talep-teslim)

- Göç `20261014212000_satin_alma_teslim_yontemi` (kullanıcı onayı: kart "Eklensin"): `satin_alma_talep.teslim_yontemi` (`firma_getirir` | `biz_alacagiz`, boş: belirtilmedi).
- Uç `POST /satin-alma-talepleri/:id/teslim-yontemi` (`satin-alma.yaz`, sürümlü). Yeni işlem ve yetki yok. Talep bütününün kaydı alanı değiştirmez.
- Sipariş panelinde "Teslim" seçimi: Tedarikçi getirir / Biz alacağız; seçiliye yeniden basmak seçimi kaldırır.
- "Biz alacağız" denen, siparişi verilmiş talepte her kayıtlı tedarikçi sevkiyat bekleme listesine alım olarak düşer (`alimDinle`, sevkiyat dinler). Gün siparişin beklenen teslimi, yoksa ihtiyaç günü.
- Yöntem değişir, talep iptal olur ya da tamamı teslim alınmadan siparişten çıkarsa işe çevrilmemiş alım satırı kalkar; işe çevrilmiş satıra dokunulmaz.
- VARSAYIMLAR (geri alma düşük): aynı firmaya iki sipariş tek alımdır (en erken gün); teklifi kayıtlı tedarikçisiz sipariş alım açmaz; alım satırı malzeme ve adet taşımaz (planlayıcı yükü girer).

# FARK: satin-alma, katalogdaki kopya kod, ad ve birim kalktı (249 a; 19.10.2026)

- Göç `20261019108500_satin_alma_katalog_kopya.sql`: `satin_alma_katalog.kod`, `.ad`, `.birim` düşer (dolu tablo göçü, kullanıcı onayı 249 a). Katalog cevabı aynı alanları karttan verir; adsız kartta ad stok kodudur, birimsiz kartta birim boş metindir. Liste kartın koduna göre sıralanır.
- `kategori` kalır: kartta kategori yalnız sarf, demirbaş ve hizmette var; yoksa kalemde saklanan gösterilir.
- Katalog kodu üretimi (`satin-alma.katalog-kodu` ayarı) kullanılmıyor; ayarın silinmesi UYUM-BORCU 33'te. Stoğa giden sipariş satırında kullanılmayan `katalogKodu` alanı kalktı.
- Stok'un üç testindeki katalog INSERT sütun listesi daraltıldı (koordinatör izniyle, test düzeneği). Rol x işlem, uç ve paket yok.
- VARSAYIM: birimsiz kartta birim `''` (sözleşme metin; boş birim kart bağlanırken zaten reddedilir). Geri alma: ucuz.

# FARK: satin-alma, plan motoruna açık siparişin geliş tarihi (19.10.2026)

- `disari.ts` `malzemeGelisTarihleri(db, malzemeNolar)`: malzeme başına açık sipariş satırlarının kalan miktarı (sipariş - net teslim, > 0), birimi, sipariş no'su ve beklenen teslimi; termin sırasıyla, tarihsiz en sonda. Kalanı kapatılmış sipariş gelmez. Fiyat yok, yetki çağıranın ucunda.
- Göç, uç, rol x işlem ve paket yok. Test: `satin-alma.test.ts` "plan: açık siparişteki malzemenin kalan miktarı".

# FARK: satin-alma, mal kabule giden sipariş satırında kalan miktar (denetim #18; 19.10.2026)

- `disari.ts` `siparisSatirlari` her satıra `kalanMiktar` ekler: sipariş miktarı - net teslim, eksiye inmez. Mal kabul ekranının tam miktar yerine bunu önermesi Stok'un işi (koordinatör iletti).
- Göç, uç, rol x işlem ve paket yok. Test: `satin-alma.test.ts` "denetim #18".

# FARK: satin-alma, Kalite Merkezi askısı da siparişi durdurur (E-13, karar 87; 19.10.2026)

- SAT-76 denetimi Kalite Merkezi'nin tedarikçi onayını da okur (`kalite-merkezi/disari` `kaliteAskisindakiTedarikciler`, çözücü: Kalite Merkezi stok üzerinden satın almayı ithal ettiği için bağ `sunucu/kablolama.ts`'te). Onayı "Askıda" olan tedarikçiye yeni sipariş 422 alır; ileti iki yeri de anar.
- Kalite kaydında firma kimliği yok: iki tarafta kod varsa kodla, yoksa adla eşlenir; boşluk ve büyük-küçük harf (tr-TR) sayılmaz (`kaliteAskisindakiFirmalar`).
- Satın almanın kendi `askida` durumu da kalır (250 a): tedarikçi iki yerden birinde askıdaysa sipariş verilmez. Göç, rol x işlem ve paket yok. Testler: `kurallar.test.ts` E-13, `satin-alma.test.ts` E-13.
- VARSAYIM: kod iki tarafta doluysa ad tutsa bile kod belirler (aynı adlı başka firma askıya girmez). Geri alma: ucuz.

# FARK: satin-alma, kartlı kalem kartın birimiyle (257 a; 19.10.2026)

- Talep açma, kaydetme ve siparişteki kalemi değiştirme, kartı ya da birimi değişen kartlı kalemde birimi malzeme kartının birimiyle karşılaştırır (boşluk ve tr-TR büyük-küçük harf sayılmaz); farklıysa 422. Birimsiz kart ve kartsız kalem serbest (`kartBirimiReddi`).
- Var olan kayıtlara dokunulmaz: kural öncesinden kalan farklı birimli kalem değişmeden kaydedilir. Göç, uç, rol x işlem ve paket yok.
- Ekran: talep kalem satırında karttan gelen birim salt okunur olur; kart bağı kalkınca yeniden yazılır.
- Borç 36 testindeki "teslimsiz kalemde birim değişir" adımı kartlı kalemde artık 422'dir; hizmet ve eldiven fikstürleri kart birimiyle açılır.

# FARK: satin-alma, miktar girişi ortak ayrıştırıcıdan (denetim #37; 19.10.2026)

- Talep açma (`talep/TalepAc.tsx`) ve satın alma merkezindeki kalem ile siparişteki kalemi değiştirme miktarları `istemci/src/ortak/veri/miktar.ts` ile okunur: "12.5" = "12,5", virgül varsa nokta binliktir ("1.250,5" = 1250,5). Virgülsüz "1.250" belirsizdir (soru 71): gönderilmez, ortak ileti gösterilir.
- Merkezdeki miktar girdisi binliksiz yazılır (1250); ekranın kendi yazdığı değer yeniden okununca belirsiz sayılmaz. Fiyat girişleri değişmedi.
- Sunucu, göç, uç ve rol x işlem yok.
