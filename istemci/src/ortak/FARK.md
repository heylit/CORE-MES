# FARK: kullanım rehberi, kitapçık ve role göre ilk tanıtım (dal claude/project-thread-eqjo0u)

- Üst çubukta Yardım düğmesi (soru işareti; telefonda Hesap menüsünde; her sayfada F1). Açıldığı sayfanın tarifi en üstte; soru gibi yazılan arama
  ("nasıl izin isterim") sayfa tariflerini, "Ne oldu?" olaylarını ve genel konuları bulur, "Sayfaya git" ile götürür.
- Her modül kendi sayfalarının tarifini `istemci/src/moduller/<ad>/rehber.ts` ile bildirir (özet, nasıl yapılır, bilmeniz gerekenler, arama sözcükleri);
  kabuk toplar (`ortak/rota/rehber.ts`). Tarifi yazılmamış sayfa da rehberde durur: başlığı ve kişinin gördüğü ikinci menü maddeleriyle. Bütün
  sayfalar (31) bu turda yazıldı. Ortak konular `ortak/rota/rehber-genel.ts`.
- İlk girişte sağ altta tanıtım önerisi (perde açmaz). Tanıtım kişinin gördüğü sayfaları anlatır; rol yetkiyi, yetki sayfaları belirlediği için
  tanıtım role göredir. Görüldü bilgisi tarayıcıda, kişi başına (`ortak/veri/tanitim.ts`); Yardım'dan yeniden başlatılır.
- Kitapçık: aynı içerik tek sayfada, hepsi açık; "Yazdır / PDF" yalnız kitapçığı basar.
- Ortak simge setine `help` ve `book` eklendi (Duruş nedenleri simge adları listesi tipi gereği iki satır aldı).
- Şema, göç, uç, işlem, rol ve paket değişmedi.

# FARK: bağlantı yok ve gönderilemedi uyarısı, kart #1323 (dal 1323-baglanti-uyarisi)

- Ortak istek katmanı (`ortak/veri/api.ts`) her cevapta ve her ulaşılamamada `ortak/veri/baglanti.ts` deposuna bildirir. Kabuk üstte şerit çizer
  (`ortak/arayuz/BaglantiSeridi.tsx`): "Bağlantı yok" (kapatılamaz), dönüşte "Bağlantı geri geldi". Kopukken giden yazma "sonucu bilinmiyor" sayılır;
  aynı istek kimliğiyle yeniden gönderilip cevap alırsa sayıdan düşer. Belirsiz kayıt varken şerit kendiliğinden kapanmaz.
- Kopukken sunucu 5 sn'de bir `GET /api/saglik` ile yoklanır; herhangi bir cevap (503 dahil) bağlantının döndüğünü gösterir. Dönüşte uygulama
  açık sorguları yeniden okutur (`App.tsx`). Süresi dolan yazma belirsiz sayılır ama bağlantıyı kopuk yapmaz; çağıranın iptali sayılmaz.
- Modüller değişmedi; şeridi kullanmak için bir şey yapmaları gerekmez (ortak `api` kullananlar). Arkon ve çerçeve sayfaları kendi istek
  katmanlarını kullandığı için bu şeride düşmez. Şema, göç, uç, işlem, rol ve paket değişmedi.

# FARK: önizlemenin ağa açılması, kart #1280 (dal 1280-baslat-yerel-ag)

- `TMIV2_ONIZLEME_ADRESI` (IP; `0.0.0.0` bütün arayüzler) verilince önizleme (4101, `npm run baslat`) o adreste dinler; yoksa yalnız
  localhost, bugünkü gibi. IP olmayan değerde açılış Türkçe iletiyle durur. Geliştirme sunucusu etkilenmez. Kod `ortak/pwa/dinleme.ts`.
- Şema, göç, uç, işlem, rol ve paket değişmedi.

# FARK: telefon kapısında HTTPS (kurum CA yolu), kart #1278 (dal 1278-https-kurum-ca)

- `TMIV2_HTTPS_SERTIFIKA` ve `TMIV2_HTTPS_ANAHTAR` (PEM, mutlak yol) birlikte verilince 4101 (önizleme ve geliştirme sunucusu) HTTPS sunar; ikisi
  de yoksa düz HTTP, bugünkü gibi. Biri eksik, dosya yok ya da okunamıyor, sertifika ile anahtar uyuşmuyorsa açılış Türkçe iletiyle durur.
