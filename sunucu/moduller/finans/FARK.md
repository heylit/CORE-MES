# Fark: finans, tam teslim (taban c2c9871)

Depoda `finans` modülü yoktu; bütün dosyalar yenidir. Firma teslimine (`teslim-finans-firma-c2c9871.zip`) göre farklar ayrı başlıktadır. Kilitli dosyalardaki değişiklikler CEKIRDEK-ISTEKLERI.md'dedir.

## Firma teslimine göre

Eklenen
- `sunucu/gocler/20261008132300_finans_cekirdek.sql`: 15 tablo, kısıtlar, dizinler, tetikleyiciler (dağıtım, mahsup, belge ve çek kilidi, pasif firma ve hesap, silme yasağı, durum hesabı), `finans_hesap_bakiyesi` ve `finans_belge_kapanan` işlevleri, yürürlükteki KDV oranları ve tek ayar satırı.
- `sunucu/moduller/finans/para.test.ts`: 31 test (gerçek PostgreSQL).

Değişen
- `sunucu/moduller/finans/kurallar.ts`, `kurallar.test.ts`: para kuralları (KDV geçerliliği, firma-yön uyumu, düzeltme kilidi, çapraz dağıtım, mahsup tutarları, çek geçişleri, hesap kuralları, toplu aktarım firma eşlemesi) ve testleri.
- `sunucu/moduller/finans/sorgular.ts`, `servis.ts`, `uclar.ts`: 55 para ucu, liste sorguları, menü sayacı.
- `sunucu/moduller/finans/NOTLAR.md`, `UYUM-BORCU.md`: tam kapsam.
- `paylasilan/sozlesme/finans.ts`: para şemaları. `paylasilan/islemler/finans.ts`: `finans.oku`, `finans.yaz`, `finans.yonet` eklendi. `paylasilan/sayfalar/finans.ts`: ikinci menü 13 madde ve sayaç ucu.
- `istemci/src/moduller/finans/kopru.ts`: tam veri okuma ve 31 adlandırılmış yazma türü. `FinansCercevesi.tsx`: kapsam (`tam`/`firma`), grafik kitaplığı gömme, kökene bağlı değiştirme. `rotalar.tsx`: 13 yol. `FinansCercevesi.test.tsx`: dış kaynak denetimi, kimlik iletisi.
- `istemci/src/moduller/finans/cerceve/finans.html`: tam kip katmanı ("GÖMÜLÜ MOD, TAM KAPSAM"), kur farkı kategorileri.

Silinen: yok.

## Son ek (kullanıcı isteği: alınacak ve verilecek ödeme kalmamışsa pasif, yoksa uyarı)

- FNS-60: `servis.firmaDurumuDegistir` pasife almadan önce açık fatura, dağıtılmamış ödeme ve sonuçlanmamış çek sayar; varsa 422 ve nedeni (`kurallar.pasifeAlmaEngeli`, `sorgular.firmaAcikKayitlari`). Firma teslimindeki FNS-53 kuralı (aynı duruma geçiş) aynen kalır.
- `20261008132300_finans_cekirdek.sql`: `finans_aktif_firma` tetikleyicisi firma satırını paylaşımlı kilitler; pasife alma ile eşzamanlı yeni kayıt sırayla değerlendirilir (göç henüz depoda değil; firma göçü değişmedi).
- Ekran: firma kartında "Pasife al" uyarısı (tam kipte önceden, firma kipinde sunucu iletisiyle), kartta kalıcı uyarı satırı.
- Testler: kurallar "FNS-60", para "FNS-60".

## Ana sayfa pano kartları (kart #489)

- `istemci/src/moduller/finans/ana-sayfa.tsx`: Özet bölümünde "USD kuru" ve "EUR kuru" kartları (`finans.oku`); ortak `SayiKarti`, kur yoksa "Veri yok". Bağlantı `finans.yonet` için Ayarlar, yalnız okuyan için finans ana sayfası.
- `GET /finans/ozet` (`finans.oku`): bugün (tesis günü) geçerli son kurlar (`servis.panoOzeti`, var olan `sorgular.sonKurlar`). Sözleşme `finansOzetiCevabi`. Göç ve rol değişikliği yok.
- Testler: para "pano özeti", istemci `ana-sayfa.test.tsx` (3).
- Rol panosu incelemesi (11.10.2026): aynı uca rakamlar eklendi (`sorgular.panoRakamlari`), dört kart daha, hepsi `finans.oku`:
  "Vadesi geçmiş tahsilat" (Uyarılar; açık satış belgesi, vade bugünden önce), "7 gün içinde ödeme" (Bana düşen işler; açık alış belgesi, vade bugün ile 7 gün sonrası arası),
  "Nakit (TL)" ve "Portföydeki çek ve senet" (Özet; alınan, portföyde ya da tahsilde). Kartlar sayı ve TL toplamı gösterir; finans sayfasını açabilene ilgili ikinci menü maddesine gider.
- Varsayım: açık belgenin kalanı belgenin kendi kuruyla TL'ye çevrilir; dövizli hesap bakiyesi bugüne kadar girilmiş son kurla çevrilir. Kuru girilmemiş dövizli aktif hesap varsa ya da aktif hesap yoksa nakit "Veri yok"tur (eksik toplam gösterilmez).
- Test: para "pano rakamları" (fark ölçer; kuru eksik dövizli hesap nakdi null yapar, kur girilince döner). Göç ve rol değişikliği yok.

