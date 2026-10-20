# Bağlama: çekirdeğe düşen ortak borçlar (liste, kod yok)

Kaynak: bütün modüllerin `UYUM-BORCU.md` ve `CEKIRDEK-ISTEKLERI.md` dosyaları (origin/main, 09.10.2026) ve `bagla/HAZIRLIK.md`.
Bu dosya yalnız listedir; dal açılmadı, commit atılmadı. Kullanıcı "yaz" deyince her grup ayrı kart ve dalla girer.

İşaretler:
- **[ONAY-ROL]**: rol x işlem satırı ekler ya da değiştirir (yetki modeli, göçle). Kullanıcı onayı ister.
- **[ONAY-GÖÇ]**: dolu tabloya sütun, kısıt ya da eklenti ekleyen göç. Kullanıcı onayı ister.
- **[ONAY-PAKET]**: yeni bağımlılık ya da eklenti. Kullanıcı onayı ister.
- Kanıt türü: D = DOĞRULANDI (origin/main üzerinde grep ya da dosya okuması), V = VARSAYIM (gerekçe yanında), B = BİLMİYORUM.
- "Kart/dal" sütununda kart yoksa "yok" yazar; kart numarası bilinmiyorsa B.

## 1. Kullanımı doğrudan etkileyenler (kullanıma açmadan önce kapanmalı)

| # | Madde | Modül | Kullanımı nasıl etkiliyor | Kart / dal | Değişiklik |
|---|---|---|---|---|---|
| 1 | Rol dağıtımı yok: işlemler yalnız yöneticide | plan (CI 3, P-B12), rota (CI 4, B8/B21), finans (CI 5), satın alma (borç 6), stok (rol satırı yok), kalibrasyon (borç 1), duruş nedenleri (borç 1) | Yönetici dışında kimse bu ekranları açamaz ya da yazamaz. | Aşama 2 akış kartları; kart B | [ONAY-ROL], göç (rol_islemi satırları). Öneriler modüllerin CEKIRDEK-ISTEKLERI dosyalarında (D) |
| 2 | Arkon rol dağıtımı: `sayfa.arkon` ve `arkon.*`; ince işlemler | Arkon | Arkon yazma uçları bugün `'oturum'`la açık: oturumu olan herkes yazabilir. `arkon.yansima-oku` (müdür, planlama) ve `arkon.yansima-yeniden` verildi (D). | #223; dal `224-bakim-rolu-ve-arkon-rolleri` (D, birleşmemiş) | [ONAY-ROL], göç |
| 3 | Okuma uçları ADR 0007 yerine `'oturum'` | plan (P-B9, 2 GET), rota (B11, 10 GET), stok (13, 26 GET; K3 kararı sorulacak), satın alma (7: `acilis`, `menu-sayaclari`) | Oturumu olan her rol bu verileri okur; rol bazlı gizleme yok. | yok (B) | Kod (uç tanımı); yeni okuma işlemi gerekiyorsa [ONAY-ROL] |
| 4 | Yazma uçlarında tekrar koruması (istek kimliği) yok | stok (7/12, hiçbir yazma ucu `tekrarKorumali` değil; "kullanıma açmadan önce" diye yazılı), kalibrasyon (5, `POST /olcu-aletleri`) | Çift tıklama ya da ağ tekrarı çift stok hareketi / çift kayıt açar. | yok (B) | Kod (modül tarafı, çekirdek kalıbı hazır: D) |
| 5 | Sürüm denetimi eksik (dolu tabloya sütun) | duruş nedenleri (3), kalibrasyon (4) | Aynı kaydı iki kişi düzeltirse sonraki öncekini sessizce ezer. Kullanıcı kararıyla borçta (D). | yok | [ONAY-GÖÇ] (`surum` sütunu) |
| 6 | Sürüm denetimi eksik (sütun var ya da gerekmiyor, kod) | ayarlar (2), istasyonlar (5, kişi kısıtı), satın alma (8, alt kayıt), malzemeler ve Arkon (`surumluGuncelle` kullanılmıyor), rota (B12 `eskiSurum()`) | Aynı: eşzamanlı düzeltmede son yazan kazanır. | yok | Kod; satın alma alt kayıt tablosunda sütun yoksa [ONAY-GÖÇ] (B) |
| 7 | Toplama kapatmada kişi denetimi | stok (15) | Toplamayı başka bir kişi kapatabilir. Kullanıcı kararı bekliyor (D, borçta "karar"). | yok | Kural kararı; rol gerekiyorsa [ONAY-ROL] |