- Kod `ortak/pwa/https.ts`, Vite eklentisinin `config` kancasından çağrılır; derleme ve testler değişkenlere bakmaz. Kurulum notu `kurulum/https.md`.
- Şema, göç, uç, işlem, rol ve paket değişmedi. Arkon CSP'si değişmedi. Erişim yöntemi (VPN, internete açma) bu işin dışında.

# FARK: telefona kurulabilir web uygulaması (PWA), kart #1269 (dal 1269-pwa-kurulabilir)

- Bildirim (`/manifest.webmanifest`) ve service worker (`/sw.js`) derlemede `ortak/pwa/vite-eklentisi.ts` ile üretilir; kaynak `ortak/pwa/bildirim.ts`
  ve `ortak/pwa/calisan.ts`. Tema rengi tek yerde (`TEMA_RENGI`), index.html etiketleri de oradan eklenir; test açık tema zemini (`--bg`) ile eşleşmeyi denetler.
- Simgeler `istemci/public/`: 192, 512, maskelenebilir 192 ve 512, iOS için 180 (`apple-touch-icon.png`); kabuktaki TMI işareti, depoda üretildi, dış kaynak yok.
- Service worker yalnız güvenli bağlamda ve derlenmiş sürümde kaydolur. Yalnız `/assets/`, `/simgeler/` ve apple simgesi önbelleğe girer; `/api`, `/arkon-mes/`
  ve sayfa gezintileri ele alınmaz. Her derleme yeni önbellek adı getirir, eskisi etkinleşmede silinir. Çalışan başka parça ithal ederse derleme durur.
- `vite.config.ts`: eklenti ve test ortamında yalnız `tokens.css` işlenir. `main.tsx`: sayfa yüklenince kayıt (tek satır).
- Şema, göç, uç, işlem, rol ve paket değişmedi. Arkon'a bildirim eklenmedi; CSP'si değişmedi.

# FARK: genel aramada kayıtlar, kart #1221 (dal 1221-hizli-git)

- Reçete ve Rota'daki "Hızlı git" bütün uygulamada üst çubuk aramasına taşındı; ikinci Ctrl K yok. Şema, göç, işlem ve paket değişmedi.
- Sözleşme: sayfa tanımında `aramaUcu` (ikinci menüsü olmayan modül de bildirir). Kabuk kişinin gördüğü sayfaların ucuna `?q=` ile sorar;
  cevap `KayitAramaCevabi` (en çok 5 satır, `paylasilan/ikinci-menu.ts` `kayitAramaSorguSemasi` / `kayitAramaCevapSemasi`). Yetkiyi uç denetler.
- Sorgu 2-60 harf; yazma 250 ms durunca sorulur, yeni harf eski isteği keser. Yalnız uygulama içi adres kabul edilir (`kayitYoluMu`).
- Kutu adı arama ucu olan modül varsa "Sayfa ya da kayıt ara"; yoksa eskisi gibi. Bu dalda hiçbir modül uç bildirmez; uçlar ayrı PR'da.

# FARK: ana sayfa grafik kartı, kart #715 (dal 715-grafik-karti)

- `GrafikKarti` (ortak arayüz): tek serili çubuk ya da eğri, SVG, yeni paket yok. Yükleniyor, veri yok ve hata yazıyla; değerler fare
  üstünde ve gizli tabloda. `ozet` başlığın yanındaki değer; verilmezse eğride son değer. Yüzde Türkçe biçimde önde (%7).