## Defter farkı (A4, kart #246; UYUM-BORCU 6)

- FNS-61: düzeltme (belge, çek, firma, hesap, kur, düzenli ödeme, ayar) ve iptal (belge, ödeme, dağıtım, mahsup, çek, virman) komutları deftere değişen alanın önceki ve yeni değerini çekirdek `denetimEki` ile bırakır. Fark saf kuralda (`kurallar.defterFarki`), okuma serviste; servis fonksiyonları son parametre olarak eki alır.
- Ödeme iptali bağlı çekin durum değişikliğini, dağıtım iptali belgenin ve ödemenin değişen alanlarını da aynı eke yazar. Çekin öteki komutları (tahsile verme, tahsil, ödendi, ciro, karşılıksız, geri alma) durum geçişidir, ek bırakmaz.
- `sorgular.kurGetir` (kilitli) eklendi; `duzenliGetir` kilit seçeneği aldı. Göç, sözleşme ve ekran değişmedi.
- Testler: kurallar "FNS-61", para dört "FNS-61" testi.

## Prototipe (başvuru: finans-sistemi/index.html) göre

- Gömülü mod katmanları (firma ve tam kapsam), köprü istemcisi, standart görünüm sözleşmesi, Firmalar ekranı, firma penceresi, hesap/para birimi/kur/tevkifat alanları, virman, mahsup, avans mahsubu, ciro penceresi, çek tahsil hesabı sorusu, Ayarlar'da Hesaplar/KDV oranları/Kurlar, sadeleştirilmiş ilk kurulum.
- Kategorilere "Kur farkı geliri" ve "Kur farkı gideri" eklendi (K-11).
- Gömülü sürümden çıkarılan: Google Fonts ve jsDelivr bağlantıları, örnek şirket verisi üreticisi.
- Güvenlik düzeltmesi: üç yerde kaçırılmamış kullanıcı metni (GUVENLIK-DENETIMI.md bölüm 4).

## Değişen ya da kaldırılan var olan kurallar

Yok (yeni modül). Prototipin kendi kurallarına göre değişenler UYUM-BORCU.md'de: silme yerine iptal, "Geri al" yok (K-6), avans belge değil ödeme kalanı (K-13), tek nakit bakiyesi yerine hesaplar (K-4), cari adı yerine firma (K-14).

## Depoda oturtma (Aşama 1, dal 246-finans, taban main 669022c)

- Göçler yeni damgayla: `20261008132200_finans_firma.sql`, `20261008132300_finans_cekirdek.sql`; içerik bit bit aynı.
- Belgeler modül klasöründe: `sunucu/moduller/finans/` (FARK, CEKIRDEK-ISTEKLERI, BASKA-MODUL-ISTEKLERI, KURAL-TEST, GUVENLIK-DENETIMI, UYGULA, ON-PAKET-finans-s4, ORTAKLIK-finans).
- Toplayıcı ve çekirdek liste satırları (CEKIRDEK-ISTEKLERI bölüm 1-2) ve `chart.js` 4.4.1 ayrı commit'lerde.
- Çerçeve yalıtıldı (karar FN3): `FinansCercevesi.tsx` artık `YalitilmisCerceve` (yalnız betik, indirme, yazdırma; opak köken). Yazı tipleri stile veri olarak gömülür (`yazi-tipleri.ts` `gomuluYaziStili`), içerik politikasında `font-src data:`. Görünüm sözleşmesi `gorunum-koprusu.ts` ile. Köprü iletisi `YalitilmisCerceve` üzerinden gider; köken ve kaynak denetimi oradadır. Ekran dosyası (`cerceve/finans.html`) değişmedi.
- Test: `FinansCercevesi.test.tsx` çerçevenin yalıtıldığını ve görünüm sözleşmesinin yalıtılmış çerçevede çalıştığını sınar (10 test).

## Form izni ve ortak görünüm köprüsü (dal 246-finans-form, taban main 6d42c4f)

- `FinansCercevesi.tsx`: `izinler`'e `'allow-forms'` (tek satır); görünüm sözleşmesi ortak `useYalitilmisGorunum` ile. `gorunum-koprusu.ts` silindi. Ekran dosyası (`cerceve/finans.html`) değişmedi.
- Test: sandbox özniteliği form iznini taşır; ortak bileşenin `form-action 'none'` bildirimi belge türü bildiriminin hemen ardında durur (yoksa izin düşerdi).
- Tarayıcı: sekiz form kaydetti (UYUM-BORCU "Kullanıma açmadan önce").

## Oturtmada düzeltildi (teslimde gelen hatalar; dal 246-finans-denetim, denetim/DURUM.md main 21c2b9a)

