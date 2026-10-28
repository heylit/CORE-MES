# Başka modül istekleri (rota) - kod yok, imzayla

Rota çalışma kopyasında bunların geçici karşılıklarıyla sınandı; karşılıklar teslim edilmez (UYUM-BORCU). Hepsi rota birleşmeden önce
ya da rotayla aynı bağlamada girmelidir; girene kadar rota sunucusu derlenmez (çağırdığı fonksiyon yok).

## istasyonlar
1. Operasyon tipi kataloğu: tablo `operasyon_tipi (id, kod, ad, kisaltma, varsayilan_ayar_dk, varsayilan_birim_dk, aktif, sira)` ve
   `operasyonKatalogu(db: Db): Promise<{ id: number; kod: string; ad: string; kisaltma: string; varsayilanAyarDk: string | null;
   varsayilanBirimDk: string | null; aktif: boolean; sira: number }[]>`. Rotanın standart taslağı şu kodları arar: depo_girisi, uretim,
   muayene, tesviye, markalama, ozel_proses, yuzey_islem, sevk. Gelince `rota_adimi.operasyon_tipi_id` yabancı anahtarı eklenir.
2. İstasyondaki kişiler (kullanıcı kararı: istasyon makine ve kişilerin grubudur): tablo `istasyon_kisisi (istasyon_id, kisi_id)` ve
   `istasyonKisileri(db: Db): Promise<{ kisiId: number; istasyonId: number }[]>`. Gelene kadar rota ekranında kişiler "istasyonu belirtilmemiş".
3. Var olanlar kullanılır: `istasyonlar`, `aktifIstasyonlar`, `istasyondakiMakineler`, `makineGetir`.

## malzemeler
1. `malzemeAra(db: Db, g: { metin: string | null; turler: readonly string[]; yalnizAktif: boolean; sayfa: number }):
   Promise<(KatalogMalzemeOzeti & { toplam: number })[]>` (sayfa 50 satır; kod ya da adda arar). Rota'nın malzeme seçicisi ve
   Malzemeler bölümü bunu kullanır.
2. `malzeme_katalog_karti (no, tur)` tekili: rota revizyonunun türü bileşik yabancı anahtarla bağlansın.
3. `malzemeBirimleri(db: Db, nolar: number[]): Promise<Map<number, string>>`: miktarlar birimle gösterilsin.

## uretim-emirleri (karar K1)
`uretimEmriAc(db: Db, kullanici: Kullanici, g: { malzemeNo: number; adet: number; teslim: string | null; kaynakRotaRevizyonId: number;
isEmirleri: { sira: number; opNo: number; ad: string; operasyonTipiId: number; kaynak: { tur: 'makine' | 'kisi'; id: number } | null;
ayarSuresiDk: string | null; birimSureDk: string | null; bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdedi: number | null;
talimatSurumu: number | null; kontrolListesi: { ad: string; aciklama: string | null }[] }[] }):
Promise<{ uretimEmriId: number; isEmriIdleri: number[] }>`.
- Üretim emri üst kayıttır (mamul ya da yarımamul, adet, teslim, kaynak rota revizyonu); her iş emri bir rota adımıdır, tek kaynaklıdır
  (makine ya da kişi; atanmamışsa planlama atar), kontrol listesi bugünkü `emir_adimi` gibi iş emrinin adımlarıdır.
- Komut kendi işlemini denetler (öneri `uretim-emirleri.yaz`), rotanın transaction'ında çalışır; rota ucu ayrıca `rota.emre-kopyala` ister.
- Bugünkü tek istasyonlu `uretim_emri` iş emrinin karşılığıdır (VARSAYIM V4); kaynağı kişi ya da atanmamış iş emri için istasyon kuralı
  uretim-emirleri'nin kararıdır.