- Tasarım değişkeni `--grafik` (koyu #4a90dc, açık #2a6fb8): durum renklerinden ayrı, panele karşı 3:1, renk körlüğü denetiminden geçti.
- Ana sayfa bölümü `grafik` ("Eğilimler"), en altta. Modül kartı `bolum: 'grafik'` ile bildirir.

# FARK: ortak arayüz, kart #172 (dal 172-ortak-arayuz-2, taban main 7cccb80)

Şema, göç, uç, işlem ve paket değişmedi. Arkon ve malzemeler ekranına dokunulmadı.

## Eklenen
- İkinci menü daraltma (B1): sütun kipinde (>=1280) başlıkta aç/kapat düğmesi; dar hal 72 px, yalnız simge (ad erişilebilir ad ve
  ipucu olarak kalır, sayaç simgenin köşesinde). Çerçeveli sayfada pencere < 1536 ise varsayılan dar. Tercih kişi ve modül kökü
  başına tarayıcıda (`tmi:ikinci-menu-dar:<kişi>:<kök>`); kişi kimliği yoksa yalnız bellekte. Şerit kipinde düğme yok.
- Tam ekran: çerçeveli sayfalarda üst çubukta düğme; ana menü, ikinci menü ve alt gezinme gizlenir, üst çubuk kalır. Aynı düğme ya da
  kabuktaki Esc ile döner; açık penceredeki Esc yalnız pencereyi kapatır. Hatırlanmaz: modül değişince ve yeniden açılışta kapalı.
- Şerit kaydırma işareti (B8): gizli madde olan kenarda solma ve ok; dokunulmaz, ekran okuyucuya gizli.
- `Kabuk` yeni özellik `kullaniciId?: number`; `App.tsx` bunu oturumdaki kişiden verir (tek satır, kullanıcı onayı 08.10.2026).
- `useCokGenisEkran()` (`genis-ekran.ts`), `useIkinciMenuDar()` ve `tercihAnahtari()` (`veri/ikinci-menu-tercihi.ts`).

## Değişen
- Telefonda (<768) sayfa başlığı iki satıra iner (B7); önce tek satırda üç noktayla kesiliyordu.
- İkinci menü artık `.tc-ikinci-kap` kabının içinde; ızgara yeri (`grid-area: ikinci`) kaptadır. `.tc-ikinci` seçicisine ızgara
  varsayan modül stili yok (DOĞRULANDI: depoda `tc-ikinci` yalnız ortak arayüzde geçiyor).

## Değişen onaylı kararlar
Yok.

## Ölçüm (1280x800, başsız Chromium, yerel sunucu ve derlenmiş Arkon)
| Durum | Arkon çerçeve / zoom | Malzemeler çerçeve |
|---|---|---|
| Önce (main) | 960 px / 0.570 | 960 px |
| Sonra, varsayılan dar | 1136 px / 0.675 | 1136 px |
| Sonra, tam ekran | 1280 px / 0.760 | 1280 px |
Ayrıntı ve hedef/yazı sayıları: proje dosyası `ortak-arayuz/1280-olcum.md`.

## Doğrulanmadı
- Gerçek dokunmatik cihaz ve Safari. Esc'nin çerçeve odaktayken çalışmaması bilinçli (NOTLAR).

## Ek: dal 172-ortak-arayuz-3 (taban main 1a7892e)

Kod değişmedi; yalnız test ve borç.
- Tam ekranda çıkış düğmesinin üst çubukta, gizlenen bölgelerin (ana menü, ikinci menü, alt gezinme) dışında ve çalışır kaldığı
  `tam-ekran.test.tsx` ile sınanır; reddedilen: şerit kipinde de düğme tektir ve gizlenen bölgeye taşınmaz. Mutasyon: düğme tam
  ekranda çizilmeyince 3 test kırmızı. Stil test ortamında uygulanmaz (sınır kuralı h dosya okumayı yasaklar); görünürlük tarayıcıda
  360, 768, 1280 genişlikte /arkon ve /malzemeler için ölçüldü: düğme görünür, pencere içinde, 44x44; menüler gizli; basınca çıkıyor.
- Yeni `UYUM-BORCU.md`: Esc'nin çerçeve odaktayken çalışmaması (E1 a) ve `react-router-dom` 6.x iki orta uyarı (P3 a).

## Ek: dal 172-ortak-cerceve-form (taban main b116612; FC a, finans istekleri 6 ve 7)

- `YalitilmisCerceve`: `YalitimIzni` artık `'allow-forms'` alır. İzin istenince bileşen belge türü bildiriminin hemen ardına
  `form-action 'none'` politikasını kendisi koyar. Modül bunu gevşetemez, çünkü tarayıcı iki politikayı da uygular.
  Belgenin başında bildirim yoksa form izni düşer. İzin istemeyen modüllerin (malzemeler, Arkon) sayfası değişmez.
- `useYalitilmisGorunum(kok)` (`rota/cerceve-gorunumu.ts`): görünüm sözleşmesi yalıtılmış çerçevede de işler.
  - Finansın `gorunum-koprusu.ts` dosyası olduğu gibi buraya taşındı.
  - Modül bu işlevi `iletiGeldi`'nin başında çağırır. Görünüm kanalı dışındaki ileti modülün kendi işleyicisine kalır.
- Tarayıcıda doğrulandı (Chromium, depo dışı; betik ve çıktı proje dosyalarında `ortak-arayuz/fc/`):
  - `form-action` meta içinde geçerli. Gönderim istek çıkmadan durdu; `requestSubmit` ile `submit` olayı yine çalıştı.
  - Bileşenin ürettiği biçimde, modülün `form-action *` politikası olsa bile gönderim durdu.
  - Politika hiç yokken bile opak kökenden TMI'ye giden form isteğinde oturum çerezi gitmedi (`SameSite=Strict`); oturum açık kaldı.
- Mutasyonlarda testler kırmızı oldu: politika eklenmeyince, bildirimsiz sayfada izin düşmeyince ve yer başa sabitlenmeyince.
- Doğrulanmadı: Firefox ve Safari. Finansın sekiz kayıt formu, finans dalı izni ekleyince tarayıcıda gösterilecek.

## Ek: dal 325-tablet-menu (kart #325, taban main b116612)

Şema, göç, uç, işlem ve paket değişmedi. Modül ekranlarına dokunulmadı.
- İkinci menü 768 px'ten itibaren sol sütun (U8E a); şerit yalnız telefonda (<768). Yeni `useTabletEkran()` (`genis-ekran.ts`).
- Tablette (768-1279) bütün modüller dar açılır; kişinin seçimi kişi ve modül başına saklanır ve varsayılanı geçer (U8D a).
  1280 üstü kural aynı: çerçeveli sayfa 1536 altında dar, öteki geniş.
- Arkon 1024'te dar menüyle 880 px çerçeve alır ve kendi mobil düzenine geçer; masaüstü düzen tam ekranda (U8A a).
- Testler (`ikinci-menu-daralt.test.tsx`): 768 ve 1279 sütun ve dar, 1280 çerçevesiz geniş; tablet seçimi saklanır; reddedilen: 767'de şerit ve dar işareti yok.
  Mutasyon: eşik 1280'e dönünce 2, varsayılandan tablet kuralı çıkınca 2 test kırmızı.
- Tarayıcı ölçümü (dokuz modül kökü, 767/768/1024/1279/1280): içerik 768'de 624 dar / 448 geniş, 1024'te 880 / 704, 1279'da 1135 / 959; taşma yok.
- Satın alma dolu teklif ekranı 448 ve 624'te ölçüldü (uydurma veri): sıkışma var, `sunucu/moduller/satin-alma/UYUM-BORCU.md` madde 28; kabuk değişmedi.

## Ek: dal 172-menu-coklu-islem (kart #172, taban main c73e2d4; bağla tur 1, kullanıcı kararı BO1 a ve "yaz")

Şema, göç, uç ve paket değişmedi. Bugünkü menülerin görünümü değişmedi (yeni alanları kullanan modül yok).
- İkinci menü maddesine isteğe bağlı `veya: [...]`: maddenin işlemi ya da listedekilerden biri maddeyi gösterir (`paylasilan/sayfa-tanimi.ts`
  `maddeGorunurMu`, kabukta `ikinciMenuyuSuz`). `islem` tek değer kalır: onu okuyan kod maddeyi fazla göstermez. Doğrulama: listedeki her işlem kayıtlı, liste boş yazılmaz.
- İkinci menüye isteğe bağlı `sade: { tercih, maddeler }` ve ortak cihaz tercihi (`veri/cihaz-tercihi.ts`, `useCihazTercihi`, anahtar `tmi:cihaz:<ad>`).
  Tercih açıkken kabuk yetkiyle süzülmüş menüden yalnız sade maddeleri çizer; hiçbiri kalmazsa tam menü kalır. Modülün yazdığı tercih kabuğa aynı anda geçer.
- Testler: izinli ve reddedilen (`sayfa-tanimi.test.ts`, `ikinci-menu.test.ts`, `ikinci-menu-sade.test.tsx`, `cihaz-tercihi.test.ts`). Mutasyon: süzgeç tek işleme dönünce 1,
  tercih yok sayılınca 2 test kırmızı.
- Modül istekleri: Arkon menüsünde `veya` (rol satırları belli olunca), stok `useCihazTercihi` ve menüde `sade` (borç 10, Ç6), istasyonlar kişi kısıtlarında kendi `/kisi-secenekleri` ucu (borç 3).

## Ek: dal 172-ana-sayfa-kartlari (kart #172, taban main 6e04d3e; kullanıcı kararı "ANA SAYFA KARTLARI", soru 1 a)

Şema, göç, uç, işlem ve paket değişmedi.
- Ana sayfa ("/") kabuğundur: `App.tsx` `<AnaSayfa>` çizer; modül "/" rotası veremez (`rotalariTopla` reddeder).
- Modül kartını `istemci/src/moduller/<ad>/ana-sayfa.tsx` içinde `export const anaSayfaKartlari: AnaSayfaKarti[]` ile bildirir
  (`ortak/rota/ana-sayfa.ts`): `anahtar` (tekil), `sira` (küçük önce), `islem?` (yoksa herkes), `veya?` (menü maddesindeki kural), `genis?`, `ekran`.
  Kayıtsız işlem, boş ya da işlemsiz `veya`, biçimsiz ya da yinelenen anahtar açılışta dosyayı söyleyerek reddedilir.
- Görünürlük yalnız kartın görünmesidir; veri yetkisi uçtadır. Görünecek kartı olmayana boş durum metni çıkar.
- Yerleşim: 1024 ve üstü iki sütun, altında tek sütun; `genis` kart tam satır.
- `sistem` modülü kabuğun parçasıdır, sahibi ortak arayüzdür (kullanıcı kararı). "Sistem durumu" artık kart: `sira: 900`, `genis`, işlemsiz; ekranı değişmedi.
  Sıra: modül kartları 900'ün altında (satın alma talep kartı üstte). Sistem tablo ve paylaşılan kavram tutmaz; ORTAKLIK dosyası gerekmez.
- Testler: `rota/ana-sayfa.test.ts`, `arayuz/AnaSayfa.test.tsx`, `kesif.test.ts`, `App.test.tsx`. Mutasyon: süzgeç kaldırılınca 3, boş durum kaldırılınca 1 test kırmızı.

## Ek: dal 172-menu-uzerine-gelince (kart #172; kullanıcı kararı menü düzeni 1-a)

Şema, göç, uç, işlem ve paket değişmedi. Modül ekranlarına dokunulmadı.
- 768 ve üstünde ana menü ve ikinci menü varsayılan olarak simge şerididir (72 px). İkinci menü tercihinin varsayılanı her genişlikte dar
  (önceki kural: tablette ve 1536 altında çerçeveli modülde dar, öteki geniş).
- Farede (`(hover: hover) and (pointer: fine)`) şeridin üzerine gelince 150 ms sonra yazılı açılır, ayrılınca 300 ms sonra kapanır;
  açılış ızgarayı değiştirmez, içeriğin üstüne biner (`data-ana-acik`, `.tc-ikinci-kap[data-acik]`). Klavye odağı açar, Esc kapatır.
- Dokunmatikte üzerine gelme açmaz: şeridin üstündeki düğme açar ve kapatır, dışarı dokunmak kapatır. Farede aynı düğme sabitler.
- Sabitlenen menü yazılı kalır ve içeriği iter. Ana menünün seçimi ikinci menüyle aynı kayıttadır, kök yerine `/` ile (`ANA_MENU_KOKU`).
  Daha önce "geniş" seçmiş kişinin ikinci menüsü sabit açılır.
- Telefonda (<768) menüler değişmedi; üst çubukta tema, parola ve çıkış tek "Hesap" menüsündedir (borç O5). Başlık 360'ta 272 px (önce 104).
- Dar ikinci menüde madde simgesi ana menüdeki boydadır.
- Ölçüm (Chromium): 1280'de içerik ana sayfada 1208 px (önce 1032), satın almada 1136 px (önce 960); taşma yok.
- Testler: `ikinci-menu-daralt.test.tsx` (yeniden), `ana-menu-serit.test.tsx`. Mutasyon: üzerine gelme kaldırılınca 2, dışarı dokunuş kapatmayınca 2,
  ana menü varsayılanı açık olunca 3 test kırmızı.

## Ek: dal 172-gezinme (kart #172; kullanıcı kararı gezinme: menü a, sol menü daha dar, genel arama; "yaz")

Şema, göç, uç, işlem ve paket değişmedi. Modül ekranlarına ve `paylasilan`'a dokunulmadı. Önceki ekin (172-menu-uzerine-gelince) menü davranışının yerine geçer.
- Menüler açılıp kapanmaz. Ana menü 1024 ve üstünde sabit ve yazılı (`--menu-sabit` 200 px, satır `--menu-satir` 36 px, yazı bir boy küçük); 768-1023'te
  simge şeridi (72 px), ad ipucunda. Sabitle ve üzerine gelince açılma kalktı: `acilir-serit.ts`, `veri/ikinci-menu-tercihi.ts`, `genis-ekran.ts` silindi,
  `Kabuk`'un `kullaniciId` özelliği kalktı (`App.tsx` tek satır). Saklanmış eski menü tercihleri artık okunmaz.
- İkinci menü her genişlikte başlığın altında sekme şerididir (telefondaki şerit kipi). `IkinciMenu`'nün sütun kipi, dar hali ve başlığı kalktı;
  gruplar ince ayraçla ayrılır, sığmayan madde yana kayar.
- Üst çubukta Geri, İleri ve Son yerler (`GeziDugmeleri`, `rota/gezinme-gecmisi.ts`): tarayıcının geçmişinde yürür, kabuk bu sekmedeki adımları
  sayar; ilk adımda pasif, ipucu hedefin adını söyler ("Geri: Stok Merkezi › İş kutusu"). Son yerler en çok 10, en yakını başta. Sayım
  `sessionStorage`'dadır, çıkışta silinir. Telefonda yalnız Geri.
- Genel arama (`GenelArama`, `rota/arama-dizini.ts`): sayfa ve ikinci menü maddeleri adla, Türkçe harf ve büyük-küçük farkı olmadan; yalnız kişinin
  gördüğü sayfa ve yetkisinin yettiği madde. Sunucuya gitmez. Kayıt araması (firma, belge, malzeme kodu) yok; modül uçlarıyla ayrı iş.
- Ctrl K: modülün kendi Ctrl K'sı önce gelir (stok, satın alma, rota kendi aramasını açar); modül işlemezse kabuğun kutusu odak alır.
  Çerçeveli modülün içindeki tuşlar modülündür. Tarayıcının kendi Ctrl K'sı her durumda durur.
- Süzgeç ve seçili kayıt geri dönünce yalnız adreste tutan sayfada korunur (bugün stok ve rota); öteki modüllerin süzgecini ortak
  `useListeDurumu`'na taşıması modül işidir.
- Ölçüm (Chromium, yerel boş veritabanı): içerik 1280'de 1080 px, 1024'te 824, 768'de 696, 360'ta 360; dört genişlikte yatay taşma 0.
- Testler: `rota/gezinme-gecmisi.test.ts`, `rota/arama-dizini.test.ts`, `arayuz/gezinme.test.tsx` (yeni); `IkinciMenu.test.tsx`,
  `ikinci-menu-kaydirma.test.tsx`, `tam-ekran.test.tsx` yeni düzene göre; `ana-menu-serit.test.tsx`, `ikinci-menu-daralt.test.tsx` silindi.
  Mutasyon: yetki süzgeci kaldırılınca 2, modülün Ctrl K'sına yer verilmeyince 1 test kırmızı.

## Ek: dal 483-rol-panolari (kart #483; kullanıcı kararı: pano yetkiye göre, "yaz")

Şema, göç, uç, işlem ve paket değişmedi. Modül klasörlerine, `paylasilan`'a ve giriş ekranına dokunulmadı.
- Pano rol koduna bağlanmaz: kişi işlemlerinin açtığı kartları görür; birden çok rolü olan kişi hepsini görür.
- `AnaSayfaKarti.bolum`: `is` (Bana düşen işler), `uyari` (Uyarılar), `ozet` (Özet). Ana sayfa bu sırayla başlıklı bölüm çizer; kartı olmayan
  bölüm çizilmez; bölüm bildirmeyen kart bugünkü gibi en altta, başlıksız iki sütunda durur. Tanımsız bölüm açılışta dosyayı söyleyerek reddedilir.
- `SayiKarti` (ortak): simge, başlık, sayı, alt metin, verilirse sayfaya bağlantı. Veri yoksa "Veri yok", yüklenirken meşgul, hatada "Alınamadı";
  sıfır uydurulmaz. Uyarı ve hata tonu yalnız sayı sıfırdan büyükken görünür. Bölüm ızgarası `--pano-kart-enaz` (240 px) ile sığdığı kadar sütun.
- Kartların kendisi modül işidir (`moduller/<ad>/ana-sayfa.tsx`); öneri listesi proje dosyalarında `ortak-arayuz/rol-panolari.md`.
- Testler: `SayiKarti.test.tsx` (yeni), `AnaSayfa.test.tsx`, `rota/ana-sayfa.test.ts`. Mutasyon: ton koşulu kaldırılınca 1, bölüm denetimi kaldırılınca 1 test kırmızı.

## Ek: dal 172-ikinci-menu-kaydirma (kart #172; kullanıcı kararı 11.10.2026: fare kenara gelince kaysın, "yaz"; B8 değişti)

Şema, göç, uç, işlem ve paket değişmedi. Modül klasörlerine ve `paylasilan`'a dokunulmadı.
- İkinci menü şeridi fareyle kayar: kenardaki okun üstünde beklemek o yöne sürekli kaydırır (0,6 px/ms), fare çıkınca ya da uçta durur;
  oka tıklamak görünen genişliğin 3/4'ü kadar atlatır; dikey tekerlek şeridi yana kaydırır, uçta sayfaya bırakır. B8'deki "tıklanmayan ok" kalktı.
- Dokunmada sürekli kayma yok (parmakla kaydırma ve oka dokununca sayfa atlatma). Oklar ekran okuyucuya gizli kalır; klavye maddeler arasında gezer.
- Ölçüm (Chromium 1280, `/finans`, şerit 1080 / içerik 1901): 400 ms beklemede 250 px, 800 ms'de 500 px; çıkışta durdu; tık 810; tekerlek 200, sayfa kaymadı.
- Testler: `ikinci-menu-kaydirma.test.tsx` (6 yeni, "ok dokunulmaz" testi "sekme sırasına girmez" oldu). Mutasyon: 6 elle değişikliğin her biri 1 test kırmızı.

## Ek: dal 172-ikinci-menu-sol-ok (kart #172; demo bulgusu 11.10.2026)

Şema, göç, uç, işlem ve paket değişmedi.
- Oka tıklayınca gizli kalan kısım bir ekrandan kısaysa şerit uca gider. Önce 3/4 ekranlık atlayış uçta birkaç piksel bırakıyordu
  (Chromium 1280, `/finans`: sondan sol oka bir tık 821 -> 11, ok görünür kaldı; şimdi 0, ok gizlendi).
- Testler: `ikinci-menu-kaydirma.test.tsx` 2 yeni (uca gider; reddedilen: uzak uçta sıçramaz). Mutasyon: uç koşulu kaldırılınca 1 test kırmızı.
- Sayı yenilenince geri kayma: şerit sayılar değişince ve yazı tipi gelince etkin maddeye yeniden kaydırılıyordu; kullanıcı şeridi kaydırırken
  (30 sn'de bir okunan sayı değişince) geri çekiliyordu. Artık kullanıcı şeride dokunduysa (fare, dokunma, tekerlek, tuş, kenarda bekleme)
  geri çekilmez; etkin madde değişince yer yeniden bulunur.
- Test: `IkinciMenu.test.tsx` 1 yeni. Mutasyon: bekçi, sıfırlama ve tekerlek işareti ayrı ayrı kaldırılınca her biri 1 test kırmızı.

## Ek: dal 664-sirket-ozeti (kart #664; kullanıcı: yönetici için bilgi veren pano)

Şema, göç, uç ve işlem değişmedi. Modül klasörlerine dokunulmadı.
- `AnaSayfaKarti.bolum` yeni değer `yonetim` ("Şirket özeti"), bölümlerin en üstünde. Modül yöneticiye işletme özetini bu bölümde,
  `islem: 'ayarlar.yaz'` ile verir. Kartı olmayan bölüm çizilmez; bugün hiçbir modül vermediği için ekran değişmez.
