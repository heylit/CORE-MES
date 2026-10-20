# ON-PAKET: satin-alma (TMI CORE V2) — sürüm 6, yazıldı (kit 5eb9481): Satın Alma Merkezi gömülü modül

Kaynak:
- Hedef depo: kit `92f8f76`.
- Referans arayüz: `Satın_Alma_Merkezi.html`. Bu sohbette yazılan prototiple aynı; özet değeri eşleşti.
- Kullanıcı kararları: 07.10.2026, 9 soru.
- Önizleme: https://claude.ai/artifact/U7T9qMq2Pk3JcrwQg7KgjW

Yazıldı (07.10.2026). Yol, kullanıcının seçimiyle sürüm 6. Uygulamada pakete göre değişenler `FARK.md`'de; kural ve test eşlemesi `KURAL-TEST.md`'de.

İşaretler: **D** doğrulandı (dosya ya da komut çıktısı) · **V** varsayım (gerekçe, geri alma maliyeti) · **B** bilmiyorum · **K** kullanıcı kararı.

## Değişenler (sürüm 5 → 6)

Yön değişti. Satın Alma Merkezi'nin arayüzü, işleyişi, kurgusu, işlevleri ve yerleşimi değişmeden TMI CORE'a yerleşir; bağlantılar TMI'nin modüllerine yapılır. Sürüm 5'teki TMI bileşenleriyle yazılmış ekranlar emekliye ayrılır. Sunucu modülü, Faz 1a tablolarını temel alarak prototipin bütün veri modelini taşıyacak şekilde genişler.

| # | Karar (K) | Sonucu |
|---|---|---|
| 1 | Yerleşim aynı; renkler TMI değişkenlerinden | Prototipin 62 sabit rengi ve 91 satır içi stili `tokens.css` değişkenlerine eşlenir. Ölçü ve yerleşim değerleri modül CSS'inde kalır; koyu tema çalışır. |
| 2 | Hesap kodu ortak klasöre; sunucu kayıtta aynı fonksiyonla doğrular | Prototipin `calc.ts`'i (net bugünkü maliyet, puan, kalem bazlı bölme, dağıtım merdiveni) `paylasilan/` altına taşınır. Ekran canlı gösterir; sunucu kayıtta yeniden hesaplar, farkı reddeder. |
| 3 | Faz ayrımı kalkar | Faz 1a, 1b ve 2 tek teslimde: puan, bölme, döviz, karne, öğrenilenler, dağıtım denemesi, senaryolar, raporlar, onay formu, sipariş metni. |
| 4 | Satın alma kendi kataloğunu tutar; ileride malzemelerle senkron | Kendi katalog tabloları ve takma adlar. Katalog kaydında boş bırakılabilir `malzeme_id` (malzemeler modülüne bağlantı) bugün kullanılmaz. Malzemelerle örtüşme bilerek kabul edildi (5. bölüm). |
| 5 | Görünüm seçicisi kalkar; ekran seti rolden | Kenar çubuğundaki seçici kaldırılır. Hangi ekran setinin açılacağı TMI işlemlerinden belirlenir. |
| 6 | Teslimi depo alır, fiyat görmez | Arayüze tek ek: fiyatsız "Teslim bekleyenler" ekranı (prototipin görsel diliyle). Satın almanın sipariş bölümündeki teslim alma düğmesi depo yetkisine bağlanır. |
| 7 | Her ekran seti TMI menüsünde ayrı sayfa | Satın Alma, Taleplerim, Onaylar, Teslim Bekleyenler menüde ayrı sayfalardır; kişi yetkisi olan hepsini görür. |
| 8 | Silme: yalnız taslak talep ve kararsız teklif; ilerlemiş talepte iptal | Prototipin "Sil" ve 8 saniyelik "Geri al" akışı bu iki durumda aynen çalışır. Taslak dışındaki talepte "Sil" yerine iptal yapılır (gerekçeli). Karar verilmiş talepteki teklif silinmez. |
| 9 | İki menü kalır | TMI'nin menüsü ile Satın Alma Merkezi'nin kendi menüsü (iş kutusu, talepler, malzemeler, tedarikçiler, raporlar, ayarlar) yan yana durur; yerleşim birebir aynıdır. Sonuç: içerik alanı TMI menüsünün genişliği kadar daralır (önizlemede talep başlıkları 1280 pikselde birkaç satıra bölünüyor). Kabul edildi. |

## 0. Kimlik

