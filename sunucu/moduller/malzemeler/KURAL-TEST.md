# Kural -> test: malzemeler (bu turda değişenler)

MKK-1..MKK-15'in testleri `katalog-onay-baglama.test.ts`, `katalog-kartlari.test.ts`, `kurallar.test.ts`, `stok-kodu-kurallari.test.ts` adlarında MKK numarasıyla durur; bu turda değişmedi.

## MKK-9 onay akışı anahtarı yalnız bayraklı yönetici (kart #229 ön koşulu), `katalog-onay-baglama.test.ts`
- `MKK-9: onay akışını yalnız bayraklı yönetici açıp kapatır; tanım ve onay işlemlerini birlikte taşıyan bayraksız kişi 403, öteki ayarları yazar` (ret ve izin)
- `MKK-9: onay akışı ayarını yalnız onay yetkisi olan açıp kapatabilir (tanim-yaz tek başına yetmez)` (ret)

## MKK-16 değişiklik talebinin farkı (kart #226), `talep-fark-dogrulama.test.ts`, `kurallar.test.ts`
- Fark sunucuda: `sahte fark: eksik alan ve yanlış eski/yeni değer, kayıtlı farkta gerçeğe çevrilir (onaycının göreceği saklanan fark)`, `sahte fark: boş fark gönderen yazarın gizli değişikliği de kayıtlı farkta görünür`
- Noktalı anahtar: `sahte fark: noktalı üst anahtar iç içe alanı gizleyemez (...)` (ret), `izinli: noktalı anahtar taşıyan meşru talep uygulanır` (izin)
- 30 satır: `sahte fark: sunucunun farkı ekranın göstereceği 30 satıra sığar, taşan alanlar adı ve yeni değeriyle son satırda anılır`
- Taşan değer (tur 2): `sahte fark: taşan alanın eski değeri de onaycıya görünür (...)` (izin: uygulanır), `Kart #226: 30 satırı aşan farkta taşan alanların eski ve yeni değeri de son satırdadır (...)`,
  `Kart #226: onaycının gördüğü kayıtlı fark bugünkü farktan farklıysa (değersiz eski biçim) talep uygulanmaz, güncelse uygulanır` (ret 409 ve izin)
- Bayat: `bayat talep: aktif kart başka yolla değişince talep uygulanamaz (409), reddedilebilir`, `bayat talep: 30 satırı aşan farkta taşan alanın tabanı değişince de 409` (ret), `izinli: 30 satırı aşan talep, taban değişmemişse uygulanır` (izin)
- Uygulama içeriği: `onay isteğiyle farklı içerik uygulatılamaz: talepte olmayan içerik 422, talepteki içerik uygulanır`, `onay isteğine başka alan eklenemez ve talebin tuttuğu birlesen/mukerrerOnay dışarıdan kurulamaz`
- Null: `talep alanını null göndermek uygulama denetimini atlatmaz: önerilmeyen içerik 422, önerilen içerik uygulanır`
- Sunucu damgası: `sahte fark: istemcinin gönderdiği fark özeti yok sayılır`, `sahte fark: sahibi talebini değiştirince fark yeniden hesaplanır; ...`
- Meşru akış: `meşru akış (<tür>): talep aç, onaycı uygular; ikinci talep reddedilir` (5 tür)
- Saf: `Kart #226: fark ham alan yoluyla, ...`, `Kart #226: talep uygulanırken içerik talepteki önerilenle aynı ve talep hâlâ geçerli olmalı`

## MKK-17 (istemci) çerçeve yalıtımı (kart #236), `istemci/src/ortak/arayuz/YalitilmisCerceve.test.tsx`, `MalzemeKatalogu.test.tsx`, `kopru.test.ts`
- `YalitilmisCerceve > izin verilmezse yalnız betik çalışır; ... aynı köken ve üst gezinme hiç verilmez`
- `YalitilmisCerceve > başka pencereden ya da yalıtılmamış kökenden gelen aynı biçimli ileti yok sayılır` (ret)
- `MalzemeKatalogu > cerceve yalitilmistir: ayni koken, form ve ust gezinme izni yok; ...`
- `MalzemeKatalogu > baska pencereden, yalitilmamis kokenden ya da baska kanaldan gelen istek islenmez` (ret)
- `kopru.test.ts`: boş, `.` ve `..` kimlik reddi (ret), geçerli kimlik geçer (izin)
- Tarayıcıda (gerçek sandbox) bu dalda çalıştırılmadı; dal `236-cerceve-kisitlamasi`'nda başsız tarayıcıyla denenmişti (kart #236 yorumu).

