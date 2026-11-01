---
name: yapi-kaliplari
description: Kod tabanında bir şeyin yerini aramadan, yeni dosya açmadan ya da test yazmadan önce kullan.
---

# Yapı kalıpları

Kalıp sabittir; liste değişir. Modül haritası (uç, işlem, tablo, göç, bağımlılık): `npm run harita`; tek modül `-- --modul <ad>`.

## Modül dosyaları (`sunucu/moduller/<ad>/`)

| Dosya | Görevi |
|---|---|
| `paylasilan/sozlesme/<ad>.ts`, `paylasilan/islemler/<ad>.ts` | klasör dışında: sözleşme (zod şemaları: gövde, parametre, cevap; tipleri) ve işlem listesi |
| `paylasilan/sayfalar/<ad>.ts`, `paylasilan/ayarlar/<ad>.ts` | klasör dışında, gerekiyorsa: modülün menü sayfaları (grup ve grup içi sıra ile), ikinci menüsü ve ayar tanımları |
| `uclar.ts` | `export const uclar = [uc({...})]`; işleyici ince, işi servise verir |
| `servis.ts` | akış: kuralı ve sorguyu birleştirir; `Db` parametre alır |
| `kurallar.ts` | iş kuralı, saf fonksiyon ve sabitler; veritabanı ve saat yok |
| `sorgular.ts` | SQL yalnız burada (`db.sorgu`, `db.tek`) |
| `disari.ts` | başka modüllerin ithal edebildiği tek dosya |
| `*.test.ts` | kural testi saf; akış testi gerçek PostgreSQL ile. Kritik yazma ucu (stok hareketi, üretim kaydı, emir kapama, sevkiyat, finans hareketi) aynı kayda eşzamanlı iki yazmayı gerçek PostgreSQL'de koşan test taşır; `KURAL-TEST.md` satırı testi adıyla gösterir |
| `NOTLAR.md` | koddan okunamayan notlar (karar, vazgeçilen yol, tuzak); en çok 30 satır |

İstemci: `istemci/src/moduller/<ad>/`: ekran + css, `rotalar.tsx` (`export const rotalar`; uygulama klasörden bulur), `anahtarlar.ts` (modülün sorgu anahtarları). Göç: `sunucu/gocler/<zamanDamgasi>_<ad>.sql`.

## Bağımlılık yönü

`paylasilan` <- `cekirdek` <- `moduller/<ad>` <- `ana.ts`. Modül, başka modülün yalnız `disari.ts`
dosyasını ithal eder. İstemci sunucuyu ithal etmez; uç tipini sözleşmeden `import type` ile alır, elle yazmaz.
Modüller arası ithal tek yönlüdür, döngü kurmaz (sunucu ve istemci ayrı grafik; `import type` sayılır, test dosyası sayılmaz): `npm run sinir` kural f, yolu yazar.
Çok modüllü akışı üstteki modülün ucu başlatır, alttakinin `disari.ts` komutunu kendi `db`'siyle aynı transaction'da çağırır (ADR 0006).

Başka modülün kaydının adı gerekiyorsa o modülün bütün listesini çekip bellekte eşleme; kimlik listesiyle ad veren dışa açık fonksiyonu çağır.
Kalıp (ilk örnek `kisiler/disari.ts` `kisiAdlari`): `<kavram>Adlari(db: Db, idler: number[]) => Promise<Map<number, string>>`; SQL modülün `sorgular.ts`'inde,
tek sorgu; boş dizide sorgu atılmaz; yinelenen kimlik tek kayıt; olmayan kimlik haritada yok (hata değil); pasif kayıt da adıyla döner. Fonksiyon yoksa sahibi modülden istenir, kopyası yazılmaz.

## Çekirdeğin dışa açtıkları (`#cekirdek/...`)