- **Ad:** `satin-alma` (değişmedi); tablo öneki `satin_alma_`; kural öneki `SAT-`.
- **Sayfalar (çekirdek isteği):**

  | Yol | İşlem | Açılan ekran seti |
  |---|---|---|
  | `/satin-alma` | `sayfa.satin-alma` | Prototipin "Satın alma" seti: iş kutusu (pano), talepler, talep sayfası, malzemeler, tedarikçiler, raporlar, ayarlar |
  | `/satin-alma-taleplerim` | `sayfa.satin-alma-taleplerim` | "Talep eden" seti |
  | `/satin-alma-onaylari` | `sayfa.satin-alma-onaylari` | "Onaylayan" seti |
  | `/satin-alma-teslimleri` | `sayfa.satin-alma-teslimleri` | Depo ekranı |

  Tedarikçiler artık `/satin-alma` setinin içindedir (prototipteki gibi). Ayrı tedarikçi sayfası kalkar.
- **Kapsam:** Prototipin bütün işlevleri, aşağıdaki iki listedeki istisnalarla.

**Kırmızı çizgi nedeniyle kalkanlar (bilgi; kural değişmezse geri gelmez):**
- **TCMB'den kur çekme:** Dış servis çağrısı yok (D: `CLAUDE.md`). Elle kur girişi aynen kalır.
- **"Örnek verileri yükle / sil":** Depoya demo verisi girmez (D: kullanıcının kalıp talimatı, "YAZMA … demo verisi").
- **Tarayıcıda veri saklama (localStorage):** Veri yalnız sunucuda tutulur. Görünüm tercihi de saklanmaz (Karar 5).

**Varsayımla değişenler (itiraz ederseniz geri alınır):**
- **V-30, JSON yedek dışa ve içe aktarma:** Kalkar; yedek TMI'nin işi (D: talimat, "yedek … depoda zaten var"). CSV dışa aktarmalar kalır. Geri alma maliyeti düşük.
- **V-31, canlı güncelleme (SSE):** TMI'de canlı iletim yok (önkoşul). Ekran 30 saniyede bir ve odak dönüşünde yeniler. Çakışma 409 ile yakalanır (prototipte de var). Geri alma: canlı iletim gelince taşıyıcı değişir.
- **V-32, Ayarlar ekranı:** `/satin-alma` setinin içinde aynen kalır: şirket adı, kurlar ve faiz, varsayılan ağırlıklar, birimler ve bütçeler, onay limitleri, kategoriler, geçerlilik, en az teklif, fiyat uyarısı. Değerler modülün kendi tablolarında tutulur. Yalnız dört göz, TMI Sistem Ayarları'ndan okunur (kalıp D: `malzemeler.dort-goz`). Böylece Sistem Ayarları'nın sayı tipi önkoşulu (ÖK-4) gereksizleşir.

## 1. İş kuralları

Kaynak, prototipin davranışıdır. Sürüm 5'teki 36 Faz 1a kuralı aynen geçerli. Sürüm 4'te 1b ve F2'ye bırakılan 18 kural kapsama girer (SAT-10, 12, 15, 20–23, 25, 26, 28, 33, 36, 40, 43, 44, 46–48). Aşağıdakiler eklenir ya da değişir.

