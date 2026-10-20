# Arkon 2. tur kapanış raporu ve Akış A denemesi

Tarih 08.10.2026. Kartlar #199, #243, #223, #248. Ana dal 7c20cef (#272 birleşmiş, GitHub'dan DOĞRULANDI: merged_at 2026-10-08T07:35:08Z).

## 1. Akış A denemesi (yönetici olmayan rollerle)

Nasıl: test veritabanında (tmiv2_test, geçici şema) uygulama `app.inject` ile koşuldu. Kişiler yalnız göçteki gerçek rolle kuruldu (yönetici rolü alındı). Deneme dosyası geçiciydi, depoya girmedi, kod değişmedi. DOĞRULANDI: komut çıktısı.

| # | Kim | Ne yaptı | Sonuç |
|---|---|---|---|
| 1 | yönetici | İş merkezi ve istasyon tanımladı | 200, 200 |
| 2 | yönetici | 4 kişi kurdu, her biri tek rolle | planlama_proje, cam, operator, mudur |
| 3 | planlama_proje, cam, operator, mudur | Arkon'a girdi (`/arkon/ben`) | 200; Arkon rolleri plan, prep, operator, lead |
| 4 | planlama_proje | Aynı istasyonda iki emir açtı (A, B) | 200, 200 |
| 5 | planlama_proje | A için Arkon paketi taslağı yazdı | 200 |
| 6 | operator | A paketini yayınlamayı denedi (ret örneği) | 403 "Arkon rolünüz bu belgeyi yazamaz ya da silemez." |
| 7 | cam | A paketini yayınladı; B'yi de (taslak planlamadan) | 200 |
| 8 | operator | A başlamadan sayım gönderdi (+2 sağlam) | 200; yansıma "bekliyor" |
| 9 | operator | A işine başladı (running) | yazıldı; TMI A: başladı, çalışıyor, sağlam 2 (bekleyen sayım yazıldı) |
| 10 | operator | A sayım +5 | yazıldı; TMI A sağlam 7 |
| 11 | operator | A kuyruğa alınmadan B'ye başlamayı denedi (ret örneği) | reddedildi "Bu istasyonda başlamış bir iş var; önce onu bitirin." |
| 12 | operator | İş değiştirdi: A kuyruğa (queued) | yazıldı |
| 13 | operator | B'ye başladı | yazıldı; TMI A: çalışma duraklı, sağlam 7; TMI B: çalışıyor |
| 14 | operator | A'yı yeniden kuyruğa aldı | eşlenemedi "Emir çalışmıyordu; kuyruğa alma TMI'de değişiklik yapmadı." |
| 15 | mudur | "TMI'ye yazılamayanlar" listesini açtı | 200, 2 satır (adım 11 ve 14); kişi adı ve iç hata yok |
| 16 | planlama_proje | Aynı listeyi açtı | 200, 2 satır |
| 17 | operator | Aynı listeyi açtı | 403 |
| 18 | cam | Aynı listeyi açtı | 403 |

Hata çıkmadı. Gözlem (hata değil): listede `emirNo` boş geldi; bu alan Arkon kaydının `orderNo` alanından okunur ve deneme kaydı onu göndermedi. VARSAYIM: tablet gönderir; emrin güncel numarası için `emirAdlari` isteği açık.
Kapsam: dört kişide iş merkezi kısıtı yoktu; kısıtlı kişi senaryosu `yansima.test.ts` içinde ölçülü (2. tur).
Denenmeyen: tarayıcı ve tablet (ekran) akışı; bu deneme sunucu uçlarıyla yapıldı. Kabul kullanıcının tarayıcı denemesindedir.

## 2. Düzen tablosu (2. tur)

| Madde | Kart | Commit | Durum | İzinli / ret testi |
|---|---|---|---|---|
| Liste veri kapsamı; kişi ve iç hata dönmez | #243 | d587ed9 | main'de (PR #276) | var / var |
| Bekleyen sayım olayları tıkamaz | #199 | 14214ab | main'de | var / var |
| queued -> duraklat | #199 | 8aebf9b | main'de | var / var |
| Dolu numune ölçümü yalnız kalite ve yönetici | #223 | 8969dba | main'de | var / var |
| Silmede sürüm (sunucu, köprü, tablet) | #223 | ed19c7a | main'de | var / var (tablet tarafı tarayıcıda denenmedi) |
| Arızada açan, çağrı kaydından | #223 | 3111d1b | main'de | var / var |
| Belgeler (borç, fark, kural testi, istekler) | #199 | 1568d33 | main'de | - |
| Liste okuma rolü mudur ve planlama_proje | #243 (çekirdek) | #272 | main'de | rol dağılımı testi |
| Araç: `test:modul` ve `sinir` Arkon'u görüyor | #199 | 4765450, a5c0d07 | main'de | - |

