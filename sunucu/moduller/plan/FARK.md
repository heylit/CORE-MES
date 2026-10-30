# FARK (plan, taban c2c9871)

Teslim edilen dosyalar. Plan ekranları Rota istemcisindedir (P2) ve güncel rota zipiyle gelir. Çalışma kopyasındaki geçici karşılıklar teslimde yoktur (UYUM-BORCU).

| Dosya | Ne |
|---|---|
| `paylasilan/islemler/plan.ts` | plan.yaz, plan.kilitle, plan.studyo, plan.canliya-al |
| `paylasilan/sozlesme/plan.ts` | Plan, yerleşim, senaryo şemaları ve yazma gövdeleri |
| `sunucu/gocler/20261008100000_plan_tablolar.sql` | plan_durumu (plan sürümü), plan_yerlesimi (makine ya da kişi, zaman, kilit, sürüm), plan_senaryosu, plan_senaryo_yerlesimi |
| `sunucu/moduller/plan/disari.ts` | Boş (plan en üstte) |
| `sunucu/moduller/plan/kurallar.test.ts` | Test |
| `sunucu/moduller/plan/kurallar.ts` | Saf kurallar: süre, boşluk, bağımlılık, motor (öner), uyarılar, sıralama, göstergeler |
| `sunucu/moduller/plan/plan.test.ts` | Test |
| `sunucu/moduller/plan/servis.ts` | Bağlam (iş emri, kaynak, kapsam), okuma, komutlar, stüdyo |
| `sunucu/moduller/plan/sorgular.ts` | Yerleşim ve senaryo sorguları |
| `sunucu/moduller/plan/uclar.ts` | 14 uç |

## Çalışma kopyasında koşulan komutlar (Node 24.21.0, PostgreSQL 16.15; geçici karşılıklarla)
| Komut | Sonuç |
|---|---|
| `node --test sunucu/moduller/plan/kurallar.test.ts` | pass 4, fail 0 |
| `node --import ./araclar/ortam-yukle-goc.ts --test "sunucu/moduller/plan/**/*.test.ts"` | tests 6, pass 6, fail 0 (gerçek PostgreSQL) |
| `npx vitest run --config istemci/vite.config.ts istemci/src/moduller/rota` | Tests 19 passed (19) (plan, Kanban, stüdyo ekranları dahil) |
| `CI=true npm run kontrol` | sunucu tests 1024, pass 1024; istemci Test Files 34 passed (34); sınır 0 ihlal; çıkış 0 |