| No | Kural | Sınama |
|---|---|---|
| SAT-33 (değişti) | Gereken onay seviyesi tutara göre onay limitleri tablosundan gösterilir. Onayı `satin-alma.onayla` işlemi verir; seviye bilgi amaçlıdır, prototipteki gibi. | saf + uç |
| SAT-51 (kalktı) | Faz 1a'daki "karar tek tedarikçiye" kısıtı kalkar. Karar tek tedarikçi ya da kalem bazlıdır (SAT-28). | – |
| SAT-56 | Hesaplar `paylasilan` altındaki tek fonksiyonla yapılır. Sunucu, kayıtta toplamı, net bugünkü maliyeti ve önerileni kendisi hesaplar; ekranın gönderdiği değeri yok sayar (Karar 10, bağlama SA5 a). | saf (aynı fikstürde ekran ve sunucu sonucu eşit) + uç |
| SAT-57 | Sipariş tedarikçi başınadır. Kalem bazlı kararda her tedarikçiye ayrı sipariş açılır; her sipariş ayrı teslim alınır. Bütün siparişler teslim alınınca talep tamamlanır. | akış |
| SAT-58 | Katalog kalemi bir malzeme kartına bağlıdır; kod, ad, kategori ve birim karttan okunur. Yeni kart "Malzemeler ve Hizmetler"de açılır; talepte katalogda olmayan kalem serbest metinle ilerler. Takma adla yazılan kalem mevcut kayıtla eşleşir (bağlama SA2 b). | akış |
| SAT-59 | Katalog kodu `M-` ön ekli sıra numarasıdır ve benzersizdir. | kısıt |
| SAT-60 | Birim bütçe kullanımı, o birimin yıl içindeki onaylanmış ve siparişe dönmüş kararlarının toplamıdır. | saf |
| SAT-61 | Teklif fiyatı, aynı kalemin son alış fiyatından ayarlardaki yüzde kadar yüksekse uyarı gösterilir. | saf |
| SAT-62 | Teklif sayısı ayarlardaki en az teklif sayısından azsa karar ekranı uyarır; engellemez. | saf |
| SAT-63 | Talep hareket kaydı yalnız eklenir (kim, ne zaman, ne). | kısıt (`yalniz_ekleme`) |
| SAT-64 | Kullanıcının göreceği ekran seti, `kullanici.islemler` listesinden belirlenir: `yaz` → satın alma seti; `onayla` → onay seti; `talep-ac` → talep eden seti; `teslim-al` → depo ekranı. | saf + ekran testi |
| SAT-65 | Depo ekranı ve teslim cevabı fiyat taşımaz (SAT-37 genişler: kalem bazlı siparişlerde de). | uç |

| SAT-66 | Yalnız taslak talep silinir; diğer talepler gerekçeyle iptal edilir. Silinen taslak talebin kalemleri ve teklifleri birlikte silinir. | kısıt (tetikleyici: taslak dışında silme reddi) + uç |
| SAT-67 | Teklif yalnız talepte geçerli karar yokken silinir; karardan sonra teklif silinmez. | kısıt (tetikleyici) + uç |
| SAT-68 | Silme, prototipteki gibi 8 saniye içinde geri alınabilir: silme o süre yazılmadan bekler, geri alınırsa hiç yazılmaz. İptalde 8 saniyelik geri al yoktur; iptal hemen yazılır, yanlış iptal durum elle önceki aşamaya çevrilerek geri alınır (kullanıcı kararı 17.10.2026, "SAT-68: Kalsın"). | akış |

SAT-08 değişir: "Talep silinmez" yerine "Taslak dışındaki talep silinmez" (SAT-66).

## 2. Tablolar

Faz 1a'nın 9 tablosu temel alınır, eksikler eklenir. Serbest `json` sütun yok (D: talimat). Göç: `<damga>_satin_alma_tablolar.sql`. Henüz `main`'e girmedi; tek göç olarak yeniden yazılır.

| Tablo | Prototipteki karşılığı | Not |
|---|---|---|
| satin_alma_talep_sayaci, satin_alma_talep, satin_alma_talep_kalemi | purchase_request, request_item | Talebe `birim_id` ve ağırlık sütunları eklenir; kaleme `katalog_id` eklenir. Talep eden `kisi.id`'dir. |
| satin_alma_teklif_istegi | rfq | |
| satin_alma_teklif, satin_alma_teklif_satiri | quote, quote_line | Para birimi TRY, USD, EUR, GBP; teklif günü kuru. |
| satin_alma_karar | award | Tek tedarikçi ya da kalem bazlı. |
| satin_alma_karar_kalemi | award_split | |
| satin_alma_onay | approval | Yalnız ekleme; dört göz. |
| satin_alma_siparis | award_order | Tedarikçi başına; teslim ve kalite siparişte. |
| satin_alma_sabit_kur | award.fx | Sipariş anında. |
| satin_alma_ogrenilen | award.lessons | |
| satin_alma_hareket | activity_log | Yalnız ekleme. |
| satin_alma_senaryo, satin_alma_senaryo_satiri | scenarios | |
| satin_alma_katalog, satin_alma_katalog_takma_adi | material, material_alias | `malzeme_id bigint` boş olabilir, FK `malzeme` (Karar 4). |
| satin_alma_tedarikci, satin_alma_tedarikci_kategorisi, satin_alma_tedarikci_degerlendirmesi | supplier, supplier_category, supplier_evaluation | Firma alanları (ad, vergi no, yetkili, telefon, e-posta, şehir) `firmalar` modülünde. |
| satin_alma_ayar | app_settings | Tek satırlık tablo, sütunlu: şirket adı, geçerlilik günü, en az teklif, fiyat uyarı yüzdesi, varsayılan ağırlıklar. |
| satin_alma_kur | currency | Para birimi, kur, aylık fırsat maliyeti, kur tarihi. |
| satin_alma_birim | department | Ad, yıllık bütçe. |
| satin_alma_onay_limiti | approval_limit | |
| satin_alma_kategori | category | |