- `uc.ts`: `uc({ yontem, yol, yetki, tekrarKorumali?, parametre?, sorgu?, govde?, cevap, isle })`.
  `tekrarKorumali: true` (yalnız oturumlu POST/PUT/DELETE): aynı kişinin aynı `istek-kimligi` başlığıyla (`#paylasilan/istek-kimligi.ts`) yinelediği komut ikinci kez uygulanmaz, ilk cevap döner; başlık zorunlu olur. Depo `tekrar.ts` `TekrarDeposu`; sunucu `sunucu/uygulama-secenekleri.ts` ile verir, bayraklı ucunu sınayan test `uygulamaKur({ ..., tekrar: tekrarDeposu })` (`istek-kimligi/disari.ts`); depo verilmeyen kurulumda uç çağrılınca 500 döner, işleyici koşmaz (yalnız test ortamında; test dışı ortamda `kimlik`, `denetle` ya da `tekrar` eksikse `uygulamaKur` açılışta durur). Ayrıntı `uc-ekle`.
  İşleyici `{ db, kullanici, parametre, sorgu, govde, istek }` alır. GET salt okunur tek görüntüde
  (`okumaTx`; yazma 500), diğerleri tek transaction içinde koşar; `txDisi: true` yalnız veritabanı yokken de cevap vermesi gereken GET içindir. Cevap şemasında olmayan alan dışarı çıkmaz.
  `yetki`: kayıtlı işlem (`paylasilan/islemler/<modul>.ts`), `'acik'` ya da `'oturum'` (ADR 0003); GET'te `istek.durumKoduYaz(kod)` durum kodunu belirler.
  `denetim?: 'govdesiz' | 'yok'` (yalnız yazma ucu; verilmezse gövde denetim kaydına tam girer): kullanıcı kararıyla ve sabit liste testiyle; ayrıntı `uc-ekle`. `denetimOzeti?: (govde) => düz nesne` (yalnız `'govdesiz'` ve gövde şemasıyla): durum geçişi gövdede olan uçta özetin yanına `_secilen` olarak yazılan en çok 8 ilkel alan, 512 bayt; aşan ya da fırlatan seçici komutu 500 ile düşürür ve geri alır. Seçicili uç sabit listede `govdesiz+secim` diye durur; seçici eklemek ya da kaldırmak da kullanıcı kararıdır (örnek `malzemeler/uclar.ts`).
- `db.ts`: `Db` (`sorgu`, `tek`), `Veritabani` (`tx`, `kapat`). `date` ve `numeric` metin (şema: `#paylasilan/ondalik.ts` `ondalikMetinSemasi`), `int8` sayı döner; `tx` bitince `db` kapanır, beklenmemiş sorgu bırakan işleyici geri alınır.
  `kayitNoktasi(db, is)` → `{ tamam: true, deger } | { tamam: false, hata: UygulamaHatasi, kisit }`: alt işi ara kayıt noktasında koşar; iş hata verirse yalnız onun yazıları geri alınır, çağıranın yazıları ve transaction kalır. YALNIZ iş kuralı reddi döner (`UygulamaHatasi` ya da kısıt ihlali 23505/23503/23514; ihlal istek sınırındaki karşılığına çevrilir, `kisit` günlük içindir): `tamam: false` güvenle "reddedildi" sayılır. Başka her hata (süre aşımı, kilitlenme, beklenmeyen hata) geri alındıktan sonra yeniden fırlar; çağıran olağan durumda yakalamaz. Yakalarsa transaction kullanılır kalır (kayıt noktasına dönülmüştür): alt işi "sonra yeniden denenecek" diye kendi kaydına yazan üst modül bunu kullanır; kilit alma ve ön okumalar da noktanın içinde olmalıdır, dışarıdaki hata transaction'ı düşürür. Üst modül alt modülün `disari.ts` komutunun reddini kendi kaydına yazacaksa kullanır (ADR 0006). İç içe açılır; yalnız yazma transaction'ının `db`'siyle (okuma ucu, transaction dışı ve bitmiş `db` açık hata).
