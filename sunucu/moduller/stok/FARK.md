# FARK: stok, siparişsiz satın alma kabulü reddi (kart #99; soru 104 a)

Kullanıcı kararı 2026-10-22: Soru 104 a, davranış değiştiren düzeltme onaylı.
- `POST /stok/mal-kabul`: `tur: 'satin_alma'` olan her satır sipariş satırı ister; yoksa 400, alan `satirlar.N.siparisSatirId`, ileti "diğer" türünü söyler. Siparişli kabul değişmedi; iade ve diğer değişmedi.
- Örnek veri ve stok testlerindeki siparişsiz giriş kurguları "diğer" türüne çevrildi (sınadıkları stok davranışı aynı).
- Mal kabul ekranı: satın alma türünde siparişe bağlanmamış satır varsa göndermeden önce uyarı.
- Başka modül: `etiket-merkezi` testi (`etiket-merkezi.test.ts` mal kabul kurgusu) siparişsiz satın alma gönderiyor ve kırılır; o modülün kartıyla "diğer"e çevrilmeli (bu dala dokunulmadı).

# FARK: stok, Malzeme · Teslim paneline Okut taşınması, sunucu (kart #95; sorular 89, 93 a, 95 a, 96 a+b, 98 a)

Kullanıcı kararları 2026-10-22: Soru 96 a ve b, b'de telafi 1-4 ile; onaylı kararı (T7) değiştirme, dolu tabloyu değiştiren göç, yetki genişletme ve güvenliği gevşetme onaylı. Soru 98 a davranış değiştiren düzeltme onaylı. Rol x işlem değişmedi.
- Göç `20261022101900_stok_istek_kaynagi_okutarak_alma`: `stok_malzeme_istegi`ne `kaynak_istasyon_id`, `red_nedeni`; `stok_teslim`e `okutarak`, `itiraz_sonu`, `itiraz_nedeni`, `itiraz_kisi_id`, `itiraz_zamani`, `iade_teslim_id`. Var olan satırlar değişmez (eski istek depoya, eski teslim okutmasız).
- A, istasyondan istek: `POST /stok/malzeme-istekleri/ac` `kaynakIstasyonId` alır (teslim yeri istasyon olmalı). İstek depo listelerine ve sayaçlarına düşmez, depo geçişleri 409. Kaynak istasyonun kapsamındaki kişi kutuda `bendenIstenenler`i görür; `POST /stok/malzeme-istekleri/:id/kabul-et` istekle yolda teslim açar (istek hazırlanıyor; isteyen istasyon alınca teslim olur), `/reddet` nedenle iptal eder. İsteyen kendi isteğini kabul edemez.
- "Nerede var": `GET /stok/teslim-kutusu/malzeme-yerleri` (`stok.istek`) depodaki kullanılabilir toplam ve bütün istasyonlardaki serbest miktar; `kod-coz` malzeme cevabına kapsam dışı istasyonlar `digerIstasyonlar` olarak eklendi (yalnız gösterim, soru 93 a).
- B, okutarak al: `GET` ve `POST /stok/teslim-kutusu/okutarak-al` malzeme (ya da lot) ve yer kodunu sunucuda yeniden çözer; yer yalnız aktif istasyon konumu. Teslim açılıp aynı anda alınır, `okutarak` işaretli, açıklaması "Okutarak alındı, kaynak onayı yok" (telafi 4). Yalnız kalitesi serbest ve yolda ayrılmamış miktar; emirli parti yalnız kendi emri için (telafi 1, K2). Kaynak istasyona atanmış kişilere `stok.okutarak-alindi` bildirimi (telafi 2).
- İtiraz: `POST /stok/teslimler/:id/itiraz` kaynak istasyonun kapsamındaki kişi, `itiraz_sonu`na kadar bir kez (telafi 3). Süre kaynak istasyonun o gün başlayan vardiyalarının bitişi, yoksa tesis günü sonu. İtiraz geri almaz; malzeme alanın istasyonunda serbestse ondan kaynağa iade teslimi açılır. Kutuda `okutarakAlinanlar`.
- Soru 98 a: mamul ve yarı mamulde `cikisNedeni: 'sevk'` olan `/stok/cikis` ve `/stok/sepet/stoktan-dus` 422 döner; sevk sevkiyat işinden düşer.
- Sepet: satıra `koken` (`uretim` giriş ya da aynı yerde statü dönüşümü; `teslim` başka yerden transfer).
- `kod-coz` (panel) malzeme cevabı `malzeme.tur` ve lotun `parti.uretimEmriId`'sini taşır: panel stok okuması olmadan mamulü sevke, emri fasona yönlendirir.

# FARK: stok, Malzeme · Teslim paneli, istemci (kart #95; sorular 89, 90 a, 93 a, 95 a, 96, 97 a, 98 a)
- Okut sayfası kalktı (90 a). `/stok/okut` adresi ve menü maddesi paneli açar, sayfa İş kutusuna döner (`?mod=kabul` Teslim al, `sevkiyat` Teslim et, `sepet` depo sepeti). Panel yetkisi (`stok.istek`) olmayan okuyucuya okutmanın panelde olduğu yazılır. Stok Merkezi'ndeki Okut, Mal kabul ve Sevk çıkışı düğmeleri paneli açar.
- Okutma sonucu (89): okuyucunun altında kart; Sorgula sekmesi yok. Gözler, lotlar, toplam yalnız stok okuması olana (`/stok/kod-coz`, 93 a); herkes alabileceği yerdeki serbest miktarı ve başka istasyonlardakini görür. İşler karttan seçilir: Mal kabul (`stok.giris`), Sevk, Okutarak al, Depo sepetine ekle (`stok.transfer`, son ekleme geri alınır).
- Teslim al: okutulan malzeme için Mal kabul (eski hızlı kabul, 91 a sipariş satırı; Rafı okut penceresi, önerilen göz, etiket bas), sonra Malzeme teslim al.
- Sepet: Hepsi, Üretilen, Teslim alınan (`koken`); Depo sepeti yalnız `stok.transfer` (95 a): satır kaldır, hepsini tek yere taşı.
- Teslim et: Benden istenenler (kabul: kaynak istasyon sepetinden parti ve miktar; red: neden), Okutarak alınanlar (süre içinde itiraz), Sevk, sonra Malzeme teslim et. Sevk: mamul ve yarı mamulde `sevkiyat` modülünün `UrunSevkleri` ve `uretim-emirleri`nin `FasonaGonder` bölümü (97 a, stok yalnız ev sahibi); siparişsiz malzemede `stok.cikis` ile sevk çıkışı (98 a), son çıkış `stok.geri-al` ile geri alınır.
- Malzeme iste: Nereden (depo ya da malzemenin bulunduğu istasyon, `malzeme-yerleri`); istasyondan istekte teslim yeri zorunlu. Okutarak al bölümü: malzeme ve yer okutulur, önizlemeden satır, götürülen istasyon ve miktar seçilir. İsteklerimde kaynak istasyon ve red nedeni.

# FARK: stok, Stok Merkezi sadeleştirme: tek Hazırlık listesi ve Taşı ekranı (kart #1319)

Kullanıcı (14.10 18:41): taşıma sepeti ve sipariş toplama işe yaramıyor; sade, hızlı, profesyonel olsun. Kararlar (karar kartları 18:53): Birleştir, Taşı ekranı, okutma isteğe bağlı, geri alma müdürde. Rol x işlem değişmedi.
- Menü: Sipariş toplama ve Malzeme istekleri tek "Hazırlık" (`/stok/hazirlik`, `stok.transfer` ya da `stok.toplama`); "Taşıma sepeti" adı "Taşı". Eski yollar (`/stok/toplama`, `/stok/toplama/:id`, `/stok/istekler`) yönlenir.
- Hazırlık: bekleyen istekler seçilip tek liste açılır; aynı malzemenin istekleri tek kalem; liste bir teslim yerine (istasyon, konum) toplanır, toplanan oraya taşınır (hedefsiz elle liste eskisi gibi sevk çıkışı). Adım kısmi toplanabilir (STK-H2); okutma isteğe bağlı, okunan kod gözle ya da lotla eşleşmezse adım toplanmaz.
- Liste bitince toplanan istekleri açılış sırasıyla karşılar (STK-H4); karşılanan istek teslim olur, karşılanmayan listeden çıkar ve açık kalır. İptal edilen liste istekleri bırakır. Listedeki istek tek başına teslim edilmez (STK-H1); yolda teslimi olan isteğe ikinci teslim açılmaz (STK-H3).
- Taşı: malzeme katalogdan aranıp eklenir; her satıra ayrı teslim yeri ya da hepsine tek yer; her yer için ayrı fiş (`teslim-et` cevabı `{ fis, fisler }`). Konum seçimi uzun açılır liste yerine kod ya da adla arama (`KonumSecici`).
- Kart #1323: `topla` ve `kapat` tekrar korumalı; teslim, stoktan düşüm, liste açma, topla ve kapat kilitlenmede yinelenir; bakiye satırları kimlik sırasıyla kilitlenir (`siraliKilitle`, #1325 ile gelen ortak yardımcı).
- Göç `20261014193600_stok_hazirlik`: yalnız iki yeni boş tablo (`stok_toplama_hedefi`, `stok_toplama_istegi`); dolu tablo değişmedi.
- Varsayım: kişiye (istasyonsuz) istek listede liste hedefine taşınarak karşılanır; elle kalem ve istek aynı malzemede birleşir, dağıtımda istekler önce gelir. "Hazırla" düğmesi kalktı (listeye alınan istek hazırlanıyor olur; uç duruyor). Geri alma maliyeti düşük (yeni tablolar boşken).

# FARK: stok, mal kabulde malzemeyi katalogdan arayarak seçme (dal claude/stok-merkezi-sadelestirme-cu0dd0)

