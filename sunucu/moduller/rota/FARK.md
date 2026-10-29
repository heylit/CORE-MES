# FARK (rota, taban c2c9871)

Teslim edilen dosyalar (depo yollarıyla). Çalışma kopyasındaki geçici karşılıklar (istasyonlar, malzemeler, uretim-emirleri, toplayıcılar) teslimde yoktur: UYUM-BORCU.md.

| Dosya | Ne |
|---|---|
| `istemci/src/moduller/rota/AdimPaneli.tsx` | Ekran |
| `istemci/src/moduller/rota/AkisSemasi.tsx` | Ekran |
| `istemci/src/moduller/rota/AkisTablosu.tsx` | Ekran |
| `istemci/src/moduller/rota/Alanlar.tsx` | Ekran |
| `istemci/src/moduller/rota/BolumHatasi.tsx` | Ekran |
| `istemci/src/moduller/rota/BolumYeri.tsx` | Ekran |
| `istemci/src/moduller/rota/EmirlerEkrani.tsx` | Ekran |
| `istemci/src/moduller/rota/KanbanEkrani.tsx` | Ekran |
| `istemci/src/moduller/rota/KomutPaleti.tsx` | Ekran (Hızlı git, T4) |
| `istemci/src/moduller/rota/KaynaklarEkrani.tsx` | Ekran |
| `istemci/src/moduller/rota/MalzemeSecici.tsx` | Ekran |
| `istemci/src/moduller/rota/MalzemelerEkrani.tsx` | Ekran |
| `istemci/src/moduller/rota/OperasyonlarEkrani.tsx` | Ekran |
| `istemci/src/moduller/rota/PartiPaneli.tsx` | Ekran: parti böl ve birleştir (#262) |
| `istemci/src/moduller/rota/PlanEkrani.tsx` | Ekran |
| `istemci/src/moduller/rota/PlanStudyosuEkrani.tsx` | Ekran |
| `istemci/src/moduller/rota/PlanAdimlari.tsx` | Ekran: Plan adım şeridi ve bekleme göstergesi (#841) |
| `istemci/src/moduller/rota/SenaryoEtkisi.tsx` | Ekran: senaryo etkisi ve Plan'daki senaryo özeti (#841) |
| `istemci/src/moduller/rota/Katlanir.tsx` | Ekran: katlanır panel (#841) |
| `istemci/src/moduller/rota/RevizyonSeridi.tsx` | Ekran |
| `istemci/src/moduller/rota/RotaEkrani.tsx` | Ekran |
| `istemci/src/moduller/rota/StokEkrani.tsx` | Ekran (salt okunur, #448) |
| `istemci/src/moduller/rota/StokTamamlama.tsx` | Ekran: emir kartında stok ve tamamlama (#444) |
| `istemci/src/moduller/rota/Rotalar.test.tsx` | Test |
| `istemci/src/moduller/rota/TalimatPenceresi.tsx` | Ekran |
| `istemci/src/moduller/rota/UrunAgaci.tsx` | Ekran |
| `istemci/src/moduller/rota/anahtarlar.ts` | Ekran |
| `istemci/src/moduller/rota/bolumler.ts` | Ekran |
| `istemci/src/moduller/rota/csv.test.ts` | Test |
| `istemci/src/moduller/rota/csv.ts` | Ekran (CSV, T4) |
| `istemci/src/moduller/rota/duzenleme.ts` | Ekran |
| `istemci/src/moduller/rota/gorunum.ts` | Ekran |
| `istemci/src/moduller/rota/kaynak.css` | Ekran |
| `istemci/src/moduller/rota/merkez.css` | Ekran |
| `istemci/src/moduller/rota/plan.css` | Ekran |
| `istemci/src/moduller/rota/rotalar.css` | Ekran |
| `istemci/src/moduller/rota/rotalar.tsx` | Ekran |
| `istemci/src/moduller/rota/secim.ts` | Ekran |
| `istemci/src/moduller/rota/sema.css` | Ekran |
| `istemci/src/moduller/rota/test-ortak.tsx` | Ekran |
| `istemci/src/moduller/rota/useKaynakVerisi.ts` | Ekran |
| `istemci/src/moduller/rota/usePlan.ts` | Ekran |
| `istemci/src/moduller/rota/useRotaCalisma.ts` | Ekran |
| `paylasilan/ayarlar/rota.ts` | rota.dort-goz (varsayılan açık). |
| `paylasilan/islemler/rota.ts` | rota.yaz, rota.onayla, rota.talimat-yaz, rota.emre-kopyala. |
| `paylasilan/sayfalar/rota.ts` | Sayfa tanımı (değişmedi) + ROTA_IKINCI_MENU (kabuk çizer; prototipin bütün bölümleri, K2). |
| `paylasilan/sozlesme/rota.ts` | Uç şemaları; kaynak (makine/kişi), emre kopyala, malzeme arama, menü sayacı şemaları. |
| `sunucu/gocler/20261008140954_rota_tablolar.sql` | Sekiz tablo, beş tetikleyici; malzeme `malzeme_katalog_karti(no)`, kaynak makine/kişi (K3), aday kaynak tablosu. |
| `sunucu/gocler/20261009010515_rota_operasyon_tipi_bagi.sql` | Operasyon tipi bağı |
| `sunucu/gocler/20261009010516_rota_tetikleyici_adlari.sql` | Tetikleyici adları |
| `sunucu/gocler/20261009043000_rota_fason_adimi.sql` | Fason adımı |
| `sunucu/moduller/rota/NOTLAR.md` | Sunucu modülü |
| `sunucu/moduller/rota/disari.ts` | Sunucu modülü |
| `sunucu/moduller/rota/kurallar.test.ts` | Test |
| `sunucu/moduller/rota/kurallar.ts` | Sunucu modülü |
| `sunucu/moduller/rota/rota.test.ts` | Test |
| `sunucu/moduller/rota/servis.ts` | Sunucu modülü |
| `sunucu/moduller/rota/sorgular.ts` | Sunucu modülü |
| `sunucu/moduller/rota/uclar.ts` | Sunucu modülü |

## Önceki teslimden (rotalar, 92f8f76) farklar
- Modül adı `rota`, uçlar `/rota/...`, işlemler `rota.*`; malzeme bağı `malzeme_katalog_karti.no`; rota mamul ve yarımamule kurulur.
- Adımın kaynağı istasyon değil makine ya da kişi (K3); aday kaynaklar.
- İkinci menü kabukta (veri); modülün kendi menüsü kaldırıldı.
- Yeni: emre kopyalama ucu (K1), istek kimliğiyle tekrar koruması, menü sayacı, malzeme arama ucu.
- Kaldırılan: istasyonlar/vardiya/plan/uretim-emirleri sunucu kodları (o modüllerin işi; istek olarak yazıldı).

## Çalışma kopyasında koşulan komutlar (Node 24.21.0, PostgreSQL 16.15; geçici karşılıklarla)
| Komut | Sonuç |
|---|---|
| `node --import ./araclar/ortam-yukle-goc.ts --test "sunucu/moduller/rota/**/*.test.ts"` | tests 45, pass 45, fail 0 |
| `npx vitest run --config istemci/vite.config.ts istemci/src/moduller/rota` | Tests 19 passed (19) |
| `CI=true npm run kontrol` | sunucu tests 1014, pass 1014; istemci Test Files 34 passed (34); çıkış 0 |
| `npm run sinir -- --modul rota` | Sınır 0 ihlal, döngü 0; yol denetimi 9 ihlal = teslim edilmeyen geçici karşılık ve toplayıcı dosyaları |

## Güncelleme: plan modülüne bağlanma (plan teslimiyle)
- `PlanEkrani.tsx`, `KanbanEkrani.tsx`, `PlanStudyosuEkrani.tsx` plan sözleşmesine (`paylasilan/sozlesme/plan.ts`) göre yeniden yazıldı:
  makine ve kişi çizelgesi (ölçek iş sürelerine göre), doluluk matrisi, yerleşim taşı/kilitle/kaldır, Kanban sütunları makine ve kişi,
  stüdyo senaryoları. `istemci/src/moduller/rota/beklenen/plan.ts` silindi (uygularken depodan da silinir).
- Ekran testleri 19/19.

## Depoda oturtma (Aşama 1, 2026-10-08, kart #260)
Teslim olduğu gibi alındı; yalnız oturtma için değişenler:
- Göç yeniden damgalandı: `20261008090000_rota_tablolar.sql` -> `20261008140954_rota_tablolar.sql` (içerik aynı).
- `sunucu/moduller/rota/baglanti.ts` (yeni): olmayan dış fonksiyonların geçici karşılıkları (`operasyonKatalogu`, `istasyonKisileri`,
  `malzemeAra`, `uretimEmriAc`); `servis.ts` yalnız ithal satırları buna döndü.
- `kurallar.ts` STANDART_ROTA kodları istasyonlar kataloğu kodlarına eşlendi (karar RT2 a); `kurallar.test.ts` ve `rota.test.ts` aynı kodlarla.
- `rota.test.ts`: makine güncellemesi sürüm gönderir (istasyonlarda sürüm denetimi tabandan sonra geldi); RT-66/68 izinli durumu ve malzeme
  arama testi geçici karşılığa göre ölçer (UYUM-BORCU B3, B6).
- Toplayıcı satırları (`paylasilan/islemler.ts`, `ayarlar.ts`, `sayfalar.ts`) ayrı commit'le, dar istisnayla.
- Ekran dosyalarına dokunulmadı.

## T4 (kart #415, 2026-10-09)
- A1-A8 (EK maddeler): katalog değerlerine dön, listeden değiştir, tanımla ve adıma ekle, Hızlı git (Ctrl / Cmd + K; bölüm, emir, malzeme, istasyon), Operasyonlar ve Malzemelerde "Akışta aç", son bakılan ürün.
- S4 b: CSV yalnız liste ekranlarında (Operasyonlar, Malzemeler, Üretim emirleri, Stok); yerel yardımcı `csv.ts`.
- Stok bölümü Stok Merkezi uçlarıyla: minimumun altı süzgeci, arama, sayfalama, son hareketler. Kullanıcı kararıyla salt okunur (#448): geri alma ve bütün yazma Stok Merkezi'nde, ekran oraya bağlantı verir. Statüler bekliyor (B32).
- Üretim emirleri gerçek sözleşmeyle (`/adimli-emirler`): yeni emir emre kopyalamayla, plana al, iki adımlı iptal, iş emrine makine ya da kişi, durum süzgeçleri, Kanbanda göster, Şemada aç.
- Bağlama (#414 sonrası): `baglanti.ts` ve `beklenen/uretim-emirleri-adimli.ts` kalktı; `uretimEmriAc` uretim-emirleri'nden; menü sayaçları plan modülüne taşındı (`/plan/menu-sayaclari`), rota `acikRevizyonSayisi` verir.

| Komut | Sonuç |
|---|---|
| `node --import ./araclar/ortam-yukle-goc.ts --test sunucu/moduller/rota/*.test.ts` | pass 48, fail 0 |

## KD-018 (kart #260, 2026-10-09)
- RT-69: fason adımda aday kaynak ve `makineKullanimi: 'paralel'` kayıtta 400 ile reddedilir (`kurallar.ts` `taslakDenetle`); onayda yeniden denetlenir (`onayaHazirMi`, `HazirlikAdimi.makineKullanimi`).
- Ekran: adımın kaynağı fason firma olunca adaylar boşalır, makine kullanımı tek olur; fason adımda aday bölümü gösterilmez.
- Göç yok; var olan kayıt değişmez. Kural öncesi kaydedilmiş böyle bir taslak onaya gönderilemez, düzenlenince kaydedilir.

## Emir kartında stok ve parti (kart #444, #262, 2026-10-10)
- `StokTamamlama.tsx` (#444): bitmiş emrin kartında "Stok ve tamamlama"; stok giriş ve çıkış yetkisiyle, iki adımlı onay, miktarsız komut (çıktıyı stok sağlam adetten hesaplar, #447); eksik varsa "Eksikleri teslim al" mal kabule emirle gider.
- `PartiPaneli.tsx` (#262): emir kartında "Partiyi böl" (sıradaki bekleyen adımdan, elde kalandan az) ve alt partide üst emre ya da aynı adımdan kardeşe birleştir (iki adımlı onay); komut başına istek kimliği.
- `EmirlerEkrani.tsx`: listede alt parti üst emrin altında dal (`kaynak.css` girinti sınıfları); birleşen parti "Birleşti: UE-x" diye görünür.
- Sunucu değişmedi.
- Plan çizelgesi, emir planı (`PlanEkrani.tsx`) ve Kanban kartı (`KanbanEkrani.tsx`) alt partiyi dal gösterir; plan cevabı `ustEmirId` taşır, ortak sıra `gorunum.ts` `dalla` (B37).

## Rotasız ürün ve taslak açma (kart #454, 2026-10-10)
- Reçete ve rota boş ekran: rotası olmayan üründe şema ve tablo yerine "Standart rotadan başla / Boş rota" kartı görünür; önceden panonun altında kalıyordu.
- `taslak-ac` her açışta yeni istek kimliği taşır (`taslakAcIstegi`); önceden 400 "Bu komut istek kimliği ister." dönüyordu.
- Başlıkta seçilen ürünün stok kodu ya da adı; ağaçta boş birim yazılmaz. Sunucu değişmedi.

## Üretim emirleri teslimdeki hâline (kart #457, 2026-10-10)
- Kullanıcı teslimden sapma istemedi: yeni emirde başlangıç ve teslim yine bugünle gelir, öncelik adla seçilir, alan "Not"; iş emri tablosunda "Kısaltma" sütunu (katalogdan, tip id ile; yoksa tip adı).
- Sunucu değişmedi.

## Emirlere uygula ve Rev N (kart #459, 2026-10-10)
- Kullanıcı kararı "Hepsini döndür": emir listesinde "rota değişti" rozeti (açık emir, kaynak revizyon artık yürürlükte değil), emir kartında "Rev N akışta aç" ve "Emirlere uygula (yürürlükteki rota)" teslimdeki gibi döndü.
- Sunucu: `GET /rota/revizyon-kunyeleri?idler=` (harf, ürün, yürürlükteki revizyon; oturum) ve `POST /rota/emirler/:id/yururlukteki-rotayi-uygula` (`rota.emre-kopyala`, istek kimliği). Uygulama uretim-emirleri `isEmirleriniYenile` ile güvenli kipte: başlamış iş emri korunur. Emre kopya ile aynı girdi (`isEmriGirdileri`).
- Rozet yalnız açık emirde (VARSAYIM: bitmiş ya da iptal emre rota uygulanmaz; geri alma tek satır).
- Operasyon kodu düzenleme istasyonlar ucunu bekliyor (#459).

## Operasyon kodu düzenleme (kart #460, 2026-10-10)
- Kullanıcı kararı "Hepsini döndür": Operasyonlar ekranında kod teslimdeki gibi düzenlenir; yalnız değişince gönderilir, istasyonlar ucu başka operasyonun koduna 409 verir.
- Standart rota kod riski #464 ile kapandı (tip kimlikle).

## Standart rota kimlikle (kart #464, 2026-10-10)
- Kullanıcı kararı "Tablo ekle": yeni `rota_standart_adim (sira, operasyon_tipi_id -> istasyonlar_operasyon_tipi, ad)`; göç bugünkü kodlardan bir kez doldurur, katalogda olmayan kodu atlar ve bildirir.
- "Standart rotadan başla" tipi kimlikle bulur; operasyon kodu değişse de açılır. `kurallar.ts` STANDART_ROTA kalktı.

## Saat dilimi (P-B24, #477 sonrası)
- `EmirlerEkrani.tsx`: yeni emir formunun başlangıç ve teslim varsayılanı tesis günü (`tesisGunu`, `#paylasilan/tesis-zamani.ts`); tesiste 00:00-03:00 arasında dünkü gün gelmez.
- `csv.ts`: dışa aktarılan dosya adındaki gün tesis günü.
- `Rotalar.test.tsx` UE-01 formu 21:30Z anında açar, tesis gününü bekler.

## İstek kimliği (kart #481, denetim S-03, S-09, 2026-10-11)
- Kullanıcı kararı "Yaz". Rota istemcisinde `crypto.randomUUID` kalmadı: kimlik ortak `yeniIstekKimligi()` ile üretilir; kurum içi sunucuya düz http ile girilen tarayıcıda Parti paneli ve stok tamamlama açılır, komutlar gider.
- Yeni `komut.ts` `korumaliPost`: plan komutları, stüdyo, öner, yeni emir, emirlere uygula ve taslak açma sonucu bilinmeyen hatada (ağ, zaman aşımı, 5xx) yeniden gönderilirse aynı kimliği taşır; başarıda ya da 4xx'te bırakılır. Kendiliğinden yeniden deneme yok.

## Ana sayfa kartları (kart #489, 2026-10-11)
- Kullanıcı kararı "yaz" (kalan modüllerin pano kartları; tablo `ortak-arayuz/rol-panolari.md`, kart kişinin işlemlerine göre görünür).
- Yeni `istemci/src/moduller/rota/ana-sayfa.tsx`, "Bana düşen işler" bölümünde iki kart:
  - "Açık rota revizyonu" (`rota.yaz`): taslakta ya da onay bekleyen revizyonu olan ürün sayısı (ikinci menüdeki `rotalar` sayacıyla aynı tanım).
  - "Onay bekleyen rota" (`rota.onayla`): açık revizyonu onay bekleyen ürün sayısı.
- Veri var olan `GET /rota/urunler` ucundan, rota ekranlarının sorgu anahtarıyla (tek istek). Sunucu, uç, göç ve rol değişikliği yok. Sayı alınamazsa "Alınamadı"; sıfır uydurulmaz.
- `ana-sayfa.test.tsx`: sayımlar, tek istek, hata durumu, kartın işlemi ve bölümü.

## Operasyon kataloğu İstasyonlar'a taşındı (R1, kart #544, 2026-10-11)
- Kullanıcı kararı: B dağıtımı "yaz" (`bagla/b-dagitim-1.md` R1); katalog ekranı İstasyonlar > Operasyon tipleri'nde (#548).
- `OperasyonlarEkrani.tsx` artık yalnız rota revizyonlarıdır: katalog tablosu, katalog CSV'si ve "Operasyon" ekleme düğmesi kalktı; revizyon listesi ve revizyon CSV'si kaldı. `sayfa.istasyonlar` taşıyan kişiye kataloğa bağlantı gösterilir.
- Bölüm başlığı "Rota revizyonları" (`bolumler.ts`); yol ve anahtar aynı. İkinci menü başlığı çekirdekte (#549).
- `useKaynakVerisi`: kullanılmayan operasyon tipi sorgusu kalktı. Akış şemasından yeni tip ekleme (`RotaEkrani`) kaldı.
- `Rotalar.test.tsx`: Rota'da kod düzenleyen test (IS-03, #460) kalktı, çünkü Rota'da kod düzenlenmiyor (kod kilidi ve 409 İstasyonlar testinde). Yerine: ekranda katalog yok, bağlantı yalnız yetkiliye; revizyon CSV'si.

## Demo bulguları (kart #544, 2026-10-11)
- 2.3: adımda operasyon tipi değişince adım adı yeni tipin adını alır; ad elle değiştirilmişse korunur (`duzenleme.ts` `tipDegistir`).
- Rota başlığı ve revizyon şeridi, ayrıntı gelmeden ürün kimliği ("Ürün 1") yerine ürün kodunu gösterir: ad önce ürünün revizyon listesinden, sonra rota listesinden okunur; hiçbiri yoksa "…" (`RotaEkrani.tsx` `urunAdi`).
- Testler: `duzenleme.test.ts` (ad yeni tipi alır, elle verilen ad korunur), `Rotalar.test.tsx` (ayrıntı gelmeden başlıkta ürün kodu).

## Operasyon alanları: kısaltma ve varsayılan süre yok, tipler gruplu (kart #544, 2026-10-11)
- Kullanıcı kararı ("yaz"): kod kısaltmadır; Rota'da kısaltma, hazırlık dk ve çevrim dk sorulmaz; operasyonlar gruplanır.
- "Yeni operasyon tanımla" kutusu (`AdimPaneli.tsx`): kısaltma, hazırlık ve çevrim alanları kalktı, grup seçimi geldi (katalogdaki gruplardan). Kayıt kısaltma ve varsayılan süreleri boş yazar.
- Akış şeması rozeti ve Üretim emirleri adım tablosu kısaltma yerine operasyon kodunu gösterir ("Kod" sütunu).
- Adımdaki "Operasyon tipi" listesi gruplara bölünür; seçenek "kod · ad". `GET /rota/secenekler` tip satırında `grup` ve `grupAdi` taşır (`paylasilan/sozlesme/rota.ts`).
- Plan etkisi yok: plan ve termin adımın kendi ayar ve birim süresini kullanır, onlar kaldı. Veritabanındaki kısaltma ve varsayılan süre sütunları ile İstasyonlar > Operasyon tipleri ekranı değişmedi. Göç ve yetki yok.

## Operatör ekranı kalktı (kart #544, 2026-10-11)
- Kullanıcı kararı: "rotadaki operatör ekranı kaldır"; operatör Üretim Terminali'ni kullanır.
- Rota > Atölye'deki boş "Operatör ekranı" bölümü kalktı: `bolumler.ts` ve ikinci menü (`paylasilan/sayfalar/rota.ts`). İşlem ve rol değişmedi (madde `sayfa.rota` ile açılıyordu).
- Eski adres `/rota/operator` Rota ana sayfasına yönlenir (`rotalar.tsx`); terminale yönlenmez, çünkü `sayfa.terminal` herkeste yok.
- `Rotalar.test.tsx`: bölüm listesinde yok; eski adres ana sayfaya gider.

## Fason firma listesi sınırı (KD-021, kart #544, 2026-10-11)
- Bulgu: rota seçeneklerindeki fason firmalar, finansın arama sınırı (50) içinde gelen bütün firmalardan sonradan süzülüyordu; 50 fason olmayan firmadan sonra gelen fason firma seçilemiyordu.
- `servis.ts` `fasonFirmalar`: fason süzgeci finansın `firmaAra` aramasına verilir. Sınır finansındır: 50'den çok fason firma bugün listeye girmez.
- `rota.test.ts`: 55 fason olmayan firmadan sonra eklenen fason firma listede.

## Rota tarama düzeltmeleri (kart #544, 2026-10-11)
- Rotayı başka ürüne kopyala istek kimliğiyle gider (`useRotaCalisma.ts` `komut`); önceden tekrar korumalı uç kimliksiz isteğe 400 dönüyordu.
- Kopya hedefi ve giren/yan ürün seçicisinde ürünün kendisi listelenmez (`MalzemeSecici` `haric`).
- Rotası olmayan giren mamulün sütunu "Rota yükleniyor…" yerine "Bu mamulün rotası yok" der (`AkisSemasi.tsx` `rotasiz`).
- Hızlı git penceresinde odak arama kutusundadır (`data-ilk-odak`; pencere ilk düğmeye odaklıyordu).
- Plan ayarları ve yerleşim düzeninde yinelenen React anahtarı paneli çoğaltıyordu; anahtarlar bölüme göre ayrıldı (`PlanEkrani.tsx`).
- Test: `Rotalar.test.tsx` kopyalama (kendisi listede yok, istek kimliği).

## Menüdeki Plan Çizelgesi ve Plan Matrisi (kart #544, 2026-10-11)
- Kullanıcı isteği (madde 5): menüdeki iki plan sayfası Rota > Plan'ın salt okunur hali olsun. Önceden ikisi de "Yapım aşamasında" yer tutucusuydu.
- Rota modülü `/cizelge` ve `/matris` yollarına ekran verir (`PlanSaltEkrani.tsx`): göstergeler, emir zaman çizelgesi, makine ve kişi çizelgesi;
  doluluk matrisi ve istasyon/personel/emir matrisi. Bileşenler Plan bölümüyle aynıdır (`PlanEkrani.tsx` dışa açıldı).
- Yalnız canlı plan okunur (`GET /plan`, taslaksız); Öner, ayar, taşıma, kilit ve kaldırma yok. Çubuğa dokununca yalnız bilgi kartı açılır.
- Sunucu, uç, göç ve rol değişikliği yok: sayfayı `sayfa.cizelge` / `sayfa.matris` gösterir, `GET /plan` oturumla okunur.
- Test: `Rotalar.test.tsx` (yalnız `sayfa.cizelge`, `sayfa.matris` olan kullanıcı; düzenleme düğmesi yok, yalnız GET).

## Karttaki operasyonlardan ilk rota (kart #688, 2026-10-12)
- Kullanıcı kararı "Karttan aktar": malzeme kartında girilen operasyonlar Rota'ya taslak rota olarak kopyalanır; aktarım tek yönlü, kartta kopya kalır.
- Tetik Rota tarafındadır: rotası olmayan, kullanımdaki mamul ya da yarı mamul açılınca "Karttaki N operasyondan başla" düğmesi çıkar
  (`taslak-ac` kaynağı `kart`).
- Kullanıcı isteği "Kendiliğinden açılsın": `isler.ts` `rota-karttan-taslak` işi (dakikada bir) kodlu operasyonu olan kullanımdaki mamul ve yarı mamul
  kartları (`malzemeler/disari.ts` `operasyonluAktifKartlar`) tarar; rotası olmayan karta karttan taslak açar. Açan kartı onaylayan kişidir
  (yoksa son güncelleyen); rota yazma yetkisi aranmaz (VARSAYIM: kullanıcı açılışın kişiye bağlı kalmamasını istedi). Kart başına kayıt noktası:
  bir kartın reddi ötekileri durdurmaz, günlüğe uyarı yazılır. Taslak iptal edilse de yeniden açılmaz (ürünün revizyonu var).
- Kart verisi `malzemeler/disari.ts` `malzemeOperasyonlari` ile okunur (#690). Kod, istasyonlar kataloğundaki aktif tipin koduyla eşlenir
  (büyük-küçük harf sayılmaz); eşleşmeyen satır düşmez, varsayılan tiple ("uretim", yoksa ilk aktif) açılır ve ekranda adıyla bildirilir.
  Adsız satır eşleşen tipin adını, tip de yoksa kartın kodunu alır.
  Kart numaraları OP numarası olur. Kaynak, süre ve bileşen boş gelir.
- Yalnız ilk rotada: ürünün herhangi bir revizyonu varsa (iptal dahil) karttan açma 409 döner ve öneri gösterilmez.
- "+ Mamul seç" düğmesi "+ Ürün seç" oldu; seçici mamul ve yarı mamul kartlarını arar (önceden yalnız mamul).
- Sözleşme: `taslakAcGovdesi` kaynağına `kart`, `urunRevizyonlariCevabi`'na `kartOperasyonlari` ({ sayi, eslesmeyen } ya da null) eklendi. Göç yok.

## Rota şablonları (kart #698, 2026-10-12)
- Kullanıcı isteği: "varsayılan bir rota şablonu olsun, düzenleyebildiğimiz, sıfırdan da doldurulabilir ama şablon rotalarımız olsun".
- Göç `20261012103000_rota_sablonlar` (Stok #701, parti kolu, emir türü, #720 ve #721 göçlerinden sonra). Yeni tablolar `rota_sablonu` (ad tekil, tek varsayılan, sürüm) ve `rota_sablon_adimi` (sıra, operasyon tipi, ad). Göç bugünkü standart rotayı
  "Standart rota" adıyla varsayılan şablon olarak kopyalar; `rota_standart_adim` artık okunmaz, kaldırılması ayrı onaylı göçtür.
- Uçlar: `GET /rota/sablonlar` (oturumla; Malzemeler kartı da istemcide buradan okur), `POST /rota/sablonlar/ekle`, `/:id/kaydet`, `/:id/varsayilan-yap`,
  `/:id/sil`; yazma `rota.yaz` ile (yeni işlem ve rol göçü yok). Varsayılan şablon silinmez; şablondan açılmış rota kopyadır, şablon değişince değişmez.
- Ekran: ikinci menüde "Rota şablonları" (liste, adım düzenleyici, varsayılan yap, sil). Rotasız üründe "Standart rotadan başla" yerine şablon
  seçimi (varsayılan seçili) ve "Şablondan başla"; `taslak-ac` kaynağına `sablon` eklendi, `standart` varsayılan şablondur.

## Parti kolu ekranı (kart #689, B6, 2026-10-12)
- "Partiyi böl" formunda bölünen adım seçilir: kendisi ve sonrası başlamamış her adım (önceki adımın bitmesi gerekmez). Elde kalan,
  önceki adım bitmemişse emir adedidir; bitmişse onun sağlamı, bu adımda katılmış kolların adedi eklenerek (kesin sınır sunucuda).
- İsteğe bağlı birleşme adımı (bölünen adımdan sonraki başlamamış adımlar) ve kola rework, tamir ya da ek adım: tür, yer (kolun başı ya da
  bir adımın sonrası), op numarası (komşuların arası önerilir), ad, operasyon tipi, ayar ve birim süre, açıklama. Kaynak boş gider; kolun
  tablosunda atanır (VARSAYIM: formu kısa tutmak için).
- İş emri tablosunda rotadan gelmeyen adım türü simgesiyle ve açıklamasıyla görünür. Kolda "Katılacak: <emir> OP n" ve "Birleşme planını
  kaldır" (`POST /adimli-emirler/:id/birlesme-plani`, istek kimliğiyle). Elle birleştirme, kaynağın kalan adımlarından biri ek adımsa önerilmez.
- Sunucu ve göç değişikliği yok (#692 uçları).

## Üretim emirleri ana menüde (kart #651, 2026-10-12)
- Kullanıcı kararı: "mevcut olan kaldırılır, rotadaki üretim emirleri sayfası ana sayfaya taşınır; özellikleri ve bağlantısı kopmamalı".
- Emir listesi `/emirler` sayfasıdır (Üretim grubu, `sayfa.emirler`); Rota'nın ikinci menüsünden çıktı. Ekran ve özellikleri aynı (EmirlerEkrani).
- Eski `/rota/emirler` adresi sorgusuyla `/emirler`'e yönlenir: pano kartları, stok kartı, Arkon bağlantısı ve yer imleri çalışır.
- `sayfa.emirler` işlemi göçle `sayfa.rota` olan rollere verilir; eski `/uretim-emirleri` menüden kalkar (ayrı commit).

## Şirket özetinde açık ve geciken emir (kart #664, 2026-10-12)
- Yöneticinin ana sayfasındaki "Şirket özeti" bölümüne iki sayı kartı: Açık emir (taslak, serbest, üretimde; arşiv dışı) ve Geciken emir (açık ve teslimi bugünden önce; teslimsiz emir sayılmaz).
- Kaynak `GET /adimli-emirler`; emir listesi ekranıyla aynı sorgu anahtarı, iki kart tek istek. Kartlar `/rota/emirler`'e bağlanır, `ayarlar.yaz` ile görünür.
- Sunucu, uç, göç ve rol değişikliği yok. Test: `ana-sayfa.test.tsx`.

## Yeni emirde listede olmayan kartlar (kart #544, 2026-10-12)
- Kullanıcı bulgusu: yeni açılan mamul ve yarı mamul "Yeni üretim emri" listesinde görünmüyordu; liste yalnız yürürlükte rotası olan kartı alır.
- Listenin altında ipucu: "Rotası yürürlükte olmayan N kart listede yok (X rotası taslakta ya da onayda, Y kartın hiç rotası yok)" ve
  Ürün ve rotalar'a bağlantı. X rota listesinden; Y, kullanımdaki mamul/yarı mamul sayısından (`/rota/malzeme-ara`) rota listesinde aktif olanlar düşülerek.
- Sunucu, uç ve göç değişikliği yok; başka modüle istek gerekmedi (sayım var olan rota arama ucundan).
- Test: `Rotalar.test.tsx` (#651 adlı test: sayım, bağlantı, taslaklı kart listede yok).

## Planlama ana sayfa kartları (kart #724, 2026-10-12)
- `plan.yaz` olan kişinin ana sayfasında: "Planda geciken emir" (plan göstergesi `geciken`), "Plana girmeyen emir" (yerleşemeyen iş emri olan emir, `engelli`),
  "Bu hafta istasyon doluluğu" (GrafikKarti, çubuk). Üçü canlı planı plan ekranıyla aynı sorgu anahtarıyla tek istekte okur. Sunucu, uç ve rol değişikliği yok.
- VARSAYIM: "bu hafta" bugünden başlayan 7 gündür; doluluk istasyon başınadır (plan yükü istasyon düzeyinde gelir), çalışma zamanı olmayan istasyon yazılmaz.
- Kalan: "Malzemesi eksik emir" kartı için emir başına stok karşılaştırması sunucuda yok; kart #724'te ayrı adım.

## Parti kolu planda, ekran (B7, kart #689, 2026-10-12)
- Kanban kartı ve plan yerleşim kartı ek adımı türüyle gösterir (`AdimTuru`: Rework, Tamir, Ek adım); çizelge çubuğunun etiketine tür eklenir.
- PL-06: plan yerleşim kartında emrin parti paneli (`PlanPartiBolumu`): Partiyi böl, birleştir ve birleşme planını kaldır, Üretim emirlerindeki uçlarla.
  Yetki sunucudakiyle aynı: `uretim-emirleri.yaz` ya da `plan.canliya-al`. Emri okuyamayan kişide panel görünmez. Başka emri açmak Üretim emirleri listesine arama ile gider.
- Kapanan borç: plan UYUM-BORCU P-B18'in "Partiyi böl", "Parçaları birleştir" maddeleri (paralel bölme PL-06'nın motoru ayrı kalır).

## Şablon listesinde girinti (kart #698, 2026-10-12)
- `tc-rota-yigin` liste olarak kullanıldığında tarayıcının liste girintisi ve imi kaldırıldı; şablon listesi ve parti kolu adımları sol kenarla hizalı.

## Üretim emirleri ekranı görünümü (kart #842, 2026-10-12)
- Yalnız görünüm ve kullanım; sunucu, sözleşme ve yetki değişmedi. Emir satırı tek yerde tanımlı sütun şablonlu ızgara (no, ürün, adet, öncelik, durum, adım, sıradaki, teslim, uyarı); Sabit sütun başlık satırı yalnız geniş kapta (en az 1200 px) gelir; 1200 pikselin altında satır kırılır: 1280 ekranda (kap yaklaşık 1030 px) ve 768'de iki satırlı düzen (1. satır no, ürün, öncelik, durum, uyarı; 2. satır adet, adım, sıradaki, teslim), 360'ta üç ila dört satır.
- Öncelik, durum, adım durumu ve "rota değişti" ortak `Rozet` ile; kol satırındaki "↳" yerine `layers` simgesi. Birleşen parti rozet değil, simgeli düz metin.
- Adım tablosu: makine ya da kişi seçicisi tek satır, kısa etiketli (makine kodu, kişi adı; tam ad `title`); fasonda seçici yok, "Fason: <firma>". Ayar ve birim süre ayrı, sağa yaslı, iki ondalık (ekranda yuvarlanır, tam değer `title`); veri yoksa "–". Başlama ve bitiş boşsa "–".
- Üst bant: bağlantılar solda, parti eylemleri ve emir eylemleri aynı araç çubuğunda (sarar). "İptal et" "Diğer" menüsünde, iki adımlı onay satırıyla; birincil değil.
- Seçili adımın sol çizgisi satır boyunca; adım tablosu on bir sütun (başlama ve bitiş tek sütunda, talimat simgeli, "Bağ" başlığı kısa); 1280'de kaydırmasız sığar, 768 ve 360'ta yatay kayar. Sıfırdan farklı süre iki ondalıkta 0,00'a yuvarlanıyorsa dört ondalık yazılır.

## Plan çizelgesi ve matrisi salt okunur görünüm (kart #833)
- `/cizelge` ve `/matris` ayrı sayfa kalır; plan değiştiremeyenin canlı plan görünümüdür, yalnız `GET /plan` okur. Uyarılar, yerleşmeyen işler ve "Rota > Plan" bağlantısı (`/rota/plan`, yalnız `sayfa.rota` olana; yoksa düz metin) iki sayfada da görünür.
- Araç satırı: emir/ürün araması, istasyon süzgeci, 1/2/4 hafta aralığı, ileri-geri gezinti (sınır: planın 14 günlük ufku ile yerleşimlerin ilk-son günü), Bugün. Süzgeç istemcidedir.
- Efsane: öncelik ve durum (çizelge), doluluk sınıfları (matris). Doluluk eşiği tek yerde (`planGorunumu.ts` `YUK_ESIKLERI`); Rota > Plan'daki iki matris de aynı sınıflamayı kullanır.
- Makine ve kişi çizelgesi (`KaynakCizelgesi.tsx`): istasyona göre gruplu; etiket sütunu `position: sticky`. Geciken (teslim gününden sonra biten) ve uyarılı iş kesik çerçeveli ve stop/hold tonlu; yeşil verilmez. Emir çubuğu ve iş çubuğu aynı bilgi panelini açar (salt okunur).
- Yerleşemeyen emir satırında çubuk çizilmez, yalnız "Yerleşemedi"; kısmen yerleşende "Kısmen yerleşti n/m".
- Matris tek (`PlanMatrisTablosu.tsx`): İstasyon yükü, Personel, Makine ve kişi (eski ayrı "Doluluk matrisi"nin yerini aldı), Emir planı; satır/gün/genel ortalama (kapasite ağırlıklı), hücreye dokununca günün işleri.
- Gün sınırı her yerde tesis günüdür; gece yarısını aşan iş iki güne bölünür (eski Doluluk matrisi şimdiden başlayan 24 saatlik pencere kullanıyordu, istasyon tablosuyla gün kayıyordu; Rota > Plan'daki de düzeltildi).
- VARSAYIM: Personel yükü iş merkezi toplamıdır, cevap işi iş merkezine bağlamaz; hücre ayrıntısı bunu söyler. Kapasitesiz ama ihtiyaçlı personel günü "Aşırı" sınıfındadır. Makine/kişi doluluğu 24 saate göredir (kaynak takvimi cevapta yok). Ufuk (14 gün) dışındaki istasyon/personel günleri boş bırakılır.
- Dar ekran: zaman çizelgesi ve kaynak çizelgesi 360-768'de yatay kaydırır (ölçek 1:1, okunur); etiket sütunu solda sabit kalır.

## Plan, Plan Stüdyosu ve Kanban kullanım düzeni (kart #841)
- Yalnız istemci; sözleşme ve uçlar değişmedi. Arayüzde tek ad "senaryo" (eski "taslak"); adres parametresi `?taslak=` ve sunucudan gelen senaryo adı olduğu gibi kaldı.
- Plan: üstte senaryo şeridi ve adım şeridi (Hesapla, İncele, Canlıya al; adıma göre tek birincil düğme). "Öner" artık "Planı yeniden hesapla"; her plan komutu bekleme göstergesi ve sonuç iletisi verir
  (kaç iş yer değiştirdi, kaç yeni yerleşti/yerleşmedi, kaç emir gecikiyor ve öncekine göre fark; fark istemcide önceki ve sonraki `/plan` cevabından hesaplanır).
- Plan'da senaryo açıkken değişiklik özeti ve canlıya göre etki görünür (`GET /plan/senaryolar`); Canlıya al (iki adımlı, `plan.canliya-al`) adım şeridindedir, yetkisizde düğme çizilmez ve nedeni yazılır.
- Plan düzeni: göstergeler ve tek "Dikkat gerekenler" paneli (uyarılar + yerleşmemiş işler, yinelenmeden), ortada tek görünüm seçicili çizelge (Emir çizelgesi, Makine ve kişi, Doluluk matrisi, Plan matrisi),
  altta katlanır "Ayarlar ve motor". Emir çizelgesi ve Makine ve kişi çizelgesi satır başına SVG + solda sabit HTML etiket sütunu; dar ekranda etiket sütunu görünür kalır, çizelge yatay kayar (1:1 ölçek).
- Stüdyo: seçili senaryonun ayrıntısı üstte; Canlıya al birincil, Aç ve düzenle / Senaryoda hesapla ikincil, Çoğalt / Ad ve notu değiştir / Sil "Diğer" menüsünde (Sil onay penceresiyle). Yeni senaryo formu "Yeni senaryo" düğmesinin arkasında;
  hızlı dene katlanır listede.
- Kanban: kartta öncelik, teslim ve gecikme; ↑ ↓ her kartta görünür; bırakma yeri imi; sütunlar kaydırılabilir kapta; atanmamış karttaki OP etiketi okunur renkte; dar ekranda tek sütun ve sütun seçici; her eylemde ileti.
- VARSAYIM: taslak özeti (`taslakOzeti.surum`) senaryo sürümüyle aynıdır (sunucu `plan/servis.ts` ikisini de `x.surum`dan yazar); Plan'dan canlıya alma bu sürümle gider.
- Düzeltme turu (#841): Kanban kart sınıfları `tc-kb-*` oldu (ortak `Kart` bileşeninin `.tc-kart` sınıfı kartı iç içe gösteriyordu); sıra düğmeleri kartın alt satırında yatay, kart yüksekliği içeriğe göre;
  sütunlar `flex: 1 0` ile daralıp genişler ve yatay kaydırılır, sütun yüksekliği tasarım değişkenleriyle (`--ust-cubuk`) sınırlı; dar ekranda sütun seçici ilk dolu sütunla açılır;
  ↑ ↓ ve "Öne al" pasifliği taşınabilir kart sırasına göre. Göstergeler 3 sütun (dar ekranda 2); dar ekranda adım şeridi üç sütun, yalnız geçerli adımın açıklaması altta; eksen etiketi soldan kesilmez, "şimdi" oku geri geldi.
- Bekleme göstergesi Stüdyo komutlarını, Stüdyo'daki "Senaryoda hesapla" ve Plan'daki Canlıya al'ı da kapsar (ortak `PLAN_KOMUT_ANAHTARI`).
- Sonuç iletisi: önceki planda yerleşikken yerleşmeyen iş "yer değiştirdi" sayılır; "yerleşmedi" sayısının ve gecikmenin öncekine göre farkı yazılır (önceki plan önbellekte yoksa fark yazılmaz).
- Stüdyo'da Sil açık ve kendi senaryosunda görünür (önceki davranış; `benim` açık durumu içerir), yalnız Diğer menüsüne taşındı.
- Emir açma formuna isteğe bağlı "Proje" seçici (#861, uretim-emirleri B11): `GET /projeler?durum=aktif` ile yalnız aktif projeler, boş seçenek "Proje yok"; seçilen `projeId` emre kopyala gövdesine girer, sunucuda `emreKopyala` onu `uretimEmriAc`a geçirir (pasif proje 400, `Proje bulunamadı ya da aktif değil.`).
- VARSAYIM: `sayfa.projeler` ya da `projeler.oku` işlemi olmayan kullanıcıda seçici çizilmez ve proje istenmez; emir projesiz açılır (geri alma maliyeti düşük: tek koşul).
- Örnek veri (#906): `ornek-veri.ts` + `ornek-veri.test.ts`. Üç örnek mamule yürürlükte Rev A rota (Mil 2, Flanş 4 fasonlu, Burç 2 adım); `ornek.planlama` hazırlar ve gönderir, `ornek.mudur` onaylar (dört göz açık).
- VARSAYIM: rota işlemleri hiçbir role verilmediği için örnek koşu yalnız bu iki kişiye ilgili işlemi (`rota.yaz` / `rota.onayla`) koşuya özel verir; hesap rolleri değişmez (geri alma maliyeti düşük).
- Rota düzenleme (#943): masaüstünde seçilen adım ya da giren/çıkan için düzenleme, şema ya da tablonun sağında sabit sütun olan tam panelde açılır (şemanın içindeki yüzen kart kalktı); dar ekranda alttan açılan panel aynen kalır.
- Süre ayrımı ve gerçekleşen süre (#1043, Reçete ve Rota süreler planı; kararlar S1 a, S4 a, 13.10.2026):
  - Göç `20261013131825_rota_sure_ayrimi.sql`: `rota_adimi` ve `rota_aday_kaynagi` tablolarına boş olabilen `islem_suresi_dk` ve `degisim_suresi_dk`,
    kısıt `*_sure_ayrimi` (değişim işlemsiz olmaz; işlem varsa birim süre = işlem + değişim). Yeni tablo `rota_gerceklesen_sure` (yalnız ekleme).
  - Var olan satır yazılmaz: onaylı revizyon tetikleyiciyle kilitlidir (`rota_icerik_kilitli`). "İşlem = bugünkü çevrim" okumada uygulanır (RT-71).
  - Uçlar: `GET /rota/revizyonlar/:id/sureler`, `POST /rota/adimlar/:id/gerceklesen-sure`; `disari.ts` `adimEtkinSureleri(db, revizyonId, makineId?)`.
  - Adım cevabında `islemSuresiDk`, `degisimSuresiDk`, `degisimOraniYuzde`; kaydet gövdesinde isteğe bağlı `islemSuresiDk`, `degisimSuresiDk`.
  - Eski Rota ekranı ayrımı gidiş-dönüşte korur; birim süre elle ya da katalogdan değişince ayrım kalkar (`BIRIM_ELLE`).
  - VARSAYIM: gerçekleşen süre ürün + OP numarasına bağlıdır, revizyona değil (yeni revizyon kaybetmez). Geri alma: yeni tablo, ucuz.
  - VARSAYIM: yetki `rota.yaz` (yeni işlem yok, rol x işlem değişmez). Geri alma: tek satır.
  - VARSAYIM: kaynak listesinde `kabul` de var (S4 a "kabul et" için); terminal ve kabul satırları bağlamada yazılır (A7a).
- Terminalden gerçekleşen süre (bağlama B1, borç B38; göç yok):
  - Emir bitince (`disari.ts` `emirBittiYansit`, bağı `kablolama.ts`) rotada olan her makine ya da kişi iş emrinin ölçümü (`isEmriSureOzeti`) terminal önerisi
    olarak yazılır (RT-76): hazırlık ve işlem, iş emriyle; makine iş emrinde öneri o makineye özgüdür. Plan öneriyi kullanmaz (S4 a).
  - Kabul teoriğe yazar (169 c): elle ve terminal satırı ölçümdür, plan yalnız teoriği kullanır (RT-74). `GET /rota/revizyonlar/:id/sureler` adım başına `olcum`
    (tür başına bekleyen ölçüm) taşır; `POST /rota/adimlar/:id/gerceklesen-sure/kabul` (`rota.yaz`) ölçümü ürünün açık taslağına, yoksa yürürlükteki revizyondan
    açılan yeni taslağa teorik süre olarak yazar ve `{ taslak, sureler }` döner (RT-77, RT-78); onay mevcut revizyon akışıyla (dört göz) verilir.
  - Ölçüm toplam birim süredir, değişim düşülmez (170 b); adım ayrılmışsa kabulde işlem = ölçüm − değişim (RT-78).
  - Elle giriş de ölçümdür, teoriğe yalnız kabulle geçer (171 a); revizyon yürürlüğe girince teorik süresi değişen türün ölçümü boşalır, eski teorik eski revizyonda kalır (RT-79).
    Bu, RT-73'ün "geçerli gerçekleşen süre son elle ya da kabul satırıdır" kararını değiştirir (onaylı kararla çelişme 171 a ile onaylı).
  - VARSAYIM: onaydaki revizyon varken kabul 409 döner (açık revizyon tektir, RT-02). Geri alma: tek koşul.
  - VARSAYIM: elle ölçümün kabulü kabul satırı yazmaz (tablo kabul satırını iş emrine bağlar); izi taslağın düzenleyeni ve sürüm defteridir. Geri alma: göçle sütun gevşetme.
  - VARSAYIM: öneri yalnız emir bitince yazılır (iş emri bitişinde olay yok); yazan kişi emri bitirendir. Geri alma: dinleyici.

## İşlem şartnamesi kütüphanesi (971 a, 972 a, 973 a, 976 a, 977; 2026-10-28)

| Dosya | Ne |
|---|---|
| `sunucu/gocler/20261028087000_rota_islem_sartnamesi.sql` | 8 yeni tablo, kilit tetikleyicileri, varsayılan kütüphane (14 kategori, 141 standart atfı, 53 şartname sürüm 1 yürürlükte); dolu tabloya dokunmaz |
| `paylasilan/sozlesme/rota.ts` | Şartname, adım bağı ve emre sabitleme şemaları |
| `paylasilan/islemler/rota.ts`, `paylasilan/islem-adlari.ts` | `rota.sartname-yaz`, `rota.sartname-yayinla` (976 a; ilk aşamada yalnız yönetici, rol satırı yok) |
| `kurallar.ts`, `sorgular.ts`, `servis.ts`, `uclar.ts`, `disari.ts` | Kütüphane komutları, adım bağı, onay denetimi, emre sabitleme; `disari.ts` `isEmriSartnameleri` |
| `sartname.test.ts`, `kurallar.test.ts` | Akış (12) ve kural (4) testleri |

- Şartname "ne isteniyor"dur: kategori, kapsam (iç, fason, ikisi), kaynak (varsayılan, firma, müşteri; müşteride yalnız firma ve belge no), sürümlü alanlar (sayı, aralık, seçim, çoklu, metin, evet), standart atıfları, istenen belgeler, terminal notu.
- Yayınlanan sürüm değişmez (tetikleyici); yeni sürüm yayınlanınca eskisi "eski" olur. Emir açılınca adımın şartnamesi o an yürürlükteki sürümle ve çözülmüş değerlerle iş emrine sabitlenir; "yürürlükteki rotayı uygula" başlamamış iş emrini yeniden sabitler.
- Adım bağı (revizyon, OP no) ile tutulur, yalnız taslakta yazılır; kayıtta çıkarılan adımın bağı silinir; aynı ürünün revizyonundan açılan taslak ve aynı ürüne kopya bağı alır.
- Onaya gönderme, onay ve yürürlüğe alma: kullanımdaki, yayınlanmış, adımın kaynağına uyan (972 a) ve zorunlu alanı dolu şartname ister.
- VARSAYIM: emir açılırken zorunlu alanı boş (yeni sürümde eklenmiş) şartname emri durdurur (422). Geri alma: tek koşul, uyarıya çevrilebilir.
- VARSAYIM: kullanımdan kalkan şartname açılan emre yine sabitlenir; yeni adıma seçilmez, onayda reddedilir. Geri alma: tek koşul.
- VARSAYIM: kod ve kapsam açılıştan sonra değişmez (künye yalnız ad ve kategori); farklı kapsam için kopya açılır. Geri alma: uç genişletme.
- VARSAYIM: ilk sürüm silinmez; şartname kullanımdan kaldırılır. Geri alma: tek koşul.

## Adım adım talimat ve talimat şablonu (989 a, 992 a, 993 a)

| Dosya | Ne |
|---|---|
| `sunucu/gocler/20261028088000_rota_adimli_talimat.sql` | `rota_talimat_adimi` (yalnız ekleme), `rota_talimat_sablonu`, `rota_talimat_sablon_adimi`; 9 şablon, 38 adım tohum |
| `paylasilan/sozlesme/rota.ts` | `KONTROL_TURLERI`, `kontrolSemasi`, `adimliTalimatYazGovdesi`, şablon gövde ve cevapları; `talimatlarCevabi` sürümüne `adimli`, `adimlar` |
| `kurallar.ts`, `sorgular.ts`, `servis.ts`, `uclar.ts`, `disari.ts` | `POST /rota/urunler/:urunId/talimat-adimli-yaz`, `GET/POST /rota/talimat-sablonlari…`; `disari.ts` `talimatSurumuAdimlari` |
| `sartname.test.ts`, `kurallar.test.ts` | Akış (4) ve kural (3) testleri |

- Talimat sürümü yine `rota_talimati` satırıdır (dolu tabloya dokunulmaz): adımlı sürümün metni adım başlıklarıdır; adımlar ayrı tabloda sürüme bağlıdır. Sürüm sabitleme değişmez.
- Düz metin eski sürüm tek adım olarak okunur (`adimli: false`); göçle taşınmaz (993 a).
- Kontrol noktası: yok, onay, ölçüm (ad, alt, üst, birim), fotoğraf (açıklama), seçim (2-10 seçenek). Zorunlu adım kontrol noktası ister (kısıt ve kural).
- Emir açılırken adımlı sürümün kontrol listesi adımlardan kurulur: madde adı başlık, açıklaması adım metni (emir adımı açıklaması en çok 300 karakter, fazlası kısaltılır).
- Şablon kopyalanır, bağlanmaz: "şablondan başla" istemcide şablonu okuyup adımlı yazımla kaydeder; şablon sonra değişse talimat değişmez.
- Medya (995 a, 1004 a): adım başına en çok 5 dosya; `rota_talimat_adim_medyasi` ve `rota_talimat_sablon_adim_medyasi` (göç 089000) künyeyi tutar,
  içerik ortak dosya deposundadır. Bağ özet başına tek kayıt (`medya:<özet>`); ilk bağlayan içeriği yüklemiş olmalı, sonra rotada
  bağlı dosya yeniden yüklenmeden kullanılır (şablon kopyası, yeni sürüm). Okuma `GET /rota/talimat-medyasi/:ozet` (oturum).
  Resim 10 MB, ürün başına 1 GB (aynı dosya bir kez sayılır). Video ve diskte saklama `medyaTutamagi('rota')` ile (1007 a): bağlanan resim ve video `TMIV2_MEDYA_DIZINI`'ne alınır; disk kapalıyken (klasör yok ya da canlıda ayna yok) resim veritabanında kalır, video reddedilir.
- VARSAYIM: adım başına en çok 5 medya. Geri alma: sabit.
- VARSAYIM: videonun 3 dakika sınırı yalnız istemcide ölçülür (sunucu videoyu çözümlemez). Geri alma: sunucuda süre okuma yeni bağımlılık ister.
- VARSAYIM: şablon yazma `rota.talimat-yaz` işlemiyle (yeni işlem açılmadı). Geri alma: uçlarda tek yetki adı.
- VARSAYIM: adım sayısı en çok 30 (iş emri kontrol listesi sınırı). Geri alma: sabit, ama emir tarafı da artmalı.
- VARSAYIM: şablon silinmez, pasife alınır. Geri alma: silme ucu eklenir (kopyalanan talimatlar bağımsız).
- VARSAYIM: ölçüm sınırları boş bırakılabilir (şablonda ürüne göre doldurulur); terminal boş sınırı uyarısız kabul eder. Geri alma: şema `nullable` kaldırılır.

## Hatalı parçanın rework adımına şartname (1034 C, 2026-10-29)
- `POST /rota/emirler/:emirId/is-emirleri/:isEmriId/sartnameler`: planlama rework adımını (Üretim Emirleri `rework-adimi`) doldurduktan sonra
  şartnamesini (örn. TKR-SOK) seçer; Reçete ve Rota ekranı iki komutu art arda çağırır. Rota Üretim Emirleri'ne bağımlıdır, tersi değil (ADR 0006).
- VARSAYIM: yetki rework adımı komutuyla aynı (`uretim-emirleri.yaz` ya da `plan.canliya-al`); yeni işlem yok. Geri alma: uçta tek yetki adı.
- VARSAYIM: iki komut tek işlem değildir; şartname komutu düşerse adım şartnamesiz kalır, adım başlamadan yeniden denenir. Geri alma: Üretim
  Emirleri'ne sabitleyici kancası (kablolama) gerekir.
- VARSAYIM: komut emrin sürümünü denetler ama artırmaz (emir değişmez); aynı iş emrine eşzamanlı iki komut danışma kilidiyle sıraya girer.
- Bulgu (ayrı iş): bölmede kol için yeni iş emri açılır; rota şartnamesi yalnız emir açılışında ve emre uygulamada sabitlenir, kol adımları
  (tekrar adımı dahil) şartnamesiz kalır [Muhtemel, kod okuması, denenmedi].