- B-003: düzenli ödeme "ödendi"de net tutar kayan noktayla geri hesaplanıyordu; KDV kuruşa yuvarlanınca hesaptan girilenden 1 kuruş fazla düşüyordu (%20'de 0,15 yerine 0,16). Test "B-003" kırmızıdan yeşile döndü; artık net tamsayıyla bulunuyor, tek oranla oluşamayan toplam 400.
- B-004: ödeme iptali iptal nedenini ödemenin açıklamasının üstüne yazıyordu, `iptal_nedeni` hiç dolmuyordu; para tutarı değişmiyor, ödemenin asıl açıklaması kayboluyordu (karşılıksız çek, çek iptali, ciro geri alma da). Test "B-004" kırmızıdan yeşile döndü.
- B-008: çapraz kurun sınırı yoktu; 1000 EUR'luk belge 0,01 TL ödemeyle "kapandı" olabiliyor, alacak kayıtta sıfırlanıyordu. Test "B-008 (FK1)" kırmızıdan yeşile döndü; kur artık günün kurundan en çok finans ayarındaki pay (varsayılan %20) kadar sapar, veritabanı da denetler.
- B-009: dövizli mahsupta aradaki kur saklanmıyor ve denetlenmiyordu; 100 EUR'luk satış 1 TL'lik alışla mahsup edilip kapanabiliyordu. Test "B-009" kırmızıdan yeşile döndü; kur `finans_mahsup.capraz_kur`'da saklanır ve aynı payla denetlenir.
- Ayrıca: dağıtımda ödenen tutar kayan noktayla yuvarlanıyordu (1,15 x 1,1 = 1,26; veritabanı 1,27); tamsayıya geçti. B-012: dağıtım iptali, verilen çekin ödendi yolu ve bütün yönetim/yazma uçlarının 403 testi eklendi (eksik testti, hata değil).
- Göç: `20261008154024_finans_capraz_kur.sql` (mahsup tablosu doluysa sayıyı yazıp durur; `finans_ayar.capraz_kur_payi`, `finans_referans_kur`, `finans_capraz_kur_payi`, iki tetikleyici işlevi, `finans_mahsup.capraz_kur`).

## Akış D bağlama (Aşama 2, kart #246, dal claude/akis-d-finans-rgpmoi, taban main c17a2e7)

- Okuma sözleşmesine üç alan (CEKIRDEK-ISTEKLERI 8 kapandı): ödemede `iptalNedeni` (`finans_odeme.iptal_nedeni`), mahsupta `caprazKur` (`finans_mahsup.capraz_kur`), ayarda `caprazKurPayi` (`finans_ayar.capraz_kur_payi`). Ayar güncelleme gövdesi `caprazKurPayi`'yi isteğe bağlı alır (0'dan büyük, en çok 100; sayı ya da okunan sayı metni); gönderilmezse kayıtlı pay korunur, prototipin ayar gövdesi alanı taşımadığı için. Göç yok.
- Ekran (`cerceve/finans.html`, üç yer): Ayarlar > Kurlar'a "Çapraz kur sapma payı (%)" formu (`ekPay`, yalnız `finans.yonet`) ve payı söyleyen not; gönderim yakalayıcısı `ekPay`'i de alır. Başka ödeme akışında (firma alanı yok) tutar yazılınca `autoAlloc` konsola hata atıyordu; firma alanı yoksa döner.
- Test: `akis-d.test.ts` (4 test, gerçek PostgreSQL) akışı göçün rolleriyle yürütür: muhasebe firma, iki satış ve bir alış faturası, tahsilat, ödeme ve mahsup girer; kapanış, kalan ve hesap bakiyesi doğrulanır; müdür aynı rakamları okur, yazamaz; satın alma firma açar, depo yalnız okur, ikisi rakam görmez; iptal nedeni ve çapraz kur payı okunur, pay yalnız `finans.yonet` ile değişir.
- Tarayıcı (Chromium, 10.10.2026): göçün rolleriyle çerçevede akış ve 13 ikinci menü sayfası; kanıt paylaşılan klasörde `akis-d/`.
- `disari.ts`: `tedarikciOlabilirMi(tur)` (FNS-51'in alış yanı, `kurallar.ts`'te saf); malzemelerin isteği (malzemeler BASKA-MODUL-ISTEKLERI). Malzemeler ve satın alma kendi kopyalarını bununla değiştirir (onların işi). Test: kurallar "FNS-51 (disari)".

## Sipariş bağı (kullanıcı kararı D6 b, 11.10.2026; dal claude/akis-d-finans-rgpmoi, taban main 4d931f5)

- Göç `20261011005000_finans_siparis_bagi.sql`: `finans_belge.satin_alma_talep_id`, `satin_alma_teklif_id` (boş olabilir; dolu satırlar değişmez), `finans_belge_siparis` yabancı anahtarı `satin_alma_siparis (talep_id, teklif_id)`'e (sipariş silinirse bağ boşalır), `finans_belge_siparis_butun`, `finans_belge_siparis_alis` (yalnız alış), kısmi dizin.
- FNS-62: `disari.ts` `belgeSiparisBagla(db, kisiId, { belgeId, siparisFirmaId, siparis })` (bağlar ya da `null` ile kaldırır; yalnız iptal edilmemiş alış faturası, siparişin tedarikçisinin faturası; sürüm artar) ve seçici için `alisBelgeleri(db, firmaId)` (tutar taşımaz, FNS-48). Bağı satın almanın ucu yazar: satın alma finansın üstündedir, finans siparişi okumaz (ADR 0006).
- Belge okumasında `satinAlmaSiparisi` (`{ talepId, teklifId }` ya da `null`). Siparişe bağlı faturanın firması düzeltmede değişmez (422).
- Ekran: bağlı faturanın açıklamasına "(siparişe bağlı)" eklenir. Sipariş numarası finansta gösterilmez (finans siparişi okumaz).
- Test: akis-d "FNS-62 (D6 b)".

## Eşzamanlı eşitleme (kart #482, denetim S-01, taban main)

