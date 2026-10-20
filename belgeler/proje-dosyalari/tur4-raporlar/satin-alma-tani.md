# Satın alma teslimi: tanı, çakışma taraması, yerleştirme (kart #162, salt okuma)

Teslim: `TMICOREV2-TESLİMLER/satin-alma-teslim 08.10.26 14.33` (38 dosya, ON-PAKET sürüm 6, kit 5eb9481).
Karşılaştırma: taban = depodaki ilk oturtma (20a96ea, aynı sürüm 6'nın ilk teslimi); güncel = origin/main (#268, #273, #305 birleşmiş).
Dal açılmadı, commit atılmadı, depoya kopya yok.

**Sonuç: fark ufak değil.** Tabana göre 18 dosyada yaklaşık 750 satır değişmiş, 3 yeni dosya var (disari.ts, teslim-bilgisi.ts, göç).
Kullanıcı değişikliklerinden üçü (teslim alma kaldırma, sipariş satırı tablosu, katalog bağı) dolu olabilecek tabloda şema işi; ikisi
(ikinci menü, firma bağı) projenin yaptığı işle aynı yere başka biçimde dokunuyor. Uygulamadan önce aşağıdaki sorular cevaplanmalı.

## a) Teslimin içeriği (DOĞRULANDI: `ls -R`, `wc`)
- Belgeler: FARK.md, NOTLAR.md, ON-PAKET-satin-alma.md, CEKIRDEK-ISTEKLERI.md, BASKA-MODUL-ISTEKLERI.md, KURAL-TEST.md.
  Yok: UYUM-BORCU.md, ORTAKLIK-satin-alma.md (depodakiler korunur).
- İstemci: SatinAlma.tsx, rotalar.tsx, merkez/ altında 16 dosya.
- Paylaşılan: ayarlar, islemler, sayfalar, sozlesme (satin-alma.ts).
- Sunucu: disari.ts (yeni), teslim-bilgisi.ts (yeni), kurallar, servis, sorgular, uclar, iki test, NOTLAR; göç `20261007150100_satin_alma_tablolar.sql`.
- Tabanla aynı: calc, constants, docs, memory, roles, sim, styles.css, tipler, util, store (store main'den yalnız bizim `firmaAra` 2 satırıyla ayrışır), paylasilan/ayarlar.

## b) Tür ve taban
- Tür: depodaki modülün değişmiş hali (aynı sürüm 6, aynı göç adı ailesi). DOĞRULANDI: dosya adları ve iskelet aynı, 10 dosya bayt bayt aynı.
- Taban: 20a96ea'daki ilk oturtma. VARSAYIM: teslimde taban commit yazmıyor; 10 dosyanın birebir aynı olması ve #268/#273/#305 izlerinin hiç olmaması tabanın bu olduğunu gösteriyor.

## Kullanıcının dışarıdaki değişiklikleri (yalnız bunlar uygulanacak)
| No | Dosya | Ne değişmiş | Ekrana dokunuyor mu |
|---|---|---|---|
| U1 | islemler, sozlesme, uclar, servis, sorgular, kurallar, göç, views/ui | Teslim alma kaldırıldı: `satin-alma.teslim-al` işlemi, `GET /satin-alma-teslimleri`, `POST /satin-alma-siparisleri/teslim-al`, siparişte `teslim_tarihi`, `kalite`, `teslim_alan_kisi_id`, `siparis_verildi→teslim_alindi` geçişi | Evet (Teslim bekleyenler ekranı kalkar) |
| U2 | göç, sorgular, servis, disari.ts | Yeni tablo `satin_alma_siparis_satiri` (tamsayı kimlik; stok ve GKK buna bağlanır), fiyatsız `siparisSatirlari(db, idler?)` dışarı açılır | Hayır |
| U3 | kurallar, servis, sozlesme, teslim-bilgisi.ts | Teslim durumu türetilir: stok `teslimAlinanlar` ve GKK `gkkSonuclari` (şimdilik boş dönen geçici karşılık); "teslim alındı" yazılmaz, `siparis_verildi` yazılır | Evet (sipariş kartında satır bazlı teslim ve kalite gösterimi) |
| U4 | göç, sozlesme, sorgular | Katalog: `malzeme_id bigint` yerine `malzeme_no integer REFERENCES malzeme_katalog_karti (no)` | Hayır |
| U5 | sayfalar, rotalar, bagla, views, uclar, servis, sorgular | İkinci menü 7 madde (iş kutusu, talepler, onaylar, malzemeler, tedarikçiler, raporlar, ayarlar), sayaç ucu `GET /satin-alma-menu-sayaclari`, madde başına ayrı rota, `merkeziBagla` | Evet |
| U6 | sayfalar, rotalar | "Taleplerim" kaldırıldı | Evet |
| U7 | views, ui, yerlesim.css | Paylaştırma çubukları "Karşılaştır ve karar ver" içinde | Evet |
| U8 | CEKIRDEK-ISTEKLERI Ç5 | İkinci menü 768 pikselden itibaren solda (kabuk isteği) | Evet (bütün modüller) |
| U9 | ui, views | JSON yedek, içe aktarma, örnek veri, TCMB kaldırıldı (UYUM-BORCU 20 ile aynı yön) | Evet (düğmeler kalkar) |
| U10 | servis, göç, testler | Firma: `../firmalar/disari.ts` (`firmaAktifMi`, `firmaOzetleri`), `firma_id REFERENCES firma`, testler `POST /firmalar/ac`; V-35 tedarikçi formu firma alanlarını `firmalar`'a yazar | Hayır (form aynı, yazıldığı yer değişir) |

## Proje işiyle çakışmalar (aynı yere iki taraf dokunmuş)
| No | Proje işi (main) | Teslim | Durum |
|---|---|---|---|
| C1 | #268 ikinci menü: 11 madde, 6 grup, tek sayfa `/satin-alma/:bolum`, `gorunumler.ts`, `setNavDinleyicisi` | U5/U6: 7 madde, ayrı rotalar, `merkeziBagla` | Soru S-A |
| C2 | #273 firma geçici karşılığı `firma-gecici.ts` (finansa hazırlık, toplu `firmaOzetleri`, `firmaAra`) | U10: var olmayan `firmalar` modülü, `REFERENCES firma` | Soru S-B |
| C3 | #273 okuma yetkisi `GET /satin-alma-acilis` `yetki: { biri: SATIN_ALMA_ISLEMLERI }` | Tabandaki `satinAlmaKullanicisiMi` denetimi duruyor | Proje korunur (sunucu, ekrana dokunmaz) |
| C4 | Tekrar koruması `tekrarKorumali: true` yazma uçlarında | Teslim uclar.ts'inde yok | Proje korunur (sunucu, ekrana dokunmaz) |
| C5 | #305 fiyat denetim eki: `talepAc`/`talepKaydet` `izYaz`, `denetim: 'govdesiz'`, `denetimEki`, `TAM_DENETLENMEYEN_UCLAR` iki satırı | Teslim `talepKaydet`'te durum yazımını değiştiriyor (U3) ve eki taşımıyor | Proje korunur; U3 satırı ekin üstüne konur. İki değişiklik aynı fonksiyonda ama ayrı satırlarda (VARSAYIM: elle birleştirme, mantık çatışması yok) |
| C6 | Göç `20261007230000_satin_alma_tablolar.sql` main'de uygulanmış | Teslim aynı tabloları yeni adla (`20261007150100`) baştan kuruyor | Teslim göçü olduğu gibi giremez; fark ayrı ALTER göçüyle gelir. Soru S-C |
| C7 | UYUM-BORCU, ORTAKLIK, FARK (main'de) | Teslimde UYUM-BORCU ve ORTAKLIK yok, FARK baştan yazılmış | Main'dekiler korunur, teslim FARK'ı eklenir |

## c) Çakışma taraması (sabit kimlikler ve OS ile)
Başka modülde:
- Firma: sabit kimlik `finans_firma.id` (finans), "ayrı firmalar modülü yok". Teslim `firmalar` modülü ve `firma` tablosu varsayıyor; ikisi de depoda yok (DOĞRULANDI: `git ls-tree origin/main sunucu/moduller`). Göç bu haliyle çalışmaz.
- Mal kabul: stokta. Teslim artık satın almada teslim almıyor (U1); bu, eski "teslim al" ucuyla çakışmayı kaldırıyor. Stok modülü depoda yok; `teslimAlinanlar` geçici karşılıkla boş döner.
- Malzeme: `malzeme_katalog_karti.no` (malzemeler). Teslim aynı kimliği seçmiş; ancak yabancı anahtarı Aşama 1'de koyuyor (OS: bağ Aşama 2'de).
- Kalite (GKK): rota/kalite modülü depoda yok; `gkkSonuclari` geçici karşılık.
Yalnız bu modülde: talep, teklif, karar, sipariş, sipariş satırı, katalog ve takma adları, ayarlar, kur (finans gelene kadar).
Belirsiz: para birimi ve kur tabloları (`satin_alma_kur`) finans gelince taşınır; teslim bunu değiştirmiyor. "Hareket kaydı" ile `denetim_kaydi` örtüşmesi (ON-PAKET 5) açık.

## d) Yerleştirme: akışlar, bağımlılıklar, imzalar
- Akış: talep → teklif → karşılaştır ve paylaştır → onay → sipariş (sipariş satırları oluşur) → [stok mal kabul] → [GKK] → türetilmiş "teslim alındı".
- Bu modülün verdiği: `siparisSatirlari(db, idler?): Promise<SiparisSatiri[]>` (disari.ts; fiyatsız: id, talepId, teklifId, kalemId, miktar, birim).
- Bu modülün istediği (BASKA-MODUL-ISTEKLERI):
  - stok `teslimAlinanlar(db, siparisSatirIdler: number[]): Promise<Map<number, MalKabul[]>>`
  - rota/kalite `gkkSonuclari(db, siparisSatirIdler: number[]): Promise<Map<number, GkkKaydi>>`
  - firmalar `firmaOzetleri(db, idler): Promise<Map<number, Firma>>`; sabit kimliğe göre finanstan istenmeli (main'de `firma-gecici.ts` aynı imzayı zaten taşıyor).
- Üretim emirleri: teslim ona yazım istemiyor (DOĞRULANDI: BASKA-MODUL-ISTEKLERI'nde UE maddesi yok).

## e) Depo kalıplarından farklar (Aşama 1'de düzeltilmez, UYUM-BORCU'na; proje işi olanlar korunur)
- Okuma uçları: teslim acilis'te eski denetim; main'deki `{ biri }` korunur.
- İkinci menü biçimi: iki taraf da kabuk biçiminde (`IKINCI_MENULER`); sayaç ucu `yetki: 'oturum'` depo kalıbıyla aynı (DOĞRULANDI: `paylasilan/ikinci-menu.ts`, yapi-kaliplari skill). Fark madde ve rota düzeninde (S-A).
- Toplayıcı dar istisnası: `sayfalar.ts` ve `TAM_DENETLENMEYEN_UCLAR` satırları yalnız bu modülün, ayrı commit.
- Tekrar koruması: main'deki korunur.
- Denetim eki: #305 korunur; yeni sayaç ucu GET olduğu için ek gerekmez.
- Sürüm denetimi: talep sürümlü kaydet (V-33) iki tarafta aynı.
- Dosya saklama: teslimde dosya eki yok (DOĞRULANDI: grep).
- Ç11 (`paylasilan/satin-alma-hesap.ts`) teslimde de uygulanmamış; calc.ts istemcide kalıyor (değişmedi).

## f) Kırmızı çizgi taraması
- Dış çağrı: kodda URL yok. Tek bağlantı belgede: `ON-PAKET-satin-alma.md:7` claude.ai önizleme bağlantısı (koda girmez). TCMB çağrısı kaldırılmış (U9).
- Paket: ithaller yalnız fastify, node:*, react, react-router-dom, vitest, zod. Yeni bağımlılık yok.
- Gerçek veri: testlerde "Deneme A.Ş.", "Deneme Tedarik A/B"; gerçek müşteri, parça no, kişi adı bulunmadı (grep, VARSAYIM: adların uydurma olduğu biçimden).
- Eski sistem: `tmi`, 4000, Planlama, TMI_YEDEK izi yok (grep).
- Sonuç: oturtmayı durduran kırmızı çizgi yok.

## g) Yerleştirme planı
Tek dal `162-satin-alma-3`, tek çekme isteği, main'in üstüne kullanıcı değişiklikleri; ayrı commitler:
1. Göç (yeni damga, ALTER): siparişte teslim sütunlarını kaldır (S-C), `satin_alma_siparis_satiri` ekle, `malzeme_id` → `malzeme_no integer` (yabancı anahtarsız, S-D), `firma_id` yabancı anahtarsız kalır.
2. Paylaşılan: islemler (`teslim-al` çıkar), sozlesme, sayfalar (S-A'ya göre). Toplayıcı satırları ayrı commit.
3. Sunucu: kurallar, sorgular, servis, uclar, disari.ts, teslim-bilgisi.ts; #273, tekrar koruması, #305 korunur; firma `firma-gecici.ts` üzerinden.
4. İstemci: merkez ve rotalar, kullanıcının yaptığı gibi.
5. Testler: teslimin testleri (firma kısmı `[uydurma firma]` geçici karşılığa uyarlanır), main'in #273/#305 testleri korunur.
6. Belgeler: FARK, UYUM-BORCU (yeni maddeler), ORTAKLIK (sipariş satırı, malzeme_no).
- Boyut: yaklaşık 800 satır değişiklik (VARSAYIM: taban farkı 754 satır + yeni dosyalar).
- Çekirdek: Ç5 (768 px sol ikinci menü) ayrı kart, `istemci/src/ortak` şeridi; bu dalda yapılmaz. Ç1-Ç3 main'de zaten var (VARSAYIM: #268'de girdi), Ç4 firmalar göçü sabit kimlikle çelişir.
- SF işi: #305 birleşti; bekleyen SF yok. Teslim servis/uclar'a dokunduğu için C5 birleştirmesi bu dalda yapılır.

## Kullanıcıya sorular
- **S-A İkinci menü.** Neden: proje 11 maddelik tek sayfa menü kurdu (#268), sen dışarıda 7 maddelik menü ve ayrı rotalar yazdın; ikisi aynı yer. Seçenekler: (1) seninki: 7 madde, Taleplerim ve Teslim bekleyenler yok, sayaçlı; (2) projeninki: 11 madde, sayaçsız. Öneri: 1 (ekran ve akış senin yaptığın gibi alınır; ikisi de kabuk biçiminde). Ekrana dokunur.
- **S-B Firma bağı.** Neden: teslim `firmalar` modülü ve `firma` tablosu bekliyor; sabit kimlik "firma finans_firma.id, ayrı firmalar modülü yok" diyor ve ikisi de depoda yok, göç çalışmaz. Seçenekler: (1) depodaki `firma-gecici.ts` kalır, finans gelince bağlanır, V-35 (form firmayı yazar) UYUM-BORCU'na; (2) `firmalar` modülü açılır (sabit kimliği değiştirir). Öneri: 1. Ekrana dokunmaz.
- **S-C Teslim sütunlarını silme.** Neden: siparişte `teslim_tarihi`, `kalite`, `teslim_alan_kisi_id` kaldırılıyor; dolu tabloda geri alınamaz şema işi. Seçenekler: (1) ALTER ile sil (içlerindeki veri gider); (2) sütunlar kalır, kod okumaz, Aşama 2'de stokla birlikte silinir. Öneri: 1 (sen kaldırdın; VARSAYIM: sunucuda gerçek sipariş kaydı yok, BİLMİYORUM: sunucudaki veri). Ekrana dokunmaz (ekran tarafı U1 ile zaten gidiyor).
- **S-D Katalog malzeme bağı.** Neden: `malzeme_id bigint` → `malzeme_no integer`; teslim yabancı anahtarı şimdi koyuyor, kural (#158) yabancı anahtarı Aşama 2'ye bırakıyor. Seçenekler: (1) sütun adı ve türü şimdi, yabancı anahtar Aşama 2'de; (2) yabancı anahtar şimdi. Öneri: 1. Ekrana dokunmaz.
