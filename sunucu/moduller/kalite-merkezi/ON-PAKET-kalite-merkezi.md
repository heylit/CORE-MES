# Ön paket: kalite-merkezi (Kalite Merkezi, yerel sürüm) - oturtma tarifi

Durum: UYGULANDI (12.10.2026, kullanıcı: "kaliteyi de İK gibi uygulamaya entegre olacak şekilde düzenle"; "hiçbir özellik ve yapı
değişmeyecek"). Kullanıcı kararları (12.10.2026): örnek veri boşaltıldı; yazı tanıma kitaplıkları onaylandı; saklama iki adımlı yol; uygulamanın dört
özelliği (kendi kullanıcı/PIN girişi, örnek veri, tümünü sil, geri yükleme) açık kalır.

## İlke
Uygulama olduğu gibi alınır (ekran yolu A, İK ve finansla aynı): bütün özellikler, ekran, akış, iç yapı aynen kalır.
Değişen yalnız uygulamanın dışındaki "takılma" yeridir:
1. Depolama: uygulamanın iki arka ucu (`IDBB` tarayıcı veritabanı, `SRVB` Python sunucusu) yanına üçüncü arka uç `TMI` eklenir;
   aynı yedi yöntem (`init`, `put`, `del`, `fput`, `fget`, `fdel`, `poll`) iletiyle kabuğa gider, kabuk TMI uçlarına çevirir.
   DOĞRULANDI: arka uç seçimi tek yerde (`initStore`), kayıt yazımı tek yerde (`save`, `removeRec` -> `DB.collection(c).doc(id)`).
2. Kimlik: uygulamanın kendi kullanıcı/PIN girişi TMI içinde kapalı; kullanıcı ve yetki düzeyi TMI oturumundan verilir
   (İK'daki `ben` kalıbı). Uygulamanın 8 yetki adı (`sil, ayar, kullanici, arsiv, onay, kapat, kilitac, kaynak`) TMI işlemlerine eşlenir.
3. Kitaplıklar: HTML'e gömülü kitaplıklar (yaklaşık 19 MB) dosyadan çıkarılır, depodaki paketlerden sunulur (Arkon kalıbı,
   `arkon/vite.config.ts`). Uygulama kitaplığı `emb('lib-...')` yerine aynı adla yükleyiciden alır; kod davranışı değişmez.
4. Python sunucusu, BAT/SH betikleri, SQLite ve `ornek/` klasörü depoya girmez (TMI sunucusu ve PostgreSQL bunların yerini alır).

## Kitaplık eşlemesi (DOĞRULANDI: HTML içindeki başlıklar ve depo `package.json`)
| Gömülü | Boyut | Depoda | Durum |
|---|---|---|---|
| Chart.js 4.4.1 | 0,2 MB | `chart.js` 4.4.1 | aynı |
| three.js r147 + OrbitControls | 0,63 MB | `three-147` (three@0.147.0) | aynı |
| pdf.js 3.11.174 + worker | 1,4 MB | `pdfjs-dist-3` (3.11.174) | aynı; 17.10.2026'da `pdfjs-dist` 6.3.289'a geçildi (kullanıcı onayı) |
| occt-import-js + wasm | 10,2 MB | `occt-import-js` 0.0.23 | aynı sürüm; LISANSLAR.txt 0.0.23 diyor |
| tesseract.js 5.1.1 + worker | 0,19 MB | YOK | uygulamadan alındı, kullanıcı onayı 12.10.2026 |
| tesseract core (5.x) | 3,9 MB | `tesseract.js-core` 6.1.2 | sürüm farklı; uygulamanınki alındı (onaylı) |
| İngilizce dil verisi | 2,6 MB | `@tesseract.js-data/eng` 1.0.0 | VARSAYIM: aynı veri (4.0.0_best_int); doğrulanmadı |

## İçerik ilkesi ve yalıtım (doğrulanmadı, tarayıcıda denenecek)
- Çerçeve `YalitilmisCerceve` (opak köken) ile açılır; uygulama kabuğun oturumuna erişemez.
- occt bağlama kodu `Function` yapıcısı kullanır (`unsafe-eval`); Arkon bunu ayrı çalışanda çözdü (`arkon/sun.ts` CALISAN_YOLU, #199 TBw).
  Kalite Merkezi STEP'i "arka planda" işlerken çalışan açıyor (`new Worker(url)`); opak kökende `blob:` çalışan ve wasm derlemenin
  izinli olup olmadığı BİLMİYORUM. Olmazsa uygulamanın kendi geri dönüşü var ("tarayıcı izin vermezse normal yönteme geçer", BENIOKU).
- `KM_OFFLINE=true` derlemesinde CDN yolu kullanılmaz (DOĞRULANDI: `if(!window.KM_OFFLINE){ const CDN=...}`); içerik ilkesi
  `connect-src 'none'` ile dış istek ayrıca kapanır. tesseract.js içindeki varsayılan CDN adresleri `langPath/corePath` verildiği için
  kullanılmaz (VARSAYIM: kod okuması; ağ denemesi yapılmadı).

## Sunucu tarafı (TMI modülü)
- Uçlar: `GET /kalite-merkezi/veri?sonra=<surum>` (init/poll), `POST /kalite-merkezi/<koleksiyon>/:kimlik/kaydet`,
  `POST /kalite-merkezi/<koleksiyon>/:kimlik/sil`, dosya için TMI `dosya` modülü (`disari.ts`).
- Koleksiyonlar (16, DOĞRULANDI `COLS`): ncr, capa, insp, dev, sup, frm, lot, tpl, spc, cizim, parca, kullanici, iz, belge, emir, bayrak;
  ayrıca `settings` ve `oturum` yazımları var.
- Tablo biçimi (kullanıcı kararı 12.10.2026, iki adımlı yol):
  1. Aşama 1 (bu teslim): tek belge tablosu (jsonb); uygulama değişmeden çalışır, hiçbir alan kaybolmaz.
  2. Aşama 2 (bağla): bağ ya da sunucu kuralı gereken koleksiyonlar tek tek tam ayrıştırılır (İK v2 kalıbı: köprü yazarken
     ayrıştırılmış tabloya da yazar, uygulama değişmez). Sıra: `dev` (kalibrasyon ile), `sup` (finans firma ile), `parca`
     (malzemeler ile), `ncr` ve `capa` (sunucu kuralı). Öteki koleksiyonlar (cizim, frm, tpl, spc, lot, insp, belge, emir, bayrak,
     kullanici, settings, iz) jsonb'de kalır; sorgulanan alanlarına üretilmiş sütun ve dizin eklenir.
- `iz` (değişiklik izi) uygulamanın kendi defteri: TMI'de yalnız ekleme; Python sunucusu da silinemez tutuyordu (BENIOKU).
- Yetki: Aşama 1'de işlemler yalnız yöneticide (CLAUDE.md #158 madde 4); rol dağıtımı Aşama 2'de.

## ORTAKLIK (kavram - Kalite Merkezi koleksiyonu - depodaki sahibi)
| Kavram | Kalite Merkezi | Depoda |
|---|---|---|
| Ölçüm cihazı ve kalibrasyonu | `dev` | `kalibrasyon` (olcu_aleti, olcu_aleti_turu) |
| Tedarikçi | `sup` | firma: `finans` |
| Parça | `parca` | malzeme: `malzemeler` |
| İş emri / sipariş (ERP CSV aktarımı) | `emir` | `uretim-emirleri`; ERP: Logo köprüsü (ADR 0011) |
| Kullanıcı, rol, PIN | `kullanici`, `oturum` | `kisiler`, `oturum` |
| Değişiklik izi | `iz` | `denetim` |
| Belge, fotoğraf, sertifika dosyası | `belge`, dosyalar | `dosya` |
| Teknik resim, balon | `cizim` | planlanan `cizim` (#80), Arkon çizim ekranı |
| Kalite ölçümü, SPC | `insp`, `spc` | planlanan `kalite` (#78, numune talebi), Arkon `/arkon/kalite` |
| Kalite (malzeme kalitesi) adı | - | `malzemeler` tablosu `kalite` (ad çakışması: modül adı `kalite-merkezi` önerilir) |
Aşama 1'de bunlar bağlanmaz; uygulama kendi kopyasını tutar, `UYUM-BORCU.md`'ye "bağlamada kapanacak" yazılır.

## Kapalı özellikler (TMI içinde; İK kalıbı, uygulamadan silinmez, bayrakla kapanır)
Örnek verileri yükle, Tüm verileri sil, Yedekten geri yükle (TMI yedeği sunucuda), kendi kullanıcı/PIN girişi. "Yedek indir" açık.
Uygulandı: dördü de açık ("özellik değişmez"); geri yükleme ayrı işlem (`kalite-merkezi.geri-yukle`).

## Kabul ölçütü
Uygulamanın bütün ekranları TMI menüsünden açılır; kayıt TMI veritabanına yazılır ve ikinci kullanıcıda görünür; STEP, PDF, OCR
internetsiz çalışır; tip, lint, sınır, kural ve veritabanı testleri yeşil; 360/768/1280'de uygulamanın kendi düzeni çalışır.