- `servis.ts` `hesapEsitle`: hesap satırı kilitlendikten sonra bakiye ayrı sorguyla yeniden okunur; fark bu bakiyeye göre yazılır. Önce kilitli SELECT'in kendi bakiyesi kullanılıyordu; `finans_hesap_bakiyesi` STABLE olduğundan o değer kilit beklenmeden önceki görüntüdendi ve aynı hesaba eşzamanlı eşitlemeler bakiyeyi bozuyordu (denetimde 10 eşzamanlı istekte 1200/-800/-1000, doğrusu 800).
- Test: para "S-01" (kilit beklerken bakiye değişir, sonuç girilen bakiye; 10 paralel eşitleme; ödemelerle karışık). Düzeltme geri alınınca test kırmızı. Göç yok.
- Denetimin önerdiği tetikleyici FOR SHARE kilidi eklenmedi: eşitleme kilitten sonra READ COMMITTED'da taze okuduğu için işlenmiş her hareketi görür; işlenmemiş hareket eşitlemeden sonra işlenir ve üstüne eklenir (sayımdan sonraki hareket). Karışık test bunu ölçer.
- S-10 (düzenli ödeme aynı dönem iki kez) bu karta girmedi: dönem kavramı ve kuralı yok, yalnız satır kilidi ikinci "ödendi"yi engellemez; kullanıcının denetimdeki cevabını bekler.

## Düzenli ödeme ayda bir kez (kart #502, denetim S-10, kullanıcı kararı "4-a", taban main)

- Göç `20261011110000_finans_duzenli_donem.sql`: önce iptal edilmemiş belgelerde aynı düzenli ödeme ve aynı ay (belge tarihi) çiftlerini sayar; çift varsa veri değiştirmeden durur ve sayıyı yazar (temizlik kullanıcıya sorulur). Yoksa kısmi benzersiz dizin `finans_belge_duzenli_donem` ekler. Durma yolu geçici işlemde denendi.
- `servis.ts` `duzenliOdendi`: düzenli ödeme satırını kilitler; o ay ödenmişse 409 "Bu düzenli ödeme o ay için zaten ödendi; yanlışsa önceki belgeyi iptal edin." Dizin ihlali aynı iletiye çevrilir.
- Varsayım: dönem belge tarihinin takvim ayıdır; iptal edilen belge ayı boşaltır, yeniden ödenebilir.
- Test: para "S-10" (eşzamanlı iki "ödendi"den biri 409, sonraki ay geçer, dizin doğrudan eklemeyi reddeder, iptalden sonra yeniden ödenir). Dizin kaldırılınca test kırmızı.

## Şirket adı satın almadan (kart #514, A7, kullanıcı kararı 5-b ve 1-a, taban main 1637f9f)
- Finans ekranı şirket adını `GET /satin-alma-ayarlari/sirket-adi` ucundan gösterir (köprü `finans-yukle`). Ad orada doluysa Ayarlar > Şirket ve İlk kurulum alanı salt okunurdur, altında "Satın Alma > Ayarlar'dan değiştirilir" yazar.
- Satın almada ad boşsa finansın kendi adı (`finans_ayar.sirket_adi`) gösterilir ve düzenlenir (VARSAYIM).
- `finans_ayar.sirket_adi` silinmez; ayar kaydedilince gösterilen ad oraya da yazılır. Sunucu kodu değişmedi; finans satın almayı ithal etmez (döngü).

## Demo bulguları (kart #544)
- Nakit planı kayıt yokken grafik çizmeye kalkmıyor (`VIEWS.nakit.after` simülasyon yoksa döner); konsoldaki `bands` TypeError'ı gitti.
- Firma kartında (ve cari hesapta) ikinci menüdeki "Firmalar" listeye döner: çerçeve maddeyi bildirdikten sonra menüde olmayan `firmalar-alt` adını da bildirir, kabuk çerçeveyi sapmış sayar ve aynı maddeye tıklanınca görünümü yeniden gönderir. Kabuk ve köprü değişmedi.

## Finans ayarları Sistem Ayarları'nda (kart #587, kullanıcı isteği madde 8)
- `istemci/src/moduller/finans/ayar-ekranlari.tsx`: Sistem Ayarları'na "Finans ve Muhasebe" bölümü (işlem `finans.yonet`, menüdeki Ayarlar maddesiyle aynı). İçerik `/finans/ayarlar` ile aynı çerçeve ve aynı uçlardır; değer kopyalanmaz, finans sayfasındaki Ayarlar yerinde kalır.
- `FinansCercevesi` isteğe bağlı `sabitGorunum` alır: verilince görünüm adresten değil bu addan gelir, çerçevedeki geçiş adresi değiştirmez. Bölümün yüksekliği `tc-finans-gomulu` ile verilir.
- Varsayım: bölüm sırası 50 (öteki modüller bölümlerini bildirdikçe sıra gözden geçirilir).

## İlk kurulum Ayarlar'da (kullanıcı isteği 2026-10-12, Refs #587)
- Hata: tam kipte kayıt ve çek yokken ana sayfa görünümü `kurulum`a çevriliyordu; "Kurulumu tamamla" sonrası veri yenilense de görünüm `kurulum` kaldığı için ekran kalkmıyordu (yeniden açılışta gidiyordu).
- Tam kipte ana sayfa kurulumu zorlamaz. Kurulum formu Ayarlar > "İlk kurulum" sekmesindedir; tamamlanınca sekme "Tamamlandı" ve Şirket, Hesaplar bağlantılarını gösterir. Eski `kurulum` görünümüne ve sihirbaz düğmelerine giden yollar bu sekmeye düşer.
- Kurulum yapılmamışsa ana sayfada ve Plan ekranlarında kısa uyarı; yönetici için "Ayarlar'da tamamla" düğmesi. Kurulum yapılmamışken Ayarlar bu sekmeyle açılır; Sistem Ayarları'ndaki finans bölümü aynı çerçeve olduğundan orada da görünür, çekirdeğe istek gerekmedi.
- Varsayım: uyarı yalnız ana sayfa ve Plan'da (nakit tahmini başlangıç bakiyesi ve eşiğe dayanır); öteki ekranlar uyarısız.

