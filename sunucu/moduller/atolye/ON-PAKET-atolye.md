# ON-PAKET: atolye (Fabrika Haritası)

Durum: kod yazıldı, onay bekliyor. Başvuru: hedef depo 426c374 (kullanıcının yüklediği kit); ekran düzeni ve kullanım akışı "Atölye Canlı Harita" prototipinden.
Kapsam kararı (kullanıcı, 07.10.2026, bu sohbet): "önce atölye", "Canlı Harita'nın tamamı"; ekran düzeni Canlı Harita'dan. Kart numarası: BİLMİYORUM.
Önceki ON-PAKET-atolye (333c231'e göre) yerine geçer; açık sorular 2-6'nın önerilen seçenekleri uygulandı (Varsayımlar).

## Ad ve sayfa

- Modül: `atolye`. Klasörler: `sunucu/moduller/atolye/`, `istemci/src/moduller/atolye/`, `paylasilan/sozlesme/atolye.ts`, göç `sunucu/gocler/20261007112500_atolye_yerlesim.sql`.
- Sayfa (çekirdek isteği): `{ yol: '/atolye', islem: 'sayfa.atolye', baslik: 'Fabrika Haritası', simge: 'grid', grup: 'Üretim' }`. Grup `Üretim` (canlı izleme ekranı; önceki pakette `Tanımlar`).

## Kapsam

Bu teslimde:
- Salonlar (birden çok; seçici). Salon ölçüsü, hücre ızgarası (A–J × 1–6 gibi), giriş noktası.
- 3B sahne (three.js; WebGL yoksa aynı yerleşim 2B planla): Tüm atölye, Kuşbakışı, Hücre ızgarası, Yürüyerek gez (klavye, sürükleyerek bakma, tıklayınca sunucu rotasıyla yürüme, dokunmatik çubuk).
- Canlı durum: istasyon rengi, andon ışığı, liste ve özet sayılar; üretim emirleri modülünün `GET /uretim-emirleri?durum=basladi` ucundan 15 sn'de bir okunur.
- İstasyon listesi (emir no, parça, sağlam/adet halkası, duruş nedeni) ve öğe kartı (makine, emir, ayak izi, Yakınlaş, Girişten yol).
- Arama: göz adresi (R1-02-3-1, R1-02), raf, istasyon, alan; sonuç salon ve hücreyle; başka salondaki sonuç salonu değiştirir.
- Raf kartında göz adresleri (sayfalı, 200).
- Rota: girişten öğeye ya da yürüyüşte tıklanan noktaya (sunucuda A*).
- Yerleşim düzenleyici (kuşbakışı, sürükle-bırak): duvar, cam bölme, oda, cam oda (kapılı), yürüyüş yolu, bölge, karantina, sevkiyat alanı, palet, palet rafı, küçük parça rafı, konsol raf, sac alanı, yerleşmemiş istasyonlar; döndürme, ızgara ve açı adımı, geri al/yinele, yakınlaştır/sığdır, özellik paneli, tek komutla kayıt, 422 ihlal listesi ve 409 sürüm çakışması.

Prototipte olup bu teslimde olmayan (önkoşul):

| Prototipte | Neden yok | Önkoşul |
|---|---|---|
| Kritik stok, toplama listesi, göz stoku ve lot | stok modülü yok | stok modülü; göze kimlikle bağlanır (`atolye_goz.id`) |
| Plan altlığı (DXF/PDF/görsel) | dosya saklama yok; prototip IndexedDB'de tutuyordu | çekirdek `dosya` tablosu |
| Gerçek 3B model yükleme (STEP/GLB/STL), parça modelleri | dosya saklama yok; gerçek geometri depoya girmez | çekirdek `dosya` tablosu + karar |
| AMR rotası ve araç | AMR verisi ve canlı iletim yok | AMR modülü |
| Olay akışı | emir modülünde genel olay ucu yok | BASKA-MODUL-ISTEKLERI 2 |
| Hız ×10/×30, simülasyon, demo veri | depo kuralı: demo verisi yok | yok (kaldırıldı) |
| Çevrim süresi, iş mili yükü, program, kontrol ünitesi | makine bağlantısı (toplayıcı) yok | makine veri toplayıcı |
| Anlık çakışma uyarısı (düzenlerken) | kural yalnız sunucuda; yazmayan POST yok | yok; kayıtta 422 listesi |

## Önkoşullar

1. **Çekirdek turu** (CEKIRDEK-ISTEKLERI.md): işlem `atolye.yaz` ve toplayıcı, `/atolye` sayfası, rol x işlem göçü, `kisiAdlari`, sahne renk değişkenleri (`tokens.css`), `three` bağımlılığı. Modül bunlar girmeden derlenmez (DOĞRULANDI: çalışma kopyasında bunlar `main`'e konunca `tip`, `sinir`, `kontrol` yeşil).
2. **istasyonlar** modülü var ve yeter (`istasyonlar`, `aktifMakineler` disari işlevleri; DOĞRULANDI).
3. **uretim-emirleri**: canlı durum bugün istemciden uç ile okunur; sunucuya taşımak için `disari.ts` işlevi istenir (BASKA-MODUL-ISTEKLERI 1).

## Yetki

İşlem: `atolye.yaz`. Okuma uçları `oturum` (istasyonlar ve malzemeler kalıbı).

| Yöntem | Yol | Yetki |
|---|---|---|
| GET | /atolye/salonlar | oturum |
| GET | /atolye/salonlar/:id | oturum |
| GET | /atolye/salonlar/:id/rota?basX&basZ&hedefX&hedefZ | oturum |
| GET | /atolye/arama?metin&salonId | oturum |
| GET | /atolye/raflar/:id/gozler?sayfa&bolme | oturum |
| POST | /atolye/salonlar | atolye.yaz |
| POST | /atolye/salonlar/:id/yerlesim-kaydet | atolye.yaz |
| GET | /atolye/fabrika | oturum |
| POST | /atolye/fabrika/kaydet | atolye.yaz |
| GET | /atolye/fabrika/kroki, /atolye/fabrika/kroki/parcalar/:sira | oturum |
| POST | /atolye/fabrika/kroki, /parca-yaz, /tamamla, /hizala, /sil | atolye.yaz |
| GET | /atolye/modeller | oturum |
| GET | /atolye/modeller/:id/parcalar/:sira | oturum |
| POST | /atolye/modeller | atolye.yaz |
| POST | /atolye/modeller/:id/parca-yaz | atolye.yaz |
| POST | /atolye/modeller/:id/tamamla | atolye.yaz |
| POST | /atolye/modeller/:id/ayarla | atolye.yaz |
| POST | /atolye/modeller/:id/sil | atolye.yaz |
| GET | /atolye/kalem-gorunumleri | oturum |
| POST | /atolye/kalem-gorunumleri/yaz | atolye.yaz |
| POST | /atolye/kalem-gorunumleri/sil | atolye.yaz |
| GET | /atolye/salonlar/:id/kroki | oturum |
| GET | /atolye/salonlar/:id/kroki/parcalar/:sira | oturum |
| POST | /atolye/salonlar/:id/kroki | atolye.yaz |
| POST | /atolye/salonlar/:id/kroki/parca-yaz | atolye.yaz |
| POST | /atolye/salonlar/:id/kroki/tamamla | atolye.yaz |
| POST | /atolye/salonlar/:id/kroki/hizala | atolye.yaz |
| POST | /atolye/salonlar/:id/kroki/sil | atolye.yaz |
| GET | /atolye/goz-kalemleri?salonId | oturum |
| POST | /atolye/goz-kalemleri/yaz | atolye.yaz |
| POST | /atolye/goz-kalemleri/sil | atolye.yaz |

Model yükleme ve atama da `atolye.yaz` ister (kullanıcı kararı); model görüntüleme haritayı görenlere açık.

Önerilen rol x işlem (göç CEKIRDEK-ISTEKLERI 3): `sayfa.atolye` → mudur, planlama_proje, kalite, cam, depo, operator; `atolye.yaz` → planlama_proje (yonetici her işlemi taşır).

## Tablolar (göç `20261007112500_atolye_yerlesim.sql`)

- `atolye_salon`: kod (tek, ortak kod biçimi), ad, genislik/derinlik numeric(6,2) 5–500, hucre_boyu 1–50, giris_x/z (ikisi birlikte, salonda), surum (birer artar; tetikleyici), kaydeden_kisi_id → kisi, kaydedildi timestamptz. Silinmez (tetikleyici).
- `atolye_istasyon_yeri`: istasyon_id PK → istasyon, salon_id → atolye_salon, x, z, donus [0,360), genislik/derinlik 0,2–50.
- `atolye_raf`: kod (tek, bütün salonlarda, ertelenmiş; `^[A-Z][A-Z0-9]{0,4}$`), ad, tur (palet, kucuk_parca, konsol, zemin), bolme 1–99, kat 1–9, goz 1–9, bolme_genisligi/derinlik 0,2–10, yukseklik 0,1–15, boy ≤ 100 m, x, z, donus, aktif. Silinmez (tetikleyici).
- `atolye_goz`: raf_id → atolye_raf, bolme, kat, goz; (raf, bölme, kat, göz) tek; rafın ölçüsünü aşamaz (ertelenmiş tetikleyici).
- `atolye_alan`: tur (yuruyus_yolu, bolge, karantina, sevkiyat, oda, cam_oda, palet), ad, x, z, donus, genislik/derinlik 0,2–500, kapı (kenar, ofset, genişlik; üçü birlikte; yalnız odada; kenarın içinde).
- `atolye_duvar`: bas_x/z, son_x/z, kalinlik 0,05–1, cam; uzunluk > 0.
- Göç `20261007141500_atolye_model.sql`: `atolye_model` (ad, kaynak biçimi step/stl/glb/gltf, boyut 20 bayt–25 MiB, parça sayısı boydan, SHA-256 özeti, üçgen sayısı, birim mm/cm/m, yukarı eksen y/z, dönüş, sığdır, tamam, sürüm, kaydeden), `atolye_model_parca` (model, sıra, bytea ≤ 512 KiB; model silinince silinir), `atolye_istasyon_yeri.model_id` → `atolye_model` (boş geçilebilir).
- Göç `20261007203000_atolye_parca_modeli.sql` + `20261008103000_atolye_kalem_gorunumu.sql`: `atolye_kalem_gorunumu` (kod eşleme anahtarı PK, kod 1–60, model → `atolye_model` boş geçilebilir, ambalaj, rafta paket/model, kaydeden, kaydedildi); rafta model ise model zorunlu, model ve ambalaj ikisi birden boş olamaz; yalnız tamamlanmış model (tetikleyici).
- Göç `20261008120000_atolye_goz_kalemi.sql`: `atolye_goz_kalemi` (göz → `atolye_goz`, kod eşleme anahtarı, kod 1–60, ad 1–120, doluluk %1–100, kaydeden, kaydedildi); (göz, anahtar) tek; gözün toplam doluluğu %100'ü aşmaz (ertelenmiş kısıt tetikleyicisi `atolye_goz_dolulugu`). Adet ve hareket yok (stok modülünün).
- Göç `20261008134000_atolye_kroki.sql`: `atolye_kroki` (salon PK → `atolye_salon`; ad, boyut 20 bayt–25 MiB, parça sayısı boydan, SHA-256 özeti, sayfa 1–9999, hizalama: ölçek numeric(14,10) (0, 10], dönüş [0, 360), x/z numeric(9,3); dördü ya hep boş ya hep dolu, yalnız tamamlanmış krokide; tamam, sürüm, kaydeden) ve `atolye_kroki_parca` (bytea ≤ 512 KiB; kroki silinince silinir).
- Göç `20261009090000_atolye_raf_net_olcu.sql` (dolu tabloya boş geçilebilir sütun; kullanıcı onayı "Kat kat net olcu"): `atolye_raf.kat_yukseklikleri numeric(4,2)[]` (tek boyut, uzunluğu kat sayısı, boş eleman yok, her biri 0,05–15; `atolye_raf_kat_yukseklikleri`), `goz_genisligi`, `goz_derinligi numeric(4,2)` (boş ya da 0,05–10; `atolye_raf_goz_net`). Var olan raflar boş kalır, görünümleri değişmez.
- Ortak güvence: `atolye_salon_icinde` (ertelenmiş kısıt tetikleyicisi, dönmüş dikdörtgenin dört köşesi; salon küçülmesi dahil).

## İş kuralları

| No | Kural |
|---|---|
| ATL-01 | Salon 5–500 m genişlik ve derinlikte, hücre boyu 1–50 m'dir. |
| ATL-02 | Hücre adı sütun harfi (A…Z, AA…) ve satır numarasıdır; kenardaki nokta son hücreye düşer. |
| ATL-03 | Konum ve ölçü 0,01 m'ye, dönüş 0,1°'ye yuvarlanır ve [0, 360) aralığına indirgenir. |
| ATL-04 | Bir istasyonun en çok bir yeri vardır (başka salonda yerleşikse önce oradan kaldırılır). |
| ATL-05 | Yalnız var olan ve aktif istasyon yeni yerleştirilir. |
| ATL-06 | Her öğenin bütün köşeleri (dönüş dahil) salonun içindedir (1 cm pay). |
| ATL-07 | İstasyon, raf ve palet birbiriyle ve duvar/oda kenarıyla iç içe geçmez; 1 cm'den az değme çakışma değildir; odanın içine istasyon konabilir. |
| ATL-08 | Öğesi dışarıda kalacak salon küçültülemez. |
| ATL-09 | Raf kodu bütün salonlarda tektir, kırpılıp büyük harfe çevrilir, tire içermez. |
| ATL-10 | Rafta en çok 99 bölme, 9 kat, 9 göz; ölçüler sınırlıdır; rafın boyu bölme sayısı × bölme genişliğidir. |
| ATL-11 | Göz adresi Raf-Bölme-Kat-Göz (R1-02-3-1); rafın ölçüsünü aşan göz yoktur. |
| ATL-12 | Raf küçülünce dışarıda kalan göz silinir; ona bağlı kayıt varsa komut reddedilir. |
| ATL-13 | Raf silinmez, pasife alınır; pasif raf aramada çıkmaz, planda soluk görünür. |
| ATL-14 | Arama Türkçe harf, aksan ve büyük/küçük ayırmaz; tam göz adresi ilk, sonra tam eşleşme, başlangıç, içerme; en çok 20 sonuç. |
| ATL-15 | Arama sonucu öğenin salonunu ve hücresini verir. |
| ATL-16 | Düzenleyicinin açtığı sürüm güncel değilse kayıt 409 alır; ayrıntı kimin, ne zaman kaydettiğini söyler. |
| ATL-17 | Pasif istasyonun yeri kalır, planda pasif görünür, aramada çıkmaz. |
| ATL-18 | Giriş noktası salonun içindedir; bir öğenin üstündeyse uyarıdır. |
| ATL-19 | Yürüyüş yolunu kapatan öğe uyarıdır, kaydı engellemez. |
| ATL-20 | Rota katı öğelerden (0,3 m gövde payıyla) geçmez, yürüyüş yolunu yeğler; hedef kapalıysa ulaşılan en yakın noktada biter; giriş tanımsız ve başlangıç verilmemişse rota yoktur. |
| ATL-21 | Kapı yalnız odada olur ve kenarın içinde kalır. |
| ATL-22 | Duvarın uzunluğu sıfır olamaz. |
| ATL-23 | Her yerleşim kaydı denetim kaydına düşer; salon son kaydedeni ve zamanı tutar. |
| ATL-24 | İstasyona yalnız yüklemesi tamamlanmış model atanır; model atanmamışsa gövde istasyon tipinden çizilir. |
| ATL-25 | Model GLB 2.0 olarak saklanır, en çok 25 MiB; 512 KiB parçalarla gelir; bütün parçalar, boy, GLB başlığı ve SHA-256 özeti tutmadan tamamlanmaz. |
| ATL-26 | Tamamlanmış modelin dosyası değişmez; adı ve yerleşim ayarı (birim, yukarı eksen, dönüş, sığdır) sürümle değişir, eski sürüm 409 alır. |
| ATL-27 | İstasyona atanmış ya da parçaya bağlı model silinmez; yarım kalmış yükleme silinebilir. |
| ATL-28 | Koda (parça no, malzeme kodu) tek görünüm bağlanır: model (isteğe bağlı), ambalaj, rafta paket ya da model; eşleme boşluk ve büyük/küçük harf ayırmaz; rafta model gösterimi model ister; görünüm boş olamaz; yalnız tamamlanmış model bağlanır. Başlamış emrin parçasının modeli makinenin üstünde döner; gözdeki kalem rafta seçilen görünümle çizilir. |
| ATL-30 | Kapsam başına (fabrika ya da bölüm) tek kroki (PDF); yeni yükleme eskisinin yerine geçer. Yükleme parça parça gelir, tamamlanırken parça sayısı, boy, özet ve PDF imzası denetlenir; tamamlanmış dosya değişmez. Hizalama (ölçek > 0, dönüş, konum) yalnız tamamlanmış krokiye ve sürümle yazılır; ölçek 10 hane, dönüş 0,01°, konum milimetre. |
| ATL-31 | Bölümler fabrika planında (sol üst köşe ve o köşe çevresinde dönüş) üst üste binmez; kenar değebilir. |
| ATL-33 | Rafa net ölçü girilebilir (isteğe bağlı): alttan üste her katın net yüksekliği (taşıyıcının üstünden bir üst taşıyıcının altına), göz net genişliği ve derinliği. Kat dizisi girilirse kat sayısı kadardır; kapalı katların toplamı (küçük parça rafında hepsi, palet ve konsolda en üst kat hariç) raf yüksekliğini aşmaz; göz eni × göz sayısı bölme genişliğini aşmaz (konsolda göz eni kol aralığını aşmaz, göz derinliği × göz sayısı kol boyunu aşmaz); göz derinliği raf derinliğini aşmaz (palet rafında 30 cm taşma payı). Girilmeyen ölçü çizimden hesaplanır. Rafta parçanın sığıp sığmadığı girilen ölçüyle denetlenir. |
| ATL-32 | Fabrika kaydında bir istasyon ve bir raf tek bölümdedir; kayıttaki bölümlerin her rafı bir bölümde kalır (bölüm değiştirebilir, silinmez: ATL-13); raf kodu fabrikada tektir; kayıt dışındaki bölümde yerleşik istasyon buraya gelmez. |
| ATL-29 | Göze kalem (kod, ad) gözün yüzde kaçını doldurduğuyla konur; aynı gözde aynı kod bir kez (eşleme ATL-28 gibi), yeniden yazılınca güncellenir; gözün toplamı %100'ü aşmaz; pasif rafa kalem konmaz; kalem konmuş göz raf küçülünce silinmez (ATL-12). Makinede hangi parçanın üretildiği üretim emirlerinden okunur (tablo yok). |

Kural → test ya da kısıt eşlemesi: KURAL-TEST.md.

## Başkasından istenen

| Modül | İşlev | Durum |
|---|---|---|
| istasyonlar | `istasyonlar(db, { pasiflerDahil })`, `aktifMakineler(db)` | var (DOĞRULANDI) |
| kisiler | `kisiAdlari(db, idler): Promise<Map<number, string>>` | yok; çekirdek isteği 4 |
| uretim-emirleri | istasyon durumları (`disari.ts`) | yok; BASKA-MODUL-ISTEKLERI 1 (bugün istemci ucu okur) |
| uretim-emirleri | `GET /uretim-emirleri` (bütün emirler; parça-makine ilişkisi) | var (istemci okur; DOĞRULANDI) |
| stok (yok) | göz ve kalem başına adet | yok; BASKA-MODUL-ISTEKLERI 5 |

## Başkasına verilen

- `disari.ts` (kart #686): `gozler(db, salonId?)`, `gozBul(db, adres)`, `gozAdresi(db, gozId)`, `raflar(db)`, `alanlar(db, salonId?)`. Stok miktarı göze ya da alana bağlanır.

## Örtüşme

- istasyonlar: istasyon, iş merkezi, makine oradadır; atolye yalnız `istasyon.id` ile yer tutar. İstasyon tipi gövde biçimini, ayak izi atolyededir (makinede ölçü yok).
- uretim-emirleri / terminal: canlı durum ve emir bilgisi oradan okunur; atolye yazmaz.
- stok (yok): raf ve göz atolyededir; stok göze `atolye_goz.id` ile bağlanacak.
- istasyon.tip = 'depo' ile raf aynı şeyi anlatabilir (açık soru 3).
- Sayfa yolu ve uçlar `atolye` önekli; başka modülde aynı tablo ya da sayfa yok (`npm run harita`, DOĞRULANDI).

## Varsayımlar (geri alma maliyeti)

- Raf ve göz atolyenin, göz ayrı satır, tek güncel yerleşim + satır sürümü (önceki soruların önerileri) — yüksek (dolu tablo taşınır).
- Gövde biçimi istasyon tipinden çizilir (talaşlı kabinli işleme merkezi, kalite CMM, montaj tezgâhı, boya kabini, markalama, depo); marka-model metindir, biçime dönüşmez — düşük.
- Canlı durum istemciden 15 sn'de bir sorgulanır (canlı iletim yok) — düşük.
- Rota noktaları hesaplanmış değer olduğu için sayı döner (numeric sütun değil) — düşük.
- Alan ve duvar kimlikleri kayıtta yenilenir (bağlanan kayıt yok) — orta (ileride bağlanırsa).
- Pasif raf yerinde durur ve engel sayılır — düşük.
- Model dosyası veritabanında bytea parçalarla (kullanıcı kararı); yedek boyu modellerle büyür — orta (dosya deposuna taşımak göç ister).
- STEP sunucuda değil tarayıcıda çevrilir; sunucu yalnız GLB doğrular. Büyük STEP'te çeviri kullanıcının cihazında birkaç dakika sürebilir — düşük.
- Model sığdırma tek ölçekle ayak izine sığar (oran korunur); sığdır kapalıysa gerçek ölçü, ayak izinden taşabilir (kural değil, görünüm) — düşük.
- Parça modeli de (müşteri parça geometrisi olabilir) makine modeli gibi şirket veritabanında durur; önceki kararın (model dosyası veritabanında, depoda değil) parçaya genişletilmesidir — düşük (bağ kaldırılır, model silinir).
- Kalem görünümü tablosu parça modeli tablosundan yeniden adlandırıldı (göç, satırlar korunur); teslim edilen önceki göç yerinde kaldı — düşük.
- Rafta model dizisinde göz başına en çok 48 kopya (çizim yükü) — düşük.
- Parça eşlemesi üretim emrindeki serbest metin parça noya bağlıdır (parça tablosu yok); parça kaydı gelince oraya taşınır — orta (eşleme tablosu göç ister).
- Göz ataması ve elle doluluk atölyede, adet ve hareket stok modülünde (kullanıcı kararı); stok gelince doluluk adetten hesaplanabilir — orta (doluluk sütunu kalkarsa göç).
- Makine-parça ilişkisi üretim emirlerinden türetilir, iptal emir sayılmaz; emir listesi sayfasız okunur (çok emirde sayfalama gerekir) — düşük.
- Gözün görünümünü en çok dolduran kalem verir (eşitlikte kod sırası) — düşük.
- Bölmeye bakışta kamera açısı 14°, komşu bölmeden yaklaşık 35 cm görünür; dönme kapalı (hep dik bakış) — düşük.
- Kroki dosyası (şirket planı) modeller gibi veritabanında, depoya girmez; testlerde uydurma PDF — düşük.
- Salon başına tek kroki, tek sayfa; çok katlı ya da çok paftalı plan için sayfa seçilir — orta (birden çok kroki göç ister).
- Kroki hizalaması yerleşim kaydından bağımsız, hemen saklanır (geri al/yinele kapsamında değil) — düşük.
- Yapışma toleransı 10 piksel; eksene 0,3°'den yakın çizgi eksen çizgisi; 5 cm'den kısa çizgi yapışmaya girmez — düşük.
- Çizilen raf: bölme genişliği santimetreye yuvarlanır, raf boyu çizimden en çok bölme sayısı × 0,5 cm sapar; ön yüz yönü çizimden bilinmez (gerekirse 180° döndürülür) — düşük.
- Kroki 3B sahnede gösterilmiyor (yalnız düzenleyicinin 2B planında) — düşük.
- Andon, modelli istasyonda ayak izinin arka sağ köşesinin 15 cm dışında zemin kolonunda — düşük.
- Ekran etiketleri motorun hesapladığı konumu CSS değişkeniyle alır (çekirdek isteği 7) — düşük.
- SVG plandaki yazı boyutları metre ölçeğindedir (tasarım değişkeni piksel) — düşük.

- Bölüm sol üst köşesi çevresinde döner; öğenin bölümü kayıtta ortasının düştüğü bölümdür (kenarda ilk bölüm) — düşük.
- Fabrika kaydı bütün bölümleri gönderir (her bölüm kendi sürümüyle; başkası bir bölümü kaydettiyse 409) — düşük.
- Yürüyüş ve rota yalnız bölüm içinde; fabrika görünümünde yürüyüş yok — orta (bölümler arası yol için kapı/geçit verisi gerekir).
- Bölüm çakışması yalnız kenarda serbest — düşük.
- Fabrika görünümünde öbür kapsamın krokisi yalnız hizalanmışsa gösterilir — düşük.

- Raftaki gerçek parça modeli yalnız yakında ve üçgen bütçesi içinde (1,5 M; bölme bakışında 3 M), ötesi kutu vekil; bütçe gerçek ekran kartında ölçülmedi — düşük (sabit değişir).
- Boşta 30 kare; yavaş karede piksel oranı 0,75'e kadar iner (görüntü biraz yumuşar) — düşük.

- Rafta yatış otomatik (modelin duruşu sığıyorsa korunur); elle seçim yok — düşük (kalem görünümüne alan eklenirse göç).
- Konsol rafta göz iki kol arasıdır (kullanıcı kararı: "Kol arasi kalsin"); uzun malzeme birden çok göze yazılır — düşük.
- Net ölçüde taşıyıcı kalınlıkları ölçülmez, çizimdeki değerler kullanılır: palet kirişi 12 cm, küçük parça raf tablası 2,5 cm, konsol kolu 8 cm; palet yüksekliği 14 cm (paletli gözde model bölgesi net yükseklik − 14 cm); ilk taşıyıcı palet rafında zemin, küçük parça rafında 11,25 cm, konsolda 44 cm — düşük (sabit).
- Net göz derinliği palet rafında yalnız yükün bölgesidir; palet kirişlere binecek derinlikte çizilir — düşük.
- Eksik kat girişi (bazı katlar boş) istemcide uyarılır, kayıtta sunucu ATL-33 ile reddeder — düşük.

## Açık sorular

1. **`three` (0.186) yeni bagimlilik olarak girsin mi?** Neden: 3B sahne ve yurume ona bagli; CLAUDE.md yeni bagimliligi onaya bagliyor. Secenekler: (a) girsin; (b) girmesin, harita yalniz 2B plan olsun (`Sahne3B` WebGL'siz yolu zaten 2B). Oneri: (a); kapsam secimi (Canli Harita'nin tamami) bunu istiyor.
2. **Rol x islem matrisi onerildigi gibi mi?** Neden: yetki modeli. Secenekler: (a) sayfa: mudur, planlama_proje, kalite, cam, depo, operator; yazma: planlama_proje; (b) yazma mudur'a da. Oneri: (a).
3. **Depo istasyonu (istasyon.tip = depo) ile raf iliskisi?** Neden: ayni yer iki kez tanimlanabilir. Secenekler: (a) ayri kalsin, raf atolyede; (b) raf depo istasyonuna baglansin (yeni sutun). Oneri: (a).
4. **Pasif raf yerinde engel olarak kalsin mi?** Neden: silinmedigi icin yeri hep dolu kalir. Secenekler: (a) kalsin (fiziksel raf duruyor); (b) pasif raf cakisma ve rotadan cikarilsin. Oneri: (a).
5. **Sahne etiketlerinin konumu icin satir ici CSS degiskeni (`--x`, `--y`) istisnasi kabul mu?** Neden: kural "satir ici stil yok"; konum her karede hesaplanir. Secenekler: (a) istisna; (b) ortak "sahne etiket katmani" bileseni (cekirdek); (c) etiketler WebGL icinde cizilsin. Oneri: (b), girene dek (a).
6. **Duzenleyici tam ekran: ortak `Pencere`'ye `tur="tam"` eklensin mi?** Neden: ortak bilesenle kurulamadi, modulde ozel katman var. Secenekler: (a) cekirdege eklensin, modul ona gecsin; (b) modulde kalsin. Oneri: (a).

Cevaplanan: 7. Konsol rafta göz kol arası mı, raf boyu mu? Kullanıcı (09.10.2026): "Kol arasi kalsin".

## Doğrulananlar

- Ölçüm turu 2: `npm run kontrol` çıkış 0 (sunucu 636/636, istemci 331/331), `sinir` 0 ihlal; görünüm değişiminde gölgelendirici yeniden derlemesi 8 → 0, geçiş ~285 → ~88 ms (JS, önizleme).

- Optimizasyon turu: `npm run kontrol` çıkış 0 (sunucu 636/636, istemci 331/331), `sinir` 0 ihlal; önizlemede fabrika görünümü üçgen 40,8 M → 151 bin, çizim çağrısı 1390 → 629, yeniden kurulum 778 → 285 ms; yazılım GL'de 3B ekran görüntüsü artık alınabiliyor (önce zaman aşımı).

- Fabrika bölümleri turu: `npm run kontrol` çıkış 0 (sunucu 636/636, istemci 331/331), modül istemci 81/81, `sinir` 0 ihlal; önizlemede 2B 1440 ve 390 px uçtan uca (bölüm sürükleme, bölümler arası istasyon taşıma, toplu kayıt), 3B görüntü doğrulanamadı (yazılım GL zaman aşımı).

- Kroki stüdyosu turu: `npm run kontrol` çıkış 0 (sunucu 632/632, istemci 322/322), modül sunucu 46/46, istemci 72/72, `sinir` 0 ihlal; önizlemede uydurma vektör PDF ile uçtan uca (ölçek 1:150, çizilen istasyon 4,00 × 3,50 m, kolon arası 6,50 m), 390 px taşma yok.
- Depo, parçalar ve bölme bakışı turu: `npm run kontrol` çıkış 0 (sunucu 630/630, istemci 311/311), modül sunucu 44/44, istemci 61/61, `sinir` 0 ihlal; önizleme 1366 px yazılım GL'de depo, göz paneli, bölme bakışı (palet ve küçük parça rafı) ve parçalar ekran görüntüsüyle denendi, konsol temiz.
- Kalem görünümü ve arayüz turu: `npm run kontrol` çıkış 0 (sunucu 628/628, istemci 305/305), modül sunucu 42/42, istemci 55/55, `sinir` 0 ihlal.
- Depo yükü turu: `npm run kontrol` çıkış 0 (sunucu 628/628, istemci 297/297), modül istemci testleri 47/47, `sinir` 0 ihlal.
- Parça önizlemesi turu: `npm run kontrol` çıkış 0 (sunucu 628/628, istemci 288/288), modül sunucu testleri 42/42, modül istemci testleri 38/38.
- Model turu: `npm run kontrol` çıkış 0 (sunucu 626/626, istemci 286/286), modül sunucu testleri 40/40, modül istemci testleri 36/36, `sinir` 0 ihlal; testler ayrı geçici veritabanı kümesinde (port 5433).

- Çalışma kopyası: kit 426c374 + çekirdek istekleri `main`'de, modül `atolye` dalında; Node 24.21.0, PostgreSQL 16.13.
- `npm run kontrol` yeşil (sahne yenilemesinden önce): sunucu 621 test, istemci 262 test geçti; modül sunucu testleri 35/35.
- Sahne yenilemesinden sonra (yalnız istemci dosyası değişti; `git diff` sunucu ve paylasilan için boş): `tip`, `lint` temiz, istemci 278/278 (modül 28/28, gerçeklik denetimi dahil), saf kurallar 19/19, `sinir` 0 ihlal. Sunucu akış testleri bu kez koşmadı: çalışma ortamındaki test veritabanının kimlik bilgisi `.env` ile uyuşmuyor (ortam yeniden başlamış).
- `npm run sinir -- --modul atolye`: 0 ihlal (sınır, yol, göç damgası).
- Elle deneme (yerel, uydurma tohum verisiyle; depoya girmez): 1440, 768, 360 genişlikte sayfa; açık/koyu tema; seçim, arama, göz listesi, girişten rota, yürüyüş, düzenleyicide raf ekleme, 422 ihlal listesi.
- Sahne prototiple yan yana görüntülendi (1600 genişlik, genel, yakın, kuşbakışı, koyu tema, 390 genişlik); konsolda hata yok.
- Bağımsız denetim (ayrı ajan) 26 bulgu verdi; düzeltilenler FARK.md'de, kalanlar bu paketin açık soruları ve isteklerinde.
