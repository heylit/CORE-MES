# ON-PAKET: plan (TMI CORE V2, taban c2c9871) - sürüm 3

Durum: bütün sorular cevaplandı (bölüm 9); kod yazılıyor. Dayanak: bu sohbetteki prototip (`Reçete_ve_Rota_Motoru.html`, Plan, Plan
stüdyosu, Kanban bölümleri), önceki turdaki plan tasarımı (eski taban 92f8f76; motor kuralları PL-01..PL-11, Kanban KY-01..KY-04) ve
rota kararları K1-K3. İşaretler: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## 1. Depodaki durum

| Konu | Durum | İşaret |
|---|---|---|
| Plan sayfaları | `/cizelge` (Plan Çizelgesi, Planlama), `/matris` (Plan Matrisi, Planlama), `/kuyruk` (Kuyruk, Üretim); modülleri yok | DOĞRULANDI `paylasilan/sayfalar/{cizelge,matris,kuyruk}.ts` |
| Üretim emri | `uretim_emri` tek istasyonlu; durum planli, basladi, bitti, iptal; teslim, öncelik, planlı zaman alanı yok; `emir_adimi` kontrol listesi | DOĞRULANDI `paylasilan/sozlesme/uretim-emirleri.ts` |
| Emir okuma | `acikEmirler`, `emirOzeti` (id, emirNo, durum, istasyonId) | DOĞRULANDI `uretim-emirleri/disari.ts` |
| Tek çalışan emir kuralı | uretim-emirleri'nde; plan yeniden yazmaz | DOĞRULANDI (görev metni), kodu okunmadı |
| Üretim emri / iş emri yapısı (K1) | yok; rota teslimi `uretimEmriAc` istedi | DOĞRULANDI (rota BASKA-MODUL-ISTEKLERI) |
| Makine, istasyon | `istasyonlar`, `aktifIstasyonlar`, `istasyondakiMakineler`, `aktifMakineler`, `makineGetir` | DOĞRULANDI |
| Kişinin istasyonu | yok; rota teslimi `istasyonKisileri` istedi | DOĞRULANDI |
| Vardiya, mesai | yalnız sayfa tanımı (`vardiya.ts`, `mesai.ts`), modül yok | DOĞRULANDI |
| Operasyon süresi | rotada (`ayar_suresi_dk`, `birim_sure_dk`), emre kopyalanır (K1) | DOĞRULANDI (rota teslimi) |
| Son göç | 20261007222500 | DOĞRULANDI |

## 2. Kapsam (ilk sürüm küçük)

Plan yalnız yerleştirir: iş emirlerini (K1) makine ve kişilere (K3) ve zamana. Emir, adımları ve üretim kaydı uretim-emirleri'nde kalır;
plan onları okur, kopyalamaz. Operatör ekranı yok (Arkon). İlk sürüm: çizelge (kaynak x zaman), kuyruk/Kanban (kaynak başına sıra),
matris (kaynak x gün doluluk). Stüdyo (senaryo) ikinci sürüm (S4).

## 3. Modüller arası yön (ADR 0006)

plan en üstte: plan -> uretim-emirleri (iş emirlerini, durumlarını okur), plan -> istasyonlar (makine, istasyon, kişinin istasyonu),
plan -> kisiler (kişi adları, aktiflik). Vardiya ve mesai gelince plan -> vardiya. Kimse planı çağırmaz.

## 4. Tablo önerisi (S1'e göre)

`plan_yerlesimi (id, is_emri_id, makine_id NULL, kisi_id NULL, baslangic timestamptz, bitis timestamptz, sira int, kilitli bool,
surum int, yazan_kisi_id, yazma)`: tek kaynak (makine ya da kişi) CHECK; iş emri başına tek yerleşim (UNIQUE); bitiş sunucuda süreden
hesaplanır. Aynı kaynakta çakışma kısıtı (`EXCLUDE USING gist (kaynak WITH =, tstzrange(baslangic, bitis) WITH &&)`) VARSAYIM: btree_gist
eklentisi çekirdek isteği olabilir; yoksa servis denetimi ve kilit.

## 5. Uçlar ve işlemler (öneri)

Okuma (oturum; iş merkezi kısıtlı kullanıcıda yalnız izinli iş merkezlerinin kaynakları): `GET /plan` (çizelge + uyarılar),
`GET /plan/kuyruk`, `GET /plan/matris`, `GET /plan/menu-sayaclari`.
Yazma (her biri ayrı uç, kendi şeması; sürüm denetimli, eski sürüm 409; kişi ve zaman sunucudan):
`POST /plan/yerlestir` (iş emri, kaynak, başlangıç; tekrar korumalı), `POST /plan/yerlesimler/:id/tasi` (kaynak ve/veya başlangıç),
`POST /plan/kuyruk/sirala` (kaynak, sıra listesi), `POST /plan/yerlesimler/:id/kilitle` ve `/kilidi-ac`, `POST /plan/yerlesimler/:id/kaldir`,
S1 (a) seçilirse `POST /plan/oner` (kilitsiz ve yerleşmemiş işleri motorla yerleştirir; tekrar korumalı).
İşlemler: `plan.yaz` (yerleştir, taşı, sırala, kaldır, öner), `plan.kilitle`. Rol önerisi (ayrı göç, kullanıcı onayıyla): planlama_proje
ikisi; mudur `plan.kilitle`.

