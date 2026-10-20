# ON-PAKET: rota (TMI CORE V2, taban c2c9871) - sürüm 8

Durum: kararlar işlendi (bölüm 10); kod teslim edildi (teslim-rota-c2c9871.zip). Dayanak: bu sohbetteki prototip
(`Reçete_ve_Rota_Motoru.html`) ve önceki onaylı ön paket (ON-PAKET-rotalar sürüm 5, taban 92f8f76). Bu sürüm onu yeni tabana
taşır; değişenler bölüm 1'de. İşaretler: DOĞRULANDI (dosya ya da komut çıktısıyla), VARSAYIM, BİLMİYORUM.

Not: aynı mesaja eklenen belge `plan` modülü görevini tarif ediyor; bu oturumda mesajdaki `rota` görevi yapılır, plan ayrı görevdir.

## 1. Tabanda değişenler ve kararlara etkisi

| Konu | Önceki taban (92f8f76) | c2c9871 | Etki |
|---|---|---|---|
| Malzeme kartı | `malzeme`, `bigint id`, tür hammadde/sarf/mamul | `malzeme_katalog_karti`, bağlantı `no integer` (UNIQUE), tür hammadde/yarimamul/mamul/sarf/demirbas (DOĞRULANDI `20261007120000_*`, `20261007143403_*`) | Rota mamul ve yarımamule kurulur (onaylı karar, mesaj). Önceki ön paketteki "yarı mamul türü yok" kararı yerine bu geçer (FARK.md'ye yazılır). |
| Malzeme özeti | ad, stok birimi vardı | `malzemeOzeti(db, no)`: id, kimlik, kod, tür, ad, onayDurumu; **birim yok** (DOĞRULANDI `paylasilan/sozlesme/malzemeler.ts`) | Birim için istek (bölüm 7). |
| Modül adı | `rotalar` | sayfa `/rota`, işlem `sayfa.rota`, grup Tanımlar (DOĞRULANDI `paylasilan/sayfalar/rota.ts`); modül adı `rota` | İşlemler `rota.*`. |
| İkinci menü | modül kendi menüsünü çiziyordu | kabuk çizer, modül `IkinciMenuTanimi` verisini bildirir; modül kendi yan menüsünü çizmez (DOĞRULANDI `kurulum/dis-modul-sartnamesi.md`) | Önceki teslimdeki modül içi menü (MerkezMenusu) kalkar. |
| Üretim emri | adımsız | `emir_adimi`: emir başına sıra, ad, açıklama; "talimat kontrol listesi"; emir **tek istasyonlu** (DOĞRULANDI `20261007094251_*`, `paylasilan/sozlesme/uretim-emirleri.ts` `emirGovdesi`) | Rotanın emre kopyalanma biçimi soruluyor (S1). |
| Modüller arası yön | serbest | ADR 0006: tek yön, üstteki alttakini çağırır, döngü araçla denetlenir; birleştirme sırası "üretim emirleri ve terminal, rota, ..., en son plan" (DOĞRULANDI) | Rota, uretim-emirleri'nin üstündedir: rota ucu emri açar ve uretim-emirleri komutunu çağırır; uretim-emirleri rotayı tanımaz. |
| Rol x işlem | teslimle göç | teslimle girmez; öneri yazılır, kullanıcı onayıyla ayrı göç (DOĞRULANDI şartname madde 5) | Rol dağılımı bölüm 4'te öneri. |
| Tekrar koruması | yok | `uc({ tekrarKorumali: true })` + `istek-kimligi` modülü (DOĞRULANDI `sunucu/cekirdek/uc.ts`) | Yeni kayıt açan komutlarda kullanılır. |

## 2. Kapsam

Rota modülü: mamul ve yarımamulün çok seviyeli reçetesi (adımlara bağlı bileşenler; yarımamul bileşen kendi rotasıyla açılır),
operasyon sırası (adımlar, bağımlılık, istasyon, süre, aday istasyonlar), revizyonlar ve onay akışı, iş talimatı (sürümlü),
ürün ağacı, revizyon farkı ve rotanın emre kopyalanması (biçimi S1).
Kapsam dışı: plan, Kanban, plan stüdyosu, emir listesi, kaynaklar, vardiya (her biri kendi modülünde; S2).

## 3. Sayfa ve ikinci menü (veri olarak; kabuk çizer)

Ana menüde tek sayfa `/rota` (var). İkinci menü (`ROTA_IKINCI_MENU`, `paylasilan/sayfalar/rota.ts`):
- Ürün ve rotalar `/rota` (sayfa.rota): ürün seçici, akış şeması (tam sayfa tahta, yüzen düzenleme kartı), akış tablosu, revizyon şeridi.
- Ürün ağacı `/rota/agac` (sayfa.rota): çok seviyeli reçete, miktara göre toplam ihtiyaç.
- Onay bekleyenler `/rota/onay` (rota.onayla): onaya gönderilmiş revizyonlar; sayaç ucu `/rota/menu-sayaclari`.
Toplayıcıya ekleme çekirdek isteği.

## 4. Uçlar, işlemler, önerilen roller

İşlemler (`paylasilan/islemler/rota.ts`): `rota.yaz`, `rota.onayla`, `rota.talimat-yaz` (+ S1'e göre `rota.emre-kopyala`).
Önerilen dağılım (önceki onaylı karar S12; ayrı göçle, kullanıcı onayıyla): planlama_proje: yaz, talimat-yaz; mudur: onayla;
cam: talimat-yaz. Dört göz (ayar `rota.dort-goz`, varsayılan açık): gönderen ve taslağı kaydeden onaylayamaz.

Okuma (oturum): `GET /rota/secenekler`, `/rota/urunler`, `/rota/urunler/:no`, `/rota/revizyonlar/:id?miktar=`, `/rota/revizyonlar/:id/fark`,
`/rota/revizyonlar/:id/agac`, `/rota/urunler/:no/talimatlar/:opNo`, `/rota/onay-bekleyenler`, `/rota/menu-sayaclari`.
Yazma (her biri ayrı uç, kendi şeması ve işlemi; sürüm denetimli; kişi ve zaman sunucudan):
- `POST /rota/urunler/:no/taslak-ac` (rota.yaz, tekrar korumalı), `/rota/revizyonlar/:id/kaydet` (rota.yaz, sürüm), `/onaya-gonder` (rota.yaz),
  `/iptal` (rota.yaz), `/kopyala` (rota.yaz, tekrar korumalı), `/geri-gonder` (rota.onayla), `/onayla` (rota.onayla, dört göz),
  `/yururluge-al` (rota.onayla), `POST /rota/urunler/:no/talimat-yaz` (rota.talimat-yaz, okunan sürüm denetimli).
- Emre kopyalama ucu S1'e göre.

## 5. Tablolar (yeni göç, damga 20261007222500'den yeni)

Önceki onaylı şema (sekiz tablo, beş tetikleyici) yeni anahtarla: `rota_revizyonu (malzeme_no int, malzeme_turu)`,
`rota_revizyonu_duzenleyen`, `rota_op_numarasi`, `rota_adimi`, `rota_aday_istasyonu`, `rota_bileseni (malzeme_no int)`,
`rota_yan_urunu`, `rota_talimati`. Ürün yalnız mamul ya da yarımamul (S-kısıt + servis denetimi); bileşen hammadde, sarf, yarımamul
ya da mamul. `malzeme_katalog_karti (no)` yabancı anahtarı; tür eşleşmesi için `(no, tur)` tekili malzemeler'den istenir (bölüm 7),
gelene kadar servis denetler (UYUM-BORCU).

## 6. İş kuralları (önceki onaylı RT listesi korunur; değişenler)

- RT-01..RT-64 aynen (durum akışı taslak > onay_bekliyor > onaylı > yürürlükte, iptal; yürürlükteki tek; içerik yalnız taslakta değişir;
  onaylı rota değişmez, değişiklik yeni taslak açar; OP numarası bir kez verilir; döngü sunucuda reddedilir; alt mamul yürürlükte rotasız
  olamaz; talimat sürümlüdür; dört göz).
- Değişen: ürün mamul **ya da yarımamul**; bileşen yarımamul de olabilir (döngü ve "alt ürünün yürürlükte rotası" kuralı yarımamulde de geçer).
- Yeni: yeni kayıt açan komutlar (taslak-ac, kopyala, emre kopyala) istek kimliğiyle tekrar korumalıdır.
- Kullanıcı metni (ad, açıklama, talimat) düz metindir; ekranda kaçırılarak basılır, HTML ve SVG yorumlanmaz.

## 7. Başka modül istekleri (kod yok, imzayla)

- malzemeler: `malzemeBirimleri(db, nolar: number[]): Promise<Map<number, string>>`; `malzeme_katalog_karti (no, tur)` tekili.
- istasyonlar: operasyon tipi kataloğu (tablo + `operasyonTipleri(db)`), önceki teslimdeki gibi.
- uretim-emirleri: S1'in seçeneğine göre (bölüm 9).

## 8. Varsayımlar

| No | Varsayım | Geri alma |
|---|---|---|
| V1 | Rota modülü uretim-emirleri'nin üstündedir (ADR 0006 ve birleştirme sırası) | Orta |
| V2 | Ekran önceki teslimdeki akış şeması ve tablosudur (tahta, yüzen kart, tekerlekle yakınlaşma); modül içi menü kalkar | Düşük |
| V3 | Birim gelene kadar miktar birimsiz gösterilir | Düşük |

## 9. Sorular

S1. Rota üretim emrine nasıl kopyalansın? Neden: c2c9871'de emir tek istasyonludur ve adımları talimat kontrol listesidir
(`emir_adimi`: sıra, ad, açıklama); rotanın çok operasyonlu yapısı emre doğrudan sığmaz; seçim uretim-emirleri'nin şemasını belirler.
Seçenekler: a) rotanın her operasyonu ayrı bir üretim emri olur (aynı işin emirleri sıra ve önceki emirle bağlanır; operasyonun talimatı
emrin adım listesi olur); rota ucu açar, uretim-emirleri komutu yazar  b) emir çok operasyonlu olur (emre operasyon tablosu eklenir;
uretim-emirleri'nde büyük değişiklik)  c) yalnız talimat kopyası: emir istasyonuyla açılır, rota o istasyondaki operasyonun talimatını
emrin adımlarına kopyalar. Öneri: a.

S2. Önceki "bütün prototip bölümleri tek Reçete ve Rota sayfasında" kararı ne olsun? Neden: şartname her modülü ana menüde tek
sayfa ve kendi ikinci menüsüyle istiyor; plan görevi ayrıca kendi sayfasını kuruyor; karar onaylı olduğu için sorulur.
Seçenekler: a) rota yalnız kendi bölümlerini taşır (Ürün ve rotalar, Ürün ağacı, Onay bekleyenler); plan, emir, kaynak ve vardiya
bölümleri kendi modüllerinde  b) karar sürer (rota sayfası öteki modüllerin ekranlarını da taşır; şartnameye aykırı, borca girer).
Öneri: a.

