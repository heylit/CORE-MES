# Başka modül istekleri (plan) - kod yok, imzayla

## uretim-emirleri (K1, P3)
1. `planlanacakIsEmirleri(db: Db): Promise<PlanIsEmri[]>`; `PlanIsEmri = { id; uretimEmriId; emirNo; malzemeNo; adet; teslim: string | null;
   kaynakRotaRevizyonId; sira; opNo; ad; kaynak: { tur: 'makine' | 'kisi'; id } | null; ayarSuresiDk: string | null; birimSureDk: string | null;
   bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdedi: number | null; durum: 'planli' | 'basladi' | 'bitti' | 'iptal' }` (iptal hariç).
2. `isEmriKaynagiYaz(db: Db, kullanici: Kullanici, isEmriId: number, kaynak: { tur: 'makine' | 'kisi'; id: number }): Promise<void>`: planın
   yerleştirdiği makine ya da kişi iş emrine yazılır, terminal o kaynağı görür; komut kendi işlemini (öneri `uretim-emirleri.yaz`) ve iş
   emrinin açık olduğunu denetler. Bir kaynakta aynı anda tek çalışan iş kuralı uretim-emirleri'nde kalır.
3. Rota teslimindeki `uretimEmriAc` (üretim emri + iş emirleri).
Gelince `plan_yerlesimi.is_emri_id` ve `plan_senaryo_yerlesimi.is_emri_id` yabancı anahtarları eklenir.

## istasyonlar
`istasyonKisileri(db)` (rota teslimiyle aynı istek): kişinin istasyonu; kapsam ve gruplama için. Var olanlar kullanılır: `istasyonlar`,
`aktifIstasyonlar`, `istasyondakiMakineler`, `makineGetir`, `kisininIzinliIsMerkezleri`.

## vardiya, mesai (gelince)
Çalışma takvimi: `calismaTakvimi(db, kaynak, aralik)` benzeri; gelene kadar plan sürekli çalışma varsayar (UYUM-BORCU).

## rota
Var olan `revizyonGetir` (aday kaynaklar ve rotadaki kaynak; aday dışı uyarısı) kullanılır; istek yok.

## T4 (kart #415) sonrası kalan istekler
Madde 1-3 karşılandı (#414). Kalanlar:
- KARŞILANDI (#419): `isEmriKaynagiYaz` `plan.canliya-al` işlemini de kabul eder (kullanıcı kararı a).
- uretim-emirleri: `PlanIsEmri.durum` iş emri düzeyinde başlamışı versin (bugün başladı emir düzeyinde).
- KARŞILANDI (#417): `oncelik`, `baslangic` ve `taslakDahil`.
- uretim-emirleri: iş emrini bölme ve birleştirme komutu (PL-06, "Partiyi böl", "Parçaları birleştir").
- uretim-emirleri: acil sipariş, öncelik ve teslim değişikliği komutları (stüdyo canlıya alma); istasyonlar: makine durumu komutu (arıza); vardiya: kapalı gün.
- istasyonlar: KARŞILANDI (#409, bağlama #439).
- vardiya: çalışma takvimi (#410; PL-03, PL-04).

## Yük testi (2026-10-18) sonrası: toplu okuma
- rota: `revizyonlar(db: Db, idler: readonly number[]): Promise<Map<number, RotaRevizyonu>>` (`revizyonGetir` ile aynı biçim); bugün farklı
  revizyon başına üç sorgu.