`app_user` tablosu kalkar: kişiler TMI'den gelir.

## 3. Uçlar ve bağlantı (taşıyıcı)

Prototipte ekranlar `store.ts` üzerinden çalışır, veri katmanı ayrıktır (D: prototip kaynağı, `web/src/transport.ts`). Yeni `transport.tmi.ts` yazılır; ekran kodu değişmez.

| Prototipin isteği | TMI karşılığı | Yetki |
|---|---|---|
| Açılış verisi (bootstrap) | `GET /satin-alma-acilis`: kullanıcının yetkisine göre süzülmüş talepler, katalog, tedarikçiler ve ayarlar | oturum (servis süzer) |
| Talebi kaydet (bütün olarak, sürümlü) | `POST /satin-alma-talepleri/:id/kaydet` (bütün talep + sürüm) | Servis değişikliği sınıflar (V-33) |
| Talep aç | `POST /satin-alma-talepleri/ac` | satin-alma.talep-ac |
| Tedarikçi kaydet | `POST /firmalar/ac` ve `/:id/duzenle` (firma alanları) + `POST /satin-alma-tedarikcileri/:id/kaydet` | firmalar.yaz, satin-alma.yaz |
| Katalog kaydet | `POST /satin-alma-katalogu/:id/kaydet`, `/ac` | satin-alma.yaz |
| Ayarları kaydet | `POST /satin-alma-ayarlari/kaydet` | satin-alma.ayar (yeni işlem) |
| Rapor | `GET /satin-alma-raporlari/:ad` | satin-alma.oku |
| Teslim bekleyenler (yeni ekran) | `GET /satin-alma-teslimleri`, `POST /satin-alma-siparisleri/:id/teslim-al` | satin-alma.teslim-al |
| Talep eden ayrıntısı | `GET /satin-alma-taleplerim/:id` (fiyatsız) | satin-alma.talep-ac |

**V-33, kaydet ucunun yetkisi:** Uç `satin-alma.talep-ac` ister (en zayıf işlem). Servis, eski ve yeni hâli `kurallar.ts`'teki `degisiklikTuru` ile sınıflar ve gereken işlemi `kullanici.islemler`'de arar (kalıp D: `istasyonlar/kurallar.ts:12`):

| Değişiklik | Gereken işlem |
|---|---|
| Onay ya da ret eklendi | `onayla` |
| Teslim bilgisi yazıldı | `teslim-al` |
| Taslakta, kendi talebinde düzenleme | `talep-ac` |
| Diğer her değişiklik | `yaz` |

Durum geçişi, hesaplar ve kısıtlar sunucuda denetlenir. Prototipin ekranına ve `store.ts`'ine dokunmadan TMI'nin "kural sunucuda, yazma komutla" ilkesine uyar. Geri alma maliyeti orta: komutlara bölünmek istenirse taşıyıcı ve uçlar yeniden yazılır.

**Ekranların yerleşmesi:**
- Her TMI sayfası, prototip uygulamasını içerik alanına bağlayan ince bir React ekranıdır.
- Prototipin kendi menüsü ekran setinin içinde kalır; TMI kabuğu çevrede durur (Karar 9).
- Prototip kodu `istemci/src/moduller/satin-alma/merkez/` altına taşınır.
- CSS, modül kökü sınıfı altında kapsamlanır; TMI ekranlarına sızmaz.

## 4. İstenen ve verilen

**İstenen:**
- `kisiler.kisiAdlari` (Ç7, değişmedi).
- `firmalar.firmaAdlari` ve `firmaAktifMi` (var).
- `ayarlar.sistemAyariOku` (D).

`malzemeler`'den şimdilik hiçbir şey istenmez (Karar 4).

**Verilen:** yok.

## 5. Örtüşme