## 2. Sunucu zamanı ve kişi

| # | Madde | Modül | Kullanımı nasıl etkiliyor | Kart / dal | Değişiklik |
|---|---|---|---|---|---|
| 8 | Arkon kayıt zamanı TMI'ye taşınmıyor; üretim emirleri tarafına `olayZamani` isteği | Arkon (a) | Makinedeki olay zamanı yerine aktarım zamanı görünür. Üretim emirleri bu oturumun dokunamadığı modül. | yok | Üretim emirleri sözleşmesi (bu şerit yazmaz; sahibine iletilir) |
| 9 | "Bugün" veritabanı `current_date` saat diliminde | istasyonlar (16) | Sunucu saat dilimi İstanbul değilse gün sınırı kayar. V: kurulumda saat dilimi ayarlıysa sorun yok. | yok | Kod ya da kurulum ayarı |
| 10 | `rev[].ch` ve `not` istemci metni | malzemeler | Revizyon notunda kişi ve zaman istemciden gelir, değiştirilebilir. | yok | Kod (sunucu doldurur) |

## 3. Denetim kaydı

| # | Madde | Modül | Kullanımı nasıl etkiliyor | Kart / dal | Değişiklik |
|---|---|---|---|---|---|
| 11 | `denetimEki` / `denetimOzeti` kullanılmıyor | finans (6) | Düzeltme ve iptalde önceki-yeni değer deftere düşmez. | yok | Kod (modül) |
| 12 | `denetimYaz` modül adı vermiyor | ayarlar (`servis.ts:42`, D; denetim borcu 6) | Denetim ekranında modüle göre süzmede ayar kayıtları görünmez. | yok | Kod (çekirdek-yakın, küçük) |
| 13 | Modüle göre süzme ayrı karar | denetim (3) | Denetim ekranı modül filtresi istemiyor/eksik. | yok | Karar |
| 14 | Arkon yazmalarında tam gövde deftere | Arkon | Karar bekliyor; defter büyüklüğü ve kişisel veri. | yok | Karar |
| 15 | `modul` serbest metin | dosya (3) | Yanlış yazılan modül adı süzmeyi bozar. | yok | Kod ya da [ONAY-GÖÇ] (kısıt eklenirse) |

## 4. Ortak arayüz (`istemci/src/ortak`)

| # | Madde | Modül | Kullanımı nasıl etkiliyor | Kart / dal | Değişiklik |
|---|---|---|---|---|---|
| 16 | İkinci menü sayaçları ortak değil | Arkon (istek); satın alma kendi sayacını yapıyor | Menüde bekleyen iş sayısı modülden modüle farklı görünür. | yok | Kod (ortak) |
| 17 | Cihaza göre sade menü ve ortak 3B parçası | stok (Ç6, Ç3) | Tablet/terminalde menü kalabalık. | yok | Kod (ortak) |
| 18 | İkonlar (araba, palet) | stok (Ç4) | İkon eksik, metinle gösteriliyor (V). | yok | Kod (ortak ikon seti); yeni ikon paketi gerekiyorsa [ONAY-PAKET] |
| 19 | Ortak kişi seçici | istasyonlar (3, 11) | Kişi seçimi için `kisiler.oku` gerekiyor; istasyon yöneticisinde yoksa liste boş. | yok | Kod; `kisiler.oku` rol satırı [ONAY-ROL] |
| 20 | Ortak yüzde tipi | istasyonlar (15) | Yüzde alanları modülde ayrı doğrulanıyor. | yok | Kod (`paylasilan`) |
| 21 | İstemci menü tablolarını değer olarak okuyamıyor (`PAYLASILAN_DEGERI` lint) | istasyonlar (2), malzemeler (CI 5) | Modül menü/sayfa bilgisini kopyalıyor; ikisi ayrışabilir. | yok | Araç/lint kuralı (araç, işi durdurmuyor) |
| 22 | Kabukta cihaz tercihi deposu | stok (10) | Cihaz seçimi sayfa yenilenince kaybolur (V). | yok | Kod (ortak) |
| 23 | CSP `script-src 'unsafe-inline'` | malzemeler | Güvenlik başlığı gevşek; kurulumda kapanacak. | yok | Kurulum ayarı |