## 10. Kararlar (sürüm 7)

K1 (S1). Rota emre şöyle geçer: **üretim emri** (mamul ya da yarımamul, adet) üst kayıttır; alt adımları **iş emirleri**dir; her iş
emri bir rota adımından (operasyondan) gelir, tek istasyonludur ve operasyonun talimatı iş emrinin kontrol listesi adımları olur.
Bugünkü tek istasyonlu `uretim_emri` iş emrinin karşılığıdır (VARSAYIM V4); üst kayıt ve bağ uretim-emirleri'nden istenir
(BASKA-MODUL-ISTEKLERI). Rota ucu (`POST /rota/revizyonlar/:id/emre-kopyala`, `rota.emre-kopyala`, tekrar korumalı) uretim-emirleri'nin
komutunu çağırır; uretim-emirleri rotayı tanımaz. Komut gelene kadar uç bağlamada kapanacak borç olarak durur (UYUM-BORCU).

K2 (S2). Sayfa düzeni, menü ve kullanım önizlemedeki gibi kalır: ana menüde tek "Rota" sayfası, ikinci menüde prototipin bütün
bölümleri (Planlama: Üretim emirleri, Plan, Plan stüdyosu; Atölye: Operatör ekranı, Kanban, Stok; Ana veriler: Ürün ve rotalar,
Operasyonlar, Malzemeler, Kaynaklar). İkinci menüyü kabuk çizer (veri `ROTA_IKINCI_MENU`). Rota modülünün sahibi olmadığı
bölümlerin verisi kendi modüllerindedir; bu teslimde o bölümler önizlemedeki ekranıyla gelir ve sahibi modülün uçları gelene kadar
"modülü bekleniyor" durumunu gösterir (UYUM-BORCU: şartnamede her modül kendi sayfasındadır; bu sapma kullanıcı kararıdır).