## MKK-14 tür, onay durumu ve önek karttan (tur 2), `katalog-kartlari.test.ts`, `kurallar.test.ts`
- `MKK-14 (kart #163): tür, onay durumu ve kod öneki kartın kendisinden; özet bunları taşımasa da kart doğru sütunlarla kaydedilir` (izin)
- `MKK-14 (kart #163): özet karttan farklı önek, tür ya da durum taşırsa 400; kartın türü ya da onay durumu geçersizse 400` (ret, yedi gövde)
- Saf: `MKK-14, MKK-1, MKK-10 (kart #163): tür, onay durumu ve kod karttan; ...`

## Okuma uçları ve ikinci menü (tur 2)
- `sablon-ve-okuma-yetkisi.test.ts` `okuma uçları: sayfası olan roller 200 okur, sayfasız rol 403, oturumsuz 401` (uç tanımına bağlı; `'oturum'`a döndürünce düşer)
- `ikinci-menu.test.ts`: menü geçerli ve çerçeveli; salt okuyan yeni malzeme maddesini görmez
- `istemci/src/moduller/malzemeler/gorunumler.test.ts`, `MalzemeKatalogu.test.tsx` `ikinci menu: ...` (izin: adresin görünümü, olay yalnız çerçeveye, çerçeve yeniden yüklenmez; ret: tanımsız alt adres köke döner, çerçeve hazır olmadan olay yok)

## MKL-1..MKL-5 Logo'ya gönderime hazırlık (kart #232), `logo-hazirlik.test.ts`, `logo-goc.test.ts`, `kurallar.test.ts`
- MKL-1 ilk aktiflikte "bekliyor": `MKL-1: kart ilk kez aktif olduğu yazımda "bekliyor" olur; ...` (izin), `MKL-1: onay akışı kapalıyken doğrudan aktif açılan kart da ...` (izin),
  `MKL-1 (ret): önceden aktif olmuş kart pasiften dönünce "bekliyor" olmaz ...` (ret), göç: `aşan kod yoksa göç geçer: var olan kartların Logo durumu boş kalır ...` (ret ve izin)
- MKL-2 istemci yazamaz: `MKL-2: kart kaydetme Logo alanlarını yazamaz; gövdede gelen Logo alanları yok sayılır` (ret)
- MKL-3 kilit: `MKL-3: Logo kaydı olan kartın birimi değişmez (422, tetikleyici de reddeder); aynı birimle kayıt ve kaydı olmayan kartın birim değişimi serbest` (ret ve izin); saf: `MKL-3 (kart #232): ...`
- MKL-4 eksikler: `MKL-4: eksikler (...); eksik kart aktif olur ve "bekliyor" kalır` (izin: eksiksiz kart boş liste), saf: `MKL-4 (kart #232): ...`, `Logo durum listesi (kart #232): ...`
- MKL-5 sonuç: `MKL-5: sonuç kayıt numarasıyla "gonderildi", hatayla "hata"; aynı numara ikinci karta yazılamaz; gönderilmiş kart geri dönmez` (izin ve ret: 409, 422, 400, 404, tetikleyici), saf: `MKL-5 (kart #232): ...`
- MKL-5 gönderilen değer: `MKL-5 (gönderilen): Logo'ya giden tür ve birim karşılığı verilirse o yazılır, arada değişen karşılık yazılmaz; boş metin reddedilir` (izin: gönderilen yazılır; ret: boş metin 400)
- Kuyruk: `logoyaGidecekMalzemeler: yalnız bekleyen ve hatalı kartlar, en eski aktiflik önce, sınırla`
- Stok kodu 24 kısıtı: `24 karakteri aşan stok kodu varsa göç sayıyı söyleyerek durur ve hiçbir şey değişmez (LG4 = a)` (ret), `Kural 3 (kart #232): veritabanı 24 karakteri aşan stok kodunu reddeder ...` (ret ve izin)
- LB7 izinli karşılık: `LB7 (kart #232): tür karşılığı yalnız 10, 11, 12, 13; demirbaş boş kalır; birim kodu boşluksuz; veritabanı kısıtı da tutar` (izin ve ret: 422, 400, kısıt),
  göç (`logo-goc.test.ts`): `izinli değerin dışında karşılık varsa göç bozan satırları sayısıyla yazarak durur ...` (ret), `karşılıklar izinliyse göç geçer ...` (izin ve ret)