## Depoda oturtma (Aşama 1, 2026-10-08, kart #261)
Teslim olduğu gibi alındı; sözleşme ve işlemler önce ayrı istekte geldi (#317). Bu istekte:
- Göç yeniden damgalandı: `20261008100000_plan_tablolar.sql` -> `20261008143604_plan_tablolar.sql` (içerik aynı).
- `sunucu/moduller/plan/baglanti.ts` (yeni): uretim-emirleri ve istasyonlardan istenen fonksiyonların geçici karşılıkları; `servis.ts` yalnız ithal satırları buna döndü.
- `plan.test.ts`: iş emirleri testin kendi geçici tablosunda (P-B8); operasyon kodu `TRN`; makine güncellemesi sürüm gönderir; şema öneki `plan`.
- Ekranlar rota istemcisinde, #320 ile geldi; ekran dosyasına dokunulmadı.

## T4 (kart #415, 2026-10-09)
- Göç `20261009200000_plan_taslak_ayar.sql`: yerleşimlere elle sıra ve dondurma; senaryoya açıklama ve sürüm; `plan_ayari`, `plan_senaryo_ayari`, `plan_senaryo_degisikligi`. Göç önce satır sayar, dolu tabloda durur.
- P6: bütün plan yazmaları kullanıcının taslağına gider; taslak yoksa açılır ve cevap `taslakAcildi` taşır. Canlı yalnız canlıya almayla değişir; canlıya alma iş emrine makine ya da kişiyi `isEmriKaynagiYaz` ile yazar.
- Motor: sıralama kuralı (öncelik, EDD, CR, SPT), ileri / geri yön, tampon, dondurulmuş bölge, elle sıra (KY-03), darboğaz (PL-11), seçenekleri karşılaştır.
- Yeni uçlar: `/plan/karsilastir`, `/plan/menu-sayaclari`, `/plan/kuyruk/sirala`, `/plan/dondur`, `/plan/dondurmayi-kaldir`, `/plan/elle-siralari-sil`, `/plan/ayar`, senaryoda çoğalt, bilgi, değişiklik kaldır, değişiklikleri at, canlıyı al, hızlı dene.
- Bağlama (#414 sonrası): `planlanacakIsEmirleri`, `isEmriKaynagiYaz` uretim-emirleri'nden; `baglanti.ts` yalnız `istasyonKisileri` (P-B4, #409'a dek).
- Ekranlar rota istemcisinde: Plan (taslak şeridi, göstergeler, ayarlar, motor paneli, emir zaman çizelgesi, üç kipli matris), Kanban (üç görünüm, atanmamış sütun, süzgeçler), Plan stüdyosu (aç ve düzenle, çoğalt, hızlı dene, tüm değişiklikler, canlıya göre etkisi). Teslimdeki çizelge ve doluluk matrisi korundu.

| Komut | Sonuç |
|---|---|
| `node --import ./araclar/ortam-yukle-goc.ts --test sunucu/moduller/plan/*.test.ts` | kurallar 12, akış 8; fail 0 |
| `npx vitest run --config istemci/vite.config.ts istemci/src/moduller/rota` | 36 passed |

## Plan eylemleri (kart #262, 2026-10-10)
- `GET /plan/onizle`: yeni emir canlı plan (ya da verilen taslak) üzerinde yazılmadan önizlenir; motor emirli ve emirsiz iki kez koşar. Yan ürün emre kopyalanmaz (rotadan okunur).
- `POST /plan/kuyruk/plan-sirasina-don`: bir kuyruğun elle sıraları taslakta silinir (`elleSiraSil` iş emri listesiyle daralır).
- Ekran: Yeni üretim emrinde "Önizle" paneli (teslimi önerilen tarihe ayarla, yeniden hesapla, taslak olarak kaydet, onayla ve plana al); Kanban makine ve kişi kuyruğunda "Plan sırasına dön".
- "Partiyi böl", "Parçaları birleştir" bölme modeli kararını bekliyor (P-B18).

## İstasyonlar eki bağlama (kart #439, 2026-10-10)
- `baglanti.ts` kalktı; kişinin istasyonu, plan ayarı (verim), makine durumu ve yetkinlik istasyonlar `disari.ts`'inden.
- Motor (`oner`) kaynak başına verim alır; süre verime bölünür. Arızalı ya da bakımdaki makine pasif sayılır. S3 yetkinlik uyarısı.
- Rota istemcisi: `beklenen/istasyonlar-plan.ts` kalktı; plan ayarı ve makine durumu okunan sürümle yazılır; Kaynaklar > Personel'de Yetkinlik sütunu.
- PL-09 (personel kısıtı) için istasyon verisi hazır; vardiya #441 ile bağlandı.

## Vardiya eki (#441)
- Motor vardiya modülünün `calismaTakvimleri` ile yerleştirir (365 gün); vardiyası tanımlanmamış kaynak sürekli çalışır, tatil ve kapalı günü düşülür, plan uyarısı alır (P-B3, P-B20 kapandı).
- İstasyon yükünün kapasitesi takvimdeki çalışma dakikasıdır; matris etiketi "en çok N sa/gün".
- PL-09: `planCevabi.personelYuku` (iş merkezi başına kişi-saat ihtiyacı ve kapasitesi); "personelin sınırladığı gün" göstergesi; motor ertelemez (P-B19 kalan).
- Kapalı gün denemesi canlıya alınınca vardiya takvimine yazılır (`gunYaz`); canlıya alan `vardiya.yaz` da taşımalı (P-B16 kısmen).
- Rota istemcisi: Kaynaklar > Vardiyalar vardiya modülünün `VardiyaDuzeni` ekranıdır (sürüm ve istek kimliğiyle yazar); Personel'de kişinin vardiyası seçilir; `beklenen/vardiya.ts` kalktı.

## Parti dalı (kart #262, 2026-10-10)
- `paylasilan/sozlesme/plan.ts`: iş satırı (yerleşim, yerleşmemiş) ve emir satırı `ustEmirId` taşır (bölünmüş alt partide üst emir, uretim-emirleri `planlanacakIsEmirleri`'nden); alan isteğe bağlı, sunucu her zaman yazar.
- `servis.ts`: `isOzeti` ve emir satırı alanı doldurur; `plan.test.ts` bölünmüş emri gerçek veritabanında ölçer.

## Saat dilimi (P-B24, #470 sonrası)
- `servis.ts`: `gun0`, `gunTarihi`, `vardiyaOku` başlangıcı ve vardiyasız kaynağın kapalı günü, `gun_kapat` denemesi, `emirBaslangicDk` tesisin 00:00'ından; teslim sonu (`teslimDk`, önizlemedeki `gec`) tesisin 23:59:59'u; önerilen teslim günü, `zamanMetni` ve taslak adı tesis saatiyle (`#paylasilan/zaman.ts`). Gün uzunluğu 1440 dk kaldı.
- `plan.test.ts`: P-B24 testi (21:30Z anında `gunler[0]` tesis günü, tatil tesisin 00:00'ında başlar); emir başlangıcı ve PL-04 tatil günü testleri tesis gününe göre.

## İş sırası tek kaynak (A4, kart #506, 2026-10-11)
- Kullanıcı kararları: "1yaz,2a" ve sıralamanın taslağa gitmesi ("b"; P6 ve P-B15 korunur).
- `disari.ts` ilk kez dışa açar (şema ve göç yok, yeni uç yok):
  - `canliSira(db, isEmriIdleri)`: `{ planSurumu, yerlesimler }`; canlı plandaki yerleşimler başlangıç sırasıyla (kaynak, başlangıç, bitiş, elle sıra, kilit, dondurma). Yerleşmemiş iş listede yoktur.
  - `kuyruguSirala(db, kullanici, { kaynak, isEmriIdleri, planSurumu })`: `{ taslakId, taslakAcildi }`. `plan.yaz` ister; okunan canlı plan değiştiyse eski sürüm; bugünkü `sirala` kuralıyla kişinin bugünkü canlıdan açtığı son açık taslağına yazar, yoksa taslak açar. Canlıya müdür alır.
- `plan.test.ts`: okuma, taslağa yazma, taslağın yeniden kullanımı, canlıya alınınca yeni sıra; yetkisiz, eski sürüm, boş, yinelenen ve kilitli iş reddi.

## Canlı yerleşim okuma ucu (kart #522, 2026-10-11)
- Kullanıcı kararı: "Yaz" (Üretim Emirleri sayfası planlanan başlangıç ve bitişi canlı plandan okur).
- `GET /plan/canli-yerlesim?isEmirleri=1,2,3` (yetki `oturum`, `GET /plan` gibi): `canliSira`'yı sarar; `{ planSurumu, yerlesimler: [{ isEmriId, kaynak, baslangic, bitis, kilitli, dondurulmus, elleSira }] }`, zamanlar ISO. Yalnız canlı; taslak görünmez, yerleşmemiş iş listede yoktur. Boş liste boş cevap; en çok 500 kimlik, bozuk liste 400.
- Sözleşme `paylasilan/sozlesme/plan.ts`: `canliYerlesimSorgusu`, `canliYerlesimCevabi`. Şema, göç, yeni işlem ve paket yok.
- `plan.test.ts`: oturumlu okuma, taslaktaki taşımanın görünmemesi, boş liste, oturumsuz 401, bozuk liste 400.

## Başlamış emrin bekleyen adımı (demo 2.16, kart #544, 2026-10-11)
- Bulgu: emrin bir adımı başlayınca uretim-emirleri `planlanacakIsEmirleri` emrin bütün adımlarını "başladı" verir; planda bekleyen adım taşınamaz ve Arkon'dan sıralanamaz (409).
- `servis.ts` `adimDurumuyla`: yalnız "başladı" gelen adımlar için `isEmriOzeti` ile iş emrinin kendi durumu okunur; çalışmıyorsa plan onu "planlı" sayar. Bunun için uretim-emirleri koduna dokunulmadı; o modül dışarıda yazılıyor.
- `plan.test.ts`: yeni test (çalışan adım taşınmaz, aynı emrin bekleyen adımı taşınır, ilk adım bitince de planlı). #262 testi, yerleşmemiş satırı için kalan adımı çalışır yapar; eski kurulum bu hataya dayanıyordu.

## Çalışan işin önüne iş koyma (A4 3b, kart #199, 2026-10-11)
- Kullanıcı kararı "3b": makinede çalışan işin önüne iş konabilir, operatör çalışanı duraklatır; dondurulmuş ya da kilitli iş yerinden oynamaz.
- `servis.ts` `sirala` (ve onu kullanan Arkon `kuyruguSirala`): çalışan iş sıralamaya girer; bitmiş, iptal, kilitli ve dondurulmuş iş 409. `tasi` ve `kaldir` çalışan işi yine reddeder.
- `canliyaAl`: çalışan iş, taslakta aynı kaynakta elle sıralanmış ve canlıdan farklıysa canlıya yazılır; makinesi (`isEmriKaynagiYaz`) yalnız planlı işte değişir.
- Motor değişmedi: çalışan iş sabit kalır, elle verilen yerinde durur. Şema, göç, yeni işlem ve paket yok.
- `plan.test.ts`: çalışan işin önüne iş taslakta ve canlıda arkaya kaydırır, makinesi değişmez; dondurulmuş çalışan işin önüne 409.
- Kart #641 (2026-10-12): istasyon günlük yükü (matris ve PL-09 kişi ihtiyacı) işin yalnız kaynağın çalışma takvimindeki parçasını sayar
  (`kurallar.ts` `calisilanParcalar`). Önce vardiya sonunu aşan işin gece süresi de yük sayılıyordu; vardiya içinde koşan test 25 kat ihtiyaç
  görüyordu (12500 / 500). Şema ve sözleşme değişmedi.

## Parti kolu planda (B7, kart #689, 2026-10-12)
- Süre adımın işleyeceği adetle: `PlanIsEmri.adimAdedi` (bölünmeden önceki ve birleşme sonrası adımlar kolların adedini de işler).
- Motor (`kurallar.ts` `oner`): `MotorIsi.bagli` başka emirdeki öncüllerdir; işin kendi bağımlılığıyla (bekleyen, akışlı, bağımsız) beklenir.
  Öncülü henüz yerleşmemiş iş, o emir sırası gelene dek bekler ve tur yeniden döner; öncül yerleşemezse ya da döngü kalırsa "Bağlı parti yerleşmedi.".
- Servis (`partiBaglari`): kolun listedeki ilk adımı üstün bölünme sırasından önceki adımını, üstün birleşme adımı kolun son adımını bekler.
  Kolun sırası ek adımla yeniden numaralandığından kolun ilk adımı sırayla değil listedeki ilk adım olarak alınır.
- Sözleşme: yerleşim ve yerleşmemiş satırına `tur` (rota, rework, tamir, ek) eklendi. Göç, uç ve rol değişikliği yok.
- uretim-emirleri: `PlanIsEmri.bolunmeSira` eklendi (yalnız okuma).
- VARSAYIM: uyarılar (sıraya aykırı başlangıç) yalnız emir içi öncüle bakar; kol bağı uyarıya girmedi.

## Taban plan (33 a, 25 b, 394 a, 2026-10-21)
- Kullanıcı kararı 33 a: taban planın sahibi plan modülüdür; canlıya almayla aynı işlemde yeni, yalnız eklenen bir tabloya yazılır. Reçete ve Rota sekmeyi `disari.ts` `tabanPlani` ile okur (sekme ayrı iş).
- Göç `20261019161000_plan_taban.sql`: `plan_taban` (adım başına tek satır, `plan_taban_is_emri_tek`); değiştirme, silme ve boşaltma `yalniz_ekleme` ile reddedilir. Boş tablo; dolu tabloya dokunulmadı. İş emrine yabancı anahtar yok: emir silinse de taban kalır.
- `canliyaAl`: plan sürümü artırıldıktan sonra canlıya geçen her adımın canlı yeri (makine ya da kişi, başlangıç, bitiş), yeni canlı sürüm, senaryo ve canlıya alan kişi yazılır; tabanı olan adım atlanır. Plan sürümü satırı canlıya almanın başında kilitlenir, eşzamanlı ikinci canlıya alma bekler; benzersiz kısıt ikinci yazmayı ayrıca durdurur. Deneme emirleri (eksi kimlik) yazılmaz.
- Yeni uç, işlem, rol ve paket yok.
- VARSAYIM: taban adım başınadır; ilk canlıya almada yerleşmemiş adım, ilk yerleştiği canlıya almada kendi tabanını alır. Emrin ilk planı en küçük plan sürümlü satırlarıdır. Bölünmüş işte zarf (ilk başlangıç, son bitiş, ilk parçanın kaynağı) yazılır, parçalar yazılmaz.
- VARSAYIM: göçten önce canlıda olan adımın tabanı, göçten sonraki ilk canlıya almadaki yeridir (canlı kurulum yok; yalnız geliştirme verisi).
- `plan-taban.test.ts`: ilk yazma, değişmezlik, sonradan giren adım, yalnız ekleme ve kısıt, emir silinince kalma, eşzamanlı iki canlıya alma, yetkisiz ve vazgeçilen taslak.
## Bölünen siparişin gecikme bedeli (35 b, 2026-10-21)
- Kullanıcı kararı 35 b (davranış değiştiren düzeltme onaylı): bölünen siparişin her parçasının gecikmesi sipariş adedindeki payıyla ağırlanır.
- Bulgu: planın TL maliyetinde ceza, kâr riski ve finansman emrin tutar payıyla (225) zaten ağırlıydı; `tabanSaat × gecikme` ise emir başına tamdı. Aynı satır iki emre bölününce taban iki kez sayılıyor, motor bölmeyi pahalı görüyordu.
- `kurallar.ts`: `adetPayi` (emir adedi / satır miktarı, en çok 1; satırsız ya da miktarı bilinmeyen emirde 1); `gecikmeMaliyeti` ve `planMaliyeti` payı alır, yalnız taban kısmını ağırlar. `servis.ts` `tlToplami` payı emrin sipariş satırından verir.
- Şema, uç, işlem ve paket yok. Plan TL toplamı ve TL iyileştirmesinin sonuçları değişir.
- VARSAYIM: öncelik sınıfının saatlik bedeli (`gecikmeBedeli`, `emirBedelleri`) değişmedi: oran saatliktir, toplam değildir; payla ağırlansa küçük parça daha düşük sınıfa düşerdi.
- Testler: `kurallar.test.ts` 35 b (saf); `plan-bedel.test.ts` 35 b (gerçek PostgreSQL, satır 10/20/40 adette taban 1, 1/2, 1/4).
## Onay adımı (H1, H5; 2026-10-23)
- Kullanıcı kararları: hedef (canlı plana tek kapı), 146 (dört göz ayarı, varsayılan kapalı), 147 a (Arkon sırası onaya gider), 148 a (bedel ayarı ve elle çarpan taslağa). Sözleşme H0'da (`PLAN_ONAY_KOMUTLARI`, `SENARYO_DURUMLARI`, `onay`, `yapabilir`, taslak gövdeleri).
- Göç `20261023201500_plan_onay.sql`: senaryo durumuna `onayda` ve defter türüne `bedel_ayari`, `siparis_carpani` (CHECK genişler); kapanış kısıtı ve iki koruma tetikleyicisi onaydakini kapalı saymaz; yeni boş tablolar `plan_senaryo_onay_kaydi` (yalnız ekleme), `plan_senaryo_bedel_ayari`, `plan_senaryo_siparis_carpani`. Dolu tabloya sütun eklenmedi.
- Uçlar: `onaya-gonder`, `onaydan-cek` (plan.studyo), `geri-gonder` (plan.canliya-al). `canliya-al` yalnız onaydaki taslaktan. Yeni işlem ve rol yok.
- Davranış değişikliği: açık taslak doğrudan canlıya alınmaz; `POST /plan/bedel-ayari` ve `POST /plan/siparisler/:id/carpan` taslağa yazar ve `PlanCevabi` döner (taslak kimliğiyle); `GET /plan/bedel-ayari?taslak=` ve `GET /plan/siparisler/:id/bant?taslak=` taslağınkini okur.
- `canliyaAl`: taslağın ayarı ve bedel ayarı tek güncellemeyle canlıya (geçmişe canlıya alma başına tek satır); taslaktaki çarpanlar yazanı ve gerekçesiyle `plan_siparis_carpani`'ya.
- `disari.ts` `bekleyenSiralar` (Arkon H6): açık ya da onaydaki taslakta kaldırılmamış sıralama değişikliği olan iş emirleri.
- Senaryo listesi onaydakini açıklarla birlikte üstte gösterir, etkisini hesaplar; ikinci menü stüdyo sayacı açık ve onaydakileri sayar.
- Bağımlılık: plan -> ayarlar `disari.ts` (`sistemAyariOku`); ayarlar plana bağlı değil.

## Vardiyasız tezgâh (168 b, 2026-10-23)
- Sunucu motoru (`PlanMotoruCozucusu`) dönüşünde `vardiyasiz` (anahtar "emir no|OP no") taşıyabilir. `sunucuMotoru` bu işleri hata saymaz, yer vermez, ayrı döndürür.
- Kuyruk yaz: vardiyasız işin taslaktaki yeri kalkar, yazılmaz; komut 200. Canlıya al: vardiyasız işin taslak yeri canlıya geçmez, canlıdaki hâli kalır, tabanı yazılmaz.
- Plan cevabı: motor kayıtlıyken makinesinin takvimi olmayan yerleşmemiş işin nedeni "Tezgâhın vardiyası tanımsız."; takvimsiz uyarısı "vardiya takvimi yok; işleri yerleşmedi." Motor kayıtsızken bugünkü metin.
- VARSAYIM: neden, işin atanmış makinesinin takvimi olup olmadığından okunur (motorun listesi saklanmaz); kuyruk yazımında taslaktaki eski yerin kalkması iş yerleşmemiş görünsün diyedir.

## Ortak motor canlıda (627 a, kart 625h)
- `sunucu/kablolama.ts` plan motoru çözücüsünü bağlar (ADR 0018 karar 5). Canlıya almada ve kuyruk yazımında taslağın makine kuyrukları (planlı, sabit olmayan, bölünmemiş makine işi) sıraları korunarak ortak motorla yeniden dizilir; vardiyası tanımsız tezgâhın işi uyarıyla boş kalır (168 b).
- Planlama sayfasının çalışma kaydı yoksa çözücü 409 döner. Uç, göç, yetki değişmedi. `/plan/oner` ve `/plan/karsilastir` 625n'de kalktı (aşağıda).

## Ortak motor tek motor (627 a, 669 a, 671 a, 677 a, 678 a, 679 b, 686 a, 687 a, 689 a, 690 b; kart 625n)
Uçlar ve sözleşme:
- `POST /plan/oner` ve `GET /plan/karsilastir` kalktı (`servis.ts` `oner`, `karsilastir`; sözleşme `karsilastirmaCevabi`, `KarsilastirmaCevabi`). Hiçbir ekran çağırmıyordu (DOĞRULANDI, grep).
  Planı kur planlama sayfasındadır: sayfa kuyrukları kendi motoruyla sıralar, `POST /plan/kuyruklari-yaz` ile yazar, saatleri ortak motor verir. Defterde Planı kur `sirala`dır (eskiden `oner`).
Sunucu kuralları (`servis.ts`):
- Sıraya aykırı taşıma (308 b) motordan önce de denetlenir: ret motor koşmadan döner.
- Elle seçilmemiş iş, kuyruğu rota dışı bir makinedeyse rotadaki makinesinin kuyruğuna döner (elle seçilen makine kalır, H3).
- Bölünmüş ya da ileriye (1 dk'dan çok) sıralanmış çalışan iş motora sabit gider; yeri kayıtlı aralığıdır (671 a, kural 2 ve 5). Canlıya almada önüne iş konan çalışan iş kuyruğa verilir (A4 3b).
Ortak motorla değişen beklentiler (Motor A'dan farklar):
- Vardiyası tanımsız merkezin işi yerleşmez, nedeni ve uyarısı görünür (168 b, 650 a; PL-04). Tezgâh kendi iş merkezinin haftasıyla çalışır (650 a). Kapalı gün tatildir (677 a; PL-04, P-B24).
- Başlangıcı olmayan emir günün başından serbesttir (678 a; P-B24).
- Süre ürünün yürürlükteki rotasındandır, iş emrinin kendi süresinden değil (679 b; Z6). Rota değişikliği stüdyoda taslak olarak gelir.
- Bölünmüş iş sabittir (671 a): hurdadan sonra parça süresi kendiliğinden kısalmaz (38/42 dk kalır); makineleri kapanan bölünmüş iş yerinde kalır, yersiz olmaz. Yersiz bölme yalnız eski veride kalır ve parçalarıyla yeniden yazılır.
- Arızalı makineye iş yazılmaz (kuyruk yazımı reddeder); işin var olan yeri uyarıyla kalır (Motor A kaldırıyordu; #439).
- Planın personel kısıtı ayarı ortak motora gitmez; motorun personel kısıtı planlama çalışmasının Kısıtlar ayarındadır (282 a).
- Kişi kaynaklı adım ortak motorun girdisinde yoktur (bitmiş sayılır); Planı kur onu yerleştirmez (P1, PL-02).
- Elle sıralı iş kuyruktaki yerini korur (Motor A kuyruğun başına alıyordu). Planı kur kuyruğu yeniden yazdığı için yeni kuyruğuna yazılan işin elle sıra düşme kaydı kapanır.
- Alt partinin adımı makinesiz açılır; Planı kur'da makineyi sayfa seçer (#262 testi makineyi verir).
Kalan Motor A kullanımları (ayrı kart, 625m): 220 a motor yerleşimi, emir önizleme, hızlı deneme, parçalı kuyruk yazımı (yazımdan sonra Motor A önerisi, 276 a).
- Sıra sayfanındır (687 a). Motor A'nın sıralama kuralları sunucuda sınanmaz: 196 a, 265 a, 6a ve 6b yalnız bedel, bant, çarpan, ayar ve yetkiyi sınar
  (bedel bandı ve sınıf eşikleri `bant` ucundan); 203 a sayfanın TL amacıyla karşılanır, testi kalktı; 276 a (taslak motorun önerisiyle aynı) kalktı.
  Sayfanın sıralamasına para ve müşteri verisi 674 borcuyla gelir.
- Rotada olmayan ek adım (rework, tamir, ek) emrin kendi adımıdır (686 a): `PlanMotoruIstegi.ekAdimlar` ile ayar ve parça başı süresi, adedi ve
  emrin içindeki öncül ve ardılı motora gider (`servis.ts` `ekAdimlari`); motor onu öncülünden sonra, kuyruğundaki tezgâhta dizer. 689 a'nın
  ara yolu (ek adım uyarıyla yerleşmemiş kalır) kalktı. Süresi okunamayan ek adım gönderilmez; motor yerleştiremez, komut reddedilir.
- Parti kolu bağı (B7, `partiBaglari`) ortak motora öncül olarak gider (`PlanMotoruIstegi.baglar`, 690 b): kolun ilk adımı üstün bölünme öncesi
  adımını, üstün birleşme adımı kolun son adımını (ek adım da olabilir) bekler.
Testler: plan-kiyas.test.ts kalktı (Motor A ile ortak motor kıyası). Planı kur testlerde `taslaktaOner` yardımcısıdır (plan-ortak.test.ts); ortak kurulum merkeze tam gün (iki yarım vardiya) ve boş planlama kaydı verir.

## Canlıya almada dakika kayması (759, 2026-10-27)
- 737 a denetimi (`geriKayan`) yalnız motorun yerinde tuttuğu işi (planın iş emri, yeniden dizilmeyen: kilitli, dondurulmuş, bölünmüş, çalışan)
  geçilmiş sayar. Önce planın iş emri olmayan satır da (biten ya da planlanmayan iş) sayılıyordu; motor onu engel saymadığı için dakika dönünce
  canlıya alma yanlışlıkla duruyordu (DOĞRULANDI: deneyde plan-oner A4, #23, PL-07, P4/P6 ve plan-canli bu yüzden düşüyordu).
- Sabit işin önüne sıkı dizilmiş iş, dakika dönünce sabit işin arkasına geçer; canlıya alma 737 a gereği durur (değişmedi). Bunu sınamayan
  plan-canli #1186 ve plan-gecmisi testleri saati gerçek anda sabitler (`plan-saat.test.ts` `anSabit`).
## Gece vardiyası (741 a, 2026-10-27)
- Motorun "şimdi"si gerçek saattir; başlangıç günü 07:00'ye çekilmez (`girdi.betik` `simdiUygula`, `emirler.betik`, `degerlendir.betik`; sayfada
  `zz31-tmi.betik`). Gerçek saat yoksa 07:00 kalır. Yeni plan istemcisinin altı kopyası (`istemci/src/moduller/plan/planlama/*/kurallar.ts`) aynı kuralla.
- Başlangıç gününden önceki günün gece vardiyası gece yarısından sonra da çalışma saatidir (`engine.betik` compile: tezgâh, personel ve genel
  pencere d=-1'den; pencere 0'da kesilir). İstemci `derle` aynı. Işıksız tezgâhın tam günü değişmedi. Sunucu takvimi (vardiya modülü) önceki günü
  zaten okur; `servis.ts` değişmedi.
Testler: plan-cozucusu 741 a (gece 00:30'da iş şimdiden başlar, vardiya bitince akşamı bekler, gece vardiyasız tezgâh sabahı bekler); istemci motor 741 a.

## Canlıya alma yeniden dizmez (762 b, 2026-10-27)
- Kullanıcı onayı: mesaj cmsg_019jymdq1CtoFcRqjZv7Ln6X44fgfvedVKYaZkeSDxyvPZ (2026-10-27 06:11:31Z): "762: b, ADR ve davranış değiştiren düzeltme onaylı".
- Canlıya alma sunucu motorunu çağırmaz; onaylanan taslağın saatleri aynen canlıya geçer. Taslak yazıldıktan sonra zaman geçse de kuyruk
  yeniden dizilmez, 737 a kayma reddi (`geriKayan`) ve "Planı kur'u yeniden çalıştırıp" 409'ları kalktı. Geçmişte kalan başlangıç terminalde
  gerçek saatle kaydedilir. Canlıya alma cevabında `motorFarki` artık dönmez (alan isteğe bağlı kaldı; kuyruk yaz döndürmeye devam eder).
- Sıra denetimi (308 b, 671 a) taslağın kendisine bir kez yapılır.
- 168 b korunur: vardiyası tanımsız tezgâhtaki taslak yeri canlıya geçmez. Önce motorun `vardiyasiz` listesinden gelirdi; şimdi sunucu aynı iş
  kümesinde (planlı ya da sıralanmış çalışan, kilitsiz, dondurulmamış, bölünmemiş makine işi) tezgâhın takvimine (`b.takvimler` null) bakar.
Testler: plan-motoru canlıya al (motor çağrılmaz, saatler taslağınki; 168 b her iki iş canlıya geçmez), plan-canliya-al-kayma (zaman geçince 200, canlı taslağın saati).

## Bekleyen değişiklikler atölyede (749, 755 a, 787 a; 2026-10-27)
- Kullanıcı onayı: 755 a mesajları cmsg_019jymdq1CtoFcRqjZv7Ln6XDmudnovRr3cEmBNov7VZ7n (05:42Z), cmsg_019jymdq1CtoFcRqjZv7Ln6XP32mFy1afztaLH59Sr4LPM (05:51Z),
  teyit cmsg_019jymdq1CtoFcRqjZv7Ln6X41pRDueJDe29Ra1GvA5rgV (05:53Z); 787 a cmsg_019jymdq1CtoFcRqjZv7Ln6XHgHKMVFUdoeACGZgW5ZB3a (07:27Z).
- Plan varken planın girdisini değiştiren her değişiklik çalışmanın `bekleyen` listesine girer: ne, kim, ne zaman, etkilenen siparişler
  ve reddin geri dönüş farkı. Plan atölyesinin Onay sekmesinde çalışma planının kontrolüne "Bekleyen değişiklikler" bölümü eklendi;
  her satır ya da hepsi uygulanır ya da reddedilir. Bekleyen varken onaya gönderilmez (kırmızı kontrol). Ekran düzeni değişmedi.
- Uygula: değerlendirme ucunun yeni `plan-uygula` türü (sözleşmeye eklendi, mevcut türler değişmedi). Motor kayıtlı planı taban ve
  başvuru alır, etkilenmeyen siparişlerin işlerini o plandaki yerinde geçici kilitler (eski sayfanın 'onar' kipi); '*' bütün işler.
- Reddet: geri dönüş farkı uygulanır; sonraki bekleyen aynı veriye dokunuyorsa önce o reddedilmeli. Hepsi reddedilince plan yeniden güncel.
- Bu özellikten önce bayatlamış planın kaydı olmayan değişiklikleri tek satırda gelir ve yalnız uygulanır (787 a).
- "Planı iyileştir" düğmeleri "Plan iyileştirme ara" oldu (pasif kaldı); bayat plan metinleri Plan atölyesine yönlendirir.
Testler: degerlendirme.test PD-20 (yalnız etkilenen sipariş oynar), istemci kayit, coz ve Atolye bekleyen değişiklik testleri.

## Emir önceliği (815, 699/3 a; 2026-10-27)
- Plan sırasına yalnız üretim emrinin önceliği girer: sunucu motoruna sınıf `oncelikSinifi` ile (1-2 → 1, 3 → 2, 4 → 3); atölye motoru kayıttaki
  'bedel' kipini de 'oncelik' sayar, sipariş önceliği emrinkinden (girdi.betik `oncSinifi`). Gecikme bedeli bandı, müşteri sınıfı ve elle çarpan sıraya girmez.
- Kalkan uçlar: `POST /plan/siparisler/:id/carpan`, `GET /plan/siparisler/:id/bant`; kablolamadaki müşteri sınıfı bağı ve `musteriSinifiCozucusu`.
  `GET /plan/siparisler/:id/carpan` geçmişi okur. Çarpan tabloları silinmedi; taslak kopyası ve canlıya alma artık yazmaz. Göç yok.
- Planın TL toplamında gecikme çarpanı yalnız öncelik çarpanıdır (bedel ayarının yüksek/normal/düşük çarpanları).
- Atölye motorunda "Tek TL toplamı" amacı ve Plan dengesi çubuğu bedel kipine bağlıydı; etkisiz kalır (899 a; TL amacı 832 a gereği pasif). Çubuk görünür, pasif.
Testler: plan-bedel 815 (iki test), kurallar 815, kablolama 815; istemci planlama-tam-durum, yazmalar, siparis 815.

## Hatalı parça kolu planda (1034 D, 1036 a; 2026-10-29)
- Bulgu (DOĞRULANDI, `hatali-kol.test.ts` ilk sürümü): sunucu motoru istekte olmayan öncülü bitmiş sayar (emirler.betik "istekte geçmeyen
  adım"). Kolun kalite kararı ve doldurulmamış rework adımı süresiz ve kaynaksız olduğu için motora gitmez; kolun tekrar adımı ve ana partinin
  birleşme adımı kol hazır değilken yerleşiyordu (1036 a'ya aykırı).
- Düzeltme (`servis.ts` sunucuMotoru, bekleyenAdimlar): yerleşen iş, kol öncülü (parti bağı) ya da emirdeki önceki ek adım yerleşmemişse
  emrinde sonraki adımlarla beklemeye alınır ve motor onlarsız yeniden koşar (en çok 8 tur). Rota adımı öncülüne dokunulmaz.
- Yerleşmemiş neden: rework adımı "Rework adımı: planlama kaynak ve süre seçmedi.", süresiz ve kaynaksız ek adım kalite kararı metniyle.
- VARSAYIM: bekletme yalnız sunucu motoru yolundadır; motor kayıtsızken kurallar.ts zaten "Önceki iş emri yerleşmedi" / "Bağlı parti
  yerleşmedi" der. Geri alma: bekleyenAdimlar çağrısı kalkar.
- Bulgu (DOĞRULANDI, denendi, düzeltilmedi): kola konan fason rework (ek adım) sunucu motorunda bilinmez; tekrar adımı termin günü beklemeden
  yerleşti (deneme: 7 gün termin, tekrar 0,04 gün sonra). Fason ek adım plana girmeyen iş olarak süzülür (Üretim Emirleri), motor yalnız rota ve
  emir fasonunu tanır (emirler.betik emirFasonlariniEkle). Düzeltme motor betiğinde ek adım için fason bekleme ister; 1202 ile kapandı (aşağıda).

## Fason rework ve ek adım fasonu sunucu motorunda (1202; 2026-10-29)
- Hata (DOĞRULANDI, `fason-ek-adim.test.ts` yamasız düşer: tekrar 0,03 gün sonra): Üretim Emirleri fason adımı plana iş olarak vermez, sonraki
  adıma `fasonBekleGun` yazar; sunucu motoru onu okumuyordu, yalnız rota ve emir fasonunu biliyordu. Kola konan fason rework'ten sonraki adım fasonu beklemeden yerleşiyordu.
- Düzeltme: kuyruk işinin `fasonBekleGun`'u (bağımsız değilse) istekle gider (`fasonBekleme`); motor (emirler.betik fasonBeklemeleriniEkle) işin
  öncülü motorda fason değilse önüne o kadar süren hemen çıkan fason adımı koyar. Rota ve emir fasonu değişmez; sayfa motoru değişmez.
- VARSAYIM: rota fasonu ile ek adım fasonu art arda gelirse motor yalnız rota fasonunu sayar. Geri alma: `fasonBekleme` alanı kalkar.

## Emir içi öncül listesi, çok dallı rota (1248 a, 1245 a; 2026-10-30)
- Değişiklik: plan emir içi öncülü "bir önceki sıra" saymaz, Üretim Emirleri'nin listesinden okur (`PlanIsEmri.onculler`; listesiz emirde
  ortak `adimOnculleri`). Sayfa motoru (`kurallar.ts oner`): dallar aynı anda yerleşir, birleştirme adımı her öncülü kendi türü ve deviriyle
  bekler (en geç sınır); geri yön dalları ayrı sayar. Servis: akışlı devir öncül başına, önizleme uyarısı ve sıra denetimi (onculSinirlari),
  yerleşmeme nedeni, ek adım bekletmesi (yalnız ardıl dal), motorsuz kuyruk sınırı ve ek adım komşuları listeden. Planın denediği emir
  (deneme ve teklif önizlemesi) listeyi rotanın `onculler`inden kurar; fason adımın yerine onun öncülleri geçer. Ortak motor girdisi
  (`girdi.betik bagOf`): Reçete ve Rota adımında çözülmüş `onculler` varsa bağ ondandır; `null` ise bugünkü kural.
- Test: `oncul-listesi.test.ts` (dallar, liste yok, akışlı öncül, yerleşmeyen öncül, sabit ve bitmiş öncül, geri yön, girdi bağı; gerçek
  PostgreSQL'de dallı rotadan açılan emir: yamasız B dalı A'nın bitişini bekliyordu, DOĞRULANDI).
- VARSAYIM: öncül her zaman küçük sıralıdır (Üretim Emirleri girdide denetler). Fason beklemesi işin kendisinindir; öncülü olmayan iş
  (dal başı, bağımsız) beklemez. Ek adımın komşusu en yakın (son) öncülü ve onu ilk bekleyen adımdır. Geri alma: `onculler` alanı okunmaz, eski kural döner.