| No | Varsayım | Geri alma |
|---|---|---|
| V4 | Bugünkü `uretim_emri` (tek istasyon, kontrol listesi adımları) iş emridir; üst "üretim emri" yeni kayıttır | Orta |
| V5 | Tezgahsız rota adımından gelen iş emri istasyonsuz açılamaz (bugünkü tablo istasyon ister); bağlamada uretim-emirleri kararına göre | Düşük |

K3 (kullanıcı kararı). Her rota adımı (operasyon) bir **makineye ya da bir kişiye** bağlıdır; istasyon onların grubudur (altında
makineler ve kişiler); atamalar ve plan makine ve kişi üzerinedir. Şema: `rota_adimi.makine_id` / `kisi_id` (en çok biri; ikisi de boş:
henüz atanmadı), aday kaynaklar `rota_aday_kaynagi` (makine ya da kişi, süre üstüne yazımı). İstasyon tutulmaz, kaynağın istasyonundan
okunur. Kurallar: yeni seçilen kaynak var ve kullanımda olmalı (kayıt), atanmış kaynak kullanımda olmalı (onay; RT-38); aday kendi
kaynağı olamaz, iki kez eklenemez (RT-39). Kişinin istasyonu istasyonlar modülünden istenir (BASKA-MODUL-ISTEKLERI).

| No | Varsayım | Geri alma |
|---|---|---|
| V6 | Rota verisi iş merkezi kısıtlı kullanıcıya göre süzülmez (tanım verisidir) | Düşük |
| V7 | Makine ya da kişi atanmamış adım taslakta ve onayda kalabilir; kaynağı planlama atar | Düşük |
| V8 | Talimatın her boş olmayan satırı iş emrinin bir kontrol maddesidir (120 karakterde bölünür) | Düşük |
