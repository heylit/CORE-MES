# ON-PAKET-stok, sürüm 2.4

Modül: `stok` (Stok Merkezi). Başvuru ekranı: "Stok Merkezi, TMI CORE içinde" önizlemesi; ikinci menülü yerleşim onaylı, ekran ve akış korunur.
Paket onaylandı ve kod yazıldı; bugünkü durum "Güncel durum (kod)" bölümündedir, aşağıdaki sürüm kayıtları ve tasarım metinleri o günün planıdır. Etiketler CLAUDE.md temel kuralına göredir: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

> **Dayanak: `tmi-core-v2-kit-0e72bae.zip` (commit 0e72baeba3ab4b65e078c5c6eb7a534cda9e4043).** Sürüm 2'deki dayanak uyarısı kapandı;
> bütün DOĞRULANDI ifadeleri artık 0e72bae'ye aittir. 8b7bde7 ile fark 33 dosyadır; stok paketini etkileyenler "Değişenler (2 → 2.1)" tablosundadır.

---

## Güncel durum (kod)

Bu bölüm bugünkü kodu anlatır. "Değişenler" tabloları sürüm kayıtlarıdır; sayıları o sürümün sayılarıdır. Güncel ölçüler komutla doğrulanır:
`grep -c "uc({" sunucu/moduller/stok/uclar.ts` (96) ve `npm run harita -- --modul stok`.