Yerel tam `kontrol`: sunucu 1101, istemci 539 test geçti; sınır 0 ihlal. GitHub `kontrol` d830832'de yeşil.
Dal temizliği (D1): yerel 199-arkon-oturtma ve 199-arkon-2 silindi; uzak 199-arkon-2 silinemedi (git push --delete bağlantıyı iki kez kesti). 199-arkon-oturtma uzakta yok.

## 3. Borç: kapanan ve kalan

Kapanan (2. turda): liste kapsamı, sayım tıkanması, queued, dolu ölçüm, silme sürümü, `openedBy`, listenin rollere açılması (#272).

Kalan, kullanımı tutan:
- Koddan tutan bulgu yok (Akış A geçti). Tutan tek iş: kullanıcının tarayıcıda Arkon akış kabulü (Aşama 2 kuralı).

Kalan, etkileyen:
1. Durmuş emir kuyruğa alınınca istasyon kilitli kalır (uretim-emirleri `calisma` alanı bekleniyor).
2. Hurda eksi düzeltmesi TMI'ye geçmez; TMI hurda toplamı fazla kalır (uretim-emirleri isteği).
3. Çevrimdışı gelen kayıt TMI'de varış anıyla sayılır (olay zamanı isteği).
4. Arka planda yeniden deneme yok: bekleyen satır sonraki kayıt isteğine kadar bekler (çekirdekte zamanlayıcı yok).
5. `hatali` satır kalıcı; yeniden kuyruğa alma komutu yok.
6. Reddedilen içerik saklanmaz; kullanıcı yalnız neyin kaydedilmediğini görür.
7. Ortak tablette çıkışta IndexedDB ve localStorage temizliği doğrulanmadı; başka kişinin kuyruk öğesi tablette bekleyebilir.
8. Çerçevede `sandbox` yok; `npm audit`: pdfjs-dist yüksek (Arkon `isEvalSupported: false` ile açıyor).

Kalan, sonra:
1. Uçlar `yetki: 'oturum'`; Arkon rolü servis katmanında (çekirdek `uc({ yetki })` kalıbı dışında).
2. İkinci menü sayaçsız (tek sayaç ucu yok).
3. `emir_id` yabancı anahtarı Aşama 2 göcüyle.
4. Kilit bekleme bütçesi istek başına sınırsız; `korumaliIsle` ve `geciciHataMi` doğrudan testi yok; geçici hata testleri P0001 kullanıyor.
5. `sonuc <> 'yazildi'` süzgecinin dizini yok.
6. `yeniEmirler` ölü durum; `/arkon/kisiler` `kisiler.oku` aramıyor; `arkon/web` strict kapalı.
7. Belge kayması: UYUM-BORCU "Bağlamada kapanacak" içinde "queued -> duraklat bağlı değil" ve "Diğer" içinde "Bekleyen rol dağılımı" satırları artık geçersiz (ikisi de kapandı).

## 4. Biriken istekler

uretim-emirleri (Arkon yazmaz; `BASKA-MODUL-ISTEKLERI.md`):
1. `EmirOzeti`'ne isteğe bağlı `calisma` alanı (calisiyor, durakli, durdu).
2. Hurda düzeltme: `emirSayim` hurdada eksiyi kabul etsin ya da ayrı komut.
3. Komutlara isteğe bağlı `olayZamani`.
4. Yeni emir modelinde (ürün emri + iş emri) `tmi-ue-<id>` bağının neye bağlanacağı.
5. İsteğe bağlı `emirAdlari(db, idler)` (liste için emir no ve parça adı; acil değil).

durus-nedenleri: biriken istek yok (DOĞRULANDI: istek dosyalarında geçmiyor). Arkon duruş nedenini TMI kodundan okuyor; `kv/reasons` yazımı 403.
kisiler (çekirdek üzerinden): #248, ikinci Arkon rollü TMI rolü verilirken uyarı.

## 5. 3. tur için öneri (en çok 10; onayınızla eklenir, konu açılmadı)

1. Belge kayması düzeltmesi (yukarıdaki sonra-7). Yalnız belge.
2. `hatali` satır için yönetici "yeniden dene" komutu (#243'ün devamı).
3. Çıkışta tablet verisinin temizliğini ölçen test; gerekirse temizlik.
4. Tablet silme akışı (`remoteDel`, 409'da yeniden okuma) için birim testi.
5. `korumaliIsle` ve `geciciHataMi` için doğrudan test; P0001 kullanan testlerin düzeltilmesi.
6. İkinci menü sayaç ucu (Hazırlık ve Kalite bekleyenleri).
7. `sonuc <> 'yazildi'` için kısmi dizin (dolu tabloya dizin ekleme göçü).
8. Uçların `uc({ yetki: '<islem>' })` kalıbına taşınması (yetki modeli; sorulur).
9. Arka plan yineleyici için çekirdeğe istek yazılması (CEKIRDEK-ISTEKLERI; çekirdek 3. tur konusuyla birlikte).
10. Çerçeveye `sandbox` özniteliği değerlendirmesi (ekran tarafı; önce etki listesi).