## Günlük kur ve faiz girişi (kullanıcı isteği 2026-10-12)
- Finans ana sayfasında ve Kayıtlar tablosunun üstünde "Günlük kur ve faiz" şeridi: güncel kurlar (bugün girilmişse yeşil) ve geçerli faizler, yönetici için kur ve faiz formu, "Geçmiş" düğmesi Ayarlar > Kurlar ve faiz'e gider.
- Faiz yeni: `finans_faiz` (göç `20261012064707_finans_faiz.sql`), para birimi başına aylık yüzde ve geçerlilik başlangıcı; tablo yalnız eklenir (UPDATE, DELETE, TRUNCATE reddedilir). O güne kadar başlamış son oran geçerlidir; aynı güne ikinci giriş sonrakini geçerli kılar, ikisi de listede kalır. Uçlar `GET /finans/faizler` (finans.oku), `POST /finans/faizler/ekle` (finans.yonet, kur girişiyle aynı).
- Kur: tablo zaten tarihliydi ve kayıtlar (belge, ödeme, çek) kendi kurunu saklıyor; yeni kur yalnız o tarihten sonrasını etkiler. Şeritten aynı güne ikinci kur girilirse o günün kuru düzeltilir (`kur-guncelle`), önceki değer denetim kaydına geçer; başka günlerin kuru değişmez.
- Varsayım: faiz aylık yüzde ve para birimi başınadır (satın almanın `aylik_faiz_yuzdesi` ile aynı birim); giriş yetkisi kurla aynı (finans.yonet).

## Yönetici şirket özeti kartları (Çekirdek kart #664, 2026-10-12)
- Ana sayfanın "Şirket özeti" bölümüne (`yonetim`, işlem `ayarlar.yaz`) dört kart: Kasada ve bankada, Alacak, Borç, Aylık ortalama kâr. Rakamlar `GET /finans/ozet`'ten gelir; finans ana sayfasındaki Alacağım, Borcum ve Aylık ortalama kâr ile aynı tanım: açık belge kalanı ile sonuçlanmamış çek; kâr son üç tamamlanmış ayın KDV hariç belge tutarının ortalaması (açılış, KDV ödemesi, kredi anaparası ve iptal girmez). Kasada ve bankada döviz kuru eksikse "Veri yok".
- Varsayım: kartlar uçtan okunur, uç `finans.oku` ister; yönetici rolünde bu işlem yoksa kart "Alınamadı" der.

## Sabit kıymet ve makine amortismanı (kullanıcı isteği 2026-10-12)
- Amortisman finanstadır ve yalnız yönetim amaçlıdır; Logo'ya gönderilmez. Yeni tablo `finans_sabit_kiymet` (göç `20261012144239_finans_sabit_kiymet.sql`): ad, makine kodu (isteğe bağlı), para birimi, bedel, alış günü kuru, alış tarihi, faydalı ömür (ay), yöntem, kalıntı değer, devir tarihi ve devirde birikmiş amortisman (TL), pasif tarihi, açıklama.
- Hesap aylıktır, alış ayından başlar, ömür bitince ya da pasif ayından sonra durur. Normal: eşit tutar. Azalan bakiyeler: yıllık oran normalin iki katı, en çok %50; son yıl kalan yazılır. Devirde, devir ayına kadarki tutar elle girilen birikmiştir; kalan değer planın kalan aylarına aynı biçimle yayılır. Aylık tutarlar kuruşa birikimli yuvarlanır.
- Dövizli bedel alış gününe kadar girilmiş son kurla TL'ye çevrilir (kur elle de verilebilir) ve kayıtta saklanır; sonra girilen kur geçmişi değiştirmez.
- Uçlar: `GET /finans/sabit-kiymetler` (bu ay, birikmiş, net değer), `GET /finans/amortisman` (son 24 ay toplamı), `POST /finans/sabit-kiymetler/ekle` ve `/:id/pasif` (finans.yonet; pasif denetim kaydına yazılır). Yeni rol satırı yok.
- Ekran: Ayarlar > "Sabit kıymetler" sekmesi (liste, ekleme, pasife alma). Gelir tablosunda "Amortisman (nakit dışı)" gider satırı; net kâr düşer, nakit akışı değişmez. Ana sayfa ve yönetici kartındaki aylık ortalama kâr da amortismanı düşer.
- `disari.ts` `makineAmortismani(db, makineKodu, ay)`: plan ve istasyonlar makine saat maliyetini bağlamada buradan alır; kıymet yoksa null.
- Varsayım: kıymet düzeltme ve silme yok (yanlış kayıt pasife alınır); kalıntı değer kıymetin para birimindedir, devirde birikmiş TL'dir; aylık ortalama kârdaki amortisman son üç tamamlanmış ayın ortalamasıdır.

