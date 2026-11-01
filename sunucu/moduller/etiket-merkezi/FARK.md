# FARK: etiket-merkezi (yeni modül)

Kurgu: /mnt/project-files/arastirma/etiket-merkezi/2026-10-18-etiket-merkezi-kurgusu.md (proje klasörü, depoda değil). Dayanak: kullanıcı isteği 18.10.2026, 96 b (dondurma istisnası), 98 evet (doğrudan baskı), 99 evet (roller).

1. PR (#1697):
- Sunucu: hazır etiket şablonları (konum, malzeme, lot, refakat kartı, istasyon, yazıcı denemesi), yerleşim (mm -> satır ve QR matrisi),
  Zebra ZPL ve Argox PPLB komut üreticileri, iki okuma ucu (`GET /etiket-merkezi/sablonlar`, `GET /etiket-merkezi/sablonlar/:anahtar/cikti`).
- İstemci: "Etiket Merkezi" sayfası, ikinci menü (Hazır şablonlar, Yazıcı denemesi), gerçek ölçülü önizleme, komut dosyası indirme.

2. PR:
- Göç `20261018201804_etiket_merkezi_yazici`: iki boş yeni tablo (`etiket_merkezi_yazici`, yalnız eklenen `etiket_merkezi_baski`). Dolu tabloya dokunmaz.
- İşlemler `etiket-merkezi.oku`, `.bas`, `.yazici-yaz`, `.sablon-yaz` (son ikisi şablon tasarımıyla kullanılacak); ayar `etiket-merkezi.dogrudan-baski` (varsayılan kapalı).
- Uçlar: yazıcı listesi, aç, güncelle (sürümlü); `POST /etiket-merkezi/sablonlar/:anahtar/bas` (tekrar korumalı); `GET /etiket-merkezi/baskilar`.
- Doğrudan baskı: yalnız bu modül, yalnız `TMIV2_ETIKET_YAZICI_AGI` aralığındaki tek IP, yalnız TCP 9100, tek yönlü; ayar ve değişken olmadan kapalı. Şimdilik yalnız deneme şablonu.
- İstemci: Yazıcılar ve Baskı geçmişi sayfaları (ikinci menü), deneme sayfasında "Yazıcıya gönder".
- Rol satırları (99 evet) bu PR'da yoktu; kişiler göçleriyle girdi (#1726, #1738, vardiya sorumlusu #1743).

3. PR (94 a):
- Seçili konumların etiketi: `GET /etiket-merkezi/sablonlar/:anahtar/kayit-cikti?tur=konum&id=…` (`etiket-merkezi.oku`); baskı gövdesinde `kayit`.
  Konum kodu stok `konumAdlari` ile okunur; stoğa dokunulmaz.
- Göç `20261019064900_etiket_merkezi_baski_kaydi`: yeni boş tablo, basılan kayıtlar (yalnız eklenir). Defterde kayıt sayısı sütunu.
- Ekran: `/etiket-merkezi?tur=konum&id=1,2,3` seçili konumlarla açılır (stokun "Etiketleri bas" düğmesi); kayıt çıkarılabilir, seçim kaldırılabilir.
- Konum ve istasyon hazır şablonlarında kod yazısı küçüldü: 20 karakterlik konum kodu kesiliyordu (EM-13 testi yakaladı).

4. PR (UYUM-BORCU 14):
- `POST /etiket-merkezi/sablonlar/:anahtar/indir` (`etiket-merkezi.bas`, tekrar korumalı): dosya yazıcısının komut dosyası yazıcının dili, çözünürlüğü ve harf ayarıyla üretilir,
  defterde sonuç "indirildi". Doğrudan baskı ayarına bağlı değildir (ağa bir şey gitmez).
- Göç `20261019104500_etiket_merkezi_indirme`: yalnız sonuç CHECK'i genişler.
- Ekran: gönderme bölümünde "Yazıcı" listesi ağ (ayar açıksa) ve dosya yazıcılarını gösterir; dosya yazıcısında düğme "Yazıcı için indir". Önizlemedeki serbest indirme kalır; adı "Önizleme için indir (<dosya>, deftere yazılmaz)", ikincil düğme (5. PR).

6. PR (#1908 sonrası):
- Kayıt türleri `lot` (parti kimliği; stok `lotEtiketleri`) ve `istasyon` (istasyon kimliği; stok `istasyonKonumlari`, ad istasyonlar `istasyonAdlari`).
  Konumu açılmamış istasyon eksik sayılır, basılmaz. Göç: `etiket_merkezi_baski_kaydi` tür CHECK'i genişler.
- Ekran: `?tur=lot&id=…` ve `?tur=istasyon&id=…` adresleri; başlık ve not türe göre.

7. PR (#1926 sonrası):
- Kayıt türü `refakat` (üretim emri kimliği; uretim-emirleri `refakatKarti`). Olmayan emir eksik sayılır; iptal emir baskıyı 409 ile durdurur.
  Refakat şablonuna `adimlar` (işlem sırası) alanı eklendi. Göç: tür CHECK'ine `refakat` girer.
- Ekran: `?tur=refakat&id=…` adresi.

8. PR (269 a, 270 a, 271 a):
- Kayıt türleri `malzeme` (kart no; malzemeler `malzemeOzetleri`) ve `mal-kabul` (mal kabul kimliği; stok `lotEtiketleri({ malKabulId })`).
  Mal kabul seçimi kabulün bütün lotlarını lot şablonuyla basar, deftere lot olarak yazar; etiket sınırı basılan lot sayısıyla denetlenir.
  Lot etiketinin kart satırına malzeme türü adı eklendi. Göç: tür CHECK'ine `malzeme` girer.
- Ekran: `?tur=malzeme&id=…` ve `?tur=mal-kabul&id=…` adresleri; mal kabulde lot çipi çıkarılamaz.

9. Raf etiketi ve sayfada seçim (#116; Soru 106-110; Soru 110 göç onaylı):
- Kayıt ve şablon türü `raf`: Fabrika Haritası rafı (`atolye/disari.ts` `raflar`, `gozler`); QR `RAF:<raf kodu>`, kod, ad (kodla aynıysa basılmaz),
  yer "bölüm · N bölme × M kat" (gözlerden). Pasif ve olmayan raf eksik sayılır. Şablonlar `raf-100x50`, `raf-50x25`. Göç `20261022105000`: tür CHECK'ine `raf` girer.
- Kod sözlüğüne `RAF` öneki (`paylasilan/kod-sozlugu.ts`, ayrı commit): raf stok konumu değildir (stok gözdedir), öneki ayrı. Stok Okut rafı #115 ile çözer; o gelene kadar "bilinmiyor".
- `GET /etiket-merkezi/raflar` (`etiket-merkezi.oku`): seçim için kullanımdaki raflar ve bölüm kodu.
- Ekran: Hazır şablonlarda (kayıt seçili değilken, `etiket-merkezi.oku` olana) "Konum ve raf etiketleri" kartı: Raflar ve Konumlar sekmesi, bölüm/depo
  süzgeci, arama, tek tek işaret, "Görünenleri seç", "Etiketleri hazırla" (en çok 200). Konum listesi stoktan (`GET /stok/konumlar`) okunur;
  stok okuması olmayan konum sekmesinde not görür, istek atılmaz. Kullanıcı isteği (2026-10-22 09:44): "etiket sayfasında tek tek veya toplu basılabilsin".

Değişmeyen: bugünkü üç baskı ekranı (stok Etiketler, Lot etiketi, Refakat kartı) ve kod sözlüğü. Yeni paket yok (QR matrisi onaylı `qrcode-generator`, TCP `node:net`).
Değişen onaylı karar: QR teslim kurgusundaki varsayım 5 ("yazıcıya doğrudan komut yok") 98 evet ile değişti. Üçüncü iç istisna ADR 0014 ve CLAUDE.md'de (#1739); `.env.ornek` satırı da girdi.

## Refakat partisi kartı lotla (kart #127; dal 127-refakat-sablon-lot)
- Yeni kayıt türü `refakat-partisi` (stoktaki refakat partisi kimliği; `?tur=refakat-partisi&id=…`): refakat şablonuyla basılır. Emrin kart satırları Üretim Emirleri'nden, QR (`RP:<parti>`), başlık (emir no-P sıra) ve lot satırı stoktan (`refakatPartisi`, `disari.ts`).
- Refakat şablonuna `lot` alanı (lot no, parti, döküm, sertifika); hazır `refakat-100x150` şablonunda parti satırının altında. Emirden basılan kartta (`tur=refakat`) lot satırı boştur.
- İptal ve olmayan kart eksikte kalır. Defterde (`etiket_merkezi_baski_kaydi`) kartın emri `refakat` olarak yazılır; göç yok.
- Stok refakat kartı penceresinde "Etiket Merkezi'nde bas" (yalnız `sayfa.etiket-merkezi` olan görür); stoğun kendi yazdır tuşu kalır.

## Emirden lotsuz refakat kartı kalkar (kart #589, Soru 587 a)
- Kayıt türü `refakat` (üretim emri kimliği, lotsuz kart, QR `UE:`) sözleşmeden (`KAYIT_TURLERI`), sunucudan ve ekrandan çıktı; `?tur=refakat&id=…` adresi seçim sayılmaz, uç 400 verir. Refakat kartı yalnız `refakat-partisi` (stoktaki lotlu kart, QR `RP:`) olarak basılır; ekranda başlığı "Refakat kartları".
- Değişmeyen: şablon türü `refakat` ve hazır `refakat-100x150` şablonu; defterde kartın emri `kaynak_tur = 'refakat'` olarak yazılır (eski satırlar da). Göç yok. Emir satırları yine Üretim Emirleri `refakatKarti`'ndan okunur.
- Sıra: kart #588 (emir ayrıntısındaki eski "Etiket Merkezi'nde bas" düğmesi kalkar) ile aynı turda ya da ondan sonra girer.

## Etiket listesi (kart #1292; 1285 a, 1286 a, 1287 a, 1288 teyitli)
- Göç `20261029146000_etiket_merkezi_etiket_turu`: yeni boş tablo `etiket_merkezi_etiket_turu` (kod, ad, sahip modül, ne zaman basılır, içerik, şablon türü, kayıt türleri, durum, bugün başka yerde basıldığı ekran, sıra), katalog satırlarıyla dolar. Dolu tabloya dokunmaz.
- Satırlar: basılan yedi tür (konum, raf, malzeme, lot, refakat kartı, istasyon, yazıcı denemesi); ilk tur (1285 a) kalite durum, hatalı parça, sevk koli; ikinci tur kalibrasyon, seri no, fason gidiş. Dışarıda basılan dört yol (1288) satırında yazılı: stok konum ve lot penceresi, malzeme katalog etiketi, Üretim Hazırlık seri no etiketi, Kalite Merkezi KF-19.
- Uç `GET /etiket-merkezi/etiketler` (`biri: sayfa.etiket-merkezi`); yeni işlem ve rol yok. Tablo ile koddaki `SABLON_TURLERI` ve `KAYIT_TURLERI` testle eşlenir (EM-U17): yeni tür listeye yazılmadan girerse test düşer.
- Borç (1309 c): Üretim Hazırlık seri no etiketi şimdi taşınmaz; seri no sunucuda kayıt değil (işin kaydında istemcide üretilir). Markalama modülündeki seri kaydıyla birlikte ikinci turda (`seri-no` satırı) ele alınır.
- Ekran: ikinci menüde "Etiketler" (`/etiket-merkezi/etiketler`); tablo, sahip modül ana menü adıyla.

## Hatalı parça etiketi (kart 1525, 1285 a)
- Yeni şablon türü ve kayıt türü `hatali-parca`; hazır şablon `hatali-parca-100x50` (lot etiketiyle aynı rulo). Kaynak Üretim Emirleri `disari.ts hataliKaydi`; sahip modülde değişiklik yok.
- Basılan: durum (karar: REWORK, HURDA, RED, KABUL, ŞARTLI KABUL; karar yoksa KARAR BEKLİYOR), emir no (kol açıldıysa "kol <no>"), parça no ve adı, OP no ve adı, adet ve hurda nedeni, ayıran ve zaman, karar veren, zaman, NCR no ve not. Boş alan basılmaz.
- QR emrin `UE:<kimlik>`i (parçanın bulunduğu emir: kol ya da emrin kendisi); yeni önek yok (UYUM-BORCU 19).
- Deftere `kaynak_tur = 'hatali-parca'`, `kaynak_id` hatalı kayıt kimliği. Göç `20261031211000_etiket_merkezi_ilk_tur.sql` (1530): defter tür kısıtı genişler, etiket listesinde `hatali-parca` satırı `hazir` olur.
- Uç, işlem ve rol değişmedi: kayıt çıktısı `etiket-merkezi.oku`, basma ve indirme mevcut işlemleriyle.

## Kalite durum etiketi (kart 1525, 1286 a)
- Yeni şablon türü ve kayıt türü `kalite-durum`; hazır şablon `kalite-durum-100x50` (lot etiketiyle aynı rulo). Kaynak stok `disari.ts kaliteEtiketleri` (ayrı stok yaması, 1525 adım 2c).
- Kimlik stok bakiye satırıdır (kalite durumu lotta değil satırdadır; aynı lot iki konumda iki durumda olabilir). Olmayan, lotsuz ve boş satır eksik sayılır.
- Basılan: durum (SERBEST, KARAR BEKLİYOR, ŞARTLI, RED; satırdan, elle seçilmez), lot no, malzeme adı ve kodu, miktar, birim ve konum. QR `LOT:<lot no>`. Karar tarihi, karar veren, GKK/NCR basılmaz (UYUM-BORCU 21).
- Deftere `kaynak_tur = 'kalite-durum'`, `kaynak_id` bakiye satırı. Göç `20261031211100_etiket_merkezi_kalite_durum.sql` (1530): etiket listesinde `kalite-durum` satırı `hazir` olur; tür kısıtı 20261031211000'de açıldı. Dışarıdaki yol (KF-19) adım 4'te boşalır.
- Uç, işlem ve rol değişmedi.