Kullanıcı (14.10 18:41): "Mal kabul sayfasında malzeme no diyor, malzeme nosu bilmiyor olabilir; arayabilmeliyiz katalogdan." Göç, uç, işlem ve rol değişikliği yok.
- `MalzemeSecici` açılır listeli arama alanı oldu: ad, stok kodu ya da kart no yazılır, eşleşen en çok 8 kart (stok `/stok/ara`, malzemeler `malzemeAra`) stok miktarıyla listelenir; ok tuşları ve Enter ile seçilir, Escape kapatır. Okuyucu kart numarasını yazıp geçebilir.
- Seçilen kart alanda numara yerine "ad · stok kodu" olarak görünür; gövdeye yine kart numarası gider. Alan adları "Malzeme", "Dönen malzeme", "Giden malzeme" (Mal kabul) ve "Malzeme" (Sipariş toplama).
- Varsayım: müşteri parça no, tedarikçi kodu ve eski kodla arama malzemeler `malzemeAra` sorgusunda yok; istek `BASKA-MODUL-ISTEKLERI.md`'de. Geri alma maliyeti düşük (yalnız istemci).

# FARK: stok, stok değeri ağırlıklı ortalama alış fiyatıyla (kart #544, dal 544-stok-ortalama-fiyat)

Kullanıcı kararı (12.10.2026, karar kartı): stok değeri ağırlıklı ortalama alış fiyatıyla; 11.10'daki "son alış fiyatı" kararının yerine. Göç yok.
- `stokDegeriHesapla` satın almanın `ortalamaAlisFiyatlari` (#672) TRY birim fiyatını kullanır; kural `stokDegeri` aynı. İş kutusunda ve Şirket özeti kartında alt yazı "ortalama alış fiyatıyla".
- Varsayım (satın alma): bütün pozitif teslimler miktarla ağırlıklı; kuru bilinmeyen teslim girmez; iskonto ve masraf yok; geri alınan teslim ortalamadan düşmez.

# FARK: stok, Stok Merkezi kullanılabilirlik (kart #680, dal 680-stok-merkezi-kullanilabilirlik)

Kullanıcı (12.10 06:32): stok değeri depoya açık olmasın; Stok Merkezi kullanılabilir değil (malzemeler elle dolduruluyor); toplama ve sepet aynı gibi; satırın yanında taşı, çıkış, sepete ekle, QR. Göç, yeni işlem ve rol değişikliği yok.
- `/stok/panel` stok değerini yalnız `finans.oku` olana hesaplar (`degerGorunur`); depo ve diğer okuyucular göstergeyi görmez.
- `/stok/malzemeler?kapsam=kartlar`: stoğu olmayanlar dahil bütün stoklanır kartlar (malzemeler `malzemeAra`), ekranda "Bütün kartlar" sekmesi.
- Üretim emri kimliği elle yazılmaz: açık emirler (planlı, başladı) listeden seçilir (çıkış, üretim girişi, sepet teslimi).
- Toplama ve sepet ayrı kalır, adları "Sipariş toplama" ve "Taşıma sepeti"; her sayfa ötekinin ne için olduğunu söyler.
- Malzemeler listesinde satır başına Taşı, Çıkış, Sepete, QR; çok gözde önce göz sorulur.
- Varsayım: "elle dolduruluyor" stoğu olmayan kartın listede görünmemesi ve emir kimliğinin elle yazılması olarak okundu.

# FARK: stok, pano ozeti (kart #667, dal 667-stok-pano-ozet)

Kullanıcı (12.10): rol panoları özet ve bilgi veren olsun. Göç, işlem ve yeni uç yok.
- İş kutusu sayı şeridine "Mal kabul bekleyen" (kabul alanındaki malzeme, `kabulde`) ve "Toplama bekleyen" (açık toplama listesi, panel cevabında yeni `toplamaBekleyen`); ikisi de kendi listesine gider.
- Ana sayfa "Şirket özeti" (bölüm `yonetim`, #666) için iki yönetici kartı (`ayarlar.yaz`): stok değeri (tam TL, son alış fiyatıyla, fiyatsız kart sayısı) ve kritik ya da eksi stok. Veri `/stok/panel` ucundan, iş kutusuyla aynı önbellek.
- Varsayım: ana sayfada değer tam TL'ye yuvarlanır (sayı kartı yalnız sayı alır); kuruşlu değer stok panosunda.

# FARK: stok, stok değeri son alış fiyatıyla (kart #544, dal 544-stok-degeri)

Kullanıcı kararı (11.10.2026): stok değeri son alış fiyatıyla (a); göç yok. Bu karar ağırlıklı ortalama alış fiyatı kararıyla (yukarıdaki bölüm) değiştirildi; bugün geçerli olan odur.
- `/stok/panel` cevabında `stokDegeri` (TRY, kuruşlu metin; fiyatlı stoklu kart yoksa null) ve `fiyatsizKart`. Hesap saf kural `stokDegeri`: pozitif toplam x satın almanın `sonAlisFiyatlari` TRY birim fiyatı, kuruşa yarım yukarı.
- İş kutusundaki "Stok değeri" göstergesi sabit "—" yerine değeri ya da "Veri yok" gösterir; fiyatı olmayan kart sayısını alt satırda söyler.
- Varsayım: TRY karşılığı olmayan (kuru bilinmeyen) fiyat değere katılmaz, fiyatsız sayılır. Eksi toplamlı kart değere katılmaz.

# FARK: stok, ayar ekranı Sistem Ayarları'nda (kart #587, dal 587-stok-ayar-ekrani)

- `istemci/src/moduller/stok/ayar-ekranlari.tsx`: Stok ayarları (`Ayarlar`) Sistem Ayarları'nda da açılır; Stok > Ayarlar yerinde kalır. Aynı bileşen ve uçlar; görünürlük `stok.tanim`.

# FARK: stok, demo denemesi düzeltmeleri (kart #544, dal 544-stok-demo-bulgulari)

- Hareket işareti türden değil yönden çıkar (`hareketIsareti`): sayım fazlasının geri alınması artık "−" görünür; hareketler ve iş kutusu aynı işlevi kullanır.
- Mal kabul düzeltmesinde sıfır miktarlı satır yazılmaz; satırsız düzeltme belgeyi tamamen iptal eder (yeni belge satırsız açılır). Ekranda "Belgeyi tamamen iptal et". İlk mal kabulde sıfır hâlâ reddedilir.
- Stok içi arama (`/stok/ara`) hizmet kartını önermez; mal kabul, fason ve toplama seçicileri bu aramayı kullanır. Hizmet satırı sipariş satırıyla gelir.
- Varsayım: iptal kaydı satırsız belge olarak tutulur, ayrı durum sütunu yok (göç yok). Geri alma: düzeltme gövdesinde en az bir satır.

# FARK: stok, sepet okuması kilitsiz (kart #544, dal 544-stok-sepet-kilit)

- `GET /stok/sepet` salt okunur işlemde `FOR UPDATE` kullanıyordu; kaynak gözlü satırda 500 dönüyordu. Mevcut artık kilitsiz `bakiyeOku` ile okunur; teslimdeki kilit (`sepetiAyir`) aynı.

# FARK: stok, malzeme kartının sipariş noktası ve depo yeri (A7, kart #516, dal 516-siparis-noktasi-depo-yeri; taban main 1637f9f)

Kullanıcı: 2-a "sipariş noktası = kritik seviye", 3-b "stoka varsayılan göz sütunu" (dolu tabloya sütun, onaylı) ve "a7yaz" (11.10.2026).
## Eklenen
- Göç `20261011131700_stok_varsayilan_konum.sql`: `stok_malzeme_ayari.varsayilan_konum_id` (boş olabilir, kısıt `stok_malzeme_ayari_varsayilan_konum` -> `stok_konum`). Var olan satırlar boş kalır; veri taşınmaz.
- `POST /stok/malzemeler/:id/ayar-duzenle` gövdesine `varsayilanKonumId` (verilmezse boş); yalnız aktif konum (DEP-59, 422). Ayrıntı cevabında `ayar.varsayilanKonum` (kimlik, kod).
- Uç `GET /stok/malzeme-kart-bilgileri` (`oturum`, sayfalı, sayfa boyu en çok 500): kritik seviyesi ya da varsayılan konumu dolu malzemeler, kart kimliğiyle (DEP-60). Malzeme kartı bunu gösterir (malzemeler istemcisi); malzemeler sunucusu stoku ithal etmez (stok malzemeleri ithal ediyor, döngü olurdu).
- Ekran: Stok > malzeme ayrıntısı > Stok ayarı'nda "Varsayılan konum" seçimi; kritik seviyenin ipucu "Malzeme kartında sipariş noktası olarak görünür".
## Bu turda varsayılanlar
1. Kart bilgisi gizli değildir; oturumu olan herkes okur. Geri alma: uç yetkisi.
2. Varsayılan konum her türden aktif konum olabilir (raf gözü, zemin, kabul, üretim çıkışı). Geri alma: DEP-59 sorgusu.

# FARK: stok, rol panosu kartları (kart #483, dal 483-stok-pano)

Kullanıcı kararı ("Yaz", 11.10.2026): dört kart; kaynak tek uç.

## Değişen
- `GET /stok/ozet` (oturum): `acikIstek` (`stok.transfer`; açık ve hazırlanan malzeme isteği), `dusukStok` (stok okuma kümesi; kritik seviyede ya da altında kart), `sayimBekleyen` (`stok.sayim`; sayım süresi dolmuş göz, yerleşim yoksa null), `eksikEmir` (stok okuma kümesi; kalan sarfı kullanılabilir stokla karşılanmayan açık emir). Yetkisi olmayan sayı hesaplanmaz, null döner. Göç yok, yeni işlem yok.
- `istemci/src/moduller/stok/ana-sayfa.tsx`: dört kart (ortak `SayiKarti`, tek sorgu). Açık istekler "Bana düşen işler" (`stok.transfer`; bağlantısız, istek ekranı yok: UYUM-BORCU 31), düşük stok ve malzemesi eksik emir "Uyarılar" (stok okuma; `/stok/malzemeler?durum=kritik`, `/rota/emirler`), sayım bekleyen göz "Özet" (`stok.sayim`; `/stok`). `SayiKarti` dosyasından doğrudan ithal edilir: `arayuz/index.ts` ana sayfa kabuğunu da taşıdığı için kart dosyasında döngü kurar.
- VARSAYIM: eksik emir sayımında her emir stoğu tek başına görür; aynı malzemeyi bekleyen iki emir ikisi de yeterli sayılabilir. Ürün kartı olmayan eski emir sayılmaz. Geri alma maliyeti: sayım fonksiyonu.

# FARK: stok, CSV dosya adında tesis günü (kart #206, dal 206-stok-csv-tesis-gunu; saat dilimi borcu P-B24, #470)

## Değişen
- Malzemeler ve Hareketler ekranının CSV dosya adı `paylasilan/zaman.ts` `tesisGunu` ile üretilir; gece yarısından sonra UTC gününe kaymaz. Sunucu ve göç değişmedi.

# FARK: stok, üretimden malzeme isteği (kart #206, dal 206-stok-malzeme-istegi; Arkon isteği madde 9, temizlik planı madde 10)

## Değişen
- Yeni tablo `stok_malzeme_istegi` (göç `20261010211500`, yeni ve boş tablo): kaynak kimliği tekil, malzeme kartı, miktar, istasyon, isteğe bağlı emir ve not, durum `acik | hazirlaniyor | teslim | iptal`, teslimde karşılanan miktar.
- `disari.ts`: `malzemeIstegiAc(db, kullanici, girdi)` çağıranın işleminde istek açar; aynı `kaynakKimligi` (ör. `arkon:logi:<id>`) ilk kaydı döner, eşzamanlı iki çağrı da tek kayıt bırakır. `malzemeIstekleri(db, kaynakKimlikleri)` durum, miktar, karşılanan (teslimden önce null) ve güncelleme zamanını verir; bilinmeyen kimlik haritada yoktur.
- Yetki (VARSAYIM, koordinatör notu "önce mevcut yetkiler"): yeni işlem yok. Arkon `stok.istek-ac` önermişti; gerekirse rol x işlem çekirdek göçüyle eklenir. Geri alma maliyeti: servisteki işlem adı ve bir göç. İsteği emri başlatan üretim işlemi olan kişi açar (`uretim-emirleri` `KOMUT_ISLEMI`, bugün operatör ve müdür); istasyon kişinin iş merkezi kapsamında olmalıdır (DEP-36 gibi); var olan kaydı dönmeden önce de kapsam denetlenir. Hizmet kartı, pasif ya da olmayan istasyon, olmayan emir 400; kullanılamaz kart 422.
- Depo uçları: `GET /stok/malzeme-istekleri` (durum süzgeci), `GET /stok/malzeme-istekleri/:id`, `POST .../hazirla`, `.../teslim-et` (karşılanan miktar), `.../iptal-et`; yazmalar `stok.transfer` ve sürümlü. Geçiş yalnız ileri: açık hazırlanır; açık ve hazırlanan teslim ya da iptal olur; kapanan değişmez (409).
- VARSAYIM: teslim stok hareketi yazmaz; malzeme sepetle ya da çıkışla düşülür, istek yalnız iş takibidir. Geri alma maliyeti: teslim komutuna bir çıkış çağrısı.
- VARSAYIM: depo ekranı bu dalda yok (uçlar hazır); İş kutusuna ya da ikinci menüye bağlamada girer (UYUM-BORCU 31).

# FARK: stok, emir tamamlamada sıfır çıktı (kart #206, dal 206-stok-tamamla-sifir; rota isteği #444)

## Değişen
- `POST /stok/uretim-emirleri/:id/tamamla` gövdesinde `miktar: '0'` kabul edilir: çıktı girmez, yalnız kalan sarf yazılır (sağlam adedi elle girilmiş ya da hepsi fire olmuş emir). Yapılacak sarf yoksa 409.
- Çıktı artık emrin sağlam adedine göre girer (`uretimEmriOzeti.saglamAdet`, #443); gövdedeki `miktar` yalnız daha azını girmek için. Sağlam adedi girmiş ve sarfı kalmamış emir tamamlanmıştır; hepsi fire olmuş emir (sağlam 0) sarfı yazılınca kapanır. UYUM-BORCU 30'daki sağlam adet borcu kapandı. Yetki ve kapsam değişmedi.

# FARK: stok, emrin eksiklerini mal kabulle teslim alma (kart #206, dal 206-stok-eksik-teslim; ilk sistemdeki "Eksikleri teslim al")

Kullanıcı kararı a (10.10.2026): eksikler mal kabul ekranına dolu gelir; parti ve belge kuralları (DEP-20) değişmez.

## Değişen
- Mal kabul ekranı `?emir=<kimlik>` ile açılınca emrin tamamlama önizlemesini okur; eksiği olan ve hizmet olmayan her bileşen, eksik miktarıyla bir kez satıra dolar. Emir no ve dolan satır sayısı ekranda görünür; eksik yoksa "Eksik yok" yazar.
- Kabul olağan mal kabuldür (tür, irsaliye, parti, konum depocunun); sunucu değişmedi, göç yok.
- Emir ekranındaki "Eksikleri teslim al" bağlantısı `uretim-emirleri`'nin işidir (BASKA-MODUL-ISTEKLERI).

# FARK: stok, üretim emrini stokta tamamlama (kart #206, dal 206-stok-emir-tamamla; ilk sistemdeki "Tamamla ve stokta")

Koordinatör notu: bitmiş emrin sağlam adedi stoğa girer, bileşenleri `uretim-emirleri`'nin `emirMalzemeIhtiyaci` ile düşülür. "Eksikleri teslim al" karar kartında bekler, yazılmadı.

## Değişen
- `GET /stok/uretim-emirleri/:id/tamamlama` (okuma): bileşen başına brüt, emre verilmiş net sarf, kalan, kullanılabilir stok ve eksik; çıktının girilmiş ve girecek miktarı; engel.
- `POST /stok/uretim-emirleri/:id/tamamla` (`stok.giris` ve ayrıca `stok.cikis`, tekrar korumalı): tek işlemde kalan sarfı `uretime_sarf` olarak en eski girişten düşer (fason ve üretim alanı hariç, çıkış önerisiyle aynı kural), sonra çıktıyı bugünkü üretim girişi yoluyla URETIM konumuna emir partisiyle yazar.
- Aynı emrin tamamlaması emir başına işlem kilidiyle sıraya girer; ikinci istek yeniden hesaplar ve reddedilir. Çıktısı girmiş ve sarfı kalmamış emir tamamlanmış sayılır: fireli emirde kalan adet ikinci çağrıda girmez; üretim girişi geri alınırsa yeniden açılır.
- Reddedilenler: emir `bitti` değilse, eksik varsa (ilk sistemdeki gibi), yapılacak bir şey kalmadıysa 409; sağlam adet girilmemiş adedi aşarsa 400; kapsam dışındaki emir 403 (DEP-36). Çıktı yazılamazsa sarf da yazılmaz.
- Brüt, iş emirleri boyunca malzeme başına toplanır ve üç ondalığa yukarı yuvarlanır. Hizmet bileşeni düşülmez. Göç yok.
- VARSAYIM: sağlam adet gövdeden (`miktar`) gelir, yoksa emrin girilmemiş adedi girer; `uretimEmriOzeti` sağlam adet vermiyor (BASKA-MODUL-ISTEKLERI). Geri alma maliyeti: bir satır.
- VARSAYIM: üretim alanına taşınmış ama sarf yazılmamış bileşen düşümde sayılmaz; depodan düşülür. Geri alma maliyeti: kural fonksiyonunda bir süzgeç.

# FARK: stok, fason dönüşünde giden parti seçimi (kart #206, dal 206-stok-fason-parti)

Kullanıcı kararı: "Devam et bitir hepsini" (09.10.2026), UYUM-BORCU 28 kapanır.

## Değişen
- Mal kabulde fason dönüşü: seçilen fason kutusunda giden kartın birden çok partisi varsa "Giden parti" seçimi çıkar ve zorunludur; seçilen parti gövdeye `fason.partiId` olarak gider. Tek partide sorulmaz, sunucu kendisi seçer. Sunucu ve şema değişmedi.

# FARK: stok, plan ekranı için dışa açık stok durumu ve toplu geri alma (kart #415 isteği, dal 415-stok-disari)

Kullanıcı kararı: "Yaz, a" (09.10.2026); statü (a) ayrı karar kartına kalır, yazılmadı.

## Değişen
- `disari.ts`:
  - `malzemeStokDurumlari(db, malzemeIdler)`: kart başına toplam, kritik seviye (ilk sistemdeki "minimum") ve durum (`eksi`, `kritik`, `yeterli`, `tanimsiz`). Bakiyesi ve ayarı olmayan kart haritada yok.
  - `dusukStokSayisi(db)`: toplamı kritik seviyede ya da altında olan kart sayısı, panelle aynı.
- Yeni uç `POST /stok/hareketler/geri-al` (`stok.geri-al`, tekrar korumalı): birden çok hareketi tek işlemde, yeniden eskiye geri alır. Biri reddedilirse hiçbiri yazılmaz; aynı hareket iki kez 400. Göç yok.
- VARSAYIM: "minimum" ile kritik seviye aynı anlamda (geri alma maliyeti: bir fonksiyon adı). "Yeniden eskiye" sırası hareket kimliğine göredir; kimlik yazılış sırasıyla artar (sıralı birincil anahtar).

# FARK: stok, fasondan dönüş ve saf hizmet (kart #206, dal 206-stok-fason-donus)

Kullanıcı kararı: K-080 c (hizmet stoklanmaz; fasondan dönüş ve saf hizmet mal kabulde) ve şema seçeneği A (09.10.2026, "A"): fason konum türü, stoksuz hizmet satırı, `fason_cikis_hareket_id`.

## Değişen
- Yeni konum türü `fason` (elle açılır). Konumlar ekranında Fason kutuları sekmesi kutuları listeler ve "Fason kutusu aç" ile açar. Giden yarı mamul fason kutusuna bugünkü taşıma komutuyla gider.
- Mal kabulde sipariş satırı hizmet kartınaysa satır iki biçimde yazılır (DEP-58):
  - Fasondan dönüş: satırın kartı dönen yarı mamuldür; dönen malzeme stoğa girer, `fason` alanındaki giden malzeme fason kutusundan düşer (tek işlem). Yetmezse ONAY_GEREKLI, onayla eksiye düşer.
  - Saf hizmet: satırın kartı hizmet kartıdır; stok yazılmaz (konum ve hareket boş).
  - İkisinde de teslim satın almaya `teslimIsle` ile gider.
- Düzeltme hepsini geri alır: giriş ve fason çıkışı ters çevrilir, teslim geri alınır. Fason çıkış hareketi tek başına geri alınmaz.
- Dönen kartı depocu seçer; rota adımı bağı gelince oradan gelir (UYUM-BORCU 26).
- Sözleşme:
  - Mal kabul gövdesi: satıra `fason` ({malzemeId, konumId, partiId?, miktar?}), gövdeye `eksiOnay`.
  - Mal kabul satırı cevabı: `konumKod` ve `hareketId` boş olabilir; yeni `fason` alanı (giden kart, miktar, kutu, hareket, siparişin hizmet kartı).
  - Açık sipariş satırı: `malzemeTur`.
- Göç `20261009163000_stok_fason_donus.sql`: konum türü `fason`; `stok_mal_kabul_satiri.konum_id` ve `hareket_id` yalnız saf hizmette boş (`stok_mal_kabul_satiri_stoksuz_hizmet`); `fason_cikis_hareket_id` (tekil, değişmez). Göç önce satırları sayar.
- VARSAYIM: fason çıkışı `cikis_nedeni = 'diger'`, açıklama "Fason dönüşü"; yeni çıkış nedeni şema değişikliği gerektirirdi. Geri alma maliyeti: bir göç ve bir satır.

# FARK: stok, kod değerlendirme düzeltmeleri (kart #206, dal 206-stok-kd)

Kullanıcı kararı: kod değerlendirme bulguları KD-009, KD-010 düzeltilsin; KD-013 aynı dala, "hizmet kartına bakiye değil hizmet sonucu oluşan malzeme giriş çıkışı" (09.10.2026, "a", "yaz").

## Değişen
- Mal kabul satırı başka malzeme kartının sipariş satırına bağlanırsa 400 `satirlar.N.siparisSatirId` ile reddedilir, hiçbir şey yazılmaz; düzeltmede de aynı (KD-009). VARSAYIM: kartsız (katalogsuz) sipariş kalemi eskisi gibi bağlanır.
- Stok komutu sonucu bilinmeden biterse (ağ, zaman aşımı, 5xx) aynı komutun elle yeniden gönderimi aynı istek kimliğini taşır; kimlik başarıda ya da 4xx'te bırakılır. Mal kabul, çıkış, taşıma, sayım, sepet ve toplama bu yoldan geçer (KD-010). Ortak arayüze dokunulmadı.
- Hizmet kartı hiçbir komutla bakiye açmaz (sayım fazlası, eksiye onaylı çıkış dahil); hizmetten çıkan malzeme kendi kartıyla girer (KD-013). Göç yok.

# Fark: ON-PAKET-stok 2.3 (onaylı) → ilk sürüm kodu

Dayanak 5eb9481. Pakette olup kodda farklı olan her şey; gerekçe ve kapanış `sunucu/moduller/stok/UYUM-BORCU.md` ve ON-PAKET-stok.md "Değişenler (2.3 → 2.4)".

| # | Pakette | Kodda | Neden |
|---|---|---|---|
| 1 | 26 uç | Teslimde 32 uç; bugün 97 (GET 51, POST 46), güncel liste ON-PAKET-stok.md "Uç listesi"nde | İlk teslimde eklenen: `GET /stok/menu-sayaclari` (ikinci menü sayacı), `GET /stok/depolar`, `GET /stok/malzemeler/:id/ozet` (kart seçimi), `POST /stok/mal-kabuller/:id/duzelt` (DEP-53), `GET /stok/panel` (iş kutusu göstergeleri), `GET /stok/malzemeler/:id/goz-onerisi` (DEP-34). Yolu değişen yok |
| 2 | DEP-36 iş merkezi kapsamı İ | Var | Üretime sarf ve emir tamamlama, emrin iş merkezi kişinin kapsamında değilse 403 verir ve yazmaz (`servis.ts`, `stok.test.ts`) |
| 3 | Yabancı parti 422 | 409 BAGIMLI_KAYIT | Yabancı anahtar ihlalinin kodunu çekirdek belirler |
| 4 | `paylasilan/ayarlar/stok.ts` | Var | Altı `numara` ayarı (mal kabul, fiş, toplama, malzeme isteği, teslim, lot); sayım süresi ayar değil, deponun yerleşiminde |
| 5 | Malzeme özeti stok birimiyle | Birim yok | Kart özeti birim taşımıyor (DOĞRULANDI); istek yazıldı |
| 6 | Mal kabulde metinle kart arama | Katalogdan arayarak seçim | `malzemeler` `malzemeAra` ve `GET /stok/ara` ile (yukarıdaki "katalogdan arayarak seçme" bölümü) |
| 9 | Mal kabul satırında sipariş satırı sütunu (S) | `siparis_satir_id`, `satin_alma_siparis_satiri` yabancı anahtarıyla vardır | Satın alma gelince yeni göçle eklendi (`20261009051000_stok_tedarik_bagi.sql`; DOĞRULANDI harita sütunları) |
| 10 | Ekran başlığı önizlemede `h1` | `h2`, aynı görünüm | Kabuk sayfa başlığını `h1` basıyor; App testi tek `h1` ister |
| 11 | Menü verisi `STOK_IKINCI_MENUSU` (2.3 taslağı) | `STOK_IKINCI_MENU` | Ad kalıbı `<AD>_IKINCI_MENU` (DOĞRULANDI `modul-ac`) |
| 13 | Ekran: önizlemedeki düzen | İlk teslimde İş kutusu, Malzemeler, Raflar, Mal kabul ve Hareketler önizlemeden zayıftı | Önizlemeye getirildi: İş kutusunda gösterge kartları, son 7 gün grafiği, kritik stok, raf doluluğu, son hareketler; Malzemelerde arama, sekme sayıları, raf etiketleri; Raflarda solda liste sağda matris, üç görünüm (Ürünler, Doluluk, Sayım yaşı); Mal kabulde ambalaj tipi kartları, ölçü ve özel ölçü, ambalaj sayısı × ambalaj içi = toplam, kayıtlı ambalajın hatırlanması, göz önerisi, sığma bilgisi; Hareketlerde tür sekmeleri, arama, gün grupları, CSV |
| 14 | Stok değeri göstergesi | Önizlemede ₺ tutar | Satın almanın ağırlıklı ortalama alış fiyatıyla hesaplanır; fiyatlı stoklu kart yoksa değer yok, sayı uydurulmaz (kart #544 bölümü) |
| 15 | Malzeme adıyla arama | Önizlemede ad, kod, kategori, raf | Konum kodu, parti no, kart numarası, ad ve stok koduyla; müşteri parça no, tedarikçi kodu ve eski kodla arama yok |
| 16 | Okut, Sepet, teslim fişi sonraki sürümdeydi | Bu sürüme alındı (kullanıcı kararı) | Okut: Sorgula, Mal kabul, Sevkiyat, Sepet modları; kamera (BarcodeDetector, yoksa jsqr), fotoğraftan okuma, el okuyucu, aktif konum, oturum geçmişi. Sepet: kişiye özel satırlar, kaynak seçimi, miktar düzeltme, teslim (konuma taşı ya da stoktan düş), onaylı eksi, fiş (QR'lı, yazdırılır), son fişler. Yeni göç `20261008142032_stok_sepet_fis.sql` (3 tablo), 9 uç |
| 17 | Toplama sonraki sürümdeydi | Bu sürüme alındı | Liste açılınca kalemler en eski girişten gözlere ayrılır ve rota sırasına dizilir (DEP-42: önce rafsız konum, raflar sırayla, koridorda yılan, gözde kat yukarı); eksik söylenir, göz uydurulmaz; sıradaki adım büyük gösterilir, "Toplandı" o gözden çıkış yazar (DEP-56), iki kişi aynı adımı toplayamaz (sürüm); Bitir ve İptal. Yeni göç `20261008142033_stok_toplama.sql` (3 tablo), 5 uç, yeni işlem `stok.toplama` |
| 18 | 3B depo sonraki sürümdeydi ve çekirdek parçası istiyordu | Bu sürümde modülde (kullanıcı kararı) | three ile: raf tiplerine göre dikme, kiriş ve tabla; ambalaj tipine göre yükler (palet, koli, kasa, bidon, makara); Genel, Plan ve Yürü (WASD, oklar, sürükle) modları; göz kodu ya da malzeme adıyla arama ve vurgu; göze dokununca panel ve "Gözü aç ve say"; yalnız gerektiğinde çizim; WebGL yoksa açık ileti. Raflar yerleştirilmemişse sırtı sırta dizilir (2B yerleşim gelince kayıtlı konum kullanılır). uç sonradan kaldırıldı (UYUM-BORCU 37) |
| 19 | Yerleşim düzenleyici sonraki sürümdeydi | Önizlemedeki `E` birebir taşındı | Raf tipi ekleme (boş yer bulma, SAT çakışma), sürükleyerek taşıma, ızgara adımı, Sığdır, tekerlek ve iki parmakla yakınlaşma; bina ve dama tahtası (harf ve numaralar, kare adları), mal kabul alanı (taşı, boyutlandır), fason dolabı (taşı, döndür); raf paneli (tip, kod, numaralama, ilk bölme, bölme ve kat sayısı, ölçüler, X ve Z, ±90°, ön yüzü çevir, adres aralığı, stoklu göz uyarısı, çoğalt, iki dokunuşla sil, raf matrisi); çakışma uyarısı; Kaydet ve Vazgeç. Kayıt tek işlemde: kaldırılan, değişen, yeni raflar; numaralama değişince gözler bölme sırasıyla yeni adrese geçer, stok gözle kalır (önizlemedeki stok taşıma); stoklu göz kaldırılamaz; aynı adres 409. Yeni göç `20261008142034_stok_yerlesim.sql` (yerleşim ve kare adları; göz kodu tekilliği ertelenebilir), 3 uç |
| 20 | 3B rafı kendi ekseninde diziyordu | Düzenleyiciyle aynı eksen ve kayıtlı yerleşim | Bölmeler -z, derinlik x, açı saat yönünün tersine; bina zemini ve mal kabul alanı yerleşimden; hiç yerleştirilmemiş raflar önizlemedeki koridor düzeninde |
| 21 | Konumlar düz listeydi | Önizlemedeki sekmeler | Depo zemini dama tahtası (kare boyu yerleşimde, kare adları, kareyi konum olarak açma, dolu kare); Fabrika ve Fason konumları sonradan Fabrika Haritası ve firma bağıyla geldi (kart #686, #1304, #1310 bölümleri); Bütün konumlar listesi |
| 22 | QR etiketleri yoktu | Önizlemedeki etiketler | Konum etiketi `LOC:kod` (kat renginde çubuk), malzeme etiketi `MLZ:no`; A4'e 3 sütun yazdırma (yalnız etiketler basılır), HTML olarak indirme; raf matrisi, konum, malzeme, malzeme listesi, dama tahtası ve Ayarlar'dan |
| 23 | Depocu modu yoktu | Önizlemedeki Yönetici / Depocu | Cihaz tercihi; depocu açılışı (Okut, Sepet, Toplama, Mal kabul kutucukları) ve her stok ekranında alt çubuk. Menünün cihaza göre sadeleşmesi kabuk işi (çekirdek isteği Ç6) |
| 24 | Her yerden arama yoktu | Önizlemedeki Ctrl K ve / | Konum kodu (LOC önekiyle de), raf, kare adı, parti no, kart no ve sayfalar; Enter ilk sonucu açar. 1 uç (`/stok/ara`) |
| 25 | Sayım bekleyen gözler çalışmıyordu (sayı ayarı yoktu) | Çalışıyor | Sayım süresi deponun yerleşiminde (varsayılan 30 gün, düzenleyicide Bina panelinde); iş kutusunda satır ve liste. Ç2'nin stok için kalan kısmı yalnız kare boyu değil, artık hiçbiri. Göç `20261008142035_stok_sayim_suresi.sql`, 1 uç |
| 26 | Kabul alanından rafa yerleştirme, şablondan kurulum, fiş bağlantısı, malzemeler CSV yoktu | Var | Kabul alanı satırında "Rafa yerleştir" (göz önerisi seçili); Ayarlar'da şablondan hızlı kurulum (koridor, bölme, kat, tip; var olan raflara dokunmaz); hareket satırında fiş bağlantısı; Malzemeler'de CSV |
| 27 | Okut'ta ambalaj seçimi ve geri al yoktu | Önizlemedeki gibi, TMI geri alma kurallarıyla | Mal kabul modunda ambalaj seçimi (Otomatik ya da tip) ve ambalaj sayısı; aktif konum yoksa "Rafı okut" bekleyen girişi (önerilen göz düğmesi, Vazgeç), sıradaki konum okutması girişi o göze yazar. "Son işlem · Geri al": sepete ekleme herkes için geri alınır (satır eski miktarına döner); çıkış yalnız geri alma yetkisiyle (DEP-17/18); mal kabul hareketi tek başına geri alınmaz, belge düzeltmesine götürür (DEP-53) |
| 28 | Ambalaj simgeleri ve son teslim yerleri eksikti | Önizlemedeki gibi | Önizlemedeki `PACK_IC` çizimleri (kasa, koli, palet, bidon, makara) birebir; hex renk yerine tasarım değişkenlerinden türetilmiş renkler (açık ve koyu tema). Mal kabul, Okut ve bakiye satırlarında. Teslim penceresinde son fişlerden "Son teslim yerleri" kısayolları |
| 29 | 3B depo çizgi film gibiydi | Önizlemedeki gerçekçi görünüm | Önizlemedeki 3B motorunun görünüm kısmı (D.makeResources, buildStatic, drawSlot, forklift) taşındı: tuvalde üretilen dokular (beton zemin, sıvalı duvar, delikli mavi dikme, tel ızgara, karton, ahşap, kepenk, tehlike şeridi), fiziksel malzemeler, gök, güneş ve dolgu ışığı, sis; bina kabuğu, kolonlar, kepenk kapılar, mal kabul zemin yazısı, yaya yolu, koridor çizgileri, raf gölgesi; palet rafında dikme, çapraz bağ, kiriş, ızgara; çelik ve konsol raf; göz etiketleri kat rengiyle; asılı raf kodu levhaları ve bölme şeritleri; euro palet üstünde koli istifi ve streç film, kasada parçalar, bidon, makara; forklift; yürüme modunda tavan ve lambalar. Statik parçalar malzeme başına tek ağa, yükler örneklenmiş ağa birleştirilir. Gerçek malzeme renkleri sayısal sabit (sahnenin kendisi), arayüz rengi değil |
| 12 | Göç damgası | `20261008142031_stok_tablolar.sql` | Damga main'deki son göçten eski olamaz (O1) |

Teslimde olmayıp bugün de kodda olmayan: dış çağrı (`stokGirisi`, `stokCikisi`, `stokCagrisiniGeriAl`, `teslimAlinanlar`). 3B depo, 2B yerleşim, QR okutma, toplama, sepet ve fiş yukarıdaki 16-19. satırlarla ve sonraki bölümlerle koda girdi; fason ve üretim alanı konumları `stok_konum` satırları olarak geldi.

## Oturtmada depoda yapılanlar (kart #206, dal 206-stok-depo)

Teslim olduğu gibi alındı (ilk commit). Ekrana dokunulmadı. Ondan sonraki değişiklikler yalnız bunlar:

| # | Ne | Neden |
|---|---|---|
| O1 | Göç dosyaları `20261007160000..200000` → `20261008142031..35` (main satın alma göçünü alınca ikinci kez); içerik aynı | Damga main'deki son göçten eski olamaz (`goc-yaz`) |
| O2 | `uretim_emri_id` üç tabloda yabancı anahtarsız (`stok_parti`, `stok_hareketi`, `stok_fis`); `servis.ts` `emirVarDenetle` emrin varlığını `uretim-emirleri/disari.ts` `emirOzeti` ile sorar (üretim girişi, çıkış, stoktan düşüm); ESLEME'den iki kısıt adı çıktı | Kullanıcı kararı STK6 b. Kural testi (olmayan emir 409) aynı kalır |
| O3 | `paylasilan/islemler.ts` ve `paylasilan/sayfalar.ts`'e yalnız stok satırları (ayrı commit) | Dar istisna; Ç1 |
| O4 | `three` 0.169.0, `@types/three` 0.169.0 ayrı çekme isteğinde (#316) | STK1 a |
| O5 | Belgeler: `GUVENLIK-DENETIMI.md`, `ORTAKLIK-stok.md`, `UYGULA.md` yazıldı; `UYUM-BORCU.md` 11-23, `BASKA-MODUL-ISTEKLERI.md` ve `CEKIRDEK-ISTEKLERI.md` sonuna oturtma bölümleri | Teslimde eksikti |

## Fabrika Haritası bağı, adım 1 (kart #686, kullanıcı kararı "Tam birleştir")

| # | Ne | Neden |
|---|---|---|
| H1 | Göç `20261012093000_stok_harita_baglama.sql`: `stok_depo.atolye_salon_id`, `stok_konum.atolye_goz_id` ve `atolye_alan_id` (boş olabilir, tek, `ON DELETE SET NULL`); atölyenin kopya göçündeki kaynak kimlikleriyle doldurulur | Raf, göz ve alan haritada tek kaynak; stok konumu yerin stok tarafı |
| H2 | `stok_konum_tur_alanlari` gevşedi: raf gözü stok rafı olmadan da olur (haritadan açılan göz), bağı boşalan gözde bölme ve kat kalır; `stok_konum_alan_turu` alanı raf gözü olmayana bağlar | Haritada açılan göz için stok rafı yok |
| H3 | `POST /stok/konumlar/haritadan-esle` (`stok.tanim`): yeni göz ve stok türü alan (kabul, üretim çıkışı, depo zemini, fason) konum olur, depo yoksa bölümden açılır; haritadan açılan gözün kodu adresi izler; gözü silinen stoksuz konum kapanır; çakışan ve stoklu kopuk yer `atlanan` | GET salt okunur işlemde koşar; eşleme yazma |
| H4 | Raf açma, raf düzenleme, yerleşim düzenleyici ve şablondan kurulum düğmeleri Fabrika Haritası'na (`/atolye`) gider; Konumlar ve Ayarlar'da "Haritadan eşle" | Tanım tek yerde |
| H5 | Stok rafı uçları, `RafFormu`, `HizliKurulum` ve `/stok/yerlesim` yerinde kaldı (girişleri kalktı) | Adım 2'de konum yerine göz ve alan geçince kalkar |

## Fabrika Haritası eşlemesi görünür ve seçimli (kart #711)

| # | Ne | Neden |
|---|---|---|
| E1 | Eşleme yalnız stok deposu seçilmiş bölümde (aktif `stok_depo.atolye_salon_id`); depo kendiliğinden açılmaz. `POST /stok/harita-bolumleri/:id/depo` (`stok.tanim`) bölümü depo yapar ya da depodan çıkarır; stoklu ya da KABUL/URETIM taşıyan bölüm çıkmaz | Demoda üretim bölümü depo oldu, raf doluluğu bozuldu. Varsayım: karar kartında önerilen "Seçilen bölümler" |
| E2 | `GET /stok/harita-ozeti`: bölümler ve depo durumu, bağlı göz ve alan sayısı, eşlenmemiş yer, haritada karşılığı olmayan açık konumlar; Ayarlar'da "Fabrika Haritası eşlemesi" kartı | Eşleme görünür olsun |
| E3 | Konumda `haritaGozId`, `haritaAlanId`; konum ayrıntısında `haritaYeri` (göz adresi ya da alan adı), Konumlar listesinde "Haritada" sütunu | Hangi konumun haritada olduğu görünsün |
| E4 | Stok Merkezi açılınca tanım yetkilisi için eşleme sayfa yüklemesi başına bir kez sessizce koşar; düğme yedek | Elle basma unutulmasın |
| E5 | `GET /stok/goz-stoklari?gozIdler=1,2` (stok okuma): göz başına konum, kalem sayısı, en eski girişli malzeme adı; stoksuz göz cevapta yok | Atölye göz paneli istemciden okur; atölye `stok/disari.ts` ithal edemez (döngü) |
| E6 | Eşleme cevabından `yeniDepo` kalktı | Depo artık eşlemede açılmıyor |
| E7 | `stok/disari.ts` `stokluGozler` kalktı; stoklu gözün haritada silinmesi engellenmez (kullanıcı kararı 12.10, "Hayır"): konum bağsız kalır, eşleme kapatmaz (`atlanan`), Ayarlar'daki eşleme kartında listelenir | Atölye stok/disari'yi ithal edemez (döngü); tetikleyici istenmedi |
| E8 | Pasif rafın stoklu gözü eşlemede açık kalır ve `atlanan`da bildirilir; stoksuz göz kapanır (KD-042) | Bakiye pasif konumda duramaz (`stok_bakiye_aktif_konumda`); eskiden eşleme her denemede 409 ile düşüyordu |

## Demo öncesi düzeltmeler (kart #860)

| No | Değişen | Neden |
|----|---------|-------|
| D1 | Çıkış önerisi `uretim_cikisi` konumunu dışlar (önce yanlışlıkla var olmayan `uretim_alani` yazıyordu) | Başka emrin üretim çıkışındaki parça sarf ve teslim kaynağı önerilmesin (Y1) |
| D2 | Miktar girdisinde nokta ondalıktır ("12.5" → 12.5); virgül varsa noktalar binliktir ("1.250,5" → 1250.5) | Rota ve sevkiyatla aynı okuma; önce "12.5" 125 oluyordu (Y2) |

## Belge numaraları Numara kurallarından (kart #819)

| No | Değişen | Neden |
|----|---------|-------|
| N1 | Mal kabul, transfer fişi, toplama ve malzeme isteği numarası veritabanında üretilmiyor; servis kayıtla aynı işlemde `ayarlar/disari.ts` `numaraAl` ile alır (anahtarlar `stok.mal-kabul-no`, `stok.fis-no`, `stok.toplama-no`, `stok.malzeme-istegi-no`) | Kalıp Sistem Ayarları'ndan değişir; kullanıcı kararı "Yaz, göçler onaylı" (12.10) |
| N2 | Göç `stok_numara_kurallari`: dört `no` sütununda `DROP EXPRESSION` ve `NOT NULL`; teklik var olan `*_no_tek` ile; biçim CHECK'i yok; var olan numaralar değişmez | Numarasız kayıt girmesin; biçimi kalıp belirler |
| N3 | Sayaç 1'den başlar; varsayılan kalıpta var olan numaralar ilk kayıtta tek tek atlanır | Sayaç ayarlar modülünün tablosunda; stok göçü ona yazamaz |

## Parti sertifikası (kart #960)

| No | Değişen | Neden |
|----|---------|-------|
| S1 | Mal kabul satırı isteğe bağlı `sertifika: { ozet, dosyaAdi }` alır; dosya önce `/dosyalar` ile yüklenir, mal kabul aynı işlemde `cizimler/disari.ts` `belgeAcVeBagla` ile sertifika belgesini açıp satırın partisine bağlar | Sertifika dosyası partiyle gelir; Çizim merkezi yetkisi olmayan depocu da ekler (yetki `stok.giris`) |
| S2 | Partisiz satırda (hizmet, partisiz kart) sertifika dosyası reddedilir (`satirlar.n.sertifika`); türe uymayan ya da başkasının yüklediği dosyada mal kabulün tamamı yazılmaz | Belge yalnız partiye bağlanır; yarım kayıt kalmasın |
| S3 | Belge adı `Sertifika <sertifika no, yoksa döküm no, yoksa tedarikçi parti no> (<kart kodu>)` | Çizim merkezinde aranabilir ad; ayrı ad girdisi yok |
| S4 | Sertifika bağları komutun denetim kaydına tek ek olarak yazılır | Denetim eki komutta bir kez yazılabilir |

## Son partiler ucu (kart #1001)

| No | Değişen | Neden |
|----|---------|-------|
| P1 | `GET /stok/malzemeler/:id/son-partiler?sinir=1..50` (varsayılan 10) `{ partiler }` döner: parti, döküm ve sertifika no, kayıt zamanı, bağlı belgeler; şema ve tip `paylasilan/sozlesme/stok.ts` `sonPartilerCevabi` | Satın alma `disari.ts`'i ithal edemez (stok satın almayı ithal ediyor, döngü); istemcisi uçtan okur |
| P2 | Yetki: stok okuması ya da `satin-alma.oku` / `satin-alma.yaz` | Malzemeler'de hammadde sertifikası satın almaya görünür; cevap fiyat taşımaz, rol satırı gerekmez |

## Sertifika stok ekranlarında (kart #1013)

| No | Değişen | Neden |
|----|---------|-------|
| G1 | Mal kabul ayrıntısı satırı `partiId` ve `partiBelgeleri` taşır; ekranda parti sütununda sertifika bağlantısı | Kullanıcı kararı 13.10: "stok malzemelerde de gözüksün" |
| G2 | Malzeme ayrıntısında "Partiler ve sertifikalar" kartı (son partiler ucu); parti yoksa kart çıkmaz | Hammadde izlenebilirliği kart sayfasından |
| G3 | `GET /stok/partiler/:id/belgeler/:belgeId` dosyayı verir; yetki stok okuma, belge o partiye bağlı değilse 404 | Çizim merkezi yetkisi olmayan depocu da açar; başka kaydın belgesi bu uçtan verilmez |

## Otomatik lot numarası (kart #1018)

| No | Değişen | Neden |
|----|---------|-------|
| L1 | Göç `stok_lot_no`: `stok_parti.lot_no` (tekil, boş olmaz); var olan partiler kayıt sırasıyla `LT-000001`... alır; dolum için `stok_parti_degismez` tetiği göç içinde bir kez kapatılıp açılır | Kullanıcı kararı 13.10 (proje sohbeti, "Evet, ekle") |
| L2 | Yeni parti numarasını `numaraAl` ile `stok.lot-no` kuralından alır (Sistem Ayarları > Numara kuralları, varsayılan `LT-{SAYAC:6}`); mal kabulde ve üretim girişinde | Kalıp ayardan değişir |
| L3 | Hammadde, yarı mamul, mamul ve sarf mal kabulünde tedarikçi parti/döküm no zorunluluğu kalktı (DEP-20, DEP-48 değişti); numarasız satır yeni lot açar; aynı tedarikçi parti/döküm no gelirse aynı lota eklenir (`stok_parti_tek` artık yalnız numaralı ya da emirli partide) | Parçalı teslimat ve sonraki siparişler de lot alır |
| L4 | Sarf da her girişte lot alır (K4 değişti); demirbaş lot almaz (DEP-49 aynı); gözde birden çok lot varsa çıkış göz+lot satırından seçilir, "Otomatik" en eski lottan düşer; Okut sevkiyatı en eski lotu gösterip düşer | Kullanıcı kararı 13.10 (proje sohbeti, "Demirbaş hariç") |
| L5 | Parti etiketi lot no ile başlar (`LT-000012 · TP-1 · döküm D-7`); parti aramaları lot no ile de bulur; malzeme ayrıntısında "Lot no" sütunu | Lot no birincil izleme numarası |

## Sertifika sipariş satırında (#1026)

| No | Fark | Gerekçe |
|---|---|---|
| B1 | Mal kabulde yüklenen sertifika, satır bir sipariş satırına bağlıysa `cizimler` `kaydaBagla` ile `satin-alma` hedefine (sipariş satırı) de bağlanır; partiye bağ aynen kalır | Kullanıcı isteği 13.10: "sertifika da siparişe de bağlanabilir, gelen partiye de" |

## Lot etiketi ve LOT okutma (#1060)

| No | Fark | Gerekçe |
|---|---|---|
| E1 | Lot etiketi 100x50 mm, her kopya bir sayfa; QR yalnız `LOT:<lot no>`; yanında lot no, malzeme adı ve stok kodu, kart no ve tür, tedarikçi parti / döküm / sertifika no, giriş tarihi, miktar ve birim, mal kabul belge no; boş alan basılmaz | Kullanıcı kararları 13.10: "Lot etiketi bas" (a), "Yaz" |
| E2 | Uçlar: `GET /stok/mal-kabuller/:id/lot-etiketleri` (belgedeki her lotlu satır) ve `GET /stok/partiler/:id/etiket` (yeniden basım); ikisi de stok okuma yetkisiyle | Veri yalnız stokun tablolarından |
| E3 | Yeniden basımda miktar ve belge lotun ilk mal kabul satırındandır; üretim partisinde mal kabul yok, o alanlar basılmaz | Varsayım: etiket ilk gelen ambalajı tanımlar |
| E4 | Basım yerleri: mal kabul kaydı sonrası ve belge ayrıntısında "Lot etiketlerini bas" (kopya önerisi satırın ambalaj sayısı), Okut mal kabulünden sonra "Etiket bas", malzeme ayrıntısındaki partiler tablosunda "Lot etiketi" | Kart #1060 |
| E5 | `kod-coz`: `LOT:` önekli kod yalnız lot olarak aranır; öneksiz `LT-` konumdan sonra lot olarak aranır; bilinmeyen lot `bilinmiyor` döner. Sonuç türü `lot`: yalnız o lotun gözleri | Kod sözlüğü (#1059) gelince ona geçilecek |
| E6 | Okut sevkiyat ve sepette okutulan lot en eski lot kuralını geçer: düşüm o lottan; aktif konumda lot yoksa düşülmez, uyarılır; sepette "Otomatik" seçeneği çıkmaz | Kart #1060 |
| E7 | `kod-coz` önek ayrımını ortak `paylasilan/kod-sozlugu.ts` `kodTuru` ile yapar (#1070); `UE:` ve `UE-` emir kodları stokta `bilinmiyor` döner; sözlüğün tanımadığı öneksiz konum kodu ve düz kart no stokun geri düşmesiyle aranır | Kod sözlüğü (#1059) ana dalda |

## Aylık stok değeri (#1079)

| No | Fark | Gerekçe |
|---|---|---|
| A1 | `GET /stok/panel/aylik-deger?ay=1..24` (varsayılan 12): son ayların ay sonu stok değeri, eskiden yeniye; içinde bulunulan ayın noktası bugündür. Stok okuma yetkisiyle, değer yalnız `finans.oku` olana; değilse `degerGorunur: false`, `aylar: []` | Kart #1079, yönetici paneli |
| A2 | Ay sonu miktarı bugünkü bakiyeden ay sonundan sonraki hareketlerin net etkisi düşülerek bulunur; fiyat bugünkü ağırlıklı ortalama alış fiyatıdır, geçmiş fiyat tutulmaz | Varsayım: geçmiş ayın değeri bugünkü fiyatla; geri alma maliyeti düşük (fiyat geçmişi gelince yalnız servis değişir) |

## Sipariş irsaliyeleri (kart #1124)

| No | Fark | Gerekçe |
|---|---|---|
| I1 | `GET /stok/siparis-irsaliyeleri?siparisSatirlari=1,2` (stok okuma ya da `satin-alma.oku`/`yaz`, son-partiler kalıbı): sipariş satırına bağlı, düzeltilmemiş mal kabul belgelerinin no, irsaliye no ve zamanı; fiyat yok | Satın almanın "Mal kabul: irsaliye girildi" satırı; yön stok -> satın alma olduğu için satın alma sunucuda stoğu okuyamaz, ekran bu uçtan okur |
| I2 | İrsaliye tarihi belgenin kayıt zamanıdır | Varsayım: stokta ayrı irsaliye tarihi alanı yok; istenirse yeni boş olabilen sütun gerekir |

## Statülü stok (kart #1108, RR-4b, dal 1108-stok-statu)

Göç `sunucu/gocler/20261013193110_stok_statu.sql` dolu tabloları değiştirir (`stok_bakiye`, `stok_hareketi`); veri değişmez, bütün satırlar serbest (statü boş) kalır. Birleşmeden önce sayım kullanıcı onayına sunulur.

| No | Fark | Gerekçe |
|---|---|---|
| S1 | `stok_bakiye.statu_id` ve `stok_hareketi.kaynak_statu_id`, `hedef_statu_id`: `recete_rota_statu`'ya yabancı anahtar; boş statü serbest stoktur. `stok_bakiye_tek` statüyü de içerir | Karar: statü Reçete ve Rota'nındır, miktar stoktadır. Stok kodu recete-rota'yı ithal etmez |
| S2 | `POST /stok/statu-degistir` (`stok.statu-degistir`, yalnız müdür; statüyü depo değiştirmez, kart #1208): aynı konumda statü değişimi transfer hareketiyle yazılır; aynı statüye ve mevcuttan fazlası reddedilir (STK-S1) | Statü yalnız hareketle değişir; eksiye düşmez |
| S3 | Düşüm, çıkış önerisi, sayım, taşıma ve kullanılabilir miktar yalnız serbest stoğa bakar (STK-S3); geri alma statüyü de ters çevirir | RET ve KKB türü yok; statülü stok serbeste dönene kadar kapalı |
| S4 | `GET /stok/malzemeler/:id` cevabında `statuKirilimi` (önce serbest, sonra statüler); bakiye satırında `statuId`, harekette `kaynakStatuId`, `hedefStatuId` | Bekleme süresi statüye girişten sayılır (STK-S4) |
| S5 | Malzeme ayrıntısında statülü stok varsa "Statü kırılımı" kartı ve bakiye satırında Statü sütunu; statülü satırda Taşı, Çıkış, Sepete yok. Hızlı işlem ve okutma yalnız serbest satırı önerir | STK-S3'ün ekrandaki karşılığı |
| S6 | Hareketler listesinde ve CSV'de Statü sütunu (değiştiyse "kaynak → hedef") | Kart #1108 |
| S7 | Statü adı istemcide `GET /recete-rota/statuler`'dan okunur (`TÜR · ad`); okuma yetkisi yoksa ya da istek düşerse "Statü #id" görünür | Varsayım: stok kullanıcısının hepsinde Reçete ve Rota okuma yetkisi yok; rol değişikliği sorulmadı |

## Malzeme · Teslim (kart #1208, dal 1208-malzeme-teslim)

Göç `sunucu/gocler/20261014104100_stok_malzeme_teslim.sql` dolu tabloları değiştirir (`stok_malzeme_istegi`: `istasyon_id` boş olabilir, durum `stok_yok`; `stok_konum`: `istasyon_id`, tür `istasyon`); var olan satır değişmez. Göç `20261014104110_kisiler_stok_istek_yetkisi.sql` yönetici dışı bütün rollere `stok.istek` verir (kullanıcı kararı: bütün roller). Birleşmeden önce sayım kullanıcıya sunulur.

| No | Fark | Gerekçe |
|---|---|---|
| T1 | Kabukta modül üst eylem yuvası (`istemci/src/ortak/rota/ust-eylemler.ts`, `moduller/*/ust-eylem.tsx`); stok üst çubukta kamyon düğmesi ve gelen teslim sayacı | Kullanıcı kararı: üst çubukta düğme, panel açar |
| T2 | Panelde üç sekme: Teslim al (gelenler, alınan miktar, red nedeni; gönderdiklerim, geri çek), Teslim et (yer, yerdeki stok, hedef), Malzeme iste (katalogdan arama, serbest ve statülü miktar, isteklerim) | Arkon "MALZEME · TESLİM" kutusunun bütün sayfalara taşınması |
| T3 | Yeni işlem `stok.istek` (`STOK_ISTEK_ISLEMLERI`); stok okumasını (`OKUMA`) açmaz | Herkes ister ve teslim eder, stoğun tamamını görmez |
| T4 | İstek her zaman depoya gider; depoda yetmezse `stok_yok` açılır (STK-T1); hizmet istenmez | Kullanıcı kararı: stok yoksa depo ve satın alma görür |
| T5 | Teslim iki adımlıdır (`stok_teslim`): gönderilir, alan taraf alınca transfer hareketi yazılır (bütün türler, MM ve YM dahil); parti ve statü değişmez | Kullanıcı kararı: hareket malzeme + statü + konum; statü üretimde değişir |
| T6 | İstasyon stok konumudur (tür `istasyon`, `istasyon_id`); konum ilk teslimde kendiliğinden açılır, elle açılmaz | Kullanıcı kararı: ortak konum sistemi |
| T7 | Alan taraf (STK-T4): istasyona geleni istasyonun kapsamındaki kişi, depoya geleni `stok.transfer` olan alır; gönderen alamaz, yalnız gönderen geri çeker (STK-T3) | İki imza: gönderen ve alan ayrı kişi |
| T8 | Depo ekranı "Malzeme istekleri" (`/stok/istekler`, `stok.transfer`): hazırla, teslim et, iptal; istasyona giden istek isteğe bağlı teslimle karşılanır ve istasyon alınca kapanır (STK-T5); istasyonsuz istek verilen miktarla kapanır | Uyum borcu 31'in ekranı |
| T9 | Arkon uyumu: `disari.ts` `malzemeIstekleri` `stok_yok`'u `acik` olarak verir | Arkon modülüne dokunulmadı |

## Konum türleri ve ortak konum düzeni (kart #1304)
- Yeni konum türü `hurda` (göç `20261014193501_stok_konum_hurda`, yalnız liste genişler). Hurda konumundaki stok kullanılabilir stoğa ve çıkış
  önerisine girmez. Konumlar ekranında elle açılabilir.
- Fabrika Haritası alanına `hurda` ve `ara_alan` (bekleme) türü atanabilir. Fason, ara alan ve hurda alanı, depo seçilmemiş bölümde de stok
  konumu olur ve ANA depoya bağlanır; kabul, üretim çıkışı ve depo zemini yalnız depo bölümünde konum olur.
- Haritada alanın türü değişince eşleme konumun türünü (ve deposunu) izler; stoklu konum değişmez, eşleme cevabında `atlanan` olarak bildirilir.
  Alan stok dışı türe (bölge, karantina ...) dönerse stoksuz konum kapanır.
- DEP-62: Konum ayrıntısında `stok.tanim` sahibi elle açılan, haritaya bağlı olmayan, boş konumun türünü değiştirir (`POST /stok/konumlar/:id/duzenle`
  gövdesinde isteğe bağlı `tur`). Yeni işlem ve yetki yok.
## Stok Merkezi > Depo (kart #1304, dal 1304-stok-harita-deposu)

- "3D Depo" (`/stok/3d`) kalktı; yerine "Depo" (`/stok/depo`): Fabrika Haritası'nın depo görünümü (raf listesi, bölme şeridi, cephe, göz paneli) aynı veri ve aynı bileşenle, yalnız stok deposu yapılmış bölümlerle. Bileşen `atolye/disari.ts` `DepoPaneli`.
- Raf ve göz tek kayıttır (Fabrika Haritası); Stok Merkezi'nden eklenen ya da düzenlenen raf haritada aynıdır. Göç yok, rol x işlem değişmedi.
- Kullanıcı kararı (14.10, kart "Yalnız depo bölümü"): `stok.tanim` sahibi yalnız stok deposu bölümünün rafını ve göz kalemini yazar (DEP-61); yeni uçlar `/stok/depo-bolumleri/:id/raflari-kaydet`, `/stok/depo-goz-kalemleri/yaz`, `/sil`. `atolye.yaz` olan kişi haritanın kendi uçlarıyla yazar.
- Raf kaydından sonra istemci haritadan eşlemeyi koşar: yeni gözler hemen stok konumu olur.
- Menü sayacı anahtarı `depo-3b` -> `depo`. İstemciden `Depo3B.tsx`, `depo3b-sahne.ts`, `depo3b-yerlesim.ts` silindi.
## Fason iki adım (kart #1310, dal 1310-fason-stok)

- Göç `20261014204000_stok_konum_firma` (kullanıcı onayı: kart "Eklensin"): `stok_konum.firma_id` (müşteri-tedarikçi firması) ve yeni tür `yolda`.
  Yolda konumu firmasız olamaz; firma yalnız `fason` ve `yolda` konumuna bağlanır; firma başına her türden tek konum. Elle açılan firmasız fason konumu kalır.
- Dış operasyonlarda "Fasona gönder": emrin parçası önceki iş emrinin istasyon konumundan firmanın Yolda konumuna (`YLD-<firma>`) taşınır, statü ve parti korunur.
- Sevkiyat işi tamamlanınca (sevkiyat `fasonSevkiDinle`) parça Yolda'dan firmanın fason konumuna (`FSN-<firma>`) geçer; tamamlanan iş geri alınırsa geri döner.
- Fason dönüşünde sağlamı mal kabul alır (değişmedi); Dış operasyonlardaki dönüş yalnız hurdayı firmadan `fire` çıkışıyla düşer.
- İş kutusu: kapanmış emrin firmada kalan parçası "fason firmasında kaldı" satırı (`fasondaEksik`). Yeni işlem ve yetki yok.

## Ortak ızgara (kart #1304, dal 1304-ortak-izgara)
- Konumlar > "Fabrika zemini": kareler Fabrika Haritası bölümlerinin ızgarasıdır (harf sütun, numara satır; `GET /stok/zemin`, stok okuma).
  Karede haritadaki raf, istasyon, makine ve alan simgesiyle, kareye düşen stok konumları sayısıyla görünür. Eski dama tahtası
  (`stok_depo_yerlesimi`, `D-C4` kodları) ekrandan kalktı; "Fabrika" yer tutucu sekmesi de kalktı.
- Kareye atama: `atolye.yaz` olan kişi kareye alan türü (hurda, ara alan, fason, kabul ...) ya da istasyon atar (atolye ucu `hucre-ata`);
  `stok.tanim` olan kişide ardından haritadan eşleme koşar ve konum açılır ya da türü değişir. Stok tanımı tek başına kare atamaz
  (izin modeli değişmedi: harita yazımı `atolye.yaz`).
- Her konumun yerdeki karesi bağlı olduğu öğeden gelir (gözün rafı, alan, istasyon): konum ayrıntısında `zemin` ("ZM-1 B2") ve malzeme
  ayrıntısındaki stok satırlarında "Zemin" sütunu. Haritada yeri olmayan konumda boş; uydurulmaz.

## Taşıma yolu (kart #1304)
- Malzeme · Teslim panelinde Teslim et: nereden ve nereye aynı Fabrika Haritası bölümündeyse kaynak karesinden hedef karesine yol
  çizilir; malzeme kalkıp yol boyunca uçar, hedefe iner ve varışta halka yayılır. Hedef seçilince ve gönderim kaydedilince bir kez oynar.
- Performans modu ('arkon:lite' ile aynı düğme) açıkken ve işletim sisteminde hareket azaltılmışsa yalnız son hâl çizilir; süre Sistem
  Ayarları'ndaki geçiş hızıyla ölçeklenir. Kareler kutudaki `zemin` alanından gelir (istasyon yeri ve seçilebilen konumların karesi);
  ayrı bölümdeki ya da haritada yeri olmayan yer için yol çizilmez, uydurulmaz.

## Tek Malzeme tuşu (372 a, 373 a)
- Üst çubuktaki ayrı QR okut tuşu kalktı. Okuyucu Malzeme · Teslim penceresinin üstünde hazır bekler; okutma yokken altındaki dört sekme
  görünür, okutulan kod akışı başlatınca sekmelerin yerini "ne, nereye, onay" alır ve "Vazgeç, sekmelere dön" ile geri gelir.
- İlk okutulan kişi kodu Teslim et'i o kişinin istasyonuna, alıcı o kişi olarak açar; istasyon buradan gönderilebilecek yerlerde değilse
  hedef boş kalır ve söylenir. Nereye adımında okutulan kişi kodu teslimi kişinin istasyonuna `aliciKodu` ile gönderir; sunucu kodu yine doğrular.
- Malzemeler kataloğunun bastığı `MK:<stok kodu>` etiketi iki okuyucuda da (Okut sayfası ve pencere) kartı çözer (DEP-64). Uç, yetki ve
  kayıt değişmedi; tuşun yeri sağda, Malzeme tuşunun yerinde kaldı.

## Okutarak mal kabul siparişe bağlı (kart #94, soru 91 a)
- Okut'taki hızlı mal kabul okutulan kartın açık sipariş satırlarını (`GET /stok/acik-siparis-satirlari`, `stok.giris`) listeler; tek satır
  seçili gelir, birden çoksa seçmeden gönderilmez. Seçilen satırla satın alma teslimi yazılır ve sipariş teslimi işlenir (önceden sipariş
  satırı gönderilmiyordu; mal stoğa girip siparişte teslim görünmüyordu).
- Kartın açık siparişi yoksa ya da "Siparişsiz: diğer giriş" seçilirse giriş `diger` türüyle yazılır. Hizmet satırı (fason dönüşü)
  hızlı kabulde listelenmez; ayrıntılı Mal kabul ekranında kalır.
- Uç, yetki ve göç değişmedi; sunucu siparişsiz satın alma kabulünü hâlâ kabul eder (ayrıntılı ekran için; ayrı soru).

## Her geliş ayrı lot (kart #124)

| No | Fark | Gerekçe |
|---|---|---|
| H1 | Göç `stok_her_gelis_ayri_lot`: `stok_parti_tek` kaldırıldı; mal kabulün her satırı yeni lot açar, aynı tedarikçi parti ya da döküm no ikinci gelişte de ayrı lottur (L3'ün "aynı lota eklenir" kısmı değişti, DEP-21 kalktı). Üretim girişi emrin partisine eklenmeye devam eder (`stok_parti_emir_tek`) | Kullanıcı kararı 22.10 (Soru 119 a): "farklı gün gelse aynı döküm bile olsa farklı lot" |

## Refakat partisi (kart #123)

| No | Fark | Gerekçe |
|---|---|---|
| R1 | Göç `stok_refakat_partisi`: yeni tablo; emir + depodan verilen lot, emir başına sıra, açık/iptal. Bir emre bir lot için tek açık parti | Kullanıcı kararları 22.10: Soru 120 b (kart = emir + gelen lot), Soru 122 a (tablo stokun) |
| R2 | `POST /stok/refakat-partileri/ac` (stok.transfer): lot ya okutulan lot etiketinden (`LOT:`) ya da lot okutularak eklenmiş depo sepeti satırından gelir (satır karta geçince sepetten çıkar); kart etiketi ya da başka kod reddedilir; aynı emir ve lotun açık partisi varsa o döner, başka lot yeni parti açar. Üretim partisi (emrin çıktısı) kart açmaz | Soru 116 b; "aynı lotun kalanı aynı kartla, iz değişmez, sayı artar" |
| R3 | `GET /stok/refakat-partileri/:id`, `/:id/kart` (stok okuma), `GET /stok/uretim-emirleri/:id/refakat-partileri`; `POST /:id/iptal-et` (stok.transfer) yalnız hiç teslimi olmayan kartta | Kart basımı ve yanlış açılan kartın düzeltilmesi |
| R4 | `teslimGonder` isteğe bağlı `refakatPartisiId` alır: lot ve emir karttan yazılır; gövdedeki farklı lot, emir ya da malzeme ve iptal kart reddedilir | Teslim kartla yapılır |
| R5 | İki çözücü `RP:<id>` okur: Okut paneli lotun alabileceği yerlerini, kartın partisini ve kişinin alabileceği, o kartla yoldaki teslimleri verir; Okut sayfası lotun çözümüne kartı ekler Kişiye kartla yoldaki lotun etiketi okutulursa "kartı okutun" denir (400). Okutarak alma kartı da okur | Soru 118 a: alan kartı okutup alır, liste kalır; kullanıcı akışı 14:16 |
| R6 | İstemci: lot okutma sonucunda ve depo sepetindeki lot satırında "Refakat kartına geç" (emir seçilir); kart 100x150 mm stokun kendi belgesiyle basılır (QR `RP:<id>`, lot, döküm, sertifika); kart okutulunca teslim her zaman teslim kaydıdır (taşıma değil), kartla gelen teslim sonuçtan alınır | Kullanıcı akışı 14:16 |