- **Katalog ve malzemeler:** Satın alma kataloğu ile malzemeler modülü bilerek örtüşür (K, Karar 4). Senkron, `satin_alma_katalog.malzeme_id` ile yapılır. Malzemeler modülü hazır olunca eşleştirme ayrıca kararlaştırılır.
- **Ayarlar:** Satın almanın kendi ayar tabloları ile TMI Sistem Ayarları örtüşür (V-32). Yalnız dört göz Sistem Ayarları'ndadır.
- **Hareket kaydı:** Satın almanın hareket kaydı ile `denetim_kaydi` örtüşür. Prototipin "Geçmiş" sekmesi insan diliyle kayıt istiyor; denetim kaydı bunu vermiyor (D: tablo yöntem, yol ve gövde tutuyor).

## 6. Önkoşullar ve çekirdek istekleri

- **ÖK-1:** Dikey dilim ve kapsam kartı.
- **ÖK-6:** Canlı iletim yok; V-31'e göre yenilemeyle çalışılır.

Çekirdek istekleri Ç1–Ç10 sürüm 5'teki gibi. Değişenler:

| İstek | Değişiklik |
|---|---|
| Ç2 | `satin-alma.ayar` işlemi eklenir. |
| Ç4 | `/satin-alma-tedarikcileri` sayfası kalkar. |
| Ç6 | `ondalikKarsilastir` hesap kodunun taşınmasıyla birlikte gözden geçirilir. |
| Ç8 ve Ç9 | Rol × işlem: `satin_alma` rolüne `satin-alma.ayar` eklenir. |
| Ç10 (gizli etiket) | Gereksizleşir: prototip kendi girişlerini kullanır. |

**Yeni Ç11, hesap kodunun yeri:** Prototipin hesap fonksiyonları `paylasilan/satin-alma-hesap.ts` dosyasına girer (Karar 2). Bu dosya zod içermez; istemcinin değer ithal edebilmesi için `eslint.config.js`'teki izinli listeye eklenmesi gerekir (D: eslint iletisi, "zod taşımayan dosya eslint.config.js içindeki listeye eklenir").

**Bilinen kural istisnaları (Karar 1, 2, 5'in doğal sonucu):**
- Prototip ekranları TMI'nin ortak bileşenlerini değil, kendi bileşenlerini kullanır. Arayüzün değişmemesi için bu kaçınılmazdır; kopya değil, prototipin kendi kodudur.
- Prototip React değil, düz TypeScript ve DOM; yeni bağımlılık gerekmez.

## 7. Açık sorular

Açık soru yok. S8 Karar 8 ile kapandı.

## 8. Varsayımlar

| No | Varsayım | Geri alma |
|---|---|---|
| V-30 | JSON yedek kalkar, CSV kalır | Düşük |
| V-31 | Canlı güncelleme yerine 30 saniyelik yenileme | Düşük |
| V-32 | Ayarlar modül tablolarında; dört göz Sistem Ayarları'nda | Orta |
| V-33 | Talep, sürümlü tek "kaydet" komutuyla yazılır; sunucu değişikliği sınıflayıp yetkiyi ve kuralı denetler | Orta |
| V-34 | Talep eden TMI kişisidir: alan oturumdaki kişiyle dolar, prototipteki metin kutusu kişi seçimine döner | Düşük |
| V-35 | Tedarikçi formu firma alanlarını `firmalar`'a, satın almaya özgü alanları kendi tablosuna yazar; form aynı | Düşük |
| V-36 | Prototip kodu TMI'nin lint ve sınır kurallarından geçecek biçimde düzenlenir (ithaller, `any` yok); davranış değişmez | Düşük |

## Doğrulananlar

Kod yok. Okunan: referans HTML (özet değeri prototip önizlemesiyle aynı; 62 renk, 91 satır içi stil sayıldı), prototip kaynağı (`shared/src/index.ts` tipleri, 21 tablo), sürüm 5 teslimi.

## Yazım sonrası kararlar ve düzeltmeler
- **Karar 10:** Karar destek hesapları ekranda; kaydedilen türetilmiş değerler sunucuda.
- **Teslim düzeltmesi:** Teslim alma satın almada yapılmaz. Depo, stoktaki mal kabul belgesiyle, sayarak ve parti girerek alır. Sipariş satırı tamsayı kimliklidir; stok fiyatsız okur. Teslim durumu stok `teslimAlinanlar` ile okunur; gelene kadar "teslim bekleniyor".
- **Kalite:** Mal kabulden önceki GKK rota adımında verilir; satın alma sonucu rota/kalite `gkkSonuclari` ile okur, ayrı alan yok.
- **Malzeme bağı:** `malzeme_katalog_karti.no` (integer).
- **İkinci menü:** Kit 5eb9481'in zorunlu kuralı. Tek ana menü sayfası; menüyü kabuk çizer (karar 9'daki iki menü böylece korunur).
- **"Taleplerim":** Şimdilik yok.
- **İkinci menü solda:** 768 pikselden itibaren sol sütun, telefonda şerit (kullanıcı isteği; çekirdek isteği Ç5).
- **Paylaştırma:** Çubuklar "Karşılaştır ve karar ver" içinde açık durur; ayrı ekran yok (kullanıcı kararı).
- **Uçlar (10):**
  - `GET /satin-alma-acilis`
  - `POST /satin-alma-talepleri/ac`, `/:id/kaydet`, `/:id/sil`
  - `POST /satin-alma-tedarikcileri/kaydet`, `/:id/sil`
  - `POST /satin-alma-katalogu/kaydet`, `/:id/sil`
  - `POST /satin-alma-ayarlari/kaydet`
  - `GET /satin-alma-menu-sayaclari`

