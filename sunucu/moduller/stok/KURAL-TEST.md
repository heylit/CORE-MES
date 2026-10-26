# Kural → test ve kısıt: stok

S: saf test `sunucu/moduller/stok/kurallar.test.ts`; V: akış testi `sunucu/moduller/stok/stok.test.ts` (gerçek PostgreSQL); E: ekran testi `istemci/src/moduller/stok/stok.test.tsx`; K: adlandırılmış kısıt (göç `20261007160000_stok_tablolar.sql`).

| Kural | Bağlı olduğu | Sürüm |
|---|---|---|
| DEP-01 tek bakiye satırı, sıfırda silinir | K `stok_bakiye_tek`, `stok_bakiye_sifir_degil`; V "DEP-53 mal kabul düzeltmesi: eski belge ters çevrilir, yeni belge açılır, belge bir kez düzeltilir; eski satırın Logo durumu değişmez" (12 ters çevrilir, satır silinir, 10 kalır), V "DEP-11 her (malzeme, konum, parti) için bakiye hareket toplamına eşittir" | İ |
| DEP-02 yetersizde onay ister | S "DEP-02/03/04 düşüm: yeterliyse yazılır; yetmezse onay ister; onayla eksi yazılır; yeterliyken onay yok sayılır"; V "DEP-02/03/04/37 çıkış: yetersizde ONAY_GEREKLI ve mevcut; onayla eksi yazılır ve görünür; yeterliyken onay yok sayılır"; E "yetersiz stokta onay ister, mevcut miktarı gösterir; onayla eksiOnay ile yeniden gönderir" | İ |
| DEP-03 onaylı eksi yazılır ve görünür | S, V aynı; K `stok_hareketi_eksi_yalniz_dusumde`, `stok_hareketi_eksi_onay_kaynagi`; E "onaylı eksiyi işaretler; geri al düğmesi yalnız geri alma işlemiyle; süzgeçsiz listede toplam yoksa sayfalama uydurmaz" | İ |
| DEP-04 yeterliyken onay yok sayılır | S "DEP-02/03/04 düşüm: yeterliyse yazılır; yetmezse onay ister; onayla eksi yazılır; yeterliyken onay yok sayılır"; V "DEP-02/03/04/37 çıkış: yetersizde ONAY_GEREKLI ve mevcut; onayla eksi yazılır ve görünür; yeterliyken onay yok sayılır" (onayliEksi false) | İ |
| DEP-05 en eski giriş önerilir | S "DEP-05/06/07/08 çıkış önerisi: en eski giriş önce, bölünebilir; fason ve üretim alanı dışında; bakiye yoksa veri yetersiz"; V "DEP-05/08 çıkış önerisi: en eski giriş önce; bakiyesi olmayan malzemede veri yetersiz" | İ |
| DEP-06 insan seçmeden en eski giriş | S "DEP-05/06/07/08 çıkış önerisi: en eski giriş önce, bölünebilir; fason ve üretim alanı dışında; bakiye yoksa veri yetersiz" (sıralama ve bölme) | S (dış çağrı) |
| DEP-07 fason ve üretim alanı öneri dışı | S "DEP-05/06/07/08 çıkış önerisi: en eski giriş önce, bölünebilir; fason ve üretim alanı dışında; bakiye yoksa veri yetersiz" | İ |
| DEP-08 bakiye yoksa veri yetersiz | S; V "DEP-05/08 çıkış önerisi: en eski giriş önce; bakiyesi olmayan malzemede veri yetersiz" | İ |
| DEP-09 taşımada ilk giriş ve parti taşınır | S "DEP-09 taşımada ilk giriş ikisinin eskisi"; V "DEP-09/13 taşıma: ilk giriş ve parti taşınır; stoklu konum pasife alınamaz" | İ |
| DEP-10 yalnız kullanılabilir karta giriş | V "DEP-20/21/10/49 mal kabul: hammaddede parti zorunlu, aynı parti yeniden açılmaz, kullanılamaz kart reddedilir, demirbaş parti almaz" (pasif kart 422) | İ |
| DEP-11 bakiye = hareket toplamı | V "DEP-11 her (malzeme, konum, parti) için bakiye hareket toplamına eşittir" (`bakiyeDefterFarki` boş) | İ |
| DEP-12 kimlikle bağ, kod değişir bakiye taşınmaz | V "DEP-14/12/13 raf: gözler Kod-Bölme-Kat açılır; kod değişince gözün kimliği aynı kalır; stoklu göz kapatılamaz" (A → AB, aynı göz, aynı bakiye) | İ |
| DEP-13 bakiyeli konum kapatılamaz | K `stok_bakiye_aktif_konumda`; V "DEP-14/12/13 raf: gözler Kod-Bölme-Kat açılır; kod değişince gözün kimliği aynı kalır; stoklu göz kapatılamaz" (daralma 409), "DEP-09/13 taşıma: ilk giriş ve parti taşınır; stoklu konum pasife alınamaz" (pasife alma 409) | İ |
| DEP-14 raf adresi Kod-Bölme-Kat, tekil | S "DEP-14 raf adresi: Kod-Bölme-Kat; tek ve çift numaralama koridorun iki yüzü"; K `stok_konum_kod_tek`, `stok_konum_raf_gozu_tek`; V "DEP-14/12/13 raf: gözler Kod-Bölme-Kat açılır; kod değişince gözün kimliği aynı kalır; stoklu göz kapatılamaz" | İ |
| DEP-15 sayım bekleyen; süre yerleşimde (varsayılan 30 gün) | S "DEP-15 sayım bekleyen: süre tanımlı değilse kural çalışmaz (null)"; V "DEP-15 sayım bekleyen: dolu ve süreden uzun sayılmamış göz listelenir; sayılınca düşer; fiş hareketlerde bağlıdır"; K `stok_depo_yerlesimi_sayim_suresi` | İ |
| DEP-16 sayım: beklenen değiştiyse 409, fark yönüyle | S "DEP-16 sayım farkı yönü ve miktarı"; V "DEP-16 sayım farkı yönü ve miktarı" | İ |
| DEP-17 hareket değişmez, düzeltme ters hareket | K `stok_hareketi_degismez` (tetikleyici); V "DEP-50/17 Logo gönderim ve defter: gönderildi kayıt no ister; hareket defteri değişmez", "DEP-17/18/19/53 geri alma engelleri ve ters yön" | İ |
| DEP-18 bir kez geri alınır | K `stok_hareketi_tek_geri_alma`; S "DEP-17/18/19/53 geri alma engelleri ve ters yön"; V "DEP-17/18/19/53 geri alma engelleri ve ters yön" | İ |
| DEP-19 otomatik hareket elle geri alınmaz | S "DEP-17/18/19/53 geri alma engelleri ve ters yön" (`disCagriMi`) | İ (otomatik hareket S) |
| DEP-20 parti zorunluluğu türe göre | S "DEP-20/48/49 parti zorunluluğu türe göre; sertifika tek başına parti açmaz"; V "DEP-20/21/10/49 mal kabul: hammaddede parti zorunlu, aynı parti yeniden açılmaz, kullanılamaz kart reddedilir, demirbaş parti almaz"; K `stok_parti_tanimli` | İ |
| DEP-21 kalktı (#124): her mal kabul gelişi ayrı lot | V "DEP-20/10/49 mal kabul: hammadde her girişte lot alır, aynı döküm no ikinci gelişte ayrı lottur, kullanılamaz kart reddedilir, demirbaş parti almaz" (iki lot) | İ |
| DEP-22 parti başka malzemeye bağlanamaz | K `stok_bakiye_parti_malzemesi`, `stok_hareketi_parti_malzemesi`, `stok_mal_kabul_satiri_parti_malzemesi`; V "DEP-23/22 parti: gözde iki parti varsa seçim istenir; başka malzemenin partisi bağlanamaz" | İ |
| DEP-23 gözde birden çok parti → seçim | S "DEP-23/24 parti seçimi: tek parti kendiliğinden, birden çoksa seçim; partisiz satır partiyi uydurmaz"; V "DEP-23/22 parti: gözde iki parti varsa seçim istenir; başka malzemenin partisi bağlanamaz" | İ |
| DEP-24 parti bilinmiyorsa uydurulmaz | S "DEP-23/24 parti seçimi: tek parti kendiliğinden, birden çoksa seçim; partisiz satır partiyi uydurmaz"; V "DEP-16 sayım farkı yönü ve miktarı" (partisiz sayım) | İ |
| DEP-25 sarf emre bağlı, iz iki yönlü | K `stok_hareketi_sarf_emirli`; V "DEP-47/48/25 üretim girişi: yalnız mamul ve yarı mamul, URETIM konumuna, partisi emir; sarf çıkışı emre bağlanır, parti izi iki yönlü" (`emrinPartileri`, parti izi) | İ |
| DEP-25 ileri iz: parti izi emirlerin iptal edilmemiş sevk işlerini müşterisiyle verir, sevk yoksa boş; ekran yalnız gelen sevki gösterir (denetim bulgu 40) | V `urun-sevki.test.ts` "sevkiyat işinin elle teslimi ve yeniden açılması bağ üzerinden stoğa yansır" (ileri iz adımı; `sevkiyat/disari.ts` `emirlerinSevkleri`), "DEP-47/48/25 üretim girişi: ..." (emri sevk edilmemiş partide `sevkler` boş); E "partinin izi emirleri ve o emirlerin sevklerini müşteriyle gösterir", "partinin emirleri sevk edilmediyse iz penceresi bunu söyler" | Sürümsüz (okuma) |
| Karantinadan serbest bırakma miktarlı olabilir: miktar yoksa bütün karantina bakiyesi; varsa bakiyeler sırayla, kalan karantinada; sıfır ve fazlası reddedilir, hiçbir şey yazmaz | V "miktarlı serbest bırakma: verilen miktar karantina bakiyelerinden sırayla taşınır, kalan karantinada kalır; fazlası ve sıfır reddedilir, hiçbir şey yazmaz; miktarsız bugünkü gibi hepsini taşır", "denetim #15: karantinadaki parça depoda yalnız hurdaya taşınır ..." | İ |
| DEP-26 sertifika dosyası yok, yalnız no | K `stok_parti_sertifika_bicimi` (yalnız metin sütunu) | İ (önkoşul: dosya saklama) |
| DEP-27 ambalaj adedi orantılı azalır | S "DEP-27 ambalaj adedi miktarla orantılı azalır, kesir yukarı yuvarlanır" | İ |
| DEP-28 kritik durum; tanımsızsa uydurulmaz | S "DEP-28 kritik durum: tanımsızsa sayı uydurulmaz; eksi önce gelir"; V "DEP-28 malzeme ayarı: kritik seviye sürümlü yazılır; ayrıntı ve dışa açık miktarlar tutarlı"; E Malzemeler (Kritik seviye yok) | İ |
| DEP-29 eski sürüm 409 | V "DEP-29 sürüm: eski sürümle düzenleme 409 eski-surum", "DEP-28 malzeme ayarı: kritik seviye sürümlü yazılır; ayrıntı ve dışa açık miktarlar tutarlı" (surum 99 → 409) | İ |
| DEP-30…DEP-33 dış çağrı | — (tablolar ve uçlar sonraki sürüm) | S |
| DEP-34 mal kabul göz önerisi | S "DEP-34 mal kabul göz önerisi: malzemenin gözü, yoksa kolay kattaki boş göz, yoksa veri yetersiz (null)"; V "panel, DEP-34 göz önerisi, arama ve göz ölçüsü: önizleme ekranlarının verisi" | İ |
| DEP-35 başka modüle yalnız FK ve disari | npm run sinir (--modul stok): 0 ihlal | İ |
| DEP-36 iş merkezi kapsamı | V "DEP-36 üretime sarf iş merkezi kapsamı: kapsam dışındaki emre sarf 403 ve hiçbir şey yazmaz; kapsamdaki emre yazılır" | İ |
| DEP-37 eksi bakiye iş kutusunda | V "DEP-02/03/04/37 çıkış: yetersizde ONAY_GEREKLI ve mevcut; onayla eksi yazılır ve görünür; yeterliyken onay yok sayılır"; E "veri olan işleri satır olarak gösterir; mal kabul düğmesi yalnız giriş işlemiyle" | İ |
| DEP-38 mal kabul belge ve satır | V "DEP-20/21/10/49 mal kabul: hammaddede parti zorunlu, aynı parti yeniden açılmaz, kullanılamaz kart reddedilir, demirbaş parti almaz" (belge no biçimi), "DEP-38/39 Logo eşleme alanları: durumla tutarsız yazılamaz; satırın Logo dışı alanı değişmez; tutarlı eşleme yazılır" | İ |
| DEP-39 Logo eşleme alanları tutarlı | K `stok_mal_kabul_satiri_logo_tutarli`, `stok_mal_kabul_satiri_sabit` (tetikleyici); S "DEP-39 Logo eşleşme durumu sayılan ve irsaliye miktarından"; V "DEP-38/39 Logo eşleme alanları: durumla tutarsız yazılamaz; satırın Logo dışı alanı değişmez; tutarlı eşleme yazılır" | İ (alanlar) |
| DEP-40 teslim tek işlemde, fiş no tekil ve artan | K `stok_fis_no_tek`, `stok_fis_degismez`; V "DEP-54/40/41 sepet kişiye özel; teslim tek işlemde, yetmezse onay ister ve hiçbir şey yazmaz; fiş değişmez"; E "yetersiz satırı işaretler; teslimde onay ister, onayla yeniden gönderir ve fişe gider" | İ |
| DEP-41 sepetin en eski kaynağı teslimde çözülür | V "DEP-54/40/41 sepet kişiye özel; teslim tek işlemde, yetmezse onay ister ve hiçbir şey yazmaz; fiş değişmez" | İ |
| DEP-54 sepet kişiye özel | K `stok_sepet_satiri_tek`; V aynı test (başkasının satırı 404) | İ |
| DEP-55 kod çözümleme | V "DEP-55 kod çözümleme: konum kodu ve LOC öneki, kart numarası ve MLZ öneki; bilinmeyen kod uydurulmaz"; E "tanınmayan kodu söyler, uydurmaz" | İ |
| DEP-42 toplama rotası | S "DEP-42 toplama rotası: önce rafsız konum, raflar sırayla, koridorda yılan, gözde kat yukarı"; V "DEP-42/56 toplama: en eski girişten ayrılır, rotaya dizilir, eksik söylenir; adım toplanınca çıkış yazılır, iki kez toplanmaz; kapanınca toplanmaz" | İ |
| DEP-56 adım toplanınca çıkış, iki kez toplanmaz | K `stok_toplama_adimi_hareket_tek`; V aynı test; E "sıradaki adımı büyük gösterir, eksiği söyler; Toplandı sürümle gönderilir" | İ |
| 3B depo verisi ve yerleşim | 3B ekranı kart #1304 ile kalktı, uç borç #438 ile kaldırıldı: V "3B depo ucu kaldırıldı (borç #438): ekransız kalan uç 404 döner"; yerleşim DEP-57 | İ |
| DEP-57 yerleşim tek işlemde; numaralama değişince stok gözle kalır; stoklu raf kaldırılmaz; aynı adres ve eski sürüm reddedilir | K `stok_konum_kod_tek` (ertelenebilir), `stok_bakiye_aktif_konumda`, `stok_depo_yerlesimi_bina_boyu`; V "DEP-57 yerleşim: taşı, ekle, kaldır tek işlemde; numaralama değişince stok gözle kalır; stoklu raf kaldırılmaz; aynı adres ve eski sürüm reddedilir"; E "rafı listeler, seçince önizlemedeki paneli açar; döndürüp kaydedince sürüm ve yeni açıyla gönderir"; istemci saf testleri `yerlesim.test.ts` (eksen, SAT, boş yer, numaralama, ilk yerleşim) | İ |
| DEP-58 hizmet siparişinin mal kabulü: dönen malzeme fasondur (giren ve fason kutusundan düşen, tek işlem), dönmezse saf hizmettir (stok yok); ikisi teslim verir, düzeltme hepsini geri alır; fason çıkışı tek başına geri alınmaz | K `stok_mal_kabul_satiri_stoksuz_hizmet`, `stok_mal_kabul_satiri_fason_cikis_tek`, `stok_mal_kabul_satiri_fason_bagli`, tetikleyici `stok_mal_kabul_satiri_logo_disi_sabit`; S "DEP-58 mal kabul satırı: hizmet siparişinde dönen malzeme fasondur, dönmezse saf hizmettir; karışık girdiler reddedilir"; V izinli "DEP-58 fason dönüşü: dönen yarı mamul girer, giden fason konumundan düşer, teslim satın almaya yazılır; düzeltme hepsini geri alır", "DEP-58 saf hizmet: malzeme dönmezse stok yazılmaz, teslim satın almaya yazılır; düzeltme teslimi geri alır"; V reddeden "DEP-58 reddedilenler: fason olmayan konum, hizmet siparişinde eksik fason, hizmetsiz siparişte fason, konumlu saf hizmet, siparişsiz hizmet, başka hizmet kartının siparişi, kutuda birden çok parti", "DEP-58 fason dönüşü: fason konumunda yetmeyen giden ONAY_GEREKLI ister ve hiçbir şey yazmaz; onayla eksiye düşer"; E "hizmet siparişi seçilince fason dönüşü sorulur", "fason dönüşü belgesi giden malzemeyi ve fason kutusunu gösterir"; mutasyon: düzeltmede fason çıkışı ters çevrilmezse izinli test kırılır (denendi) | İ |
| DEP-59 varsayılan konum yalnız aktif konum olabilir; boş bırakılabilir | K `stok_malzeme_ayari_varsayilan_konum`; S "DEP-59 DEP-60 varsayılan konum: ..." (olmayan konum 422, pasif konum 422, aktif konum 200, boşa çekme 200); istemci "DEP-59: stok ayarında varsayılan konum seçilir ve gövdeye yazılır" |
| DEP-60 kart bilgisi (kritik seviye, varsayılan konum) oturumla okunur, kart kimliğiyle gelir; ikisi boş malzeme listede yok | S "DEP-59 DEP-60 varsayılan konum: ..." (oturumsuz 401, operatör 200); malzemeler istemcisi `kopru.test.ts` DEP-60 |
| DEP-61 Stok Merkezi'nden raf ve göz kalemi yalnız stok deposu yapılmış (etkin) bölümde yazılır; raf kaydında bölümün öbür öğeleri kalır | S "DEP-61 Stok Merkezi > Depo: ..." (depo bölümüne raf 200, alan kalır, sürüm ilerler; eski sürüm 409; kalite 403; depo olmayan bölüm 403; başka bölümün rafını çekmek 4xx; göz kalemi yaz/sil 200, depo dışı göz ve kalem 403, kalite 403, silinmiş kalem 404); istemci "DEP-61 ..." (göz kalemi ve raf kaydı stok uçlarına gider, düzenleyicide yalnız raf) |
| DEP-62 (#1304) elle açılan, haritaya bağlı olmayan, boş konumun türü değişir; haritadaki alan konumunun türü alanın türünü izler, stoklusu değişmez ve bildirilir; fason, ara alan ve hurda alanı depo olmayan bölümde ANA depoya konum olur; hurda çıkış önerisine ve kullanılabilir stoğa girmez | K `stok_konum_tur_degeri`, `atolye_alan_tur_degeri`; S "harita eşlemesi (#1304): ..." (iki test), "DEP-05/06/07/08 çıkış önerisi" (hurda); V "#1304 harita alan türü: ..." (bağlı konum 400, stoklu konum 400, elle konum 200); E "Konum türü (#1304)" (iki test) |
| DEP-63 (#1304) konumun yerdeki karesi Fabrika Haritası ızgarasından, bağlı olduğu öğenin (gözün rafı, alan, istasyon) karesidir; haritada yeri olmayan konumun karesi null | V "#1304 zemin ızgarası: ..." (401, bölüm ızgarası, karedeki öğe ve konum, konum ve bakiye `zemin`, haritasız konum null); E "Zemin ızgarası (#1304)" (iki test) |
| DEP-64 (372 a, 373 a) Malzemeler kataloğunun etiketi `MK:<stok kodu>` iki okuyucuda da kartı çözer; stok kodundan kart no'yu Malzemeler verir (`malzemeNoKoddan`), bilinmeyen stok kodu ve boş gövde tanınmaz | S "DEP-64 katalog etiketi"; V "DEP-64 katalog etiketi: ..." (teslim.test.ts, küçük harf ve boşluk, bilinmeyen, boş), "DEP-55 kod çözümleme" (MK); E okut.test.tsx "DEP-64: katalog etiketi (MK)" | İ |
| Toplu geri alma tek işlemde, yeniden eskiye; biri reddedilirse hiçbiri | V "toplu geri alma: yeniden eskiye tek işlemde, ara bakiye eksiye düşmez; biri reddedilirse hiçbiri yazılmaz; aynı hareket iki kez 400; depocu 403"; mutasyon: sıralama kaldırılınca test kırılır (denendi) | İ |
| Dışa açık stok durumu ve düşük stok sayısı | V "dışa açık stok durumu: toplam, kritik seviye ve durum; ayarsız kart tanımsız, stoksuz kart yok; düşük stok sayısı panelle aynı"; S `stokDurumu` | İ |
| Arama | V "stok içi arama: konum kodu ve LOC, raf, kare adı, parti no, kart no; bilinmeyen sonuç uydurmaz"; E "Ctrl+K arama penceresini açar; ilk sonuç Enter ile açılır" | İ |
| Depocu modu ve etiketler | E "depocu modu açılış kutucuklarını ve alt çubuğu gösterir; tercih cihazda kalır"; E "raf matrisinden bütün gözlerin QR etiketleri; QR okutmanın tanıdığı LOC önekini taşır" | İ |
| Okut bekleyen giriş ve geri al | E "mal kabulde ambalaj seçilir, Rafı okut bekler; okutulan konuma ambalajla birlikte girer"; E "sepete eklemeyi geri alır: satır eski miktarına döner" | İ |
| Ambalaj simgeleri, son teslim yerleri | E "ambalaj kartları önizlemedeki çizim simgeleriyle gelir"; E "teslim penceresi son teslim yerlerini gösterir; dokununca hedef seçilir" | İ |
| Dama tahtası | E "binayı kare boyuna böler; konum olmayan kareyi konum olarak açar" (kare adı borç #441 ile kaldırıldı) | İ |
| DEP-43…DEP-46 | — | sonraki adım |
| DEP-47 üretim girişi | K `stok_hareketi_uretim_girisi_emirli`; V "DEP-47/48/25 üretim girişi: yalnız mamul ve yarı mamul, URETIM konumuna, partisi emir; sarf çıkışı emre bağlanır, parti izi iki yönlü" | İ (elle) |
| DEP-48 üretim partisi emir | K `stok_parti_emir_tek`, `stok_parti_kaynak_tek`; S "DEP-20/48/49 parti zorunluluğu türe göre; sertifika tek başına parti açmaz"; V "DEP-47/48/25 üretim girişi: yalnız mamul ve yarı mamul, URETIM konumuna, partisi emir; sarf çıkışı emre bağlanır, parti izi iki yönlü" | İ |
| DEP-49 demirbaş parti almaz | S "DEP-20/48/49 parti zorunluluğu türe göre; sertifika tek başına parti açmaz"; V "DEP-20/21/10/49 mal kabul: hammaddede parti zorunlu, aynı parti yeniden açılmaz, kullanılamaz kart reddedilir, demirbaş parti almaz" | İ |
| DEP-50 Logo gönderim alanları | K `stok_hareketi_logo_gonderildi_nolu`; S "DEP-50/51 Logo: yalnız üretime sarf ve üretim girişi gider; ambar karşılığı yoksa uydurulmaz"; V "DEP-50/17 Logo gönderim ve defter: gönderildi kayıt no ister; hareket defteri değişmez" | İ (alanlar) |
| DEP-51 ambar karşılığı uydurulmaz | S "DEP-50/51 Logo: yalnız üretime sarf ve üretim girişi gider; ambar karşılığı yoksa uydurulmaz" | İ (alanlar) |
| DEP-52 sarf ve mamul girişi elle (terminal sayımında değişti: kullanıcı hata bildirimi 14.10.2026) | Terminal sağlam sayımı adımın girdisini emre sarf eder, taşınan malzemeyi adım statüsüne çevirir, son adımda ürünü girer; elle yol da durur. S "stok kuralları: terminal üretim girişi"; V "terminal üretim girişi: girdi istasyondan ya da en eski girişten düşülür, ..." | İ |
| DEP-53 mal kabul düzeltmesi | K `stok_mal_kabul_tek_duzeltme`, `stok_mal_kabul_degismez`; S "DEP-17/18/19/53 geri alma engelleri ve ters yön"; V "DEP-53 mal kabul düzeltmesi: eski belge ters çevrilir, yeni belge açılır, belge bir kez düzeltilir; eski satırın Logo durumu değişmez" | İ |
| Düzeltme 1: belge no kesilmez | V "düzeltme 1: mal kabul no altı haneyi aşınca kesilmez (üretim emri kalıbı)" | İ |
| ST5 okuma stok sayfası ya da stok işlemiyle, yazma işlemle (K3'ün yerine) | V "yetki (ST5): okuma stok sayfası ya da stok işlemiyle, yazma işlemle; girişsiz 401, işlemsiz 403, işlemli 200; menü sayacı oturumla"; E okuyucu düğme görmez | İ |
| ST4 toplamayı açan ya da işlemi olan başkası kapatır, kapatan kayıtta | K `stok_toplama_kapatan_kapaliysa`; V "ST4 toplama kapatma: açan ya da toplama işlemi olan başkası kapatır; kapatan kişi listede görünür; işlemsiz 403" | İ |
| ST1 sipariş satırı yalnız satın alma kabulünde, belge değişmez | K `stok_mal_kabul_satiri_siparis_satiri_var`, tetikleyici `stok_mal_kabul_satiri_logo_disi_sabit`; S `siparisBagiEngeli`; V "ST1 sipariş bağı: yalnız satın alma kabulünde; olmayan sipariş satırı 409; bağ belgenin parçasıdır, sonradan değişmez" | İ |
| Tekrar koruması: yinelenen komut ikinci kez yazmaz | V "tekrar koruması: aynı istek kimliğiyle yinelenen mal kabul ikinci belge açmaz, ilk cevap döner; kimliksiz yazma 400" | İ |
| ST3 birim karttan, yoksa null | V "ST3 birim kartın biriminden gelir; kartta yoksa null, uydurulmaz"; E "malzeme başına stoğu ve durumu gösterir", "hammadde satırında parti alanlarını gösterir" | İ |
| K6 ikinci menü veri, sayaç yetkiye göre | V "menü: her madde kayıtlı bir işlem ister, oturum yazılmaz; sayaç ucu anahtarlarla eşler (K6)"; çekirdek paylasilan sayfalar testi (Ç1 yamasıyla) | İ |
| Emir tamamlama: bitmiş emirde, eksiksiz, bir kez; kalan sarf en eski girişten, verilmiş sarf ve hizmet düşülmez; çıktı emir partisiyle; tek işlem | S "emir tamamlama: brüt malzeme başına toplanır ve üç ondalığa yukarı yuvarlanır; fazla verilen sarf kalanı eksiye düşürmez; engel sırası"; V izinli ve reddeden "emir tamamlama: bitmemiş emirde ve eksikte reddeder; kalan sarfı en eski girişten düşer, verilmiş sarfı saymaz, hizmeti düşmez; çıktı emir partisiyle girer; ikinci kez yazmaz", "emir tamamlama tek işlemdir: çıktı yazılamazsa sarf da yazılmaz; çıkış yetkisi olmayan 403; olmayan emir 404", "emir tamamlama eşzamanlı: aynı emri iki kişi aynı anda tamamlarsa biri yazar, öteki yeniden hesaplayıp reddedilir", "emir tamamlama DEP-36: kapsam dışındaki emir 403 ve hiçbir şey yazmaz", "emir tamamlama sıfır miktarla: yalnız kalan sarfı yazar; hepsi fire olan emir sonra tamamlanmış sayılır; yapılacak sarf yoksa 409"; mutasyon: emir kilidi, kapsam denetimi ve üretim girişi geri almasının düşülmesi kaldırılınca birer test kırılır (denendi) | İ |
| Eksikleri teslim al (karar a): emrin eksikleri mal kabule dolar, hizmet ve eksiksiz bileşen dolmaz; parti ve belge kuralı değişmez | E "emirden açılınca eksik malzemeler satıra dolar (hizmet ve eksiği olmayan dolmaz); kabul olağan mal kabul gövdesiyle gider", "emir parametresi geçersizse önizleme istenmez; önizleme hata verirse görünür"; mutasyon: hizmet süzgeci, bir kez dolum koruması ve parametre denetimi kaldırılınca birer test kırılır (denendi) | İ |
| Malzeme isteği: üretim açar (üretim işlemi ve istasyon kapsamı), aynı kaynak kimliği tek kayıt; depo hazırlar, teslim eder ya da iptal eder; kapanan değişmez | K `stok_malzeme_istegi_kaynak_tek`, `stok_malzeme_istegi_teslim_karsilanmis`, `stok_malzeme_istegi_kapanis_tutarli`; S "malzeme isteği yalnız ileri gider: açık hazırlanır; açık ve hazırlanan teslim ya da iptal olur; kapanan değişmez"; V "malzeme isteği: üretim disari ile açar, aynı kaynak kimliği tek kayıt; depo hazırlar ve teslim eder; kapanan değişmez" | İ |
| Rol panosu özeti: her sayı kendi işlemiyle, yetkisize null; eksik emir ve açık istek doğru sayılır | V "stok özeti (rol panosu): her sayı kendi işlemiyle; yetkisize null; eksik emir ve açık istek sayılır" | İ |
| #1124 sipariş irsaliyeleri: düzeltilen belge düşer, yerine geleni görünür; satın alma okur, yetkisiz 403 | V "#1124: sipariş satırının irsaliyeleri no ve zamanla okunur" | İ |

## Kart #1208 Malzeme · Teslim

T: akış testi `sunucu/moduller/stok/teslim.test.ts`; P: panel testi `istemci/src/moduller/stok/ust-eylem.test.tsx`; D: Hazırlık ekranı testi `istemci/src/moduller/stok/hazirlik.test.tsx`.

| Kural | Bağlı olduğu | Sürüm |
|---|---|---|
| STK-T1 depoda yetmeyen istek `stok_yok` açılır; hizmet istenmez | S "STK-T1..T5"; T "STK-T1 istek" | İ |
| STK-T2 teslim yalnız yoldayken kapanır | S; T "STK-T2/T4 teslim"; K `stok_teslim_kapanis_tutarli`, `stok_teslim_alinan_tutarli`, `stok_teslim_red_tutarli` | Sürümlü (`surum`) |
| STK-T3 iptal yalnız gönderenin | T "STK-T3 iptal" | Sürümlü |
| STK-T4 alan taraf: istasyon kapsamı ya da depo işlemi; gönderen alamaz | S; T "STK-T2/T4", "depoya gelen teslimi" | Sürümlü |
| STK-T8 kişiye teslim (299 b): imzalı, 120 sn geçerli kişi kodu; teslimi yalnız o kişi görür, alır, reddeder; kod gönderimde yeniden doğrulanır | K "STK-T8 kişi kodu"; S; T "STK-T8 kişiye teslim" | Sürümlü |
| STK-T5 isteğe bağlı teslim: depo gönderir, aynı malzeme, isteğin istasyonuna; alınınca istek kapanır | S; T "STK-T5"; D | Sürümlü |
| STK-T6 alan gönderilenden fazlasını alamaz; kaynakta yetmezse teslim alınamaz, eksi onayı yok | S; T "STK-T1..T6", "istasyondan istasyona" | Sürümlü |
| Teslimde statü ve parti değişmez | T "istasyondan istasyona"; K `stok_teslim_parti_malzemesi` | İ |
| İstasyon konumu tek ve türüyle tutarlı | K `stok_konum_istasyon_tek`, `stok_konum_istasyon_turu` | İ |
| Üst düğme yalnız `stok.istek` ile görünür | P; kabuk testi "ust eylem dugmesini yalniz islemi olana" | İ |

## Kart #1319 Hazırlık

S: saf kural testi `kurallar.test.ts`; T: akış testi `teslim.test.ts`; İ: istemci testi `istemci/src/moduller/stok/hazirlik.test.tsx` ve `stok.test.tsx` ("Hazırlık listesi", "Taşı").

| Kural | Bağlı olduğu | Sürüm |
|---|---|---|
| STK-H1 açık listedeki istek tek başına teslim edilmez, başka listeye girmez; iptal edilen liste isteği bırakır | S "STK-H1"; T "STK-H1/H2/H4", "STK-H1/H3"; K `stok_toplama_istegi` birincil anahtar | Sürümlü (istek `surum`) |
| STK-H2 adımda planlanandan azı kısmi toplanır, fazlası ve sıfır reddedilir | S "STK-H2"; T "STK-H1/H2/H4"; İ "azı kısmi toplamadır" | Sürümlü (liste `surum`) |
| STK-H3 yolda teslimi olan isteğe ikinci teslim açılmaz | S "STK-H3"; T "STK-H1/H3" | Sürümlü |
| STK-H4 bitişte toplanan istekleri açılış sırasıyla karşılar; fazlası yazılmaz, karşılanmayan açık kalır | S "STK-H4"; T "STK-H1/H2/H4" | Sürümlü |
| İstekli liste teslim yeri ister ve `stok.transfer` ister | T "STK-H1/H2/H4" (400, 403) | İ |
| Taşı: satır yeri hepsi için seçilenin önüne geçer; her yer için ayrı fiş | İ "satıra seçilen yer"; T sepet testleri | İ |

## Borç #436 Depo uçlarında iş merkezi kapsamı

T: akış testi `teslim.test.ts` (gerçek PostgreSQL). Kapsam kaynağı `istasyonlar/disari.ts` `kisininIzinliIsMerkezleri`; kişinin kapsamı sınırsızsa süzgeç yoktur.

| Kural | Bağlı olduğu | Sürüm |
|---|---|---|
| STK-K1 istek listesi, tekil okuma ve `hazirlik` sayacı kişinin kapsamındaki istasyonların isteklerini verir; kapsam dışı tekil okuma 403; istasyonsuz istek süzülmez; sınırsız kapsam hepsini görür | T "STK-K1" (kapsam içi 200, kapsam dışı listede yok ve 403, sınırsız hepsi) | Sürümsüz (okuma) |
| STK-K2 hazırla, teslim et ve iptal et kapsam dışı istasyonun isteğinde 403 verir ve isteği değiştirmez; kapsam içi ve sınırsız kapsam geçer | T "STK-K2" | Sürümlü (istek `surum`) |
| STK-K3 hazırlık listesi: teslim yeri kapsam dışı istasyon olan liste açılamaz, görünmez, toplanamaz, kapatılamaz (403); isteği kapsam dışı olan liste açılamaz; teslim yeri istasyon olmayan liste süzülmez; sınırsız kapsam hepsini görür | T "STK-K3" | Sürümlü (liste `surum`) |

## Hurdanın HM girdisi (G1)

T: akış testi `teslim.test.ts` "STK-U3 hurda". Karar: kullanıcı, 16.10.2026 karar kartı "Fire çıkışı" (fason hurdasıyla aynı kural); hurda konumuna taşıma seçilmedi.

| Kural | Bağlı olduğu | Sürüm |
|---|---|---|
| STK-U3 terminalde hurdaya ayrılan parçanın taşınan HM'si (adet x reçete miktarı) istasyondaki emrin stoğundan fire çıkışıyla düşer (önceki adım statüsü, serbest, adım statüsü sırasıyla); yetmeyen istasyonda eksiye fire yazılır (iş 558); hurda geri alma o fire çıkışını geri alır; hurdasız sayım değişmez | T "STK-U3 hurda" (ilk adım, son adım, geri alma, sıfır fark, yetersiz stok) | İ |

## İş 558, soru 562: sayım girdiyi yalnız istasyondan düşer

Karar: kullanıcı, 26.10.2026 (558 okuma teyitli; 562 1 b, 562 2 b). K2 (kart #1413) aynen kalır; K3'ün depodan düşümü, kart #154'ün başka istasyondan düşümü ve fasondan dönüp kabulde bekleyenin düşümü (#1407) kalktı.

| Kural | Bağlı olduğu | Sürüm |
|---|---|---|
| STK-U4 sayım önceki adımın parçasını (statülü taşınan: son ve çıktılı adımda sarf, ara adımda çevirme) yalnız bu istasyondan düşer (fasondan dönüp kabulde bekleyen de teslim edilmeden alınmaz); yetmeyen rotadaki miktarla istasyonda lotsuz onaylı eksi düşülür, sayım cevabında uyarı verilir; parça sonradan teslim edilince statü toplamı düzelir; sayım düşüşü eksi sarfı geri alır | T "iş 558: son adım önceki adımın parçasını yalnız kendi istasyonundan düşer..."; T "terminal üretim girişi..." (başlatma uyarısı); T `fason-iki-adim.test.ts` "girdili emir: statülü HM firmaya gider..." | İ |
| STK-U5 statüsüz hammadde girdisi depodan düşülmez; istasyonda yetmeyen istisna kartıyla lotsuz eksi düşülür; kartın lotu başka istasyondaysa da alınmaz | T "562 2 b: istasyonda yetmeyen statüsüz girdi...", "karar 110 b, Soru 129...", "denetim #1...", "iş 558 (kart #154 yerine)..." | İ |
| STK-U6 başlatma ve sayım uyarısı önceki adımın parçası bu istasyonda yokken (başka yerde duruyor, statülüde emre ayrılmış) "bu istasyona teslim edilmedi" der; önceki adım parça çıkarmadıysa söylemez | T "iş 558: son adım...", "terminal üretim girişi...", "kart #1289 girdi uyarısı..." | Sürümsüz (okuma) |

## Borç #440 Fason gönderimi eksik giderse uyarı

| Kural | Bağlı olduğu | Sürüm |
|---|---|---|
| STK-F1 fasona gönderimde istasyonda yeterli parça yoksa olan kadar taşınır, gönderim reddedilmez; gönderilen ile Yolda konumuna giren taşıma arasındaki fark "eksik gönderim" uyarısı olarak sayılır (tam gönderimde ve fason ilk adımsa sayılmaz) | S "STK-F1"; T `fason-iki-adim.test.ts` "noktasız firmaya gönderim...", "eksik gönderim uyarı sayısını artırır...", "fason ilk adımsa gönderim reddedilmez..." | Sürümsüz (hesap) |

## Kart #492 Malzeme fişi

| Kural | Bağlı olduğu | Sürüm |
|---|---|---|
| STK-MF1 emir açılınca sarf, üretimden giriş ve fire fişi açılır (emir ve tür başına tek); sarf ve fire ayrı fişe gider; geri alma geri aldığı hareketin fişine bağlanır ve değişiklik sayacını artırır; hurda sayımı giriş fişinin sayacını artırır | T `malzeme-fisi.test.ts` | Sürümsüz (sayaç) |
| STK-MF2 sayım fişi komut başına tektir; ambar fişi yalnız Logo ambarı farklı depolar arasında açılır | T `malzeme-fisi.test.ts` | Sürümsüz |
| STK-MF3 fiş no biçimi ve çözümü; Gönder yalnız elle türde bekleyen ya da hatalı fişte | S `kurallar.test.ts` "malzeme fişi kuralları"; T `malzeme-fisi.test.ts` gönder | Sürümlü (fiş `surum`) |