- Birim seti kullanımı: `logoBirimSetiKullaniliyorMu (kart #207 isteği): ...` (izin ve ret)
- Sayfa (istemci): `LogoGonderimi.test.tsx` (salt okuyan satır açamaz; tanım yazan yazar, boş değer null gider; eksikler açık yazılır; tür dört koddan seçilir; demirbaş penceresinde kaydet yok)
- Mutasyon: göçte sayım koşulu kapatılınca LG4 testi, ilk aktiflik dalı kapatılınca MKL-1 ve göç testleri düşüyor (08.10.2026, yerelde denendi).
  LB7 göçünde sayım bloğu silinince göç testi, kısıttan demirbaş koşulu silinince LB7 testi düşüyor (08.10.2026, yerelde denendi).

## Bağlama tur 1, tedarik (kart #163), `bagla-tedarik.test.ts`, `logo-goc.test.ts`
- Birim listesi (SH4 a): `birim listesi: göç prototipin yerleşik birimlerini getirir; kart listedeki birimi alır, listede olmayanı 422 ile alamaz` (izin ve ret),
  `birimi listede olmayan eski kart birimi değişmeden kaydedilir; birim değişirse listedeki birim gerekir` (izin ve ret)
- Liste Ayarlar'dan (ML2 b): `Ayarlar listesine eklenen birim aynı kayıtta tabloya girer; gizlenen yalnız bütün listelerinde gizliyse pasif olur` (izin ve ret),
  `geçersiz birim (41 karakter) ayar kaydını 400 ile durdurur; ayar ve tablo değişmez` (ret), `Ayarlar'a eklenen sarf kategorisi tabloya girer ...` (izin)
- Logo birim anahtarı (ML1 a): `Logo birim karşılığı listedeki birime bağlıdır; listede olmayan birime karşılık yazılamaz` (izin ve ret: 409, kısıt)
- `malzemeOzetleri: boş dizide boş harita; ...`, `malzemeAra: kodda ve adda harf duyarsız arar, ...` (süzgeç, iptal, joker kaçışı, sayfa)
- Göç: `listede olmayan Logo birim karşılığı ya da 40 karakteri aşan kart birimi varsa göç sayıyla durur ...` (ret), `göç geçer: yerleşik birimler ...` (izin)
- Mutasyon: kart kaydındaki birim denetimi kapatılınca dört test, gizleme hesabı kapatılınca iki test düşüyor (09.10.2026, yerelde denendi).

## Hizmet türü (kart #163, MH1-MH5), `hizmet.test.ts`, `logo-goc.test.ts`, `kurallar.test.ts`, `LogoGonderimi.test.tsx`
- Tür, önek, yön: `hizmet kartı HZ önekiyle açılır; yön sütuna ASCII yazılır; ...` (izin), `yönsüz ya da geçersiz yönlü hizmet, yanlış önek ve listede olmayan birim reddedilir` (ret),
  saf: `Hizmet: yön ekranın seçim metninden ASCII değere çevrilir; ...` (izin ve ret)