## 6. Kurallar (ret / uyarı; S5)

Önerilen ret (sunucuda, 409/422/403, her biri iki testli): aynı makine ya da kişide çakışan yerleşim; başlamış ya da bitmiş iş emrini taşıma
ya da kaldırma; pasif makine, pasif kişi ya da pasif istasyondaki makineye yerleştirme; kilitli yerleşimi taşıma; kapsam dışı istasyonun
kaynağı; eski sürüm; yetkisiz rol.
Önerilen uyarı (kayıt geçer, ekranda ve cevapta görünür): teslim gecikmesi; önceki iş emri bitmeden başlayan (bağımlılığa aykırı) yerleşim;
kaynağın rotadaki aday listesinde olmaması; takvim dışı saat (vardiya geldiğinde).

## 7. Bağlantı eksikken

Takvim yoksa sürekli çalışma; süre yoksa elle girilen süre (yerleşimde). `uretimEmriAc`/iş emri okuma, `istasyonKisileri` yoksa çalışma
kopyasında geçici karşılık, teslimde yok; UYUM-BORCU "bağlamada kapanacak". Eski `/cizelge`, `/matris`, `/kuyruk` sayfa tanımlarının
kaldırılması CEKIRDEK-ISTEKLERI'ne yazılır (S2'ye göre).

## 8. Sorular

S1. Plan neyi saklar? a) Yerleşimler kaydedilir (kaynak + başlangıç); motor "öner" komutuyla kilitsiz işleri yerleştirir, planlamacı
sürükleyerek düzeltir (öneri)  b) Eski tasarım: plan her istekte hesaplanır, saklanmaz; elle yalnız sıra ve kilit  c) Yalnız elle yerleştirme,
motor yok.
S2. Plan ekranları nerede? a) Rota sayfasında kalır (K2; Plan, Plan stüdyosu, Kanban maddeleri); plan modülü yalnız sunucu ve uç verir;
`/cizelge`, `/matris`, `/kuyruk` sayfaları kaldırılır (öneri)  b) Planın kendi sayfası (`/plan`, ikinci menü: Çizelge, Matris, Kuyruk);
rota menüsündeki plan maddeleri kalkar.
S3. Planın yerleştirdiği makine ya da kişi iş emrine yazılsın mı? a) Evet: yerleşim iş emrinin kaynağını uretim-emirleri komutuyla günceller,
terminal o kaynağı görür (öneri)  b) Hayır: atama yalnız plan kaydında kalır.
S4. Stüdyo (senaryo, canlıya alma) ilk sürümde mi? Öneri: hayır, ikinci sürüm.
S5. Bölüm 6'daki ret ve uyarı ayrımı uygun mu? Öneri: olduğu gibi.

## 9. Kararlar (sürüm 2)

P1 (S1). Yerleşimler kaydedilir (`plan_yerlesimi`); motor `POST /plan/oner` ile kilitsiz ve yerleşmemiş iş emirlerini yerleştirir;
planlamacı sürükleyerek taşır, sıralar, kilitler. Her yazma sürüm denetimli.
P2 (S2). Plan ekranları rota sayfasında kalır (Plan, Plan stüdyosu, Kanban maddeleri; K2). Plan modülü sunucu ve uç verir; rota
istemcisindeki beklenen sözleşme kopyası plan sözleşmesine bağlanır. `/cizelge`, `/matris`, `/kuyruk` sayfa tanımlarının kaldırılması
CEKIRDEK-ISTEKLERI'ne yazılır (Kuyruk Üretim grubunda ayrı kalmaz).
P3 (S3). Yerleşimin makine ya da kişisi iş emrine yazılır: plan (üst) uretim-emirleri'nin komutunu çağırır (istek:
`isEmriKaynagiYaz(db, kullanici, isEmriId, kaynak)`); terminal o kaynağı görür. Komut gelene kadar bağlamada kapanacak borç.
P4 (S4). Stüdyo ilk sürümde. Senaryo canlı yerleşimlerin kopyasıdır (`plan_senaryosu`, `plan_senaryo_yerlesimi`); senaryoda öner ve taşı
yapılır, canlıyla göstergeler karşılaştırılır; canlıya alma senaryonun yerleşimlerini canlıya yazar. Senaryo açıldıktan sonra canlı plan
değiştiyse (plan sürümü) canlıya alma açık onay ister. İşlemler `plan.studyo`, `plan.canliya-al` (öneri: planlama_proje ve mudur).
P5 (S5). Ret: çakışma, başlamış ya da bitmiş işi taşıma/kaldırma, pasif kaynak, kilitli yerleşim, kapsam dışı istasyon, eski sürüm, yetkisiz
rol. Uyarı: teslim gecikmesi, sıraya aykırı başlama, aday dışı kaynak.