| Ölçü | Bugün |
|---|---|
| Uç | 98 (GET 53, POST 45); liste "Uç listesi"nde |
| İşlem | 9: `stok.giris`, `stok.cikis`, `stok.transfer`, `stok.sayim`, `stok.tanim`, `stok.geri-al`, `stok.toplama`, `stok.statu-degistir`, `stok.istek` |
| Tablo | 25 (26 açıldı, `stok_kare_adi` 21. göçte kaldırıldı); liste "Tablolar"da |
| Ayar | 6 numara kalıbı (`paylasilan/ayarlar/stok.ts`) |
| İkinci menü | 11 madde, 4 grup (`paylasilan/sayfalar/stok.ts`) |
| Kural | DEP-36 (üretime sarf ve emir tamamlamada iş merkezi kapsamı) kodda ve testte vardır; 63 DEP kuralı tanımlı (DEP-01…53 bu dosyada, DEP-54…63 `KURAL-TEST.md`'de; `kurallar.ts` ve `stok.test.ts` esastır) |
| `disari.ts` | 29 dışa açık ad, 25 imza (`npm run harita -- --modul stok`) |

Kodda olmayanlar: `stok_dis_cagri` ve `stok_dis_cagri_satiri` tabloları; dolayısıyla `stokGirisi`, `stokCikisi`, `stokCagrisiniGeriAl`, `teslimAlinanlar` ve DEP-30…32 yoktur.
Başka modül stoğa `disari.ts` içindeki olay yansıtıcılarıyla (`emirAcildiYansit`, `emirBittiYansit`, `fasonHareketiYansit`, `hurdaSayimiYansit`, `uretimSayimiYansit` ...)
ve `malzemeIstegiAc` ile ulaşır. `GET /stok/depo-3b` kaldırıldı (404); 3B depo ve 2B yerleşim `Depo` ekranında birleşiktir.

---

## Değişenler (2.3 → 2.4)

Sürüm 2.3 onaylandı. 2.4 üç düzeltmeyi, YZ-1 ve YZ-2'nin 5eb9481'den doğrulanmasını, iki ek kararı ve ilk sürüm kodunun pakete göre farkını işler.
Dayanak: `tmi-core-v2-kit-5eb9481.zip` (commit 5eb9481a7e301003f19b0465ccda18232ce12b8e).

| # | Konu | 2.3 | 2.4 |
|---|---|---|---|
| 1 | Düzeltme: mal kabul no | `lpad(id, 6)` altı haneden sonra keser | Üretim emri kalıbı: `'MK-' \|\| CASE WHEN id < 1000000 THEN lpad(id::text, 6, '0') ELSE id::text END` (DOĞRULANDI `20261007002531_uretim_emirleri_tablolar.sql` `emir_no`); test: `MK-1234567` (bugün numara `stok.mal-kabul-no` ayarından gelir; hesaplanmış sütun yoktur) |
| 2 | Düzeltme: DEP-20 | Beş türe göre metin yanlışlıkla "Değişenler (2.1 → 2.2)" tablosundaydı; kural tablosunda eski metin | Metin kural tablosuna taşındı; o satır eski haline döndü. Başlık "İlk sürüm tabloları (İ: 11)" |
| 3 | Düzeltme: yanlış sayılan mal kabul | Kural yoktu | **DEP-53**: belge değişmez; müdür (`stok.geri-al`) belgeyi düzeltir, eski belgenin bütün hareketleri aynı işlemde ters çevrilir ve doğru satırlarla `duzeltilen_id` taşıyan yeni belge açılır; belge bir kez düzeltilir; eski satırların Logo durumu değişmez, eşleme yeni belgeyle yapılır. Mal kabul hareketi tek başına geri alınmaz |
| 4 | YZ-1 malzeme kartı | Yer tutucu | DOĞRULANDI: `malzeme_katalog_karti`, sayı kimliği `no integer GENERATED ALWAYS AS IDENTITY`, `malzeme_katalog_karti_no_tek` UNIQUE, değişmezliği `malzeme_katalog_karti_no_degismez` tetikleyicisiyle (`20261007143403_malzemeler_katalog_sayi_kimligi.sql`). Bütün bağlar `integer REFERENCES malzeme_katalog_karti (no)`. Türler `hammadde, yarimamul, mamul, sarf, demirbas` |
| 5 | YZ-1 özet alanları | Mesajdaki tanım: id, tur, stokKodu, ad, onayDurumu, erpKodu, stokBirimi, guncelleme | **Depoda farklı** (DOĞRULANDI `paylasilan/sozlesme/malzemeler.ts` `katalogMalzemeOzeti`): `id, kimlik, kod, tur, ad (boş olabilir), onayDurumu`. Stok kodu `kod` alanından okunur; **birim kartta yok** (yorum: "birim sunucuda yok"): stok ekranı birimi göstermez, istek BASKA-MODUL-ISTEKLERI'nde |
| 6 | YZ-2 ikinci menü | Yer tutucu | DOĞRULANDI (`paylasilan/sayfa-tanimi.ts`, `yapi-kaliplari` "İkinci menü"): `STOK_IKINCI_MENU` (`kok, baslik, simge, gruplar, sayacUcu`), sayaç cevabı `ikinciMenuSayacSemasi`, sayı kullanıcının yetkisine göre süzülür. Toplayıcıya (`IKINCI_MENULER`) ekleme çekirdek işi: CEKIRDEK-ISTEKLERI Ç1 |
| 7 | Çekirdek isteği 1 | Şerit, sayaç, telefon yeri | **Karşılandı, çıkarıldı** (DOĞRULANDI `yapi-kaliplari`): ikinci menü açıkken ana menü simge şeridine daralır (K1), sayaç kabukta, 1280 altında ikinci menü içeriğin üstünde yatay şerittir |
| 8 | Ek karar: satın alma teslimi | — | Depo malı stok ekranında mal kabul belgesiyle alır; satın alma stoğa yazmaz, `teslimAlinanlar` ile okur. Mal kabul satırındaki sipariş satırı bağı yalnız yabancı anahtardır, satın alma gelince **yeni göçle** eklenir; sipariş seçimi ekranda satın almanın okuma ucundan yapılır. Stok satın almanın koduna bağlı değildir |
| 9 | Ek karar: SMARTES | — | Malzeme stok kodu SMARTES'te stok numarasıdır, değişmemelidir. DOĞRULANDI: `malzeme_katalog_karti_koru` tetikleyicisi önek ve sıra no'yu (stok kodu bunlardan üretilir) ve türü kilitler. Stok modülüne iş düşmez |
| 10 | Uç sayısı | 26 | Bugün 98 (GET 53, POST 45); liste "Uç listesi"nde, ekleme ayrıntıları FARK.md'de |
| 11 | DEP-36 | İlk sürüm | Kodda ve testte vardır: üretime sarf ve emir tamamlama, emrin iş merkezi kişinin kapsamında değilse 403 verir ve yazmaz (`servis.ts`, `stok.test.ts`) |
| 12 | Kod farkı: yabancı parti | 422 | **409 BAGIMLI_KAYIT**: yabancı anahtar ihlalinin türünü çekirdek belirler; ileti modülündür |
| 13 | Ayar dosyası | `paylasilan/ayarlar/stok.ts` | Var: altı `numara` ayarı ("Ayarlar" bölümü) |

## Değişenler (2.2 → 2.3)

Sürüm 2.2 onaylandı (biçim ve kalıplar doğru). 2.3 iki tasarım hatasını, bir tutarsızlığı ve paketten sonra verilen beş kullanıcı kararını işler. Kod yeni zip geldikten sonra başlar.

| # | Konu | 2.2 | 2.3 |
|---|---|---|---|
| 1 | **Hata: dış çağrı tekilliği** | (kaynak türü, kaynak kimliği) çağrı başına tekil, ama `stokGirisi` / `stokCikisi` tek malzeme alıyordu: çok kalemli teslimde ya da çok bileşenli üretim kaydında ikinci malzeme "zaten yapıldı" diye yazılmazdı | Çağrı **satır listesi** alır (malzeme, miktar, parti) ve hepsini tek işlemde yazar; tekillik çağrı düzeyinde kalır, içerik `stok_dis_cagri_satiri`'na yazılır. Aynı anahtarla farklı içerikli ikinci çağrı 409 alır (DEP-30). Kaynak kimliği **teslim ya da üretim kaydıdır, sipariş değil**; aynı siparişin ikinci teslimi ayrı kayıttır |
| 2 | **Hata: biten mamul girişi yok** | — | Yeni kaynak türü `uretim_girisi` (kaynak: üretim kaydı). Mamul ve yarı mamul `URETIM` çıkış konumuna girer, partisi üretim emridir (DEP-47, DEP-48). Otomatik kaynak hazır değil: İ'de **elle üretim girişi** (K9) |
| 3 | **Tutarsızlık: hammaddede parti** | DEP-20 zorunlu tutuyor, `stokGirisi`'nde parti boş gelebiliyordu | Satın alınan hammaddeyi depo TMI'da **mal kabul belgesiyle**, sayarak ve partiyi o anda girerek alır. Satın alma `stokGirisi` çağırmaz. `stokGirisi` yalnız üretim girişi içindir; satırda parti, türün gerektirdiği yerde zorunludur, eksikse çağrının tamamı 422 |
| 4 | Malzeme kartı (K5) | `REFERENCES malzeme`, `bigint` | Bütün bağlar **`malzeme_katalog_karti (no)`** ve **`integer`** olarak işaretli; yeni zip'ten yazılacak. Parti kuralı beş türe göre yeniden yazıldı (DEP-20, DEP-48, DEP-49) |
| 5 | İkinci menü (K6) | Modül çiziyor; `ModulMenusu` çekirdek isteği | Modül menüyü **veri olarak** bildirir (`paylasilan/sayfalar/stok.ts`), kabuk çizer ve yetkiye göre süzer; biçim `STOK_IKINCI_MENU` (2.4'te doğrulandı). Çekirdek isteği 1 yalnız kabukta eksik kalabilecek davranışa daraldı |
| 6 | Mal kabul ve Logo irsaliyesi (K7) | Tek komut, belge yok | `stok_mal_kabul` + `stok_mal_kabul_satiri`; satırda Logo irsaliye satırı kayıt no (boş olabilir) ve eşleşme durumu (`irsaliye_bekleniyor` / `eslesti` / `fark_var`). Bağlantı kodu yok |
| 7 | Logo'ya giden hareketler (K8) | — | Üretimde tüketim ve biten mamul girişi için `logo_kayit_no` ve `logo_gonderim_durumu` (`bekliyor` / `gonderildi` / `hata`). Defter yalnız eklendiği için bu alanlar `stok_hareketi_logo` yan tablosunda, hareket kimliğiyle 1:1. Depo grubu `stok_depo` ve Logo ambar no. "Logo uyumu" başlığı açıldı |
| 8 | Operatör ekranı Arkon'da (K9) | Otomatik sarf kaynağı üretim kaydı | Üretim sayımı bugün Arkon'un kendi kaydında; TMI üretim emrine yazılması ayrı iş. **Kaynak hazır olana kadar sarf elle çıkışla, biten mamul elle üretim girişiyle yapılır.** `stokGirisi`, `stokCikisi`, `stokCagrisiniGeriAl` ve `stok_dis_cagri` tabloları S'ye taşındı |
| 9 | İlk sürüm | 23 uç, 8 tablo, 37 kural | 26 uç, 11 tablo, 41 kural (2.3 sayıları; güncel sayılar "Güncel durum (kod)"da) |

> **Yeni zip'te doğrulanacaklar (YZ).** Bu iki işaret koddan önce kapanır; paketteki yer tutucu kod değildir.
> - **YZ-1 (K5):** yeni malzeme kartı tablosunun adı, sayı kimliği sütunu ve tipi; tür değerlerinin yazımı (hammadde, yarı mamul, mamul, sarf, demirbaş);
>   `malzemeOzeti` ve `malzemeKullanilabilirMi` imzalarının aynı kaldığı (`tur`, `erpKodu`, `stokBirimi` alanları dahil).
> - **YZ-2 (K6):** `paylasilan/sayfalar/` içindeki ikinci menü veri biçimi (grup, madde, alt yol, simge, gereken işlem alanlarının adları); sayaç ve telefon davranışının kabukta olup olmadığı.

## Kullanıcı kararları (açık sorular kapandı)

| # | Soru | Karar |
|---|---|---|
| K1 | Kabuk 1280 genişlikte yalnız simge gösteren şeride dönsün mü? | **Yalnız ikinci menüsü olan modüllerde.** Öteki modüllerin görünümü değişmez (çekirdek isteği 1'e eklendi). |
| K2 | Otomatik çıkışta stok yetmezse? | **Çağıran adına onaylı eksi yazılır.** Onay kaynağı harekette ayrı tutulur (`eksi_onay_kaynagi = 'dis_cagri'`), doğuran kayıt `dis_cagri_id` ile görünür (DEP-33, DEP-37). |
| K3 | Okuma izni | **Stoğu giriş yapan herkes görür.** `stok.oku` işlemi yok; okuma uçları `oturum`. Yazma işlemleri önerilen matristeki gibi. |
| K4 | Sarfta parti | **İsteğe bağlı.** Hammadde girişinde zorunlu, sarfta girilirse izlenir; girilmezse "parti bilinmiyor" (DEP-20). |
| K5 | Malzeme kartı | Yeni katalog kartı esas; eski `malzeme` tabloları kalkıyor; karta sayı kimliği ekleniyor; `malzemeOzeti` ve `malzemeKullanilabilirMi` imzaları aynı. Türler: hammadde, yarı mamul, mamul, sarf, demirbaş. |
| K6 | İkinci menü | Modül çizmez; menüyü veri olarak bildirir, kabuk çizer ve süzer. |
| K7 | Mal kabul ve Logo | Depo TMI'da sayarak teslim alır; Logo irsaliyesi ayrıca okunup eşlenecek ve fark gösterilecek. Bağlantı kodu yok, alanlar hazırlanır. |
| K8 | Logo'ya hareket | Üretimde tüketim ve biten mamul girişi Logo'ya fiş olarak gidecek; gönderim alanları ve ambar kodu karşılığı hazırlanır. |
| K9 | Operatör ekranı | Arkon modülü; üretim sayımı Arkon'un kendi kaydında; TMI üretim emrine yazılması ayrı iş. |

## Değişenler (2.1 → 2.2, kararlar)

| # | Konu | 2.1 | 2.2 |
|---|---|---|---|
| 1 | Okuma yetkisi | `stok.oku` | `oturum`; işlem sayısı 7 → 6; ikinci menünün okuma maddeleri herkese görünür |
| 2 | Menü sayfası | yalnız `depo` rolünde `sayfa.stok` (DOĞRULANDI) | `sayfa.stok` bütün yerleşik rollere çekirdek göçüyle (`rol_islemi`); kişi sayfayı menüde görür |
| 3 | DEP-33 | yetersizse yazma | çağıran adına onaylı eksi yaz |
| 4 | `stok_hareketi` | `onayli_eksi` | + `eksi_onay_kaynagi` (`kisi`, `dis_cagri`) ve `stok_hareketi_eksi_onay_kaynagi` kısıtı |
| 5 | `stokCikisi` dönüşü | `yazildi` ya da `yetersiz` | her zaman yazar; `onayliEksi` ve `mevcut` döner |
| 6 | DEP-20 | hammadde zorunlu, sarf belirsiz | hammadde zorunlu, sarf isteğe bağlı (servis kuralı; kısıt parti satırının kendisini korur) |
| 7 | İş kutusu | eksi bakiyeler | eksi bakiyeler onay kaynağıyla: "elle onaylı" ve "otomatik (üretim kaydı / rota düşümü)" ayrı satır (DEP-37) |
| 8 | Açık sorular | 4 | 0 |

## Değişenler (2 → 2.1, 0e72bae dayanağı)

| # | 0e72bae'de gelen | Pakette değişen |
|---|---|---|
| 1 | Çekirdek liste kalıbı (`#paylasilan/liste.ts`, `#cekirdek/liste.ts`): `sayfa`, `sayfaBoyu`, `sirala`, `yon` (`artan`/`azalan`); cevap `satirlar`, `toplam` (sayılmadıysa `null`), `sayfa`, `sayfaBoyu`; boy 50, üst sınır 200 | Liste uçları bu kalıpla yazıldı; her listenin sıralama anahtarları, varsayılanı ve sayım kararı "Liste uçları" tablosunda |
| 2 | `goc-yaz`: sıralanan ya da süzülen sütuna `(<sütun>, id)` dizini; küçük tanım tablosuna dizin yok; dizin de şema değişikliğidir | Tablolara dizin listesi eklendi; `stok_raf` dizinsiz |
| 3 | `#cekirdek/kisit.ts` `kisitKorumali`: kısıt adı → modül iletisi; kendi `try/catch` yok; ad en çok 63 bayt | "Kısıt → ileti eşlemesi" bölümü eklendi; bütün adlar 63 baytın altında |
| 4 | Eşzamanlı komutun bozabileceği kural kısıtla da yazılır | DEP-13 (bakiyeli konum pasife alınamaz) servis denetiminden `stok_bakiye_aktif_konumda` bileşik yabancı anahtarına taşındı |
| 5 | `#paylasilan/zaman.ts` `zamanSemasi`, `#cekirdek/zaman.ts` `zamanMetni`; `timestamp` ve `infinity` yok | Zaman alanları bu şemayla; tip kuralına yazıldı |
| 6 | `#cekirdek/kapsam.ts` veri kapsamı: istasyona ya da iş merkezine bağlı kaydı yazan komut kapsamı denetler | DEP-36 eklendi: üretime sarf çıkışı emrin iş merkezine göre denetlenir; depo konumları iş merkezi taşımaz; okuma süzülmez |
| 7 | `#cekirdek/dogrulama-iletisi.ts`: doğrulama iletisi kendiliğinden Türkçe | Sözleşmede yalnız alana özel iletiler yazılır (ör. parti no kuralı) |
| 8 | `simgeler.ts`: `chev-left`, `chev-right`, `first`, `last`, `sort` eklendi | Sayfalama ve sıralama ortak simgeyle; `cart` ve `pallet` hâlâ yok, çekirdek isteği 4 sürüyor |
| 9 | `uretim-emirleri` için `disari.ts` hâlâ yok; `istasyonlar/disari.ts` `kisininIzinliIsMerkezleri` var | `uretimEmriOzeti` isteğine `isMerkeziId` alanı eklendi |
| 10 | Ayar türü hâlâ yalnız boolean; `paylasilan/sayfalar/stok.ts` değişmedi | Önkoşul aynen sürüyor |

## Değişenler (sürüm 1 → 2)

| # | Konu | Sürüm 1 | Sürüm 2 |
|---|---|---|---|
| 1 | Negatif stok | Yasak (kural 2, `miktar > 0`) | Onaya bağlı: komut `eksiOnay: true` taşımazsa `ONAY_GEREKLI` + "mevcut: X"; onaylı yazılır, hareket `onayli_eksi` işaretli, eksi bakiye görünür (DEP-02, DEP-03) |
| 2 | Çıkış sırası | Otomatik FIFO | Sistem en eski girişi **önerir**, depocu başka gözü/partiyi seçebilir; insan seçmeden yapılan düşümde en eski giriş (DEP-05, DEP-06) |
| 3 | Parti izi | Yok | İlk sürümde: hammadde girişinde parti zorunlu, bakiye (malzeme, konum, parti) ekseninde, hareketlerde taşınır, üretim emrine kadar izlenir (DEP-20…DEP-26) |
| 4 | Sahiplik | "Fabrika kareleri" stokta | Depo rafları, gözler, depo zemini, fason kutuları ve depo 3B görünümü stokta; üretim alanı konumları **atölye** modülünden istenir; 3B parçası çekirdek isteği |
| 5 | Serbest json | `ambalaj_ozel jsonb`, `ambalaj_ici_miktar jsonb` | Sütunlar ve `stok_malzeme_ambalaji` alt tablosu |
| 6 | Konum anahtarı | `kod text` PK | `stok_konum.id int` PK, `kod` ayrı ve tekil; bakiye, hareket, fiş, toplama kimlikle bağlı. Eski kural 13 sadeleşti (DEP-12) |
| 7 | Fiş alanları | `is_emri`, `teslim_alan` serbest metin | `uretim_emri_id int REFERENCES uretim_emri`, `teslim_alan_kisi_id int REFERENCES kisi` |
| 8 | `stokCikisi` | iş emri numarası metni | `uretimEmriId: number` (kimlik) ve çağıran kaydın kimliği |
| 9 | Bakiye–hareket | Test yok | Bakiyenin hareket toplamına eşitliğini ölçen veritabanı testi (DEP-11) |
| 10 | Kısıtlar | Taslak | Bütün sütun tipleri ve adlandırılmış kısıtlar (`stok_<tablo>_<anlam>`); `malzeme.id bigint`, `kisi.id int` |
| 11 | Eşzamanlılık | Yok | İki kişinin düzenlediği tablolarda `surum` kalıbı (`surumluGuncelle`) |
| 12 | Listeler | Sayfasız | Liste kalıbıyla; hareket listesi sayfalı |
| 13 | Başka modülden çağrı | Tekillik yok | `stok_dis_cagri` ile aynı çağrı ikinci kez yazılmaz; otomatik hareket doğuran kaydın kimliğini taşır; geri alma tam o hareketleri çevirir (DEP-30…DEP-33) |
| 14 | Uydurma | Göz önerisi ve kritik seviye her zaman sayı veriyordu | Veri yoksa "veri yetersiz" (DEP-08, DEP-41) |
| 15 | İşlemler | `stok.yerlesim` | `stok.tanim` (raf, konum, malzeme ayarı) + `stok.geri-al`; toplam 7 işlem ilk sürümde |
| 16 | Kapsam | Tek sürüm | **İlk sürüm (İ)** ve **sonraki sürüm (S)** ayrıldı; kural, tablo ve uç işaretli |
| 17 | Eklenen bölümler | — | Uç listesi, kural öneki ve sınama yolu, örtüşme tablosu, önkoşullar, varsayımlar, doğrulananlar |
| 18 | Açık sorular | 8 | 4; kabuk şeridi kullanıcı sorusu olarak |

---

## Doğrulananlar (5eb9481 üzerinde; Node v22.22.2, depo `>=24` istiyor; PostgreSQL 16)

| Komut | Son satır |
|---|---|
| `unzip -z tmi-core-v2-kit-5eb9481.zip` | `5eb9481a7e301003f19b0465ccda18232ce12b8e` |
| `npm install` | `added 417 packages in 5s` (çıkış 0) |
| `npm run tip` (Ç1 yamasıyla) | `tsc -p sunucu && tsc -p istemci` (çıkış 0) |
| `npm run lint` (Ç1 yamasıyla) | `stylelint "istemci/**/*.css"` (çıkış 0; ESLint ve Stylelint ihlalsiz) |
| `npm run sinir -- --modul stok` (yamasız) | `Göç damgası denetimi (stok, taban main): 0 ihlal.` (sınır 341 dosya 0 ihlal, yol 0 ihlal; çıkış 0) |
| Saf testler `node --test --test-reporter=spec sunucu/moduller/stok/kurallar*.test.ts` | `ℹ tests 15` / `ℹ pass 15` / `ℹ fail 0` |
| Akış testleri, gerçek PostgreSQL `node --import ./araclar/ortam-yukle-goc.ts --test --test-reporter=spec sunucu/moduller/stok/*.test.ts` | `ℹ tests 35` / `ℹ pass 35` / `ℹ fail 0` |
| Ekran testleri `npx vitest run --config istemci/vite.config.ts src/` (bütün istemci) | `Tests  496 passed (496)` |
| Çekirdek menü ve kabuk testleri (Ç1 yamasıyla) `node --test paylasilan/*.test.ts`; `npx vitest run ... src/ortak/ src/App src/moduller/stok` | `# pass 37` / `# fail 0`; `Tests  301 passed (301)` |
| `npm run teslim -- --zip teslim-stok.zip --modul stok --yalniz-sinifla` | `Teslim denemesi (stok): YEŞİL (yalnız sınıflama; teslim kodu çalıştırılmadı)`; statik uyarı 0 |
| `npm run teslim -- --zip teslim-stok.zip --modul stok --yama <Ç1>` | `KIRMIZI`, iki nedenle, ikisi de teslimden değil: (1) yol denetimi 2 ihlal = Ç1 yamasının iki toplayıcı dosyası; (2) kural ve veritabanı testinde "geçen test yok (test sayısı okunamadı)": araç Node 24'ün `ℹ pass` satırını okur, Node 22 TAP (`# pass 15`, `# pass 34`) yazar. Aynı koşuda tip, lint ve ekran testi YEŞİL |

YZ-1 ve YZ-2 dosyalarla doğrulandı: `20261007143403_malzemeler_katalog_sayi_kimligi.sql`, `paylasilan/sozlesme/malzemeler.ts` `katalogMalzemeOzeti`,
`sunucu/moduller/malzemeler/disari.ts`, `paylasilan/sayfa-tanimi.ts`, `paylasilan/ikinci-menu.ts`, `paylasilan/sayfalar.ts` (`IKINCI_MENULER` boş).

---

## Ad

`stok`. Klasörler: `sunucu/moduller/stok/`, `istemci/src/moduller/stok/`; dosyalar `paylasilan/sozlesme/stok.ts`, `paylasilan/islemler/stok.ts`,
`paylasilan/sayfalar/stok.ts` (var, yalnız bu dosya), `paylasilan/ayarlar/stok.ts`; göçler `sunucu/gocler/<damga>_stok_<konu>.sql`.

## Sayfa ve ikinci menü (K6)

Menüde tek sayfa vardır (`/stok`, `sayfa.stok`, grup Stok). İkinci menüyü modül çizmez: `paylasilan/sayfalar/stok.ts` içinde `STOK_IKINCI_MENU` veri olarak bildirir, kabuk çizer ve
kullanıcının işlemlerine göre süzer; sayaç ucu `/stok/menu-sayaclari` (`ikinciMenuSayacSemasi`, sayı yetkiye göre süzülür).

| Grup | Madde (anahtar) | Alt yol | Simge | Gereken işlem |
|---|---|---|---|---|
| (üst) | İş kutusu (`is-kutusu`) | `/stok` | `dash` | `sayfa.stok` |
| (üst) | Okut (`okut`) | `/stok/okut` | `scan` | `sayfa.stok` |
| (üst) | Mal kabul (`mal-kabul`) | `/stok/mal-kabul` | `truck` | `stok.giris` |
| (üst) | Hazırlık (`hazirlik`) | `/stok/hazirlik` | `list` | `stok.transfer` ya da `stok.toplama` |
| (üst) | Taşı (`sepet`) | `/stok/sepet` | `box` | `stok.transfer` |
| Stok | Malzemeler | `/stok/malzemeler` | `layers` | `sayfa.stok` |
| Stok | Hareketler | `/stok/hareketler` | `sort` | `sayfa.stok` |
| Depo ve konumlar | Depo (`depo`) | `/stok/depo` | `cube` | `sayfa.stok` |
| Depo ve konumlar | Konumlar | `/stok/konumlar` | `target` | `sayfa.stok` |
| Depo ve konumlar | Raflar | `/stok/raflar` | `grid` | `sayfa.stok` |
| Sistem | Ayarlar | `/stok/ayarlar` | `tool` | `stok.tanim` |

Ekran içi düğmeler işleme göre görünür: Çıkış `stok.cikis`, Taşı ve Rafa yerleştir `stok.transfer`, Sayım `stok.sayim`, Üretim girişi `stok.giris`,
Geri al `stok.geri-al`, statü ve rezerve `stok.statu-degistir`, tanım düğmeleri `stok.tanim`. Menüde sayfanın görünmesi `sayfa.stok` ile olur.

## Ayarlar (`paylasilan/ayarlar/stok.ts`)

Hepsi `numara` türündedir; yeni kaydın numarası bu kalıptan gelir, var olan numaralar değişmez.

| Anahtar | Varsayılan | Başlık |
|---|---|---|
| `stok.mal-kabul-no` | `MK-{SAYAC:6}` | Mal kabul numarası |
| `stok.fis-no` | `TF-{SAYAC:6}` | Transfer fişi numarası |
| `stok.toplama-no` | `TL-{SAYAC:6}` | Toplama numarası |
| `stok.malzeme-istegi-no` | `MI-{SAYAC:6}` | Malzeme isteği numarası |
| `stok.teslim-no` | `TS-{SAYAC:6}` | Teslim numarası |
| `stok.lot-no` | `LT-{SAYAC:6}` | Lot numarası (mal kabulde ve üretim girişinde her yeni partiye) |

Sayım süresi ve kare boyu ayar anahtarı değildir; deponun yerleşiminde tutulur (`stok_depo_yerlesimi`).

## Yetki (işlemler, ADR 0003)

| İşlem | Kapsam |
|---|---|
| `stok.giris` | mal kabul, üretim girişi, emir tamamlama, fason iş ve açık sipariş satırı okuma |
| `stok.cikis` | stoktan düşme (sarf, sevk, fire, numune), sepetten stoktan düşme |
| `stok.transfer` | konumlar arası taşıma, rafa yerleştirme, taşıma sepeti, malzeme isteğini hazırlama, teslim etme ve iptal |
| `stok.sayim` | göz sayımı |
| `stok.tanim` | raf, konum, depo haritası bağı, yerleşim, malzeme stok ayarı |
| `stok.geri-al` | hareketi ve mal kabulü geri alma ya da düzeltme |
| `stok.toplama` | toplama listesi açma, adım toplama, kapatma |
| `stok.statu-degistir` | statü değiştirme, rezerve etme ve kaldırma |
| `stok.istek` | Malzeme · Teslim: malzeme istemek, teslim göndermek, kendine geleni almak; stok okuma açmaz (`STOK_ISTEK_ISLEMLERI`) |

Hangi rolün hangi işlemi taşıdığı çekirdek göçündedir; bu dosyadan DOĞRULANMADI (BİLMİYORUM).
Okuma uçları `okuma` kümesiyle açılır: `sayfa.stok` ya da `STOK_ISLEMLERI` içindeki yazma işlemlerinden biri (`stok.istek` dahil değil). `/stok/malzemeler/:id/son-partiler` ve
`/stok/siparis-irsaliyeleri` ayrıca `satin-alma.oku` ve `satin-alma.yaz` ile açılır. `oturum` yetkili uçlar yalnız `ozet`, `menu-sayaclari` ve `malzeme-kart-bilgileri`dir.
`POST /stok/uretim-hazirligi` `terminal.uret` ile açılır. Negatif onay ayrı işlem değildir: çıkışı yapan kişi uyarıyı görüp onaylar; uç kendi işlemiyle korunur,
işleyici ek yetki denetimi yazmaz (DOĞRULANDI: `yapi-kaliplari`, "Denetim uç katmanındadır").

---

## Uç listesi

Okuma GET kaynak, yazma POST komut. Kaynak `sunucu/moduller/stok/uclar.ts` (DOĞRULANDI: `grep -c "uc({"` 96; `grep -c "yontem: 'GET'"` 51; `grep -c "yontem: 'POST'"` 46).
`okuma` = `sayfa.stok` ya da herhangi bir `stok.*` yazma işlemi.

| Yetki | Yöntem | Uçlar |
|---|---|---|
| `okuma` (36) | GET | `/stok/is-kutusu`, `/stok/panel`, `/stok/panel/aylik-deger`, `/stok/statuler`, `/stok/depolar`, `/stok/konumlar`, `/stok/konumlar/:id`, `/stok/goz-stoklari`, `/stok/harita-ozeti`, `/stok/zemin`, `/stok/raflar`, `/stok/raflar/:id`, `/stok/malzemeler`, `/stok/malzemeler/:id`, `/stok/malzemeler/:id/ozet`, `/stok/malzemeler/:id/cikis-onerisi`, `/stok/malzemeler/:id/goz-onerisi`, `/stok/partiler`, `/stok/partiler/:id/belgeler/:belgeId`, `/stok/partiler/:id/etiket`, `/stok/partiler/:id/iz`, `/stok/mal-kabuller`, `/stok/mal-kabuller/:id`, `/stok/mal-kabuller/:id/lot-etiketleri`, `/stok/uretim-emirleri/:id/tamamlama`, `/stok/hareketler`, `/stok/kod-coz`, `/stok/fisler`, `/stok/fisler/:id`, `/stok/toplamalar`, `/stok/toplamalar/:id`, `/stok/malzeme-istekleri`, `/stok/malzeme-istekleri/:id`, `/stok/yerlesim`, `/stok/ara`, `/stok/sayim-bekleyenler` |
| `okuma` ya da `satin-alma.oku`/`satin-alma.yaz` (2) | GET | `/stok/malzemeler/:id/son-partiler`, `/stok/siparis-irsaliyeleri` |
| `oturum` (3) | GET | `/stok/ozet`, `/stok/menu-sayaclari`, `/stok/malzeme-kart-bilgileri` |
| `stok.giris` (2 + 3) | GET | `/stok/fason-isleri`, `/stok/acik-siparis-satirlari` |
| | POST | `/stok/mal-kabul`, `/stok/uretim-girisi`, `/stok/uretim-emirleri/:id/tamamla` |
| `stok.cikis` (2) | POST | `/stok/cikis`, `/stok/sepet/stoktan-dus` |
| `stok.transfer` (1 + 8) | GET | `/stok/sepet` |
| | POST | `/stok/tasima`, `/stok/sepet/satir-ekle`, `/stok/sepet/satirlar/:id/degistir`, `/stok/sepet/satirlar/:id/sil`, `/stok/sepet/teslim-et`, `/stok/malzeme-istekleri/:id/hazirla`, `/stok/malzeme-istekleri/:id/teslim-et`, `/stok/malzeme-istekleri/:id/iptal-et` |
| `stok.sayim` (1) | POST | `/stok/sayim` |
| `stok.geri-al` (3) | POST | `/stok/hareketler/:id/geri-al`, `/stok/hareketler/geri-al`, `/stok/mal-kabuller/:id/duzelt` |
| `stok.toplama` (3) | POST | `/stok/toplamalar`, `/stok/toplamalar/:id/adimlar/:adimId/topla`, `/stok/toplamalar/:id/kapat` |
| `stok.statu-degistir` (3) | POST | `/stok/rezerve-et`, `/stok/rezerve-kaldir`, `/stok/statu-degistir` |
| `stok.tanim` (13) | POST | `/stok/konumlar`, `/stok/konumlar/:id/duzenle`, `/stok/konumlar/:id/pasif-yap`, `/stok/konumlar/haritadan-esle`, `/stok/raflar`, `/stok/raflar/:id/duzenle`, `/stok/raflar/:id/pasif-yap`, `/stok/malzemeler/:id/ayar-duzenle`, `/stok/harita-bolumleri/:id/depo`, `/stok/depo-bolumleri/:id/raflari-kaydet`, `/stok/depo-goz-kalemleri/yaz`, `/stok/depo-goz-kalemleri/sil`, `/stok/yerlesim/kaydet` |
| `stok.istek` (9 + 8) | GET | `/stok/teslim-kutusu`, `/stok/teslim-kutusu/sayac`, `/stok/teslim-kutusu/yerdeki-stok`, `/stok/teslim-kutusu/kod-coz`, `/stok/teslim-kutusu/kisi-kodu`, `/stok/teslim-kutusu/sepet`, `/stok/teslim-kutusu/sepet/gelecek`, `/stok/teslim-kutusu/is-malzemeleri`, `/stok/istek-malzemeleri` |
| | POST | `/stok/teslim-kutusu/is-malzemeleri/iste`, `/stok/teslim-kutusu/sepet/cek`, `/stok/teslim-kutusu/sepet/kullan`, `/stok/malzeme-istekleri/ac`, `/stok/teslimler/gonder`, `/stok/teslimler/:id/teslim-al`, `/stok/teslimler/:id/reddet`, `/stok/teslimler/:id/iptal-et` |
| `terminal.uret` (1) | POST | `/stok/uretim-hazirligi` |

Yol önekinin `/stok/` olması VARSAYIMdır (modül adı; maliyet düşük, yalnız sözleşme metni). Kodda bulunmayan yollar: `/stok/yerlesim/duzenle` (yerine `kaydet`; `kare-adi` borç #441 ile kaldırıldı),
`/stok/fason-kutulari`, `/stok/toplama*` (yerine `/stok/toplamalar*`), `/stok/depo-3b` (kaldırıldı).

### Liste uçları (çekirdek kalıbı)

Sıralama anahtarı isteğin değeridir, SQL'e yazılmaz; sorgu dosyasındaki `*_SIRALAMASI` eşlemesinin anahtarıdır, ikincil anahtar her zaman kimlik.
Sayım (`say`) verilirse `toplam` sayıdır, verilmezse `null`. Anahtarlar `paylasilan/sozlesme/stok.ts` (`listeSorguAlanlari`) ve `sorgular.ts`'ten okundu.

| Uç | Sıralama anahtarları | Varsayılan | Süzgeçler |
|---|---|---|---|
| `GET /stok/konumlar` | `kod`, `tur` | `kod` artan | `tur`, `rafId`, `metin` |
| `GET /stok/raflar` | `kod` | `kod` artan | `tur`, `metin` |
| `GET /stok/malzemeler` | `malzeme`, `toplam` | `malzeme` (kart no) artan | `metin`, `durum`, `kapsam=kartlar` |
| `GET /stok/partiler` | `kayitZamani`, `partiNo` | `kayitZamani` azalan | `malzemeId`, `metin` |
| `GET /stok/mal-kabuller` | `zaman`, `no` | `zaman` azalan | `tur`, `logoDurumu`, `baslangic`, `bitis`, `metin` |
| `GET /stok/hareketler` | `zaman` | `zaman` azalan | `metin`, `malzemeId`, `konumId`, `partiId`, `tur`, `uretimEmriId`, `baslangic`, `bitis` |
| `GET /stok/fisler` | `zaman` | `zaman` azalan | yok |
| `GET /stok/toplamalar` | `acilis` | `acilis` azalan | `durum` |
| `GET /stok/malzeme-istekleri` | `acilis` | `acilis` azalan | `durum` |

Zaman süzgeçleri `zamanSemasi` ile gelir; `baslangic` dahil, `bitis` hariç (aralık yarı açık).

---

## Tablolar

Tip kuralları: zaman `timestamptz` (cevapta `zamanSemasi`, SQL'de `zamanMetni(...)`; `timestamp` ve `infinity` yok, "süresiz" `NULL`), miktar `numeric(14,3)` (metin döner),
malzeme kartı `malzeme_id integer REFERENCES `malzeme_katalog_karti (no)`` (K5, yeni zip'ten), kişi `int REFERENCES kisi`. Kısıt adları `stok_<tablo>_<anlam>` ve en çok 63 bayt.
İki kişinin düzenlediği tablolarda `surum integer NOT NULL DEFAULT 1`. Defterler `yalniz_ekleme()` tetikleyicisiyle (UPDATE, DELETE, TRUNCATE ret).

### Güncel tablolar (26)

Kaynak: `sunucu/gocler/*_stok_*.sql` ve `npm run harita -- --modul stok` (DOĞRULANDI: 26 tablo açıldı; `stok_kare_adi` `20261017130930_stok_kare_adi_kaldir.sql` ile düşürüldü, kullanıcı onayı 17.10.2026, borç #441). Sütunların güncel hâli göçlerdedir;
aşağıdaki "İlk sürüm tabloları" bölümü ilk tasarım sütunlarını verir, sonradan eklenenleri içermeyebilir (örnek: `stok_konum` bugün `atolye_goz_id`, `atolye_alan_id`, `istasyon_id`, `firma_id` taşır;
`stok_bakiye` ve `stok_hareketi` statü sütunlarını, `stok_parti` `lot_no`yu taşır; `stok_depo` `atolye_salon_id` taşır).

| Göç (`sunucu/gocler/`) | Kurduğu tablolar |
|---|---|
| `20261008142031_stok_tablolar.sql` | `stok_depo`, `stok_raf`, `stok_konum`, `stok_parti`, `stok_bakiye`, `stok_hareketi`, `stok_hareketi_logo`, `stok_mal_kabul`, `stok_mal_kabul_satiri`, `stok_malzeme_ayari`, `stok_malzeme_ambalaji` |
| `20261008142032_stok_sepet_fis.sql` | `stok_sepet_satiri`, `stok_fis`, `stok_fis_satiri` |
| `20261008142033_stok_toplama.sql` | `stok_toplama`, `stok_toplama_kalemi`, `stok_toplama_adimi` |
| `20261008142034_stok_yerlesim.sql` | `stok_depo_yerlesimi` (deponun bina, kabul alanı ve sayım süresi yerleşimi), `stok_kare_adi` (depo zemini kare adları; `20261017130930` ile kaldırıldı) |
| `20261010211500_stok_malzeme_istegi.sql` | `stok_malzeme_istegi` |
| `20261014104100_stok_malzeme_teslim.sql` | `stok_teslim` (Malzeme · Teslim: gönderim, alma, red, iptal) |
| `20261014193600_stok_hazirlik.sql` | `stok_toplama_hedefi` (listenin teslim yeri), `stok_toplama_istegi` (listeye alınan istek) |
| `20261015124500_stok_rezerve.sql` | `stok_rezerve` (emir ve statü başına rezerve miktarı), `stok_rezerve_kaydi` (rezerve değişim kaydı) |
| `20261015144827_stok_emir_rezerve_istegi.sql` | `stok_emir_rezerve_istegi` (emir başına tek satır: kişi, zaman; VARSAYIM: emir açılışında stoktan rezerve isteği, amacı sütun adlarından okundu) |

Diğer stok göçleri mevcut tabloları değiştirir (sütun, kısıt, numara kalıbı): `..142035_stok_sayim_suresi`, `20261009051000_stok_tedarik_bagi`, `20261009163000_stok_fason_donus`, `20261011131700_stok_varsayilan_konum`,
`20261012093000_stok_harita_baglama`, `20261012165154_stok_numara_kurallari`, `20261013094408_stok_lot_no`, `20261013193110_stok_statu`, `20261014180000_stok_ara_alan`, `20261014193501_stok_konum_hurda`, `20261014204000_stok_konum_firma`.
Toplam 20 `_stok_` göçü.

### Parti tasarımı ve seçim gerekçesi

**Seçim: bakiye (malzeme, konum, parti) ekseninde tutulur; parti hareketlerde de taşınır.**
Yalnız hareket izinde tutmak çıkış anında "bu gözden hangi parti çıkıyor" sorusunu cevapsız bırakır: gözde iki parti varsa sistem ya sorar ya
tahmin eder. Tahmin yasak (karar 3), sormak için de gözdeki partileri bilmek gerekir. Bu bilgi ancak bakiye parti ekseninde tutulursa hareketleri
her seferinde toplamadan elde edilir. Bakiye ekseninde tutmak:

- sayımı parti bazında yapmayı,
- FIFO önerisini parti giriş zamanından kurmayı,
- üretim emrine çıkan partiyi kesin kaydetmeyi sağlar.

Bedeli, bakiye ile hareket defterinin ayrışma riskidir; bunu DEP-11 testi ölçer.

### İlk sürüm tabloları (11, ilk tasarım sütunlarıyla)

**`stok_raf`** (iki kişi düzenler: sürümlü)

| Sütun | Tip | Kısıt |
|---|---|---|
| id | int GENERATED ALWAYS AS IDENTITY | PK |
| kod | text NOT NULL | `stok_raf_kod_bicimi` CHECK (kod ~ '^[A-Z0-9]{1,3}$') |
| tur | text NOT NULL | `stok_raf_tur_degeri` CHECK (tur IN ('palet','celik','konsol','zemin')) |
| numaralama | text NOT NULL | `stok_raf_numaralama_degeri` CHECK (numaralama IN ('sirali','tek','cift')) |
| ilk_bolme | int NOT NULL DEFAULT 1 | `stok_raf_ilk_bolme_pozitif` CHECK (ilk_bolme > 0) |
| bolme_sayisi | int NOT NULL | `stok_raf_bolme_araligi` CHECK (bolme_sayisi BETWEEN 1 AND 80) |
| kat_sayisi | int NOT NULL | `stok_raf_kat_araligi` CHECK (kat_sayisi BETWEEN 1 AND 10) |
| bolme_genislik_m, derinlik_m, kat_araligi_m | numeric(5,2) NOT NULL | `stok_raf_olcu_pozitif` CHECK (üçü > 0) |
| x_m, z_m | numeric(7,2) NOT NULL DEFAULT 0 | 2D yerleşim S'de yazar |
| aci | smallint NOT NULL DEFAULT 0 | `stok_raf_aci_degeri` CHECK (aci IN (0,90,180,270)) |
| on_yuz_ters | boolean NOT NULL DEFAULT false | |
| aktif | boolean NOT NULL DEFAULT true | |
| surum | integer NOT NULL DEFAULT 1 | |
| | | `stok_raf_zemin_tek_kat` CHECK (tur <> 'zemin' OR kat_sayisi = 1) |

**`stok_depo`** (sürümlü; konum grubu ve Logo ambar karşılığı, K8)

| Sütun | Tip | Kısıt |
|---|---|---|
| id | int GENERATED ALWAYS AS IDENTITY | PK |
| kod | text NOT NULL | `stok_depo_kod_tek` UNIQUE; `stok_depo_kod_bicimi` CHECK (kod ~ '^[A-Z0-9]{1,10}$') |
| ad | text NOT NULL | `stok_depo_ad_bicimi` CHECK (btrim(ad) <> '' AND length(ad) <= 60) |
| logo_ambar_no | int | `stok_depo_logo_ambar_eksi_degil` CHECK (NULL ya da >= 0); `stok_depo_logo_ambar_tek` UNIQUE (logo_ambar_no) |
| aktif | boolean NOT NULL DEFAULT true | |
| surum | integer NOT NULL DEFAULT 1 | |

Göç tek depo açar (`ANA`, Logo ambar no boş); sistemin sabitidir. Başka depolar ekrandan açılır.

**`stok_konum`** (sürümlü). Raf gözleri raf açılınca ve düzenlenince satır olarak açılır; kod gözün adresidir.

| Sütun | Tip | Kısıt |
|---|---|---|
| id | int GENERATED ALWAYS AS IDENTITY | PK |
| kod | text NOT NULL | `stok_konum_kod_tek` UNIQUE; `stok_konum_kod_bicimi` CHECK (kod ~ '^[A-Z0-9-]{2,20}$') |
| tur | text NOT NULL | `stok_konum_tur_degeri` CHECK (tur IN ('raf_gozu','kabul','uretim_cikisi','depo_zemini','fason','istasyon','ara_alan','hurda','yolda')) (DOĞRULANDI `20261014204000_stok_konum_firma.sql`) |
| depo_id | int NOT NULL | REFERENCES stok_depo (Logo ambarı konumun deposundan okunur) |
| raf_id | int | REFERENCES stok_raf |
| bolme_no, kat_no | int | `stok_konum_raf_sayilari_pozitif` CHECK (bolme_no > 0 AND kat_no > 0) |
| firma_id | int | REFERENCES musteri_tedarikci_firma; `stok_konum_firma_turu` CHECK (`yolda` ⇔ firma dolu; firma yalnız `fason` ve `yolda`), `stok_konum_firma_tek` UNIQUE (firma_id, tur) |
| atolye_goz_id, atolye_alan_id, istasyon_id | int | atölye göz ve alanına, istasyona yabancı anahtar (`stok_konum_atolye_goz_bagi`, `stok_konum_atolye_alan_bagi`) |
| ad | text | `stok_konum_ad_bicimi` CHECK (ad IS NULL OR (btrim(ad) <> '' AND length(ad) <= 60)) |
| son_sayim | timestamptz | |
| aktif | boolean NOT NULL DEFAULT true | `stok_konum_kimlik_aktif` UNIQUE (id, aktif) (bakiye FK'sı için) |
| surum | integer NOT NULL DEFAULT 1 | |
| | | `stok_konum_tur_alanlari` CHECK göçlerle yenilendi; ilk tasarım metni geçersizdir, güncel ifade göçlerdedir (`sunucu/gocler/*_stok_*.sql`) |
| | | `stok_konum_raf_gozu_tek` UNIQUE (raf_id, bolme_no, kat_no) |
| | | `stok_konum_atolye_goz_tek` UNIQUE (atolye_goz_id), `stok_konum_atolye_alan_tek` UNIQUE (atolye_alan_id) |

**`stok_parti`** (yalnız ekleme; düzeltme yeni parti değil, sonraki sürüm konusu)

| Sütun | Tip | Kısıt |
|---|---|---|
| id | bigint GENERATED ALWAYS AS IDENTITY | PK; `stok_parti_kimlik_malzeme` UNIQUE (id, malzeme_id) (bakiye FK'sı için) |
| malzeme_id | integer NOT NULL | REFERENCES `malzeme_katalog_karti (no)` |
| tedarikci_parti_no | text | `stok_parti_no_bicimi` CHECK (NULL ya da 1..40 karakter, boş değil) |
| dokum_no | text | `stok_parti_dokum_bicimi` CHECK (aynı) |
| sertifika_no | text | `stok_parti_sertifika_bicimi` CHECK (aynı) |
| tedarikci_firma_id | int | Kodda yok: göçlerde bu sütun açılmadı (DOĞRULANDI `grep tedarikci_firma sunucu/gocler/*stok*.sql` boş) |
| uretim_emri_id | int | REFERENCES uretim_emri; `stok_parti_emir_tek` UNIQUE (malzeme_id, uretim_emri_id) (bir emirden bir malzeme için tek parti) |
| kayit_zamani | timestamptz NOT NULL DEFAULT now() | |
| acan_kisi_id | int NOT NULL | REFERENCES kisi |
| | | `stok_parti_tanimli` CHECK (uretim_emri_id IS NOT NULL OR tedarikci_parti_no IS NOT NULL OR dokum_no IS NOT NULL) |
| | | `stok_parti_kaynak_tek` CHECK (uretim_emri_id IS NULL OR (tedarikci_parti_no IS NULL AND dokum_no IS NULL)) (üretim partisi tedarikçi alanı taşımaz) |
| | | `stok_parti_tek` UNIQUE NULLS NOT DISTINCT (malzeme_id, tedarikci_parti_no, dokum_no) |

**`stok_bakiye`** (servis yazar; doğrudan düzenlenmez, sürümsüz; satır kilidiyle güncellenir)

| Sütun | Tip | Kısıt |
|---|---|---|
| id | bigint GENERATED ALWAYS AS IDENTITY | PK |
| malzeme_id | integer NOT NULL | REFERENCES `malzeme_katalog_karti (no)` |
| konum_id | int NOT NULL | REFERENCES stok_konum ON DELETE RESTRICT |
| konum_aktif | boolean NOT NULL DEFAULT true | `stok_bakiye_konum_aktif_sabit` CHECK (konum_aktif); `stok_bakiye_aktif_konumda` FOREIGN KEY (konum_id, konum_aktif) REFERENCES stok_konum (id, aktif) ON UPDATE RESTRICT: bakiyesi olan konumun `aktif` değeri false yapılamaz, eşzamanlı mal kabul ile pasife alma yarışında da |
| parti_id | bigint | `stok_bakiye_parti_malzemesi` FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id) |
| miktar | numeric(14,3) NOT NULL | `stok_bakiye_sifir_degil` CHECK (miktar <> 0) (eksi serbest, karar 1) |
| ilk_giris | timestamptz NOT NULL | FIFO anahtarı |
| ambalaj_tur | text | `stok_bakiye_ambalaj_turu` CHECK (NULL ya da 'kasa','koli','palet','bidon','makara') |
| ambalaj_olcu | text | `stok_bakiye_ambalaj_olcusu` CHECK (NULL ya da '^[a-z0-9]{1,8}$'; 'ozel' dahil) |
| ambalaj_uzunluk_cm, ambalaj_genislik_cm, ambalaj_yukseklik_cm | numeric(6,1) | `stok_bakiye_ozel_olcu` CHECK (ambalaj_olcu = 'ozel' ⇔ üçü dolu ve > 0) |
| ambalaj_adet | int | `stok_bakiye_ambalaj_adedi` CHECK (NULL ya da > 0) |
| | | `stok_bakiye_tek` UNIQUE NULLS NOT DISTINCT (malzeme_id, konum_id, parti_id) |
| | | `stok_bakiye_ambalaj_tutarli` CHECK ((ambalaj_tur IS NULL) = (ambalaj_olcu IS NULL)) |

**`stok_mal_kabul`** (belge; açılışta tamamlanır ve değişmez; Logo alanları satırdadır)

| Sütun | Tip | Kısıt |
|---|---|---|
| id | int GENERATED ALWAYS AS IDENTITY | PK |
| no | text NOT NULL | `stok_mal_kabul_no_tek` UNIQUE; numara `stok.mal-kabul-no` ayarından gelir, hesaplanmış sütun değildir (`20261012165154_stok_numara_kurallari.sql` ifadeyi düşürdü) |
| tur | text NOT NULL | `stok_mal_kabul_tur_degeri` CHECK (tur IN ('satin_alma','iade','diger')) (fasondan dönüş mal kabul değildir: konumlar arası taşımadır) |
| irsaliye_no | text | `stok_mal_kabul_irsaliye_bicimi` CHECK (NULL ya da 1..30, boş değil) (tedarikçinin belge numarası; dış belge olduğu için metin) |
| tedarikci_firma_id | int | Kodda yok: göçlerde bu sütun açılmadı (DOĞRULANDI `grep tedarikci_firma sunucu/gocler/*stok*.sql` boş) |
| zaman | timestamptz NOT NULL DEFAULT now() | |
| kisi_id | int NOT NULL | REFERENCES kisi (teslim alan depocu) |

**`stok_mal_kabul_satiri`**

| Sütun | Tip | Kısıt |
|---|---|---|
| id | bigint GENERATED ALWAYS AS IDENTITY | PK |
| mal_kabul_id | int NOT NULL | REFERENCES stok_mal_kabul |
| sira | smallint NOT NULL | `stok_mal_kabul_satiri_sira_tek` UNIQUE (mal_kabul_id, sira) |
| malzeme_id | integer NOT NULL | REFERENCES `malzeme_katalog_karti (no)` |
| sayilan_miktar | numeric(14,3) NOT NULL | `stok_mal_kabul_satiri_miktar_pozitif` CHECK (> 0) |
| parti_id | bigint | FK (parti_id, malzeme_id) → stok_parti; zorunluluk türe göre (DEP-20) |
| konum_id | int NOT NULL | REFERENCES stok_konum |
| hareket_id | bigint NOT NULL | REFERENCES stok_hareketi; `stok_mal_kabul_satiri_hareket_tek` UNIQUE |
| satin_alma_siparis_satiri_id | bigint | S: satın alma gelince **yeni göçle** yalnız yabancı anahtar olarak eklenir; ilk sürüm göçünde sütun yok |
| logo_irsaliye_satir_no | bigint | `stok_mal_kabul_satiri_logo_no_pozitif` CHECK (NULL ya da > 0) (Logo irsaliye satırı kayıt numarası) |
| logo_irsaliye_miktari | numeric(14,3) | (eşlemede Logo'dan okunan miktar) |
| logo_durumu | text NOT NULL DEFAULT 'irsaliye_bekleniyor' | `stok_mal_kabul_satiri_logo_durumu` CHECK (IN ('irsaliye_bekleniyor','eslesti','fark_var')) |
| | | `stok_mal_kabul_satiri_logo_tutarli` CHECK ((logo_durumu = 'irsaliye_bekleniyor') = (logo_irsaliye_satir_no IS NULL) AND (logo_durumu = 'irsaliye_bekleniyor' OR logo_irsaliye_miktari IS NOT NULL) AND (logo_durumu <> 'eslesti' OR logo_irsaliye_miktari = sayilan_miktar) AND (logo_durumu <> 'fark_var' OR logo_irsaliye_miktari <> sayilan_miktar)) |
| | | dizin: (logo_durumu, id) WHERE logo_durumu <> 'eslesti' |

**`stok_hareketi_logo`** (K8; defter yalnız eklendiği için Logo alanları yan tabloda, hareket başına bir satır, durumu değişir)

| Sütun | Tip | Kısıt |
|---|---|---|
| hareket_id | bigint | PK, REFERENCES stok_hareketi |
| logo_kayit_no | bigint | `stok_hareketi_logo_kayit_no_pozitif` CHECK (NULL ya da > 0) |
| logo_gonderim_durumu | text | `stok_hareketi_logo_durum_degeri` CHECK (NULL ya da IN ('bekliyor','gonderildi','hata')) |
| logo_iletisi | text | `stok_hareketi_logo_ileti_bicimi` CHECK (NULL ya da 1..500) (hata metni) |
| guncelleme | timestamptz NOT NULL DEFAULT now() | |
| | | `stok_hareketi_logo_gonderildi_nolu` CHECK (logo_gonderim_durumu <> 'gonderildi' OR logo_kayit_no IS NOT NULL) |
| | | dizin: (logo_gonderim_durumu, hareket_id) WHERE logo_gonderim_durumu IS DISTINCT FROM 'gonderildi' |

**`stok_hareketi`** (defter, yalnız ekleme)

| Sütun | Tip | Kısıt |
|---|---|---|
| id | bigint GENERATED ALWAYS AS IDENTITY | PK |
| zaman | timestamptz NOT NULL DEFAULT now() | |
| tur | text NOT NULL | `stok_hareketi_tur_degeri` CHECK (IN ('giris','cikis','transfer','sayim_fazla','sayim_eksik','geri_alma')) |
| malzeme_id | integer NOT NULL | REFERENCES `malzeme_katalog_karti (no)` |
| parti_id | bigint | `stok_hareketi_parti_malzemesi` FK (parti_id, malzeme_id) → stok_parti |
| parti_secimi | text | `stok_hareketi_parti_secimi` CHECK (parti_id IS NULL ⇔ parti_secimi IS NULL; değer IN ('kisi','tek_parti','en_eski')) |
| kaynak_konum_id | int | REFERENCES stok_konum |
| hedef_konum_id | int | REFERENCES stok_konum |
| miktar | numeric(14,3) NOT NULL | `stok_hareketi_miktar_pozitif` CHECK (miktar > 0) (yön konumlardan) |
| onayli_eksi | boolean NOT NULL DEFAULT false | `stok_hareketi_eksi_yalniz_dusumde` CHECK (NOT onayli_eksi OR tur IN ('cikis','transfer')) |
| eksi_onay_kaynagi | text | `stok_hareketi_eksi_onay_kaynagi` CHECK (onayli_eksi = (eksi_onay_kaynagi IS NOT NULL) AND (eksi_onay_kaynagi IS NULL OR eksi_onay_kaynagi IN ('kisi','dis_cagri')) AND (eksi_onay_kaynagi <> 'dis_cagri' OR dis_cagri_id IS NOT NULL)) |
| cikis_nedeni | text | `stok_hareketi_cikis_nedeni` CHECK (tur = 'cikis' ⇔ dolu; IN ('uretime_sarf','sevk','fire','numune','diger')) |
| uretim_emri_id | int | REFERENCES uretim_emri |
| dis_cagri_id | bigint | REFERENCES stok_dis_cagri; **S göçüyle eklenir** (sütun eklemek defterde veri taşımaz) |
| giris_kaynagi | text | `stok_hareketi_giris_kaynagi` CHECK (tur = 'giris' ⇔ dolu; IN ('mal_kabul','uretim')) |
| geri_alinan_id | bigint | REFERENCES stok_hareketi; `stok_hareketi_tek_geri_alma` UNIQUE (geri_alinan_id) |
| kisi_id | int NOT NULL | REFERENCES kisi |
| aciklama | text | `stok_hareketi_aciklama_bicimi` CHECK (NULL ya da 1..200) |
| | | `stok_hareketi_yon` CHECK: giris ve sayim_fazla yalnız hedef; cikis ve sayim_eksik yalnız kaynak; transfer ikisi dolu ve farklı; geri_alma ⇔ geri_alinan_id dolu |
| | | `stok_hareketi_sarf_emirli` CHECK (cikis_nedeni <> 'uretime_sarf' OR uretim_emri_id IS NOT NULL) |
| | | `stok_hareketi_uretim_girisi_emirli` CHECK (giris_kaynagi <> 'uretim' OR uretim_emri_id IS NOT NULL) |
| | | dizinler: (malzeme_id, id), (parti_id, id), (uretim_emri_id) WHERE NOT NULL, (zaman) |

**`stok_malzeme_ayari`** (sürümlü)

| Sütun | Tip | Kısıt |
|---|---|---|
| malzeme_id | integer | PK, REFERENCES `malzeme_katalog_karti (no)` |
| kritik_seviye | numeric(14,3) | `stok_malzeme_ayari_kritik_eksi_degil` CHECK (NULL ya da >= 0) |
| varsayilan_ambalaj_tur, varsayilan_ambalaj_olcu | text | `stok_malzeme_ayari_ambalaj_tutarli` CHECK (ikisi birlikte) |
| surum | integer NOT NULL DEFAULT 1 | |

**`stok_malzeme_ambalaji`** (alt tablo; ana satırın sürümünü artırarak yeniden yazılır)

| Sütun | Tip | Kısıt |
|---|---|---|
| malzeme_id | integer NOT NULL | REFERENCES stok_malzeme_ayari |
| ambalaj_tur | text NOT NULL | `stok_malzeme_ambalaji_tur` CHECK (IN ('kasa','koli','palet','bidon','makara')) |
| ambalaj_olcu | text NOT NULL | |
| ici_miktar | numeric(14,3) NOT NULL | `stok_malzeme_ambalaji_ici_pozitif` CHECK (> 0) |
| | | PK (malzeme_id, ambalaj_tur, ambalaj_olcu) |

**Sabit konumlar:** göç `ANA` deposunda iki satır açar: `KABUL` (tür `kabul`, mal kabulün varsayılanı) ve `URETIM` (tür `uretim_cikisi`, üretim girişinin varsayılanı). Sistemin sabitleridir, gerçek veri değildir.

**Dizinler (İ; şema değişikliği, onaya dahil):** `stok_hareketi` (zaman, id), (malzeme_id, id), (parti_id, id), (kaynak_konum_id, id), (hedef_konum_id, id),
(uretim_emri_id, id) WHERE uretim_emri_id IS NOT NULL, (dis_cagri_id) WHERE NOT NULL · `stok_bakiye` (konum_id), (parti_id) WHERE NOT NULL; (malzeme_id, ...) tekil kısıttan gelir ·
`stok_parti` (kayit_zamani, id), (malzeme_id, id) · `stok_konum` (tur, kod) — `kod` tekil kısıtı `kod` sıralamasını karşılar · `stok_raf` küçük tanım tablosu: dizin yok.

### Kısıt → ileti eşlemesi (`kisitKorumali`)

| Kısıt | Kod | İleti |
|---|---|---|
| `stok_konum_kod_tek` | 409 CAKISMA | Bu konum kodu kullanılıyor. |
| `stok_konum_raf_gozu_tek` | 409 CAKISMA | Bu rafta bu bölme ve kat zaten var. |
| `stok_bakiye_aktif_konumda` | 409 BAGIMLI_KAYIT | Bu konumda stok var; önce stoğu taşıyın. |
| `stok_bakiye` FK (konum silme) | 409 BAGIMLI_KAYIT | Stoklu göz kaldırılamaz; önce stoğu taşıyın. |
| `stok_parti_tanimli` | 422 GECERSIZ (alan: `parti`) | Parti için tedarikçi parti no ya da döküm no gerekli. |
| `stok_parti_tek` | — (servis var olan partiyi kullanır; eşzamanlı açılışta 409 CAKISMA: "Bu parti az önce açıldı; yeniden deneyin.") | |
| `stok_bakiye_parti_malzemesi`, `stok_hareketi_parti_malzemesi`, `stok_mal_kabul_satiri_parti_malzemesi` | 409 BAGIMLI_KAYIT (yabancı anahtar; alan: `partiId`) | Parti bu malzemeye ait değil. |
| `stok_hareketi_tek_geri_alma` | 409 CAKISMA | Bu hareket zaten geri alındı. |
| `stok_dis_cagri_tek` | — (servis ilk çağrının sonucunu döner; çatışma iletisi dışarı çıkmaz) | |
| `stok_hareketi_sarf_emirli` | 422 GECERSIZ (alan: `uretimEmriId`) | Üretime sarf için üretim emri seçin. |
| Başka modülün kısıtı | yedek `{ BAGIMLI_KAYIT }` | Bu kayıt kullanımda. |

### Kodda olmayan tablolar

`stok_dis_cagri` ve `stok_dis_cagri_satiri` (başka modülden gelen çağrının tekilliği) yazılmadı; dış çağrı komutları (`stokGirisi`, `stokCikisi`, `stokCagrisiniGeriAl`) ve DEP-30…32 de yoktur.
`stok_yerlesim` yerine `stok_depo_yerlesimi` vardır (`stok_kare_adi` borç #441 ile kaldırıldı). Sepet, fiş ve toplama tabloları "Güncel tablolar"dadır;
fason kutusu ve üretim alanı ayrı tablo değildir, `stok_konum` satırlarıdır (`firma_id`, `atolye_alan_id`, `istasyon_id`).

---

## İş kuralları (önek `DEP-`)

Sınama: **S** saf test (`kurallar.test.ts`), **V** veritabanı akış testi, **K** kısıt adıyla yakalanan ihlal testi.

| No | Kural | Sınama | Sürüm |
|---|---|---|---|
| DEP-01 | Bakiye malzeme, konum ve parti başına tek satırdır; miktar sıfıra inince satır silinir. | K `stok_bakiye_tek`, `stok_bakiye_sifir_degil`; V | İ |
| DEP-02 | Kaynakta yeterli miktar yoksa çıkış ve taşıma, `eksiOnay` alanı olmadan `ONAY_GEREKLI` döner ve ayrıntıda "mevcut: X" verir; hiçbir şey yazılmaz. | V (red) + S (yeterlilik hesabı) | İ |
| DEP-03 | `eksiOnay: true` ile gelen yetersiz düşüm yazılır, hareket `onayli_eksi` işaretlenir; eksi bakiye listelerde ve iş kutusunda görünür. | V + K `stok_hareketi_eksi_yalniz_dusumde` | İ |
| DEP-04 | Kaynak yeterliyken gelen `eksiOnay` yok sayılır; hareket `onayli_eksi` olmaz. | V | İ |
| DEP-05 | Çıkış ekranı en eski girişli bakiye satırını önerir; depocu başka göz ya da parti seçebilir, seçimi `parti_secimi = 'kisi'` olarak yazılır. | S (öneri sıralaması) + V | İ |
| DEP-06 | İnsan seçmeden yapılan düşüm (başka modül çağrısı) en eski girişli satırdan başlar; birden çok satıra bölünebilir, her satır `parti_secimi = 'en_eski'` taşır. | S + V | İ |
| DEP-07 | Fason kutusu ve üretim alanı konumları öneriye ve otomatik düşüme kaynak olmaz. | S | İ (konum türleri S'de açılır) |
| DEP-08 | Kullanılabilir bakiye yoksa çıkış önerisi "veri yetersiz" döner; göz ya da miktar uydurulmaz. | V | İ |
| DEP-09 | Taşımada hedef satırın `ilk_giris` değeri iki satırın eskisidir; parti ve ambalaj taşınır. | S + V | İ |
| DEP-10 | Yalnız kullanılabilir malzeme kartına giriş yapılır (mal kabul ve üretim girişi). | V (`malzemeKullanilabilirMi`, imza aynı, okuduğu tablo YZ-1) | İ |
| DEP-11 | Her (malzeme, konum, parti) için bakiye, o eksendeki hareketlerin işaretli toplamına eşittir. | V: rastgele hareket dizisi sonrası eşitlik sorgusu | İ |
| DEP-12 | Bakiye ve hareket konuma kimlikle bağlıdır; raf ya da konum kodu değişince bakiye taşınmaz, yalnız kod değişir. | V | İ |
| DEP-13 | Bakiyesi olan konum kapatılamaz ve gözü düşüren raf düzenlemesi reddedilir. | K `stok_bakiye_aktif_konumda` (eşzamanlı mal kabul + pasife alma testiyle) ve FK RESTRICT | İ |
| DEP-14 | Raf gözü adresi Kod-Bölme-Kat biçimindedir; aynı adres iki konumda olamaz. | K `stok_konum_kod_tek`; S (adres üretimi) | İ |
| DEP-15 | Dolu olup `stok.sayim-suresi` günden uzun sayılmamış raf gözü "sayım bekleyen"dir; ayar yoksa kural çalışmaz ve iş kutusu bunu söyler. | S + V | İ (önkoşul) |
| DEP-16 | Sayım, satırdaki `beklenenMiktar` güncel bakiyeden farklıysa 409 döner; fark `sayim_fazla` ya da `sayim_eksik` hareketiyle yazılır, konum `son_sayim` alır. | V | İ |
| DEP-17 | Hareket silinmez ve değişmez; geri alma ters yönde yeni hareket yazar. | K `yalniz_ekleme` tetikleyicisi + V | İ |
| DEP-18 | Bir hareket bir kez geri alınır; geri alma hareketi geri alınmaz. | K `stok_hareketi_tek_geri_alma` + V | İ |
| DEP-19 | Elle geri alma yalnız `dis_cagri_id` taşımayan harekette yapılır; otomatik hareket ancak çağıranın geri almasıyla döner. | V | İ |
| DEP-20 | Parti zorunluluğu karttaki türe göredir: **hammadde** mal kabulde zorunlu (tedarikçi parti no ya da döküm no); **yarı mamul ve mamul** zorunlu (üretim girişinde emir partisi kendiliğinden açılır, mal kabulde tedarikçi parti no istenir); **sarf** isteğe bağlı (K4); **demirbaş** parti almaz (DEP-49). Tür `malzemeOzeti`'nden okunur. | S (`partiGereksinimi`, `partiDenetimi`) + V (hammaddede partisiz 400, demirbaşta partili 400, sarfta partisiz 200) + K `stok_parti_tanimli` | İ |
| DEP-21 | Aynı malzemede aynı parti no ve döküm no ikinci kez parti açmaz; var olan parti kullanılır. | K `stok_parti_tek` + V | İ |
| DEP-22 | Parti, malzemesinden başka malzemenin bakiyesine ya da hareketine bağlanamaz. | K `stok_bakiye_parti_malzemesi`, `stok_hareketi_parti_malzemesi` | İ |
| DEP-23 | Gözde tek parti varsa çıkış o partiyi yazar (`tek_parti`); birden çok parti varsa insan seçer, seçmeden komut 400 döner. | S + V | İ |
| DEP-24 | Partisi bilinmeyen stok `parti_id NULL` ile durur ve "parti bilinmiyor" görünür; sistem parti atamaz, izlenebilirlik raporu bunu "bilinmiyor" diye yazar. | V | İ |
| DEP-25 | Üretime sarf çıkışı üretim emri taşır; parti izi, partiden emre ve emirden partiye iki yönde okunur. | K `stok_hareketi_sarf_emirli` + V | İ |
| DEP-26 | Sertifika dosyası eklenmez; yalnız sertifika numarası tutulur. | — (önkoşul: dosya saklama) | İ |
| DEP-27 | Ambalaj türü ve ölçüsü bakiye satırında durur; ambalaj adedi varsa miktarla orantılı azalır, kesir yukarı yuvarlanır. | S | İ |
| DEP-28 | Kritik seviye tanımlıysa toplam kullanılabilir bakiye bu değere inince malzeme "kritik" görünür; tanımsızsa "kritik seviye yok" görünür, sayı uydurulmaz. | S | İ |
| DEP-29 | İki kişinin düzenlediği kayıtta eski sürümle gelen komut 409 `eski-surum` alır (raf, konum, malzeme ayarı). | V (`surumluGuncelle`) | İ |
| DEP-30 | Dış çağrı satır listesi alır ve bütün satırları tek işlemde yazar; bir satır geçersizse hiçbiri yazılmaz. Aynı (kaynak türü, kaynak kimliği) ile ikinci çağrı satırları aynıysa yazmaz, ilk sonucu döner; farklıysa 409. | K `stok_dis_cagri_tek` + V (iki malzemeli çağrı ikisini de yazar; yinelenen çağrı yazmaz; farklı içerik 409) | S (K9) |
| DEP-31 | Otomatik hareket doğuran çağrının kimliğini (`dis_cagri_id`) taşır. | V | S (K9) |
| DEP-32 | Çağrının geri alınması tam o çağrının hareketlerini ters çevirir, başkasına dokunmaz; ikinci geri alma yazmaz. | V | S (K9) |
| DEP-33 | Dış çağrıyla gelen çıkışta stok yetmezse çağıran adına yazılır: hareket `onayli_eksi`, `eksi_onay_kaynagi = 'dis_cagri'`; dönüşte satır başına `onayliEksi` ve önceki `mevcut` vardır (K2). | V + K `stok_hareketi_eksi_onay_kaynagi` | S (K9) |
| DEP-34 | Mal kabulde önerilen göz: malzemenin bulunduğu göz; yoksa ambalaja uygun raf tipinde, kolay erişilen katta boş göz; ikisi de yoksa "veri yetersiz". | S | İ |
| DEP-35 | Başka modül tablosuna yalnız FK ve `disari.ts` ile bağlanılır. | `npm run sinir -- --modul stok` | İ |
| DEP-36 | Üretime sarf çıkışı, emrin iş merkezi kişinin kapsamı dışındaysa 403 alır (`kapsamDisiysaReddet`, bakiye kilidinden sonra, yeterlilik kuralından önce); depo konumları iş merkezi taşımaz, kapsamdadır; stok okumaları süzülmez. | V (kısıtlı kişiyle red ve kabul, gerçek giriş akışı) | İ |
| DEP-37 | Eksi bakiye iş kutusunda onay kaynağıyla görünür: elle onaylı (kişi) ve otomatik (doğuran üretim kaydı ya da rota düşümü) ayrı satırdır. | V | İ |
| DEP-38 | Mal kabul belge ve satır olarak tek işlemde yazılır; depo sayılan miktarı girer, her satır bir giriş hareketi doğurur (`giris_kaynagi = 'mal_kabul'`). Satın alınan malzemenin teslimi budur; aynı siparişin her teslimi ayrı belgedir. | V | İ |
| DEP-39 | Mal kabul satırı `irsaliye_bekleniyor` ile açılır. Logo irsaliye satırı eşlenince miktar aynıysa `eslesti`, farklıysa `fark_var` olur; fark iş kutusunda görünür. Durumu eşleme işi yazar (bağlantı kodu ayrı iş, K7). | K `stok_mal_kabul_satiri_logo_tutarli` + V (alanların durumla tutarlılığı) | İ (alanlar); eşleme ayrı iş |
| DEP-47 | Biten mamul ve yarı mamul üretim girişiyle stoğa girer: kaynak üretim emri, varsayılan konum `URETIM`, hareket `giris_kaynagi = 'uretim'` ve `uretim_emri_id` taşır. Otomatik kaynak (üretim kaydı) hazır olana kadar giriş elle yapılır (K9). | K `stok_hareketi_uretim_girisi_emirli` + V | İ (elle); otomatik S |
| DEP-48 | Üretim girişinin partisi üretim emridir: bir emir ve malzeme için tek parti açılır, aynı emrin sonraki girişleri o partiye yazar. İz, mamul partisinden emre, emirden o emre çıkan hammadde partilerine okunur. | K `stok_parti_emir_tek`, `stok_parti_kaynak_tek` + V | İ |
| DEP-49 | Demirbaş parti almaz; partili demirbaş girişi 422 döner. Seri no takibi kapsam dışıdır. | S + V | İ |
| DEP-50 | Logo'ya gidecek hareketler yalnız üretime sarf çıkışı ve üretim girişidir. Yan tablo satırı ilk gönderim denemesinde açılır; satırı olmayan ilgili hareket "gönderilmedi" demektir. `gonderildi` durumu Logo kayıt no olmadan yazılamaz. | K `stok_hareketi_logo_gonderildi_nolu` + V | İ (alanlar); gönderim ayrı iş |
| DEP-51 | Hareketin Logo ambarı konumun deposundan okunur; depo Logo ambar no taşımıyorsa gönderim "ambar karşılığı yok" ile durur, ambar uydurulmaz. | S | İ (alanlar) |
| DEP-52 | Otomatik sarf düşümünün ve otomatik mamul girişinin kaynağı TMI üretim kaydıdır; bugün üretim sayımı Arkon'un kendi kaydında olduğundan bu kaynak hazır değildir. Hazır olana kadar sarf **elle çıkışla** (`uretime_sarf` + üretim emri), mamul **elle üretim girişiyle** yapılır. | — (kapsam kuralı; ekran metninde de yazar) | İ |
| DEP-53 | Mal kabul belgesi değişmez. Yanlış sayımda müdür (`stok.geri-al`) belgeyi düzeltir: eski belgenin bütün hareketleri aynı işlemde ters çevrilir (stok yetmezse onaylı eksi ister), doğru satırlarla `duzeltilen_id` taşıyan yeni belge açılır. Belge bir kez düzeltilir (düzeltme belgesi ayrıca düzeltilebilir). Eski satırların Logo durumu değişmez; eşleme yeni belgenin satırlarıyla yapılır. Mal kabul hareketi tek başına geri alınmaz. | K `stok_mal_kabul_tek_duzeltme`, `stok_mal_kabul_degismez` + V | İ |
| DEP-40 | Teslim fişi tek işlemde uygulanır; bir satır karşılanamazsa hiçbiri uygulanmaz; fiş numarası tekil ve artandır. | V | S |
| DEP-41 | Sepetin "en eski" kaynağı teslim anında DEP-06 ile çözülür; kullanılabilir bakiye yoksa "veri yetersiz". | V | S |
| DEP-42 | Toplama rotası raf kodu sırasıyla ve koridorlarda yılan düzeniyle çıkar. | S | S |
| DEP-43 | Fason kutusuna giden malzeme stokta kalır, "fasonda" sayılır; kutu firma kimliğiyle açılır. | V | S (firmalar) |
| DEP-44 | Üretim alanı konumu atölye modülünün konum kimliğiyle açılır; adı oradan okunur. | V | S (atölye) |
| DEP-45 | Reçete bileşeni düşümü rota modülünün `stokCikisi` çağrısıyla gelir. | V | S (rota) |
| DEP-46 | 3B görünüm ve 2D yerleşim, raf geometrisinden üretilir; ekran sayı uydurmaz. | istemci testi | S (önkoşul) |

---

## Başkasına verilen (`sunucu/moduller/stok/disari.ts`)

Kaynak `npm run harita -- --modul stok` (DOĞRULANDI: 29 dışa açık ad, 25 imza; tipler dahil). Miktarlar numeric metindir (`db.ts`); veri yoksa haritada yok.

```ts
// Okuma
stokMiktarlari(db, malzemeIdler): Promise<Map<number, { toplam: string; kullanilabilir: string; uretimde: string }>>;
malzemeStokDurumlari(db, malzemeIdler): Promise<Map<number, { toplam: string; serbest: string; kritikSeviye: string | null; durum: StokDurumu }>>;
emrinPartileri(db, uretimEmriId): Promise<Array<{ partiId: number | null; malzemeId: number; lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; miktar: string }>>;
emrinAkisHareketleri(db, uretimEmriId): Promise<AkisHareketi[]>;
partiGirisZamanlari(db, partiIdler): Promise<Map<number, { lotNo: string; malKabulZamani: string | null }>>;
sonPartiler(db, malzemeId, sinir?): Promise<Array<{ partiId: number; lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null; kayitZamani: string; belgeler: ... }>>;
sonHareketler(db, sinir?): Promise<Hareket[]>;
konumAdlari(db, idler): Promise<Map<number, string>>; // kalıp: kisiAdlari
dusukStokSayisi(db): Promise<number>;
istasyondanTeslimEdilen(db, { uretimEmriId, istasyonId }): Promise<string | null>;
uretimGirdiUyarisi(db, g): Promise<string | null>;
// Malzeme isteği
malzemeIstegiAc(db, kullanici, girdi: MalzemeIstegiAcGirdisi): Promise<{ id: number; no: string; durum: MalzemeIstegiDurumu }>;
malzemeIstekleri(db, kaynakKimlikleri: string[]): Promise<Map<string, { id; no; durum; miktar: string; karsilanan: string | null; guncelleme: string }>>;
stokYokIstekleri(db, sinir?): Promise<Array<{ id; no; malzemeId; miktar: string; birim: string | null; uretimEmriId: number | null; istasyonId: number | null; acilma: string; guncelleme: string }>>;
// Olay yansıtıcıları (başka modülün olayı stoğa yazılır; çağıranın transaction'ında)
emirAcildiYansit(db, { uretimEmriId, kisiId, stoktanRezerve }); emirBirlestiYansit(db, { uretimEmriId, hedefEmirId, kisiId });
emirBittiYansit(db, { uretimEmriId, kisiId }); emirIptalYansit(db, { uretimEmriId, kisiId });
fasonSevkiYansit(db, olay); fasonHareketiYansit(db, olay); hurdaSayimiYansit(db, g); uretimSayimiYansit(db, g);
// Kayıt kancaları (başka modül çözücüsünü verir)
adimStatusuCozucusu(cozucu); adimCiktisiCozucusu(cozucu); statuListesiCozucusu(cozucu);
```

Kodda olmayanlar: `stokGirisi`, `stokCikisi`, `stokCagrisiniGeriAl`, `teslimAlinanlar`; `stokMiktarlari` cevabında `fasonda` alanı yoktur. İmza ayrıntısı için harita çıktısı esastır.

## Başkasından istenen

Stok bugün şu modüllere bağımlıdır (DOĞRULANDI: `npm run harita -- --modul stok`, "Bağımlı olduğu"): `atolye`, `ayarlar`, `cizimler`, `istasyonlar`, `kisiler`, `malzemeler`,
`musteri-tedarikci`, `satin-alma`, `sevkiyat`, `uretim-emirleri`. Hangi fonksiyonun çağrıldığı ve bekleyen istekler `BASKA-MODUL-ISTEKLERI.md` ve `UYUM-BORCU.md`'dedir;
bu dosyadaki önceki "durum" sütunu (modül yok, `disari.ts` yok) artık geçerli değildir. Kalan istekler tek tek doğrulanmadı: BİLMİYORUM.

## Örtüşme tablosu (paket tasarımı; bağımlılıkların bugünkü hâli "Başkasından istenen"de)

| Modül | Sahibi olduğu | Stok ondan alır | Stok ona verir | Sınır |
|---|---|---|---|---|
| malzemeler | yeni katalog kartı (K5), tür, birim, aktiflik, ERP kodu | ad, stok kodu, tür, birim, aktiflik (YZ-1) | yok (kart ekranı isterse `stokMiktarlari`) | Stok kart açmaz; "Malzeme kartı ekle" Malzeme Kartları'na gider |
| satın alma | sipariş, sipariş satırı | sipariş satırı kimliği (S) | `teslimAlinanlar` (S) | Teslimi **depo** TMI'da mal kabul belgesiyle, sayarak alır; parti o anda girilir (DEP-20, DEP-38). Satın alma stoğa yazmaz; aynı siparişin her teslimi ayrı belge |
| üretim emirleri | emir; üretim kaydı ve sayım (bugün Arkon'da, K9) | emir özeti, no, iş merkezi | `emrinPartileri` (İ); `stokCikisi`, `stokGirisi` (S, üretim kaydı kimliğiyle) | Sarf ve mamul girişi emre bağlanır; kaynak hazır olana kadar elle (DEP-52) |
| Arkon | operatör ekranı, üretim sayımı | yok (doğrudan bağ yok) | yok | Sayımın TMI üretim emrine yazılması ayrı iş; o gelince otomatik düşüm açılır |
| Logo | irsaliye, stok fişi, ambar | irsaliye satırı (eşleme işi) | üretime sarf ve üretim girişi fişleri (gönderim işi) | Stok yalnız alanları tutar; bağlantı kodu ayrı iş (Logo uyumu) |
| rota | reçete, bileşen | yok | `stokCikisi` (rota düşümü kimliğiyle) | Bileşen düşümü rota gelene kadar elle çıkışla yapılır |
| atölye | üretim salonu, istasyon yeri | konum kimliği ve adı | yok | Stok üretim alanı tanımlamaz; 3B parçasını ortak kullanır |
| firmalar | firma (tedarikçi, fason) | firma varlığı ve adı | yok | Fason kutusu ve tedarikçi firması firmalar gelene kadar kapalı |

## Logo uyumu

Bağlantı kodu bu modülde yazılmaz (K7, K8). Stok, eşleme ve gönderim işlerinin okuyup yazacağı alanları hazırlar; o işler ayrı karttır.

| Yön | Logo nesnesi | TMI alanı | Durum değerleri | Yazan | Kural |
|---|---|---|---|---|---|
| Logo → TMI | Mal kabul irsaliyesi satırı | `stok_mal_kabul_satiri.logo_irsaliye_satir_no` (bigint, boş olabilir), `logo_irsaliye_miktari` | `irsaliye_bekleniyor`, `eslesti`, `fark_var` | eşleme işi | DEP-39 |
| TMI → Logo | Üretime sarf (tüketim fişi) | `stok_hareketi_logo` (`logo_kayit_no`, `logo_gonderim_durumu`, `logo_iletisi`) | `bekliyor`, `gonderildi`, `hata` (boş: henüz denenmedi) | gönderim işi | DEP-50 |
| TMI → Logo | Biten mamul girişi (üretimden giriş fişi) | aynı yan tablo | aynı | gönderim işi | DEP-50 |
| Eşleme | Ambar | `stok_depo.logo_ambar_no` (boş olabilir) | — | depo tanımı ekranı | DEP-51 |
| Eşleme | Malzeme | kartın ERP kodu (`malzemeOzeti.erpKodu`, DOĞRULANDI 0e72bae; yeni kartta YZ-1) | — | Malzeme Kartları | — |

Kapsam dışı: birim dönüşümü (Logo birimi ile TMI stok birimi farklıysa), fiyat ve maliyet, iade irsaliyeleri. Gönderim ve eşleme işi bunları kendi kartında çözer.
İş kutusu bugünden iki satır gösterir: `fark_var` mal kabul satırları ve `hata` durumundaki gönderimler (veri yoksa satır yok).

## Çekirdek istekleri

1. **İkinci menü: yalnız kabukta eksik kalırsa** (K6; menüyü kabuk çizer, modül veri bildirir, parça istenmez). YZ-2 ile yeni zip'te bakılacaklar; olmayan istenir:
   (a) ana menünün 1280'de yalnız ikinci menüsü olan modülde şeride dönmesi (K1); (b) madde yanında sayaç (iş kutusu, mal kabulde fark sayısı); (c) telefonda ikinci menünün yeri.
2. **Ortak 3B parçası** (`istemci/src/ortak/uc-boyut/`): sahne, ışık, yalnız gerektiğinde çizim, yörünge ve yürüme kamerası, seçme (raycast), örnekli ve birleştirilmiş geometri yardımcıları, gizli yüz ayıklama.
   Modül yalnız "ne çizileceğini" verir (raf, göz, yük listesi); stok depoyu, atölye üretim salonunu bununla çizer. three bağımlılığına bağlı.
3. **Sistem Ayarları sayı türü**: `TurDegerleri`'ne `sayi` (alt ve üst sınırlı).
4. **Simge**: `cart` (sepet) ve `pallet`. 0e72bae'de `chev-*`, `first`, `last`, `sort` geldi, bu ikisi yok. Ortak sete eklenen simge yöneticinin seçim listesine düşer ve modülün ad tablosuna ad ister (DOĞRULANDI `istemci/src/ortak/NOTLAR.md`); gelene kadar en yakın simge kullanılır ve NOTLAR'a yazılır.

## Önkoşullar

| Önkoşul | Bugün |
|---|---|
| Sistem Ayarları sayı türü | Gerekmedi: ayarlar yalnız `numara` türündedir; sayım süresi ve kare boyu deponun yerleşiminde tutulur (DOĞRULANDI `paylasilan/ayarlar/stok.ts`, `stok_depo_yerlesimi`) |
| three, jsqr, qrcode-generator | Kök `package.json`'da var (three 0.186.1, jsqr 1.4.0, qrcode-generator 1.4.4; DOĞRULANDI). `GET /stok/depo-3b` kaldırıldığı için three'nin stok ekranlarında hâlâ kullanılıp kullanılmadığı BİLMİYORUM |
| Malzeme kartı (YZ-1) | Uygulandı: bütün `malzeme_id` sütunları `malzeme_katalog_karti`ye bağlıdır (DOĞRULANDI harita sütunları) |
| İkinci menü verisi (YZ-2) | Uygulandı: `STOK_IKINCI_MENU` |
| uretim-emirleri `disari.ts` | Var (DOĞRULANDI `sunucu/moduller/uretim-emirleri/disari.ts`, `emirOzeti`, `emirDurumlari`); DEP-36 kodda |
| satın alma | Bağımlı modül; `stok_mal_kabul_satiri.siparis_satir_id` yabancı anahtar taşır (DOĞRULANDI harita) |
| firmalar (`musteri-tedarikci`) | Bağımlı modül; `stok_konum.firma_id` yabancı anahtar taşır (DOĞRULANDI harita) |
| atölye | Bağımlı modül; `stok_konum.atolye_goz_id`, `atolye_alan_id`, `stok_depo.atolye_salon_id` (DOĞRULANDI harita) |
| Arkon sayımı, Logo bağlantısı, rota, dosya saklama | Bu dosyadan doğrulanmadı: BİLMİYORUM |

---

## Güncel sayılar

| Ölçü | Bugün |
|---|---|
| Uç | 98 (GET 53, POST 45) |
| İşlem | 9 (`stok.istek` dahil) |
| Tablo | 25; 21 göç |
| Ayar | 6 numara kalıbı |
| İkinci menü | 11 madde, 4 grup |
| `disari.ts` | 29 dışa açık ad, 25 imza |
| Kural | 63 DEP kuralı: DEP-01…DEP-53 aşağıdaki tabloda, DEP-54…DEP-63 `KURAL-TEST.md`'de (kural ve testiyle); DEP-31…33, DEP-43…46 sonraki adım, koda girmedi |

İlk sürüm ve "sonraki sürüm" (İ ve S) işaretleri paketin ilk planıdır; kodun güncel durumu "Güncel durum (kod)" bölümündedir.

## Varsayımlar (geri alma maliyetiyle)

| Varsayım | Geri alma maliyeti |
|---|---|
| Uç yolları `/stok/` önekli | Düşük: sözleşme ve istemci yolları |
| Bakiye tablosu tutulur (yalnız defter değil) | Orta: göç + servis; DEP-11 riski ölçer |
| Kabul alanı tek konum (`KABUL`) | Düşük: yeni kabul konumları satır eklemekle açılır |
| Sayımda eşzamanlılık `beklenenMiktar` ile, konum sürümüyle değil | Düşük |
| Ambalaj ilk sürümde kayıt olarak var (3B'de kullanımı S) | Düşük |
| Hareket listesinde süzgeçsiz istekte sayım yapılmaz (`toplam: null`) | Düşük: `say` vermek tek satır |
| Stok okumaları kapsamla süzülmez; yalnız üretime sarf yazması denetlenir | Orta: süzme sonradan bütün liste sorgularına parametre ekler |
| Bakiyeli konum koruması bileşik yabancı anahtarla (`konum_aktif` sabit sütunu) | Düşük: tetikleyiciyle değiştirilebilir |
| Parti yalnız ekleme; yanlış parti düzeltmesi S konusu | Orta: düzeltme akışı sonradan tablo ister |
| Dış çağrı tekilliği çağrı düzeyinde, içerik satır tablosunda (satır düzeyine indirmek yerine) | Orta: S göçü; çağrı imzası |
| Mal kabul belgesi açılışta tamamlanır (taslak belge yok) | Düşük: durum sütunu eklenir |
| Mamul ve yarı mamul mal kabulde tedarikçi parti no ister | Düşük: kural tablosunda tek hücre |
| Demirbaş parti almaz, seri no takibi yok | Orta: seri no gerekirse yeni tablo |
| Göç tek depo (`ANA`) ve iki sabit konum açar | Düşük |
| Logo ambarı depo düzeyinde (konum düzeyinde değil) | Düşük: konuma sütun eklenir |
| PostgreSQL 15+ | Düşük: kısmi tekil dizinlerle değiştirilir |

---

## Açık sorular

Yok. Dört soru kullanıcı kararlarıyla kapandı (K1–K4, en üstte).