## Doğrulananlar
**Ortam:**
- Node `v22.22.2`; depo `>=24` istiyor, Node 24 kurulamadı.
- PostgreSQL 16.15; depo 17+ istiyor.
- Veritabanı depo betiğiyle kuruldu.
- Denetim deposu:
  - `main` = kit `5eb9481` + kabul edilmiş firmalar (göç `20261007150000`) + çekirdek ve firmalar istekleri.
  - `2-satin-alma` = yalnız bu modülün 32 dosyası.

| Komut | Son satır |
|---|---|
| `npm run tip` | çıkış 0 |
| `npm run lint` | çıkış 0 |
| `npm run sinir -- --modul satin-alma` | `Göç damgası denetimi (satin-alma, taban main): 0 ihlal.` (sınır 355 dosya 0, yol 0) |
| `node --test "sunucu/moduller/satin-alma/kurallar.test.ts"` | `# tests 7 # pass 7 # fail 0` |
| `node --import ./araclar/ortam-yukle-goc.ts --test "sunucu/moduller/satin-alma/satin-alma.test.ts"` | `# tests 14 # pass 14 # fail 0` |
| `npx vitest run --config istemci/vite.config.ts` (gerileme; satın alma, App ve ikinci menü testleri dahil) | `Tests 493 passed (493)` |
| `npm run test:sunucu` (gerileme) | `# tests 823 # pass 823 # fail 0` |
| `npm run teslim -- --zip satin-alma-teslim.zip --modul satin-alma --kart 44` (kitin teslim aracı, tam koşu) | `KIRMIZI`, yalnız sayaç okuma yüzünden. Uygulanan 32, belge 6, kilitli 0. Tip ×2, lint ×2, sınır ve göç damgası, ekran testi (`Tests 3 passed (3)`) yeşil; statik uyarı 0. Kural ve veritabanı testleri "geçen test yok (test sayısı okunamadı)". Aracın ham çıktısında `# tests 7 # pass 7 # fail 0` ve `# tests 21 # pass 21 # fail 0`. Araç özeti Node 24 biçiminden (`ℹ tests N`) okur; bu ortamdaki Node 22 TAP (`# tests N`) yazar. `NODE_OPTIONS` alt sürece geçmediği için ortamdan düzeltilemedi. Node 24'te yeniden koşulmalı. |

**Gerçek uygulamada (kit 5eb9481, tarayıcı):**
- Kabuğun ikinci menüsü: İş kutusu, Talepler 3, Malzemeler 6, Tedarikçiler 6, Raporlar, Ayarlar.
- Maddeler adresle açılıyor; içeride açılan ayrıntı adresi koruyor.
- Müdür kökten onaylara yönleniyor.
- Siparişin teslim bölümü "Stok mal kabulü bekleniyor" gösteriyor.
- Paylaştırma çubukları karşılaştırmada düğmesiz görünüyor (sıralama → paylaştırma → karar).
- %50 dağılım karara aktarıldı; sunucuda kalem bazlı bölünmüş karar oluştu (Rulman 20 + 20, V kayış 12 + 13, Gres 18 + 18).
- 1024 pikselde taşma yok; konsol hatası yok.

**Çalıştırılmayan:**
- Node 24 ve PostgreSQL 17.
- Stok ve GKK fonksiyonlarıyla uçtan uca akış (fonksiyonlar henüz yok; türetme saf testlerle sınandı).