## Örnek veri (kart #906, kullanıcı isteği 2026-10-13)
- `ornek-veri.ts` (`npm run ornek-veri` payı, gerekir: kisiler): ORNEK Kasa ve ORNEK Banka TL açılış bakiyesi, 5 firma (ORN-MUS-01/02 müşteri, ORN-TED-01/02 tedarikçi, ORN-FAS-01 fason), 2 satış faturası (biri tahsil edildi, öteki çekle kısmen kapandı), 2 alış faturası (biri ödendi), düzenli gider (kira, maaş), 1 alınan çek. Kayıtları ornek.muhasebe açar; tutarlar ve adlar uydurmadır.
- `ORN-` kodlu firma varsa yüklü sayılır. Bütün yazılar servis üzerinden geçer (kurallar ve kısıtlar aynen işler). Ortak ayar, kur ve faiz yazılmaz (denetim KD-066): ilk kurulum ve günlük kur kullanıcıya kalır; örnek kayıtlar TRY'dir.
- `disari.ts`: `firmaNoKoddan(db, kod)`, `ornekFirmaNo(db, anahtar)` ve `ORNEK_FIRMA_ANAHTARLARI` (musteriA, musteriB, tedarikciA, tedarikciB, fason).
- Varsayım: sabit kıymet örneği yok (makine kodları istasyonlar örneğine bağlı; bağlamada eklenir).

## Kur ve faiz şeridinde son giriş (kart #953, kullanıcı isteği 2026-10-13)
- `GET /finans/kur-ozeti` (finans.oku): bugüne kadar geçerli son kur ve faiz, her birini kimin ne zaman girdiği; `sonGiris` ileri tarihli dahil en son yazılan kur ya da faizdir. Kişi adı kisiler `disari.ts` ile gelir.
- Göç `20261013064500_finans_kur_giren`: `finans_kur`'a boş olabilen `guncelleyen_id`, `guncelleme` (kur düzeltmesi son giren sayılır). Veri değişmez.
- Ekran: Finans ana sayfası ve Kayıtlar üstündeki şeritte "Son giriş: zaman, kişi" satırı; her kur ve faizin yanında giren kişi (zaman üzerine gelince).
- Sistem Ayarlar ekranı yalnız yöneticide kalır (kullanıcı: "kalsın").
- Yeni işlem `finans.kur-yaz` (kullanıcı kararı "Ayrı işlem ver"): kur ekle, kur düzelt ve faiz ekle uçları bunu ister (önce finans.yonet). Rol satırları çekirdekten istendi (CEKIRDEK-ISTEKLERI 9); `kur-ozeti` finans.oku ya da finans.kur-yaz ile okunur.
- İstemci `disari.ts`: `<KurFaizSeridi />` bileşeni; satın alma ana sayfasının en üstüne koyması istendi (BASKA-MODUL-ISTEKLERI).

## Siparişten beklenen ödeme (kart #1124, dal 1124-satin-alma-odeme-plani)
- Göç `20261013185000_finans_siparis_odemesi`: yeni tablo `finans_siparis_odemesi` (sipariş anahtarı satın almanın `(talep_id, teklif_id)` çifti, ON DELETE CASCADE; tür avans/vade, vade, yöntem, firma, para birimi, tutar). Dolu tabloya dokunmaz.
- `disari.ts`: `siparisOdemePlaniYaz` (planı bütün olarak yeniler; faturası bağlanmış siparişte reddeder, FNS-63; en çok 12 satır, avans vadeliden önce, FNS-64) ve `siparisPlanlari` (plan satırları ve bağlı faturaların no, tarih, vadesi; fatura tutarı gitmez, FNS-48).
- Uç `GET /finans/beklenen-odemeler` (finans.oku): faturası gelmemiş siparişlerin plan satırları, vadeye göre, firma adıyla.
- Ekran: Nakit planının altında "Siparişten beklenen ödemeler" listesi (vade, tedarikçi, sipariş no ve "Siparişten beklenen" etiketi, ödeme şekli, tutar). Nakit tahminine katılmaz (UYUM-BORCU 15).

## Firma kartı musteri-tedarikci modülüne taşındı (kart #1164, dal 1164-musteri-tedarikci)
- Göç `20261013214000_musteri_tedarikci_firma`: `finans_firma` -> `musteri_tedarikci_firma` (satır ve kimlik aynı); `finans.firma-oku/yaz` -> `musteri-tedarikci.oku/yaz` aynı rollerde.
- Firma uçları, kuralları, sorguları ve `firma.test.ts` musteri-tedarikci'ye taşındı. Finansta kalan: `/finans/firmalar/:id/pasif|aktif` (yetki `musteri-tedarikci.yaz`), çünkü pasife almayı finansın açık kayıtları engeller (FNS-60); uç `musteri-tedarikci/disari.firmaDurumuDegistir`'i engel geri çağrısıyla çağırır (ADR 0006 yönü).
- `disari.ts`'ten firma işlevleri çıktı (tüketiciler musteri-tedarikci/disari.ts'e geçti). `beklenenOdemeler` firma adını `firmaAdlari` ile alır; örnek veri firmaları musteri-tedarikci'den alır.
- İstemci: `kopru.ts` firma çağrıları `/musteri-tedarikci/firmalar*`; çerçevenin firma görünümü `musteri-tedarikci.oku` ile açılır.