## Rota sayfasındaki öteki bölümlerin beklediği uçlar (karar K2)
Ekranlar önizlemedeki gibi gelir; sahibi modülün ucu yoksa "modülü bekleniyor" gösterir. Beklenen sözleşmeler
`istemci/src/moduller/rota/beklenen/` altında kopya olarak durur (plan, vardiya, istasyonlar-plan, uretim-emirleri-adimli); sahibi modül
sözleşmesini verince oradan ithal edilir ve kopya kalkar. Uçlar: üretim emirleri `/adimli-emirler*`; plan `/plan`, `/plan-ayari`,
`/kanban*`, `/plan-senaryolari*`; vardiya `/vardiya-takvimi`, `/vardiyalar*`, `/vardiya-matrisi/degistir`, `/takvim-gunleri*`;
istasyonlar `/operasyon-tipleri*`, `/istasyon-plan-ayarlari`, `/istasyonlar/:id/plan-ayari`, `/makine-durumlari`, `/makineler/:id/durum`.

## Oturtmada eklenen (Aşama 1, 2026-10-08)

### istasyonlar (karar RT2 a: istasyonlar kataloğu esas)
- `istasyonlar_operasyon_tipi` tablosuna boş olabilen sütunlar: `kisaltma text` (en çok 6 harf ya da rakam), `varsayilan_ayar_dk numeric(8,2)`,
  `varsayilan_birim_dk numeric(10,4)`, `varsayilan_istasyon_id int REFERENCES istasyon`, `sira int`; `operasyonTipleri` dönüşüne bu alanlar.
  Gelince `sunucu/moduller/rota/baglanti.ts` içindeki `operasyonKatalogu` eşlemi kalkar.
- `istasyonKisileri(db)` yerine bugün `istasyondakiKisiler(db, istasyonId)` ile kuruluyor (yüzdeli atamalar); kişi başına tek istasyon
  gerekiyorsa `kisininIstasyonu(db, kisiId)` gibi bir fonksiyon yeterli.
- Rota sayfasının Kaynaklar bölümü istasyonlar uçlarını okuyor: okuma uçlarının `biri` listesine `sayfa.rota` (bağlamada, rol kararıyla).

### malzemeler
- `malzemeAra` (yukarıda) önceliklidir: geçici karşılık yalnız sayı kimliğiyle bulur.

### uretim-emirleri (UE listesi; modül dışarıda, yazılmaz)
- `uretimEmriAc` (yukarıda, K1). Yön: rota ucu tetikler ve adımları verir, emri uretim-emirleri yazar.
- Not: iş emrinin kaynağı makine ya da kişidir (K3); istasyon kaynağın istasyonundan türetilir. "İstasyon iş emrine aittir" kuralı bu biçimde uretim-emirleri'nde kurulsun.

## T4 (kart #415) sonrası kalan istekler
`uretimEmriAc` karşılandı (#414). Kalanlar:
- uretim-emirleri: yürürlükteki rotayı başlamamış emirlere uygulayan komut ("Emirlere uygula") ve emrin rotası değişti bilgisi.
- uretim-emirleri: emir formu alanları öncelik, başlangıç, açıklama (#417); açık emir sayısı (menü sayacı).
- uretim-emirleri ve stok: "Tamamla ve stokta", "Eksikleri teslim al", malzeme ihtiyacı.
- malzemeler: kart sayısı fonksiyonu (menü sayacı).
- stok: okuma uçlarının `biri` listesine `sayfa.rota`; statüler ve statülü stok uçları.
- vardiya: takvim sorgu anahtarı (`anahtarlar.takvim`, `['vardiya', 'takvim']`) `disari.ts`'ten verilsin; rota Kaynaklar bugün aynı anahtarı elle yazıyor ki `useVardiyaYaz` cevabı ekrana düşsün (#441).
- Karşılandı (#262, B37): plan cevabı emrin üst partisini (`ustEmirId`) taşır.
- Karşılandı (#447): stok emir tamamlamada çıktıyı emrin sağlam adedinden hesaplar; sağlamı girilmiş emirde miktarsız komut yalnız kalan sarfı yazar (#444).

## İşlem şartnamesi okuyucuları (971 a, bağlamada)

- arkon: iç adımın terminal kartı `isEmriSartnameleri(db, isEmriIdleri)` ile şartname adını, değerleri ve terminal notunu göstersin (arkon rotaya zaten bağımlı).
- fason iş emri belgesi (sevkiyat ya da satın alma, hangisi basıyorsa): fason adımın şartnamesini, standart atıflarını ve istenen belgeleri bassın.
- kalite-merkezi: girdi ve son kontrolde istenen belgeleri ve kabul atıflarını okusun. Yön kalite-merkezi -> rota; döngü yok (ADR 0006).