- Yön kilidi: `yön yalnız hiç aktif olmamış taslakta değişir: aktif kartta 422, tetikleyici de tutar` (izin ve ret); kısıt: `yön yalnız hizmette ve hizmette zorunlu` (ret, adlı kısıtlar)
- Liste: `hizmet birimleri ... ve sekiz hizmet grubu listede; malzeme ayarı kaydı grupları kapatmaz` (izin, Ayarlar'dan genişleme ve daralma)
- Madde 6: `hizmet reçete bileşeni ve operasyon sarfı olamaz (422, satır yazılmaz); sarf bileşen olur` (izin ve ret); saf: `reçete ve operasyon sarfı başvuruları tekil toplanır`
- Logo: `hizmet tür karşılığına yazılamaz (adlı kısıt); ...` (ret), `Logo kuyruğu: hizmet öntanımda gelmez; hizmetDahil ile yönüyle gelir ...` (izin ve ret);
  istemci: `durum salt okunur: ...` hizmet satırı "Hizmet kartı bağlantısı bekliyor"
- Arama: `malzemeAra: hizmet türü ve yönüyle süzülür` (izin)
- Göç: `yeni hizmet birimi listede zaten varsa ya da HZ önekli kart varsa göç sayıyla durur; hiçbir şey değişmez` (ret), `göç geçer: kartlar, kategoriler ve karşılıklar değişmez; ...` (izin)
- Mutasyon: reçete denetimi ve yön kilidi servisten kaldırılınca ilgili iki test düşüyor (09.10.2026, yerelde denendi).

## Hizmet çeşitleri (kart #163), `logo-goc.test.ts`, `hizmet.test.ts`
- Liste: `hizmet birimleri ... ve sekiz hizmet grubu listede; ...` (izin; üç yeni grup kısa koduyla)
- Göç: `aynı anahtarlı hizmet grubu varsa göç sayıyla durur; hiçbir satır eklenmez` (ret), `göç geçer: üç grup yerleşik ve aktif eklenir; kartlar ve var olan gruplar değişmez` (izin)
- Ekranın çeşit tablosu ve kuralları (kod, ad, çeşit değişince silme, mükerrer anahtarı) otomatik testsiz: prototipin betiğini koşan test yok, kaynağı metin olarak okuyan test
  sınır kuralı h'ye aykırı. Ekranda görüntüyle sınandı (`/mnt/project-files/bagla/malzemeler-hizmet/cesit/`).

## Kart birimi kaydı (kart #423, H5), test: tarayıcı denemesi
- Ekran kuralı, otomatik testsiz: prototipin betiğini koşan test yok, kaynağı metin olarak okuyan test sınır kuralı h'ye aykırı.
- Ret (düzeltmeden önce): birime dokunmadan kaydedilen hizmet kartında `kayit.com.birim` boş (`birim-once.png`).
- İzin (düzeltmeden sonra): aynı akışla yeni kartta ve birimi boş eski kartın yeniden kaydında `kayit.com.birim` "adet" (`birim-sonra.png`, `birim-eski-kart.png`).

## Tedarikçi finans firmasından (kart #466), `tedarikci-firma.test.ts`, `kopru.test.ts`
- Arama: `aktif tedarikçi firmalar adla bulunur; yalnız müşteri olan firma listede yok; tek harf 400` (izin ve ret)
- Kayıt: `finansta olan firmanın kimliği ve adı kartta kalır` (izin); `olmayan kimlik 422, biçimsiz kimlik 400` (ret)
- Eski kart: `kimliksiz serbest tedarikçi metni olduğu gibi kaydolur` (izin)
- Firma türü: `müşteri ya da pasif firma 422` (ret); `bağlı firma sonradan pasif olsa kart yeniden kaydolur` (izin); tür kuralı mutasyonla çürütüldü (süzgeç kaldırılınca test kırmızı)
- Yetki: `kart yazma işlemi olmayan rol (operator) firma arayamaz, 403` (ret)
- Değişiklik talebi: `önerilen kartın tedarikçisi de aynı denetimden geçer; müşteri firması 422` (ret), `tedarikçi firması kaydolur` (izin); mutasyonla çürütüldü
- Köprü: `firma-ara yalniz arama metnini sabit firma ucuna tasir` (çerçeve yol seçemez)
- Ekranın seçicisi otomatik testsiz; tarayıcıda önce ve sonra görüntüsüyle sınandı.

## Aktif kartta boş birim (kart #423 borcu), test: tarayıcı denemesi
- Ekran kuralı, otomatik testsiz (prototip betiğini koşan test yok).
- Ret (düzeltmeden önce): onay akışında birimi boş aktif kart değiştirilmeden kaydedilince "Kartta değişiklik yok"; birim boş kalır.
- İzin (düzeltmeden sonra): aynı akış "Değişiklik talebi gönderildi (1 alan)"; talebin önerdiği kartta `com.birim` "adet", sunucu farkında `com.birim`.

## MKK-18 operasyon listesi istasyonlardan (A7, kart #515), `katalog-kartlari.test.ts`, istemci `kopru.test.ts`
- `MKK-18: ayarlar operasyon listesini istasyonların operasyon tiplerinden verir; pasifler de gelir` (96 tip, LZR grup adıyla; pasife alınan tip pasif gelir)
- İstemci: `MKK-18: operasyon listesi istasyonlardan gelir ve kaynağı söylenir; liste boşsa prototip kendi listesini kullanır`
- Salt okunurluk ekran kuralıdır (`opRO`: dışarıdan liste gelince düzenleme kapanır); prototip betiğini koşan test yok.

## Pano özeti (kart #489), `ozet.test.ts`, istemci `ana-sayfa.test.tsx`
- `onaydaki kart ve bekleyen değişiklik talebi sayılır; aktif ve taslak kart sayılmaz` (talep sorgudan çıkarılınca kırılır, denendi)
- `onaylama işlemi olan rol (kalite) sayıyı görür; olmayan (operator) null alır, 403 değil` (işlem denetimi kaldırılınca kırılır, denendi)
- İstemci: yetkisiz cevapta "Veri yok", uç hatasında "Alınamadı"; kart `is` bölümünde, `malzemeler.onayla` ile.

## MKK-18 devamı: Operasyonlar görünümü kalktı (kart #544), istemci `kopru.test.ts`, `gorunumler.test.ts`, `MalzemeKatalogu.test.tsx`, sunucu `ikinci-menu.test.ts`
- `MKK-18: ... liste boşken de dışarıdandır, prototipin kendi listesi açılmaz` (boş listede `operasyonlar: []` ve kaynak gider)
- `operasyonlar görünümü yok (kart #544); dış sayfa yalnız bilinen anahtarla ...` (`toString`, yol ve sayı reddedilir)
- `operasyonlar istasyonlarda (kart #544): eski adres koke doner; ... bilinmeyen anahtar reddedilir`
- Menü: maddeler `new, cat, tpl, mayar, logo, kilavuz`.
- Bağlantının prototip tarafı ekran kuralıdır (`data-go="op"`, `Host.on && OP_DIS`); prototip betiğini koşan test yok.

## Ticari mal türü (kart #1218, TM1-TM4), `ticari-mal.test.ts`, `kurallar.test.ts`, `hizmet.test.ts`, `logo-hazirlik.test.ts`
- TM1 tür ve önek: `TM1: ticari mal kartı TM önekiyle açılır; özet ve arama türü verir; yanlış önek reddedilir, satır yazılmaz` (izin ve ret); saf: `TM1 (kart #1218): ...firma kodu olamaz...`
- TM2 Logo karşılığı yalnız 1: `TM2: ticari malın Logo karşılığı yalnız 1 (422 ve adlı kısıt); 1 başka türe yazılamaz; kart karşılıkla Logo kuyruğuna eksiksiz girer` (izin ve ret: 422, kısıt); saf: `TM2 (kart #1218): ...`
- TM3 reçeteye girmez: `TM3: ticari mal reçete bileşeni ve operasyon sarfı olamaz (422, satır yazılmaz); yarı mamul bileşen olur` (izin ve ret)
- TM4 göç: `TM önekli kart varsa göç sayıyla durur; tür kısıtı değişmez` (ret), `göç geçer: kartlar ve karşılıklar değişmez; ticari mal türü ve karşılığı kabul edilir` (izin)
- Ekran TM2: `TM2 (kart #1218): ticari malın tek seçeneği 1 Ticari mal; öteki türlerde 1 yok` (`LogoGonderimi.test.tsx`). Prototip akışı otomatik testte değil; tarayıcıda 360, 768, 1280 genişlikte elle denendi.

## Kart listesi sayfalı ve önbellekli (#1323)

| Kural | Test |
|---|---|
| Kart listesi sayfalı; sayfalar her kartı bir kez verir, araya düşen iptal kart atlatmaz; sayfa boyu üst sınırı 500 (#1323) | "Liste sayfalıdır: sayfalar kart numarası sırasıyla bütün kartları bir kez verir; araya düşen iptal ve düzenleme kart atlatmaz" |
| "sonra" ile yalnız değişen kartlar; iptal gövdesiz (#1323) | "Önbellek: \"sonra\" verilince yalnız o andan (5 dakika payıyla) sonra değişen kartlar gelir; iptal gövdesiz gelir; bozuk an 400" |
| Köprü sayfaları birleştirir, oturum önbelleğinde yalnız değişenleri ister (#1323) | "liste sayfa sayfa okunur, sayfalar birleşir; ...", "önbellek: sayfa yeniden açılınca yalnız ilk sayfanın anından sonra değişenler istenir; ..." |

## Sihirbazın zorunlu adımları ve benzersiz anahtar sunucuda (B11, 157 a), `kart-kurallari.test.ts`, `olcu-kurali.test.ts`, `kurallar.test.ts`
- Aile ve kalite (157 a): saf `157 a: hammaddede aile ve kalite yeni kartta zorunlu; ...` (ret: ailesiz, kalitesiz, adsız özel kalite, silinen alan, talebin önerdiği kart; izin: kayıtlı eksik kart, boş metin değişiklik sayılmaz)
- Ölçü (157 a): `geçerli ölçü kaydolur; ölçüsüz yeni kart (157 a), bilinmeyen form, ...` (ret), `157 a: kuraldan önce ölçüsüz kaydolmuş kart ölçüsü değişmedikçe kaydolur; ölçüsü silinen kart 400` (izin ve ret)
- Yerleşik zorunlu alanlar ve kategori: saf `B11: yerleşik zorunlu alanlar ve kategori; ...` (ret: ad, parça tipi, alış tarihi, sarf türü ve kaynak sınıfı, hizmet çeşidi ve "Diğer" adı, kategorisiz sarf/demirbaş/hizmet; izin: ayarın kapattığı alan, kayıtlı eksik kart; tür ya da kategori değişince yeni kart gibi)
- Uç: `ret: ailesiz, kalitesiz ya da ölçüsüz hammadde ve zorunlu alanı ya da kategorisi boş kart 400, kart yazılmaz` (ret, altı gövde), `izinli: kuraldan önce eksik kaydolmuş kart ...` (izin ve ret)
- Anahtar: saf `B11: benzersiz anahtar ekranın kartAnahtari kuralıyla sunucuda kurulur ...` (örnekler ekranın işlevinden), uç `izinli: tam kart kaydolur; anahtar sunucunundur, ekranın gönderdiği okunmaz`,
  `ret: aynı malzemeyi farklı ekran anahtarıyla açmak mükerrer denetimini atlatamaz (409); ...`, `izinli: hizmette ekranın anahtarı kalır`; değişen testler `katalog-onay-baglama.test.ts` MKK-10 ve 2, `cakisma-kurali.test.ts`
- Ekranla karşılaştırma: sunucunun anahtarı `katalog.html` `kartAnahtari` ile 20 000 rastgele kartta karşılaştırıldı, fark yok (23.10.2026, yerelde; ekranın tablosunda olmayan kalite dışarıda: ekran o kartta anahtar kuramaz).
- Test kartları: `test-kart.ts` (`tamGovde`) eski test gövdelerini türün zorunlu alanlarıyla tamamlar; yeni kuralların testleri gövdeyi tamamlamadan gönderir.
- Bozma: servisten aile/kalite denetimi, zorunlu alan denetimi ya da sunucu anahtarı ayrı ayrı kaldırılınca `kart-kurallari.test.ts` 2, 2 ve 3 testle düşüyor (23.10.2026, yerelde denendi).

## Genel arama ve indeks (kart #1244), `arama/arama.test.ts`, `arama-indeksi.test.ts`
- Kaynak: `kod ya da adda geçen kart ...; başlık kod; en çok sınır kadar satır` (izin), `tam kod önce, sonra koddan başlayan, ...` (sıra),
  `eski / ERP kodu ya da tedarikçi koduyla ...; eşleşmeyen kod ve joker boş döner` (ret), `iptal kart dönmez; kaynak malzemeler sayfasının okuma işlemini ister` (ret; yetkisiz kişinin reddi çekirdek `/arama` testinde)
- Türkçe harf (1233): `Türkçe harf: büyük-küçük ve noktalı-noktasız fark gözetilmez` (izin; 1233'e göre ILIKE ile düşer, burada denenmedi)
- İndeks: `kodda ya da adda geçen metin araması (liste ve sayım) trigram indeksini kullanır`, `seçici rakamlı arama kart no ile birlikte yine indekse düşer`
- Mutasyon: göç kaldırılınca iki indeks testi düşüyor (29.10.2026, yerelde denendi).