## Finans yüklemesinde firma listesi (kart #1198, dal 1198-finans-adres-bulunamadi)
- Hata: #1164 sonrası finans ana sayfası "Finans verisi okunamadı: Adres bulunamadı." ile açılmıyordu; `kopru.ts` toplu yüklemede firma listesini kalkan `GET /finans/firmalar`'dan okuyordu (404).
- Düzeltme: toplu yükleme firma listesini `GET /musteri-tedarikci/firmalar`'dan okur (yetki `musteri-tedarikci.oku`; eskiden `finans.firma-oku`, aynı rollere taşındı). Sunucu ve göç değişmedi.
- Test: `FinansCercevesi.test.tsx` yüklemenin yeni ucu çağırdığını ve eski ucu çağırmadığını denetler; düzeltme geri alınınca test kırılır.

## Genel gider yük oranı (206 a, 211 a; dal claude/finans-genel-gider-orani-xai68r)
- Yeni boş tablo `finans_genel_gider_orani` (göç `20261019100500`): geçerlilik günü, aylık genel gider TL, aylık makine saati, amortisman dahil mi, açıklama. Yalnız eklenir (`yalniz_ekleme()` UPDATE, DELETE, TRUNCATE'i engeller); aynı güne ikinci giriş öncekini düzeltir (faiz kalıbı). Taslaktaki gün tekilliği bu yüzden konmadı.
- `disari.genelGiderOrani(db, gun): Promise<{ saatBasi: number; amortismanDahil: boolean } | null>`: o güne geçerli son satır; saat başı = gider / saat, dört ondalık (FNS-65). Kayıt yoksa null.
- Uçlar: `GET /finans/genel-gider-oranlari` (finans.maliyet-oku), `POST /finans/genel-gider-oranlari/ekle` (finans.yonet). Yeni işlem yok; birim maliyetlerle aynı yetkiler.
- 211 a: makine saat maliyeti `finans_istasyon_maliyet.saat_maliyeti` tek tutardır, bileşen tutmaz; amortisman içerip içermediği kodda tanımlı değil, davranış değişmedi. Giriş ekranında "doğrudan gider: enerji, bakım, sarf" yazılması ekran PR'ındadır.
- `para.test.ts` B-012: finans.yonet POST uç sayısı 23'ten 24'e çıktı (yeni ekleme ucu da 403 denetimine girer).

## Genel gider oranı ekranı (206 a, 211 a)
- Finans ikinci menüsünde "Genel gider oranı" (`/finans/genel-gider`, Sistem grubu, `finans.maliyet-oku`). Prototipte karşılığı yok; TMI ekranı olarak çerçevenin dışında açılır, prototip değişmedi.
- Liste yeniden eskiye: geçerli satır "Geçerli", aynı güne sonradan girilen "Düzeltme", düzeltilen "Düzeltildi", ileri tarihli "İleri tarihli" rozetiyle. Boş değer "—".
- Giriş formu yalnız `finans.yonet` ile çizilir; amortisman alanı "Dahil / Dahil değil" seçilmeden gönderilemez.
- Ekranda 211 a açıklaması: makine saat maliyeti yalnız doğrudan gider (enerji, bakım, sarf); amortisman ve kira genel giderde. İstasyon saat maliyetinin giriş alanı Reçete ve Rota'dadır; oradaki açıklama BASKA-MODUL-ISTEKLERI.md'de.

## Tema değişince çerçeve yeniden kurulmaz (prototip farkı Y5, değerlendirme E2)
- `FinansCercevesi.tsx`: sayfa açılıştaki temayla bir kez kurulur; sonraki tema değişikliği çerçeveye `{ kanal: 'finans', yon: 'tema', tema }` iletisiyle gider (İK'daki kalıp, borç 177). Önce: tema değişince çerçeve baştan yükleniyor, açık form kayboluyordu.
- `cerceve/finans.html` gömülü kip: ileti `data-theme`'i değiştirir; ekranda doldurulan alan ve açık çekmece yoksa görünüm grafik renkleri için yeniden çizilir.
- `finans-tema.test.tsx`: iki test (kabuk iletisi, çerçevede tema ve açık çekmecenin korunması).

## Amortisman bayrağının etkisi ekranda (teslim planı E-9)
- `GenelGiderOrani.tsx`: "Amortisman: Dahil değil" seçilince formun altında amortismanın proje maliyetinde hiçbir kaleme girmediği, seçimin yalnız kayda yazıldığı yazar (proje maliyet PM-B14). Hesap değişmez.

## Satış faturası sipariş ve sevk bağı, iade faturası (260 a, göç 20261019119000)
- Göç: `finans_belge`'ye boş olabilen `siparis_id`, `sevkiyat_isi_id`, `iade_belge_id`; tür listesine `iade`, kategoriye `satis_iadesi` (gider) ve `alis_iadesi` (gelir). Eski belgeler bağsız kalır.
- Satış faturası (gelir, fatura) onaylı ya da kapanmış, müşterisi aynı firma olan siparişe bağlanır (FNS-66); sevk yalnız siparişle. Siparişe bağlı faturanın firması düzeltmede değişmez.
- İade faturası asıl faturanın ters yönündedir, firması ve para birimi aynıdır, siparişi ve sevki asıldan gelir; asıl faturanın iadeleri toplamı asılı geçmez, düzeltmede de (FNS-67). İadesi olan fatura iptal edilmez; önce iade iptal edilir.
- `disari.siparisFaturalari(db, siparisIdler)`: siparişin iptal edilmemiş faturaları ve iadeleri (net TL = tutar x kur).
- Sevk bağı (FNS-68): sevk iptal edilmemiş teslimattır; Sevkiyat'ın bildiği müşteri ve sipariş faturanınkidir.
- Ekran (prototipte iade türü, sipariş ve sevk alanları, kategori adları) ayrı PR'la gelir.

## Satış formu için sipariş seçimi (260 a, ekranın sunucu yanı)
- `GET /finans/satis-siparisleri?firmaId=`: firmanın onaylı ve kapanmış siparişleri (no, durum, tarih, müşteri sipariş no; tutar yok), yeniden eskiye, en çok 200. Yetki `finans.yaz` (faturayı yazan). Siparişler kablolamadaki çözücüden okunur (döngü yok).
- Köprü: `satis-siparisleri` isteği. Prototipteki seçim alanı ve iade olayları ayrı PR'la (soru 273).

## Prototipte iade ve sipariş seçimi (260 a, soru 273 a)
- `cerceve/finans.html` tam kip: kategori adları "Satış iadesi" ve "Alış iadesi"; iade satırı "İade: <asıl fatura no>", siparişe bağlı satış faturası "(siparişe bağlı)" yazar.
- "Satış yaptım" formunda isteğe bağlı "Sipariş" seçimi: firma seçilince onaylı ve kapanmış siparişler köprüden (`satis-siparisleri`) gelir; seçilen sipariş `siparisId` olarak gider.
- "Ne oldu?" altında "Müşteri iade etti" ve "Tedarikçiye iade ettim": asıl fatura seçilir, iade tutarı (KDV hariç) girilir; firma, para birimi, kur, KDV ve tevkifat asıldan gelir.
- `finans-iade.test.tsx`: üç test (iade gövdesi, liste metni ve alış iadesi, sipariş seçimi).

## Sabit kıymet makine bağı (312 b, dolu tablo göçü onaylı)
- Göç: `finans_sabit_kiymet`'e boş olabilen `makine_id` (`makine (id)`'ye yabancı anahtar, `finans_sabit_kiymet_makine`). Eski satırlar doldurulmaz (314).
- Yeni sabit kıymette makine kodu istasyonlardaki bir makineye karşılık geliyorsa `makine_id` yazılır; karşılığı olmayan kod bugünkü gibi kabul edilir, bağ boş kalır. `makine_kodu` kalır.

## Satış formunda sevk seçimi (302 a, prototip değişikliği onaylı)
- `GET /finans/satis-sevkleri?siparisId=` (finans.yaz): siparişin iptal edilmemiş teslimat işleri, iş başına bir satır (tarih, belge no, durum); Sevkiyat `siparisinSevkleri` kablolamadan okunur.
- Satış formunda sipariş seçimin altında isteğe bağlı "Sevk" alanı: sipariş seçilmeden kapalı; seçilen sevk `sevkiyatIsiId` olarak gider, sunucu FNS-68 ile denetler.

## Faiz ve düzenli ödeme eklemesi tekrar korumalı (551 a)
- `POST /finans/faizler/ekle` ve `POST /finans/duzenli-odemeler/ekle` `tekrarKorumali`: istek kimliği zorunlu, kimliksiz istek 400; aynı kimlikle yinelenen istek ikinci satır açmaz, ilk cevabı alır (FNS-40).
- İstemci üç yoldan da kimlikle gönderir: Ayarlar komutları, Kur ve Faiz şeridi (sonucu bilinmeyen gönderimden sonra yeniden kaydet aynı kimliği kullanır), finans çerçeve köprüsü.

## Eski çerçeve kalktı, finans ekranı menü adreslerinde (1418, 1392 a)
- `/finans` ve her ikinci menü maddesi (`/finans/<madde>`, Genel gider oranı dahil) TS ekranını açar; ekran bölümü adresten okur, sekmelerini kendisi çizer. Deneme adresi `/finans/yeni` ve `/finans/yeni/<bölüm>` aynı bölümün adresine yönlenir (sorgu korunur).
- Yeni ekran kapısı kalktı: sayfa işlemi (`sayfa.finans`) olan herkes açar; sekmeler menü maddelerinin işlemiyle süzülür, rol ve işlem değişmedi. Hiçbir maddeyi açamayana "Finans bölümünü görme yetkiniz yok."; yalnız firma yetkisi olan kökte Firmalar'a düşer.
- Eski çerçeveden gelenler: Ctrl K komutları (kayıt olayları, bölümler, Excel, yazdır, cari tahsilat ve ödeme; `yeni/sayfa-komutlari.ts`), "N" ile "Kayıt gir", başlıkta sağlık skoru rozeti ve "Durum ve öneriler" sekmesinde kritik öneri sayısı, Plan bölümlerinde ilk kurulum uyarısı (`yeni/ana/KurulumUyarisi.tsx`, Ana sayfa ile ortak).
- Sistem Ayarları > Finans ve Muhasebe ekranın Ayarlar bölümünü açar (`FinansAyarlariBolumu`), çerçeveyi değil.
- Silinen: `FinansCercevesi.tsx`, `kopru.ts`, `yazi-tipleri.ts`, `cerceve/yazi/`, `yeni/Hazirlaniyor.tsx` ve yalnız çerçeveyi sınayan testler (`FinansCercevesi.test.tsx`, `finans-tema`, `finans-ortak-palet`, `finans-iade`, kökteki `motor.test.ts`). İade ve sipariş/sevk seçimi testleri ekran üzerinde yeniden yazıldı (`yeni/iade-siparis.test.tsx`); motor sayıları `yeni/motor.test.ts`'te. `cerceve/finans.html` yalnız eşitlik testlerinin başvurusudur.
- Sunucu, göç ve veri değişmedi.
