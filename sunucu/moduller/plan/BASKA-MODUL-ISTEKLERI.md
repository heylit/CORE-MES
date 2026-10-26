# Başka modül istekleri (plan) - kod yok, imzayla

## uretim-emirleri (K1, P3)
1. `planlanacakIsEmirleri(db: Db): Promise<PlanIsEmri[]>`; `PlanIsEmri = { id; uretimEmriId; emirNo; malzemeNo; adet; teslim: string | null;
   kaynakRotaRevizyonId; sira; opNo; ad; kaynak: { tur: 'makine' | 'kisi'; id } | null; ayarSuresiDk: string | null; birimSureDk: string | null;
   bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdedi: number | null; durum: 'planli' | 'basladi' | 'bitti' | 'iptal' }` (iptal hariç).
2. `isEmriKaynagiYaz(db: Db, kullanici: Kullanici, isEmriId: number, kaynak: { tur: 'makine' | 'kisi'; id: number }): Promise<void>`: planın
   yerleştirdiği makine ya da kişi iş emrine yazılır, terminal o kaynağı görür; komut kendi işlemini (öneri `uretim-emirleri.yaz`) ve iş
   emrinin açık olduğunu denetler. Bir kaynakta aynı anda tek çalışan iş kuralı uretim-emirleri'nde kalır.
3. Rota teslimindeki `uretimEmriAc` (üretim emri + iş emirleri).
KARŞILANDI (279 a): `plan_yerlesimi` ve `plan_yerlesim_parcasi` iş emrine bağlı; senaryo tabloları eksi kimlikli deneme emri taşıdığı için bağsız (UYUM-BORCU P-B2).

## istasyonlar
KARŞILANDI (#439, P-B4): `istasyonKisileri(db)` (rota teslimiyle aynı istek): kişinin istasyonu; kapsam ve gruplama için. Var olanlar kullanılır: `istasyonlar`,
`aktifIstasyonlar`, `istasyondakiMakineler`, `makineGetir`, `kisininIzinliIsMerkezleri`.

## vardiya, mesai (gelince)
KARŞILANDI (#441): plan `calismaTakvimleri`, `takvimGunleri`, `isMerkeziKisiPaylari` okur (`servis.ts:24`); vardiyası tanımsız kaynak sürekli çalışır sayılır (P-B3).

## rota
Var olan `revizyonGetir` (aday kaynaklar ve rotadaki kaynak; aday dışı uyarısı) kullanılır; istek yok.

## T4 (kart #415) sonrası kalan istekler
Madde 1-3 karşılandı (#414). Kalanlar:
- KARŞILANDI (#419): `isEmriKaynagiYaz` `plan.canliya-al` işlemini de kabul eder (kullanıcı kararı a).
- KARŞILANDI (P-B14): iş emri düzeyinde başlamış bilgisi `PlanIsEmri.durum` ile gelir.
- KARŞILANDI (#417): `oncelik`, `baslangic` ve `taslakDahil`.
- KARŞILANDI (UE-B3, P-B18): bölme ve birleştirme `/adimli-emirler/:id/bol`, `/birlestir`; ekranı Reçete ve Rota'da.
- uretim-emirleri: acil sipariş, öncelik ve teslim değişikliği komutları (stüdyo canlıya alma); istasyonlar: makine durumu komutu (arıza); vardiya: kapalı gün.
- istasyonlar: KARŞILANDI (#409, bağlama #439).
- vardiya: çalışma takvimi (#410; PL-03, PL-04).

## Yük testi (2026-10-18) sonrası: toplu okuma
- rota: `revizyonlar(db: Db, idler: readonly number[]): Promise<Map<number, RotaRevizyonu>>` (`revizyonGetir` ile aynı biçim); bugün farklı
  revizyon başına üç sorgu.

## Onay adımı (H1, H5; 2026-10-23)
- recete-rota (istemci): `plan-canliya-al` ve `plan-senaryo-canliya-al` önce `onaya-gonder` çağırmalı ya da onaya gönderme komutuna dönmeli (H2/H3); `plan-bedel-ayari` gövdesine `taslak` (yoksa null) eklenir, cevap `PlanCevabi`.
- recete-rota (sunucu testleri): `plan-senaryo-komut.test.ts`, `canliya-al.test.ts` canlıya almadan önce taslağı onaya gönderir.
- siparisler (istemci): `SiparisCarpani.tsx` çarpanı taslağa yazar (`taslak: null`), cevap `PlanCevabi`; ekran çarpanın onayla geçeceğini söyler.
- arkon: `yansima.test.ts` canlıya almadan önce onaya gönderir; operatöre bekleyen sıra `bekleyenSiralar` ile (H6).
- çekirdek: `sunucu/akis-sagligi.test.ts` canlıya almadan önce onaya gönderir; bedel ve çarpan taslaktan.
- paylasilan (H0 ikinci yama): `plan.dort-goz` ayar tanımı; `bedelAyariTaslakGovdesi` ve `siparisCarpaniTaslakGovdesi`'nde `taslak` isteğe bağlı.