## 5. Ortak sözleşme ve sunucu kalıpları

| # | Madde | Modül | Kullanımı nasıl etkiliyor | Kart / dal | Değişiklik |
|---|---|---|---|---|---|
| 24 | Ayar sözleşmesinde `caprazKurPayi` yok | finans (CI 8, FK1) | Çapraz kur payı yalnız veritabanından değişir, ekranda alan yok. V: grep `paylasilan`'da bulmadı. | yok | Kod (`paylasilan` sözleşme) |
| 25 | Ödeme `iptalNedeni` ve mahsup `caprazKur` okuma sözleşmesinde | finans (CI 8, B-004, B-009) | `iptalNedeni` sözleşmede (D); mahsup kuru sözleşmede yok (V), ekran göstermiyor. | yok | Kod (`paylasilan`) |
| 26 | SQLSTATE 40P01/40001 için çekirdek yardımcısı | Arkon | Kilitlenme ya da serileştirme hatasında kullanıcı genel hata görür, yeniden deneme yok. | yok | Kod (çekirdek) |
| 27 | `btree_gist` eklentisi (çakışan rezervasyon kısıtı) | plan (P-B5) | Aynı istasyona çakışan plan yalnız uygulamada engellenir. D: eklenti yok. | yok | [ONAY-PAKET] + [ONAY-GÖÇ] |
| 28 | `kisitKorumali` / `sayfaliListe` kullanılmıyor | satın alma, malzemeler, Arkon | Kısıt hatası kullanıcıya ham iletiyle döner; uzun listeler sayfalanmaz. | yok | Kod (modül tarafı, çekirdek hazır) |

## 6. Araçlar

| # | Madde | Modül | Kullanımı nasıl etkiliyor | Kart / dal | Değişiklik |
|---|---|---|---|---|---|
| 29 | `sinir` üst düzey `arkon/` klasörünü tanımıyor | Arkon (CI 3) | Kullanımı etkilemez; Arkon sınır denetimi dışında kalır. V: `araclar`'da `'arkon/'` eşleşmesi yok. | yok | Araç |
| 30 | `harita` `rol_islemi` sahibini göstermiyor | kisiler (4) | Kullanımı etkilemez. | #72 | Araç |
| 31 | Arkon CI 2: `LIKE 'arkon.%'` denetimi | Arkon | Rol göçünün doğruluk testi. | dal `224-bakim-rolu-ve-arkon-rolleri` | Göçle birlikte |

## 7. Kapandığı doğrulananlar (listeden düşenler)

- `test:modul` Linux glob (stok Ç5): kapandı (D).
- `arkon.yansima-oku` müdür ve planlama (`20261008050300`), `malzemeler.tanim-yaz` planlama ve müdür (`20261008013200`), `sayfa.denetim` müdür (`20261008082300`): verildi (D).
- Finans form izni ve görünüm köprüsü (FC #328): kapandı (D, finans borcu 1 ve 11).
- Logo matris satırı: #343'te, #339'la birlikte birleşir (D).

## Sorulacaklar (yalnız onay gerektirenler)

1. Rol dağıtımı (madde 1, 2, 19): Aşama 2 akış sırasıyla (C, A, B, D) mı girsin, tek turda mı? Öneri: akış sırasıyla, her akışın rolleri o akışın kartında.
2. Sürüm sütunu (madde 5): duruş nedenleri ve kalibrasyon dolu tablolarına `surum` sütunu eklensin mi? Öneri: evet, varsayılan 1 ile (geri alması ucuz, veri kaybı yok).
3. `btree_gist` (madde 27): eklenti kurulsun mu? Öneri: plan akışına kadar beklesin; çakışma uygulamada engelleniyor.