- `hata.ts`: `dogrulama`, `oturumYok`, `yetkiYok`, `bulunamadi`, `cakisma`, `bagimliKayit`, `gecersiz`, `onayGerekli`; `cokIstek` (429); 503 `MESGUL` ve `VERITABANI_YOK`'u çekirdek fırlatır (tek istisna `oturum`: çekirdeğin kurucusuyla). Kısıt ihlali (23505, 23503, 23514) kendiliğinden 409/422 olur.
- `kisit.ts`: `kisitKorumali(esleme, is, yedek?)`: yazmayı sarar; eşlemedeki (kısıt adı → `'ileti'` ya da `{ ileti, alan? }`) kısıtın ihlalini modülün iletisiyle fırlatır, kodu ihlalin türü belirler; adı eşlemede olmayan ihlal, türü için `yedek` (`{ BAGIMLI_KAYIT?, CAKISMA?, GECERSIZ? }`; başka modülün kısıtı için) verildiyse onu alır, yoksa ve başka her hata aynen geçer; kayıt noktası açmaz. Modül kendi `try/catch` + `kisitIhlali` sarmalayıcısını yazmaz. Ayrıntı `uc-ekle`.
- `liste.ts`: sayfalı liste: `sayfaliListe(sorgu, { say?, satirlar, sayfaBoyu? })` (cevabı kurar; taşan sayfa son sayfaya, aşan boy üst sınıra çekilir; `say` yoksa `toplam` `null`), `siralamaSql(tanim, sorgu)` (izinli anahtar -> modülün sabit sütunu + ikincil anahtar), `sayfaDilimi`, `uygulananSayfaBoyu`. Şema `#paylasilan/liste.ts` (`listeSorguAlanlari(alanlar)`, `sayfaSorguAlanlari`, `siralamaSorguAlanlari`, `listeCevapSemasi(satir)`, `SayfaliListe<T>`). Ayrıntı `uc-ekle`.
- `zaman.ts`: `zamanMetni(ifade)`: `timestamptz` sütununu saat dilimi bilgili ISO 8601 metni seçen SQL parçası. Şema `#paylasilan/zaman.ts` (`zamanSemasi`, `tarihSemasi`); `date` sürücüden metin döner, sarılmaz.
- `dogrulama-iletisi.ts`: `turkceIleti`: istek şeması hatalarının tek Türkçe eşlemesi; uç katmanı kendisi uygular, şemadaki elle yazılmış ileti kazanır.
- `surum.ts`: `surumluGuncelle({ guncelle, varMi, bulunamadiIletisi? })`: sürüm koşullu yazmanın sonucunu yorumlar (404 / 409 `eskiSurum()`); şema `#paylasilan/surum.ts` (`surumSemasi`, `beklenenSurum`), istemci `#paylasilan/hata.ts` `eskiSurumMu`.
- `kapsam.ts`: veri kapsamı (kişinin iş merkezi kısıtı): `Kapsam` (içeriği kapalı: okunamaz, kopyalanamaz, elle kurulamaz; `kisininKapsami(db, kisiId, kisitiVer)` ile alınır, tek hazır değer en dar kapsam `HICBIR_YER`; ham liste derlenmez), `kapsamDisiysaReddet(kapsam, isMerkeziId | null)` (yazmada kilitten sonra, durum kuralından önce; 403 `kapsamDisi()`; `null` iş merkezi geçer), `kapsamdaMi`, `kapsamSuzgeci` (liste parametresi: `null` sınırsız, boş dizi yalnız iş merkezi olmayanlar), `HICBIR_YER`. Çekirdek tablo sorgulamaz: kısıtı ve bayraklı kişinin muafiyetini `istasyonlar/disari.ts` verir. Yazma her zaman denetlenir; iş merkezine bağlı kayıtların liste uçları da `kapsamSuzgeci` ile süzülür (kart #91). Kısıtı aynı transaction'da yazıp okuyan komut yardımcıyı kullanmaz. Ayrıntı `uc-ekle`.
- `yetki.ts`: `Kullanici` (`id`, `ad`, `islemler`). Denetim uç katmanındadır, işleyicide değil; yönetici için ayrı dal yazılmaz.
- `test-vt.ts`: `testVeritabaniKur(onek)` (göçler uygulanmış) ve `testSemasiAc(onek)` (boş); şemayı elle kurma.

## Ortak arayüz (`istemci/src/ortak/`)

- `arayuz/index.ts` bileşenleri dışa açar; ekran yalnız buradan ithal eder.
- `veri/api.ts` (`api.get/post/put/sil`, `ApiHatasi`), `rota/kesif.ts` (`ModulRotasi`, rota keşfi).
- `veri/istek-kimligi.ts`: tekrar korumalı komut `tekrarKorumaliGonder((deneme) => cagri.post(yol, { ...deneme, parametre, govde }), { istekKimligi })` ile gider; yalnız sunucuda `tekrarKorumali` uçta. Sonucu bilinmeyen hatadan (ağ, zaman aşımı, 5xx) sonraki her yeniden gönderim aynı kimlikle: kuyruk kimliği öğeyle birlikte saklar (öğe oluşurken `yeniIstekKimligi()`).
- Ekran yalnız `tasarim/tokens.css` değişkenlerini kullanır; inline stil ve hex yok (`npm run lint`).

## İkinci menü (modülün kendi sayfaları)

Ana menü modülü gösterir; modülün sayfaları ikinci menüdedir. Modül menüyü VERİ olarak bildirir, kabuk çizer; modül menü çizmez.

```ts
// paylasilan/sayfalar/ornek.ts
import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const ORNEK_SAYFALARI = [
  { yol: '/ornek', islem: 'sayfa.ornek', baslik: 'Örnek Modül', simge: 'cube', grup: 'Üretim', sira: 40 },
] as const satisfies readonly SayfaTanimi[];

export const ORNEK_IKINCI_MENU = {
  kok: '/ornek', baslik: 'Örnek Modül', simge: 'cube',
  sayacUcu: '/ornek/menu-sayaclari', // isteğe bağlı
  gruplar: [
    { maddeler: [{ anahtar: 'genel', baslik: 'Genel bakış', yol: '/ornek', simge: 'gauge', islem: 'sayfa.ornek' }] },
    { baslik: 'Tanımlar', maddeler: [{ anahtar: 'turler', baslik: 'Türler', yol: '/ornek/turler', simge: 'grid', islem: 'ornek.tanim-oku' }] },
  ],
} as const satisfies IkinciMenuTanimi;
```

- Tipler `paylasilan/sayfa-tanimi.ts`: `IkinciMenuTanimi` (`kok`, `baslik`, `simge`, `gruplar`, `sayacUcu?`, `cerceveli?`), `IkinciMenuGrubu` (`baslik?`, `maddeler`), `IkinciMenuMaddesi` (`anahtar`, `baslik`, `yol`, `simge`, `islem`). Toplayıcı `paylasilan/sayfalar.ts` `IKINCI_MENULER`.
- `kok` modülün ana menüdeki sayfasının yoludur; madde yolu kökün kendisi ya da altıdır, menüde tekildir. `anahtar` menüde tekildir (küçük harf, rakam, tire). `islem` kayıtlı işlemdir, `simge` ortak setten (derlemede ve testte denetlenir).
- Kabuk maddeleri kullanıcının işlemlerine göre süzer; maddesi kalmayan grup, grubu kalmayan menü görünmez. Etkin madde adresten bulunur (en uzun önek; hiçbir maddeye düşmeyen alt yolda kök yoldaki madde etkin görünür). Açıkken ana menü simge şeridine daralır; 1280'in altında ikinci menü içeriğin üstünde yatay şerittir.
- Sayaç: `sayacUcu` tek bir GET ucudur; cevabı `#paylasilan/ikinci-menu.ts` `ikinciMenuSayacSemasi` (madde anahtarı -> eksi olmayan tam sayı ya da `null`). Kabuk 30 saniyede bir ve sayfa görünürken okur; hata, `null`, eksik anahtar ve sıfırda sayı göstermez. Uç `yetki: 'oturum'`; sayıyı sunucu kullanıcının yetkisine göre süzer (yetkisi olmayan maddenin sayısı `null`).
- Çerçeveli modül (`cerceveli: true`): menü kabukta kalır, modül `useCerceveGorunumu({ cerceve, kok })` (`ortak/rota/cerceve-gorunumu.ts`) ile adresteki maddenin anahtarını çerçeveye iletir. İleti biçimi, kurallar ve çerçeve tarafı `ortak/rota/cerceve-iletisi.ts` (`cerceveKoprusuKur`): görünüm adı madde `anahtar`ıdır; `hazir`, çerçeve `gorunum` iletisini hemen uygulayabilecek duruma gelince yollanır (ilk `gorunum` gelene kadar yinelenebilir). Bir `gorunum` iletisi alındıktan sonra, o ileti uygulanmadan önceki görünüm (açılış görünümü dahil) bildirilmez; uygulanan isteğin yankısını bildirmek zararsızdır. Bildirim, alınan son `sira`yı geri yazar (hiç alınmadıysa 0); sıra köprü ömrünce artar, `hazir`da sıfırlanmaz. `sandbox` özniteliği `allow-same-origin` olmadan kullanılamaz (köken `null` olur, köprü her iletiyi atar).
- Rota yine modülün `rotalar.tsx` dosyasındadır: her madde yolunun rotası olur (testle denetlenir; çerçeveli modülde hepsi aynı ekrana gider).

## Test nasıl kurulur

- Sunucu: `node:test` + `node:assert/strict`. Uç testi `uygulamaKur` + `app.inject` ile; gerçek
  süreç ve port açılmaz. Örnek: `sunucu/moduller/oturum/oturum.test.ts`.
- İstemci: vitest + testing-library. Örnek: `istemci/src/App.test.tsx`.
- Tek modül: `npm run test:modul -- <ad>`. Hepsi: `npm run kontrol`.
- Worktree'ye `.env` kopyalanmaz: betikler kendi kökünde yoksa ana çalışma ağacındakini okur.

## Dört test kuralı

1. Davranışı ölç; üretim kaynağını metin olarak okuma, sayı pimleme.
2. Yetki testi gerçek giriş akışıyla kurulur, sahte kimlik kullanılmaz; red ve kabul birlikte sınanır.
3. Fikstür gerçek cevaptan alınır, biçim uydurulmaz; istemcide sözleşme tipine uyar (`satisfies SaglikCevabi`).
4. Yokluk testi önce verinin geldiğini bekler, sonra olmayanı sınar; yoksa boş ekranda da geçer.
