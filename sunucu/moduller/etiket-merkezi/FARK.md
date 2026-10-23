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
