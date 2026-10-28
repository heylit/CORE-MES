import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

// Saatler "SS:DD" metni, numeric alanlar metin, tarih "YYYY-AA-GG" döner; dönüşüm burada, kural serviste.

export interface NoktaSatiri {
  id: number; ad: string; tur: string; enlem: string; boylam: string; adres: string | null; durakSuresiDakika: number; aktif: boolean;
  firmaId: number | null; surum: number;
}
const NOKTA_ALANLARI = `id, ad, tur, enlem, boylam, adres, durak_suresi_dakika AS "durakSuresiDakika", aktif, firma_id AS "firmaId", surum`;

export function noktalariGetir(db: Db): Promise<NoktaSatiri[]> {
  return db.sorgu<NoktaSatiri>(`SELECT ${NOKTA_ALANLARI} FROM sevkiyat_noktasi ORDER BY aktif DESC, (tur = 'fabrika') DESC, ad`);
}
export function noktaGetir(db: Db, id: number): Promise<NoktaSatiri | null> {
  return db.tek<NoktaSatiri>(`SELECT ${NOKTA_ALANLARI} FROM sevkiyat_noktasi WHERE id = $1`, [id]);
}
export function aktifFabrikaGetir(db: Db): Promise<NoktaSatiri | null> {
  return db.tek<NoktaSatiri>(`SELECT ${NOKTA_ALANLARI} FROM sevkiyat_noktasi WHERE tur = 'fabrika' AND aktif`);
}
export interface NoktaYazisi { ad: string; tur: string; enlem: number; boylam: number; adres: string | null; durakSuresiDakika: number; firmaId: number | null }
export async function noktaEkle(db: Db, n: NoktaYazisi): Promise<NoktaSatiri> {
  const satir = await db.tek<NoktaSatiri>(
    `INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, adres, durak_suresi_dakika, firma_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${NOKTA_ALANLARI}`,
    [n.ad, n.tur, n.enlem, n.boylam, n.adres, n.durakSuresiDakika, n.firmaId],
  );
  return satir!;
}
// Sürüm tutmazsa (arada başkası değiştirdi) satır dönmez.
export function noktaGuncelle(db: Db, id: number, surum: number, n: NoktaYazisi): Promise<NoktaSatiri | null> {
  return db.tek<NoktaSatiri>(
    `UPDATE sevkiyat_noktasi SET ad = $2, tur = $3, enlem = $4, boylam = $5, adres = $6, durak_suresi_dakika = $7, firma_id = $8, surum = surum + 1
      WHERE id = $1 AND surum = $9 RETURNING ${NOKTA_ALANLARI}`,
    [id, n.ad, n.tur, n.enlem, n.boylam, n.adres, n.durakSuresiDakika, n.firmaId, surum],
  );
}
// İptal edilmemiş bir işte alış ya da bırakış noktası mı?
export async function noktaIsteKullaniliyor(db: Db, id: number): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM sevkiyat_isi WHERE iptal_edildi IS NULL AND (alis_noktasi_id = $1 OR birakis_noktasi_id = $1)) AS "var"', [id],
  );
  return satir?.var === true;
}
// Bugün ve sonrası için onaylı planlarda aracın ya da noktanın geçtiği günler (açık soru 12). Fabrika her rotanın
// başı ve sonudur: fabrikada, rotası olan her onaylı gün sayılır.
export async function onayliPlanTarihleri(db: Db, hedef: { aracId: number } | { noktaId: number }): Promise<string[]> {
  const satirlar = 'aracId' in hedef
    ? await db.sorgu<{ tarih: string }>(
      `SELECT DISTINCT p.tarih FROM sevkiyat_plani p JOIN sevkiyat_plan_araci a ON a.plan_id = p.id
        WHERE p.onaylandi IS NOT NULL AND p.tarih >= current_date AND a.arac_id = $1
          AND EXISTS (SELECT 1 FROM sevkiyat_plan_duragi d WHERE d.plan_id = p.id AND d.arac_id = a.arac_id)
        ORDER BY p.tarih`, [hedef.aracId])
    : await db.sorgu<{ tarih: string }>(
      `SELECT DISTINCT p.tarih FROM sevkiyat_plani p JOIN sevkiyat_plan_duragi d ON d.plan_id = p.id
         LEFT JOIN sevkiyat_isi i ON i.id = d.is_id
        WHERE p.onaylandi IS NOT NULL AND p.tarih >= current_date
          AND (i.alis_noktasi_id = $1 OR i.birakis_noktasi_id = $1
               OR EXISTS (SELECT 1 FROM sevkiyat_noktasi n WHERE n.id = $1 AND n.tur = 'fabrika' AND n.aktif))
        ORDER BY p.tarih`, [hedef.noktaId]);
  return satirlar.map((s) => s.tarih);
}

export function noktaPasiflestir(db: Db, id: number): Promise<NoktaSatiri | null> {
  return db.tek<NoktaSatiri>(`UPDATE sevkiyat_noktasi SET aktif = false, surum = surum + 1 WHERE id = $1 RETURNING ${NOKTA_ALANLARI}`, [id]);
}

export interface AracSatiri {
  id: number; ad: string; tur: string; plaka: string | null; kapasiteKilogram: string; kapasitePalet: number;
  musaitBaslangic: string; musaitBitis: string;
  kilometreMaliyeti: string | null; saatMaliyeti: string | null; gunlukMaliyet: string | null; aktif: boolean; surum: number;
}
const ARAC_ALANLARI = `id, ad, tur, plaka, kapasite_kilogram AS "kapasiteKilogram", kapasite_palet AS "kapasitePalet",
  to_char(musait_baslangic, 'HH24:MI') AS "musaitBaslangic", to_char(musait_bitis, 'HH24:MI') AS "musaitBitis",
  kilometre_maliyeti AS "kilometreMaliyeti", saat_maliyeti AS "saatMaliyeti", gunluk_maliyet AS "gunlukMaliyet", aktif, surum`;

export function araclariGetir(db: Db): Promise<AracSatiri[]> {
  return db.sorgu<AracSatiri>(`SELECT ${ARAC_ALANLARI} FROM sevkiyat_araci ORDER BY aktif DESC, ad`);
}
export function aracGetir(db: Db, id: number): Promise<AracSatiri | null> {
  return db.tek<AracSatiri>(`SELECT ${ARAC_ALANLARI} FROM sevkiyat_araci WHERE id = $1`, [id]);
}
export interface AracYazisi {
  ad: string; tur: string; plaka: string | null; kapasiteKilogram: number; kapasitePalet: number; musaitBaslangic: string; musaitBitis: string;
  kilometreMaliyeti: number | null; saatMaliyeti: number | null; gunlukMaliyet: number | null;
}
const aracDegerleri = (a: AracYazisi) => [a.ad, a.tur, a.plaka, a.kapasiteKilogram, a.kapasitePalet, a.musaitBaslangic, a.musaitBitis, a.kilometreMaliyeti, a.saatMaliyeti, a.gunlukMaliyet];
export async function aracEkle(db: Db, a: AracYazisi): Promise<AracSatiri> {
  const satir = await db.tek<AracSatiri>(
    `INSERT INTO sevkiyat_araci (ad, tur, plaka, kapasite_kilogram, kapasite_palet, musait_baslangic, musait_bitis, kilometre_maliyeti, saat_maliyeti, gunluk_maliyet)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${ARAC_ALANLARI}`,
    aracDegerleri(a),
  );
  return satir!;
}
export function aracGuncelle(db: Db, id: number, surum: number, a: AracYazisi): Promise<AracSatiri | null> {
  return db.tek<AracSatiri>(
    `UPDATE sevkiyat_araci SET ad = $2, tur = $3, plaka = $4, kapasite_kilogram = $5, kapasite_palet = $6, musait_baslangic = $7, musait_bitis = $8,
       kilometre_maliyeti = $9, saat_maliyeti = $10, gunluk_maliyet = $11, surum = surum + 1 WHERE id = $1 AND surum = $12 RETURNING ${ARAC_ALANLARI}`,
    [id, ...aracDegerleri(a), surum],
  );
}
export function aracPasiflestir(db: Db, id: number): Promise<AracSatiri | null> {
  return db.tek<AracSatiri>(`UPDATE sevkiyat_araci SET aktif = false, surum = surum + 1 WHERE id = $1 RETURNING ${ARAC_ALANLARI}`, [id]);
}

export interface IsSatiri {
  id: number; tarih: string; tur: string; alisNoktasiId: number | null; birakisNoktasiId: number | null;
  agirlikKilogram: string; paletSayisi: number; durakSuresiDakika: number | null;
  alisEnErken: string | null; alisEnGec: string | null; birakisEnErken: string | null; birakisEnGec: string | null;
  belgeNo: string | null; aciklama: string | null; sabitAracId: number | null; iptalEdildi: boolean;
  istenenTarih: string; durum: string; yapilamadiSayisi: number; sonNot: string | null; surum: number;
}
const IS_ALANLARI = `id, tarih, tur, alis_noktasi_id AS "alisNoktasiId", birakis_noktasi_id AS "birakisNoktasiId",
  agirlik_kilogram AS "agirlikKilogram", palet_sayisi AS "paletSayisi", durak_suresi_dakika AS "durakSuresiDakika",
  to_char(alis_en_erken, 'HH24:MI') AS "alisEnErken", to_char(alis_en_gec, 'HH24:MI') AS "alisEnGec",
  to_char(birakis_en_erken, 'HH24:MI') AS "birakisEnErken", to_char(birakis_en_gec, 'HH24:MI') AS "birakisEnGec",
  belge_no AS "belgeNo", aciklama, sabit_arac_id AS "sabitAracId", iptal_edildi IS NOT NULL AS "iptalEdildi",
  istenen_tarih AS "istenenTarih", durum, surum,
  (SELECT count(DISTINCT d.plan_id)::int FROM sevkiyat_plan_duragi d WHERE d.is_id = sevkiyat_isi.id AND d.sonuc = 'yapilamadi') AS "yapilamadiSayisi",
  (SELECT d.sonuc_notu FROM sevkiyat_plan_duragi d WHERE d.is_id = sevkiyat_isi.id AND d.sonuc = 'yapilamadi' ORDER BY d.sonuc_zamani DESC LIMIT 1) AS "sonNot"`;

// Günün sevkiyat listesi: o günün planındaki işler, o güne kadarki havuz (geciken ve yapılamayıp dönen dahil),
// bugünden önceki bir günün taslağında unutulmuş işler ve o gün elle kapatılanlar.
export function gununIsleri(db: Db, tarih: string): Promise<IsSatiri[]> {
  return db.sorgu<IsSatiri>(
    `SELECT ${IS_ALANLARI} FROM sevkiyat_isi
      WHERE iptal_edildi IS NULL AND (
        (durum = 'havuzda' AND tarih <= $1)
        OR (durum = 'planlandi' AND tarih < LEAST($1::date, current_date))
        OR (durum = 'tamamlandi' AND tarih = $1)
        OR id IN (SELECT d.is_id FROM sevkiyat_plan_duragi d JOIN sevkiyat_plani p ON p.id = d.plan_id WHERE p.tarih = $1 AND d.is_id IS NOT NULL)
      )
      ORDER BY istenen_tarih, id`,
    [tarih],
  );
}
// Bekleyen: bugüne kadarki havuz (gün listesindeki gibi); gecikmiş: istenen günü geçmiş, henüz yola çıkmamış iş.
export async function ozetSay(db: Db): Promise<{ bekleyen: number; gecikmis: number }> {
  const satir = await db.tek<{ bekleyen: number; gecikmis: number }>(
    `SELECT count(*) FILTER (WHERE durum = 'havuzda' AND tarih <= current_date)::int AS bekleyen,
            count(*) FILTER (WHERE durum IN ('havuzda', 'planlandi') AND istenen_tarih < current_date)::int AS gecikmis
       FROM sevkiyat_isi WHERE iptal_edildi IS NULL`,
  );
  return satir!;
}
export function isGetir(db: Db, id: number): Promise<IsSatiri | null> {
  return db.tek<IsSatiri>(`SELECT ${IS_ALANLARI} FROM sevkiyat_isi WHERE id = $1`, [id]);
}
export interface IsYazisi {
  tarih: string; istenenTarih?: string; tur: string; alisNoktasiId: number | null; birakisNoktasiId: number | null; agirlikKilogram: number; paletSayisi: number;
  durakSuresiDakika: number | null; alisEnErken: string | null; alisEnGec: string | null; birakisEnErken: string | null; birakisEnGec: string | null;
  belgeNo: string | null; aciklama: string | null; sabitAracId: number | null;
}
const isDegerleri = (i: IsYazisi) => [i.tarih, i.istenenTarih ?? i.tarih, i.tur, i.alisNoktasiId, i.birakisNoktasiId, i.agirlikKilogram, i.paletSayisi, i.durakSuresiDakika,
  i.alisEnErken, i.alisEnGec, i.birakisEnErken, i.birakisEnGec, i.belgeNo, i.aciklama, i.sabitAracId];
export async function isEkle(db: Db, i: IsYazisi): Promise<IsSatiri> {
  const satir = await db.tek<IsSatiri>(
    `INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, alis_noktasi_id, birakis_noktasi_id, agirlik_kilogram, palet_sayisi, durak_suresi_dakika,
       alis_en_erken, alis_en_gec, birakis_en_erken, birakis_en_gec, belge_no, aciklama, sabit_arac_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING ${IS_ALANLARI}`,
    isDegerleri(i),
  );
  return satir!;
}
export function isGuncelle(db: Db, id: number, surum: number, i: IsYazisi): Promise<IsSatiri | null> {
  return db.tek<IsSatiri>(
    `UPDATE sevkiyat_isi SET tarih = $2, istenen_tarih = $3, tur = $4, alis_noktasi_id = $5, birakis_noktasi_id = $6, agirlik_kilogram = $7,
       palet_sayisi = $8, durak_suresi_dakika = $9, alis_en_erken = $10, alis_en_gec = $11, birakis_en_erken = $12, birakis_en_gec = $13,
       belge_no = $14, aciklama = $15, sabit_arac_id = $16, surum = surum + 1
     WHERE id = $1 AND iptal_edildi IS NULL AND surum = $17 RETURNING ${IS_ALANLARI}`,
    [id, ...isDegerleri(i), surum],
  );
}
export function isIptalEt(db: Db, id: number): Promise<IsSatiri | null> {
  return db.tek<IsSatiri>(`UPDATE sevkiyat_isi SET iptal_edildi = now(), surum = surum + 1 WHERE id = $1 AND iptal_edildi IS NULL RETURNING ${IS_ALANLARI}`, [id]);
}
export async function isPlandaMi(db: Db, planId: number, isId: number): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>('SELECT EXISTS (SELECT 1 FROM sevkiyat_plan_duragi WHERE plan_id = $1 AND is_id = $2) AS "var"', [planId, isId]);
  return satir?.var === true;
}
// Yalnız taslak planlardan çıkar; onaylı plandaki durak geçmiştir ve kalır.
export async function isiPlandanCikar(db: Db, isId: number): Promise<void> {
  await db.sorgu(
    'DELETE FROM sevkiyat_plan_duragi d USING sevkiyat_plani p WHERE d.plan_id = p.id AND p.onaylandi IS NULL AND d.is_id = $1', [isId],
  );
  await planlananlariEsitle(db);
}

// Bir işin bir anda tek taslağı olur: bu plana alınan iş öteki taslaklardan çıkar, o taslakların sürümü artar.
export async function isleriBaskaTaslaklardanCikar(db: Db, planId: number): Promise<void> {
  await db.sorgu(
    `WITH silinen AS (
       DELETE FROM sevkiyat_plan_duragi d USING sevkiyat_plani p
        WHERE d.plan_id = p.id AND p.id <> $1 AND p.onaylandi IS NULL
          AND d.is_id IN (SELECT is_id FROM sevkiyat_plan_duragi WHERE plan_id = $1 AND is_id IS NOT NULL)
       RETURNING d.plan_id)
     UPDATE sevkiyat_plani SET surum = surum + 1 WHERE id IN (SELECT plan_id FROM silinen)`,
    [planId],
  );
}
// Taslak plandaki iş "planlandı" olur ve planın gününe taşınır; hiçbir taslakta kalmayan planlanmış iş havuza döner.
export async function planlananlariEsitle(db: Db, plan?: { id: number; tarih: string }): Promise<void> {
  if (plan) {
    await db.sorgu(
      `UPDATE sevkiyat_isi SET tarih = $2, durum = 'planlandi', durum_zamani = CASE WHEN durum = 'planlandi' THEN durum_zamani ELSE now() END,
         surum = surum + CASE WHEN durum = 'planlandi' AND tarih = $2 THEN 0 ELSE 1 END
        WHERE durum IN ('havuzda', 'planlandi') AND id IN (SELECT is_id FROM sevkiyat_plan_duragi WHERE plan_id = $1 AND is_id IS NOT NULL)`,
      [plan.id, plan.tarih],
    );
  }
  await db.sorgu(
    `UPDATE sevkiyat_isi i SET durum = 'havuzda', durum_zamani = now(), surum = i.surum + 1
      WHERE i.durum = 'planlandi' AND NOT EXISTS (
        SELECT 1 FROM sevkiyat_plan_duragi d JOIN sevkiyat_plani p ON p.id = d.plan_id WHERE d.is_id = i.id AND p.onaylandi IS NULL)`,
  );
}
// Onayla plandaki işler yola çıkar; onay kalkınca yeniden planlanmış olur.
// Durumu değişen işler döner.
export async function plandakiIslerinDurumu(db: Db, planId: number, durum: 'yolda' | 'planlandi'): Promise<number[]> {
  const satirlar = await db.sorgu<{ id: number }>(
    `UPDATE sevkiyat_isi SET durum = $2, durum_zamani = now(), surum = surum + 1
      WHERE id IN (SELECT is_id FROM sevkiyat_plan_duragi WHERE plan_id = $1 AND is_id IS NOT NULL) RETURNING id`,
    [planId, durum],
  );
  return satirlar.map((s) => s.id);
}
export async function plandaSonucVarMi(db: Db, planId: number): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>('SELECT EXISTS (SELECT 1 FROM sevkiyat_plan_duragi WHERE plan_id = $1 AND sonuc IS NOT NULL) AS "var"', [planId]);
  return satir?.var === true;
}
// İşin onaylı plandaki son durağı (iki uçlu işte iki satır): sonucu ve planı.
// ileri: planın günü veritabanının bugününden sonra.
export interface SonDurakSatiri { planId: number; tarih: string; sonuc: 'tamamlandi' | 'yapilamadi' | null; ileri: boolean }
export function isinSonOnayliDuragi(db: Db, isId: number): Promise<SonDurakSatiri | null> {
  return db.tek<SonDurakSatiri>(
    `SELECT p.id AS "planId", to_char(p.tarih, 'YYYY-MM-DD') AS tarih, max(d.sonuc) AS sonuc, p.tarih > current_date AS ileri
       FROM sevkiyat_plan_duragi d JOIN sevkiyat_plani p ON p.id = d.plan_id
      WHERE d.is_id = $1 AND p.onaylandi IS NOT NULL
      GROUP BY p.id, p.tarih ORDER BY p.tarih DESC LIMIT 1`,
    [isId],
  );
}
export async function durakSonucunuYaz(db: Db, planId: number, isId: number, sonuc: 'tamamlandi' | 'yapilamadi' | null, not: string | null): Promise<void> {
  await db.sorgu(
    `UPDATE sevkiyat_plan_duragi SET sonuc = $3, sonuc_zamani = CASE WHEN $3::text IS NULL THEN NULL ELSE now() END, sonuc_notu = $4
      WHERE plan_id = $1 AND is_id = $2`,
    [planId, isId, sonuc, sonuc === null ? null : not],
  );
}
// tarih verilirse iş o güne taşınır (elle kapatılan iş kapatıldığı günün listesinde görünür).
export function isDurumunuYaz(db: Db, id: number, durum: string, tarih: string | null): Promise<IsSatiri | null> {
  return db.tek<IsSatiri>(
    `UPDATE sevkiyat_isi SET durum = $2, durum_zamani = now(), tarih = COALESCE($3::date, tarih), surum = surum + 1 WHERE id = $1 AND iptal_edildi IS NULL RETURNING ${IS_ALANLARI}`,
    [id, durum, tarih],
  );
}
export interface DurakSonucuSatiri { isId: number; sonuc: 'tamamlandi' | 'yapilamadi'; not: string | null }
export function planSonuclari(db: Db, planId: number): Promise<DurakSonucuSatiri[]> {
  return db.sorgu<DurakSonucuSatiri>(
    `SELECT DISTINCT ON (is_id) is_id AS "isId", sonuc, sonuc_notu AS "not"
       FROM sevkiyat_plan_duragi WHERE plan_id = $1 AND sonuc IS NOT NULL ORDER BY is_id, sira`,
    [planId],
  );
}

export interface PlanSatiri { id: number; tarih: string; amac: string; surum: number; onaylandi: string | null }
const PLAN_ALANLARI = `id, tarih, amac, surum, to_json(onaylandi) #>> '{}' AS onaylandi`;
export function planGetir(db: Db, tarih: string): Promise<PlanSatiri | null> {
  return db.tek<PlanSatiri>(`SELECT ${PLAN_ALANLARI} FROM sevkiyat_plani WHERE tarih = $1`, [tarih]);
}
// İlk yazmada plan oluşturulur; aynı günün planı arada oluşturulduysa null (çakışma).
export function planOlustur(db: Db, tarih: string, amac: string): Promise<PlanSatiri | null> {
  return db.tek<PlanSatiri>(`INSERT INTO sevkiyat_plani (tarih, amac) VALUES ($1, $2) ON CONFLICT (tarih) DO NOTHING RETURNING ${PLAN_ALANLARI}`, [tarih, amac]);
}
// Yazma komutlarında plan satırı kilitlenir: aynı günün planına aynı anda iki komut yazamaz.
// Plan yazmaları günler arasında da sıraya girer: bir günün kaydı işi öteki günlerin taslaklarından çıkarır; iki gün
// aynı anda kaydedilince ikisi de ötekinin yazmadığı hâli görür ve aynı iş iki taslağa, iki araca yazılırdı.
export async function planKilitle(db: Db, tarih: string): Promise<PlanSatiri | null> {
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtext('sevkiyat-plan-yazma'))");
  return db.tek<PlanSatiri>(`SELECT ${PLAN_ALANLARI} FROM sevkiyat_plani WHERE tarih = $1 FOR UPDATE`, [tarih]);
}
export async function planSurumunuArtir(db: Db, planId: number, amac: string): Promise<void> {
  await db.sorgu('UPDATE sevkiyat_plani SET surum = surum + 1, amac = $2 WHERE id = $1', [planId, amac]);
}

export interface PlanAraciSatiri { aracId: number; kilitli: boolean }
export function planAraclari(db: Db, planId: number): Promise<PlanAraciSatiri[]> {
  return db.sorgu<PlanAraciSatiri>('SELECT arac_id AS "aracId", kilitli FROM sevkiyat_plan_araci WHERE plan_id = $1 ORDER BY arac_id', [planId]);
}
// tahmini saatler planın günü 00:00'dan dakika (gece yarısını aşabilir); taslakta null.
export interface PlanDuragiSatiri { aracId: number; sira: number; isId: number | null; alis: boolean | null; tahminiVaris: number | null; tahminiAyrilis: number | null }
export function planDuraklari(db: Db, planId: number): Promise<PlanDuragiSatiri[]> {
  return db.sorgu<PlanDuragiSatiri>(
    `SELECT arac_id AS "aracId", sira, is_id AS "isId", alis,
            (extract(epoch FROM tahmini_varis - tarih::timestamptz) / 60)::float8 AS "tahminiVaris",
            (extract(epoch FROM tahmini_ayrilis - tarih::timestamptz) / 60)::float8 AS "tahminiAyrilis"
       FROM sevkiyat_plan_duragi WHERE plan_id = $1 ORDER BY arac_id, sira`,
    [planId],
  );
}

// Planın rotaları baştan yazılır (taslakta; onaylıda tetikleyici reddeder).
export async function planRotalariniYaz(
  db: Db, planId: number, tarih: string,
  rotalar: readonly { aracId: number; kilitli: boolean; ogeler: readonly ({ isId: number; alis: boolean } | { araDonus: true })[] }[],
): Promise<void> {
  await db.sorgu('DELETE FROM sevkiyat_plan_araci WHERE plan_id = $1', [planId]);
  if (!rotalar.length) return;
  await db.sorgu(
    'INSERT INTO sevkiyat_plan_araci (plan_id, arac_id, kilitli) SELECT $1, * FROM unnest($2::int[], $3::boolean[])',
    [planId, rotalar.map((r) => r.aracId), rotalar.map((r) => r.kilitli)],
  );
  const arac: number[] = [], sira: number[] = [], isId: (number | null)[] = [], alis: (boolean | null)[] = [];
  for (const r of rotalar) r.ogeler.forEach((o, i) => {
    arac.push(r.aracId); sira.push(i + 1);
    if ('araDonus' in o) { isId.push(null); alis.push(null); } else { isId.push(o.isId); alis.push(o.alis); }
  });
  if (!arac.length) return;
  await db.sorgu(
    `INSERT INTO sevkiyat_plan_duragi (plan_id, tarih, arac_id, sira, is_id, alis)
     SELECT $1, $2::date, * FROM unnest($3::int[], $4::int[], $5::int[], $6::boolean[])`,
    [planId, tarih, arac, sira, isId, alis],
  );
}

// Dakikalar planın günü 00:00'dan sayılır; an veritabanı oturumunun saat dilimiyle kurulur.
export async function tahminiSaatleriYaz(db: Db, planId: number, saatler: readonly { aracId: number; sira: number; varis: number; ayrilis: number }[]): Promise<void> {
  if (!saatler.length) return;
  await db.sorgu(
    `UPDATE sevkiyat_plan_duragi d
        SET tahmini_varis = d.tarih::timestamptz + make_interval(secs => s.varis * 60), tahmini_ayrilis = d.tarih::timestamptz + make_interval(secs => s.ayrilis * 60)
       FROM unnest($2::int[], $3::int[], $4::float8[], $5::float8[]) AS s(arac_id, sira, varis, ayrilis)
      WHERE d.plan_id = $1 AND d.arac_id = s.arac_id AND d.sira = s.sira`,
    [planId, saatler.map((s) => s.aracId), saatler.map((s) => s.sira), saatler.map((s) => s.varis), saatler.map((s) => s.ayrilis)],
  );
}
export async function onayYaz(db: Db, planId: number): Promise<void> {
  await db.sorgu('UPDATE sevkiyat_plani SET onaylandi = now(), surum = surum + 1 WHERE id = $1', [planId]);
}
// Önce onay kalkar (tetikleyici taslağa izin verir), sonra onay anının saatleri silinir.
export async function onayKaldir(db: Db, planId: number): Promise<void> {
  await db.sorgu('UPDATE sevkiyat_plani SET onaylandi = NULL, surum = surum + 1 WHERE id = $1', [planId]);
  await db.sorgu('UPDATE sevkiyat_plan_duragi SET tahmini_varis = NULL, tahmini_ayrilis = NULL WHERE plan_id = $1', [planId]);
}

// ---------- bekleme listesi (kart #1310) ----------

export type KalemKaynagi = 'urun' | 'fason' | 'fason-donus' | 'alim' | 'elle';
export type SonYazanYeri = 'tum-isler' | 'satin-alma' | 'sevkiyat' | 'otomatik';
export interface BekleyenSatiri {
  id: number; kaynak: KalemKaynagi; yon: 'gidis' | 'gelis'; uretimEmriId: number | null; fasonHareketId: number | null; talepId: string | null;
  firmaId: number | null; malzemeNo: number | null; adet: string | null; istenenTarih: string | null; hazirZamani: string;
  isId: number | null; kaldirildi: string | null; ustBekleyenId: number | null;
  isEmriId: number | null; siparisSatiriId: number | null; gidisBekleyenId: number | null; elleTuru: 'numune' | 'tamir' | 'kalibrasyon' | 'iade' | 'diger' | null;
  aciklama: string | null; serbestZamani: string | null; tasima: 'biz' | 'firma' | null;
  sonYazanKisiId: number | null; sonYazanYer: SonYazanYeri | null; sonYazanZamani: string | null;
  erkenZamani: string | null; erkenKisiId: number | null; erkenGerekce: string | null;
  depoZamani: string | null; depoKisiId: number | null; kabulAdet: string | null;
}
const bekleyenAlanlari = (t: string) => `${t}.id, ${t}.kaynak, ${t}.yon, ${t}.uretim_emri_id AS "uretimEmriId", ${t}.fason_hareket_id AS "fasonHareketId",
  ${t}.talep_id AS "talepId", ${t}.firma_id AS "firmaId", ${t}.malzeme_no AS "malzemeNo", ${t}.adet::text AS adet, ${t}.istenen_tarih AS "istenenTarih",
  ${zamanMetni(`${t}.hazir_zamani`)} AS "hazirZamani", ${t}.is_id AS "isId", ${zamanMetni(`${t}.kaldirildi`)} AS kaldirildi, ${t}.ust_bekleyen_id AS "ustBekleyenId",
  ${t}.is_emri_id AS "isEmriId", ${t}.siparis_satiri_id AS "siparisSatiriId", ${t}.gidis_bekleyen_id AS "gidisBekleyenId", ${t}.elle_turu AS "elleTuru",
  ${t}.aciklama, ${zamanMetni(`${t}.serbest_zamani`)} AS "serbestZamani", ${t}.tasima, ${t}.son_yazan_kisi_id AS "sonYazanKisiId",
  ${t}.son_yazan_yer AS "sonYazanYer", ${zamanMetni(`${t}.son_yazan_zamani`)} AS "sonYazanZamani", ${zamanMetni(`${t}.erken_zamani`)} AS "erkenZamani",
  ${t}.erken_kisi_id AS "erkenKisiId", ${t}.erken_gerekce AS "erkenGerekce", ${zamanMetni(`${t}.depo_zamani`)} AS "depoZamani", ${t}.depo_kisi_id AS "depoKisiId",
  ${t}.kabul_adet::text AS "kabulAdet"`;
const BEKLEYEN_ALANLARI = bekleyenAlanlari('sevkiyat_bekleyen');
// Serbest bırakma (960): taşıma, yazan ve yeri; erken çıkışta kişi ve gerekçe. Boşsa kalem serbest değildir (Tüm işlerde bekler).
export interface SerbestYazisi { tasima: 'biz' | 'firma'; yer: SonYazanYeri; kisiId: number | null; erken: { kisiId: number; gerekce: string } | null }
export interface BekleyenYazisi {
  kaynak: KalemKaynagi; yon: 'gidis' | 'gelis'; uretimEmriId: number | null; fasonHareketId: number | null; talepId: string | null;
  firmaId: number | null; malzemeNo: number | null; adet: string | null; istenenTarih: string | null; isId: number | null;
  isEmriId?: number | null; siparisSatiriId?: number | null; gidisBekleyenId?: number | null; elleTuru?: BekleyenSatiri['elleTuru']; aciklama?: string | null;
  serbest: SerbestYazisi | null;
}
// Aynı emrin ürünü ikinci kez düşmez (sevkiyat_bekleyen_urun_tek, kök kayıt). Emir bitmeden önceden bırakılmış (adedi boş) kök kayda
// biten emrin adedi ve günü yazılır; adedi dolu kök varsa null döner.
export function bekleyenEkle(db: Db, b: BekleyenYazisi): Promise<BekleyenSatiri | null> {
  const s = b.serbest;
  return db.tek<BekleyenSatiri>(
    `INSERT INTO sevkiyat_bekleyen (kaynak, yon, uretim_emri_id, fason_hareket_id, talep_id, firma_id, malzeme_no, adet, istenen_tarih, is_id,
       is_emri_id, siparis_satiri_id, gidis_bekleyen_id, elle_turu, aciklama, serbest_zamani, tasima, son_yazan_kisi_id, son_yazan_yer, son_yazan_zamani,
       erken_zamani, erken_kisi_id, erken_gerekce)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CASE WHEN $16::text IS NULL THEN NULL ELSE now() END, $16, $17, $18,
       CASE WHEN $18::text IS NULL THEN NULL ELSE now() END, CASE WHEN $19::int IS NULL THEN NULL ELSE now() END, $19, $20)
     ON CONFLICT (uretim_emri_id) WHERE kaynak = 'urun' AND ust_bekleyen_id IS NULL
       DO UPDATE SET adet = EXCLUDED.adet, istenen_tarih = COALESCE(sevkiyat_bekleyen.istenen_tarih, EXCLUDED.istenen_tarih), hazir_zamani = now()
       WHERE sevkiyat_bekleyen.adet IS NULL AND EXCLUDED.adet IS NOT NULL
     RETURNING ${BEKLEYEN_ALANLARI}`,
    [b.kaynak, b.yon, b.uretimEmriId, b.fasonHareketId, b.talepId, b.firmaId, b.malzemeNo, b.adet, b.istenenTarih, b.isId,
      b.isEmriId ?? null, b.siparisSatiriId ?? null, b.gidisBekleyenId ?? null, b.elleTuru ?? null, b.aciklama ?? null,
      s?.tasima ?? null, s?.kisiId ?? null, s?.yer ?? null, s?.erken?.kisiId ?? null, s?.erken?.gerekce ?? null],
  );
}
// Sevkiyatın bekleme listesi: araçla taşınacak, serbest, işe çevrilmemiş ve çıkabilir kalemler. Ürün emri bitince (adet dolar), dönüş
// gidişi depodan çıkınca çıkabilir; erken çıkış ikisini de geçer.
export function acikBekleyenler(db: Db): Promise<BekleyenSatiri[]> {
  return db.sorgu<BekleyenSatiri>(
    `SELECT ${bekleyenAlanlari('b')} FROM sevkiyat_bekleyen b LEFT JOIN sevkiyat_bekleyen g ON g.id = b.gidis_bekleyen_id
      WHERE b.is_id IS NULL AND b.kaldirildi IS NULL AND b.tasima = 'biz' AND b.depo_zamani IS NULL
        AND (b.erken_zamani IS NOT NULL OR ((b.kaynak <> 'urun' OR b.adet IS NOT NULL) AND (g.id IS NULL OR g.depo_zamani IS NOT NULL)))
      ORDER BY b.hazir_zamani, b.id`,
  );
}
export function bekleyenKilitle(db: Db, id: number): Promise<BekleyenSatiri | null> {
  return db.tek<BekleyenSatiri>(`SELECT ${BEKLEYEN_ALANLARI} FROM sevkiyat_bekleyen WHERE id = $1 FOR UPDATE`, [id]);
}
export function bekleyeniIseBagla(db: Db, id: number, isId: number): Promise<unknown> {
  return db.sorgu('UPDATE sevkiyat_bekleyen SET is_id = $2 WHERE id = $1 AND is_id IS NULL AND kaldirildi IS NULL', [id, isId]);
}
// Bölünen ya da işi iptal edilip yeniden açılan kalem serbest bırakılışını ve erken çıkışını taşır.
const SERBEST_SUTUNLARI = 'serbest_zamani, tasima, son_yazan_kisi_id, son_yazan_yer, son_yazan_zamani, erken_zamani, erken_kisi_id, erken_gerekce';
// Kısmi sevk (261 a): parça yeni kayda geçer, kalan eski kayıtta durur; parça kök kaydı ve listeye düştüğü anı taşır.
export async function bekleyeniBol(db: Db, id: number, parca: string): Promise<number> {
  return (await db.tek<{ id: number }>(
    `WITH kalan AS (UPDATE sevkiyat_bekleyen SET adet = adet - $2::numeric WHERE id = $1 RETURNING *)
     INSERT INTO sevkiyat_bekleyen (kaynak, yon, uretim_emri_id, malzeme_no, adet, istenen_tarih, hazir_zamani, ust_bekleyen_id, ${SERBEST_SUTUNLARI})
     SELECT kaynak, yon, uretim_emri_id, malzeme_no, $2::numeric, istenen_tarih, hazir_zamani, COALESCE(ust_bekleyen_id, id), ${SERBEST_SUTUNLARI} FROM kalan RETURNING id`,
    [id, parca],
  ))!.id;
}
// Sevk anının müşterisi (261 a): iş yola çıkınca ya da teslim edilince bırakış noktasının firması ürün kaydına yazılır.
export async function urunFirmalariniYaz(db: Db, isIdleri: readonly number[]): Promise<void> {
  if (isIdleri.length === 0) return;
  await db.sorgu(
    `UPDATE sevkiyat_bekleyen b SET firma_id = n.firma_id
       FROM sevkiyat_isi i LEFT JOIN sevkiyat_noktasi n ON n.id = i.birakis_noktasi_id
      WHERE b.is_id = i.id AND b.kaynak = 'urun' AND i.id = ANY($1::int[])`, [[...isIdleri]],
  );
}
// İptal edilen işin yükü bekleme listesine döner (17.2). Ürün ve alım kaydı iptal edilen işte kalır (sevk geçmişi, 302 a), yükü yeni açık
// kayda geçer: ürün parçası kök kaydı gösterir, sevk anı müşterisi taşınmaz. Fason, dönüş ve elle kalem tektir (gidiş-dönüş bağı); işten çözülür.
export async function isinBekleyenleriniCoz(db: Db, isId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO sevkiyat_bekleyen (kaynak, yon, uretim_emri_id, talep_id, firma_id, malzeme_no, adet, istenen_tarih, hazir_zamani, ust_bekleyen_id,
       siparis_satiri_id, ${SERBEST_SUTUNLARI})
     SELECT kaynak, yon, uretim_emri_id, talep_id, CASE WHEN kaynak = 'alim' THEN firma_id END, malzeme_no, adet, istenen_tarih, hazir_zamani,
       CASE WHEN kaynak = 'urun' THEN COALESCE(ust_bekleyen_id, id) END, siparis_satiri_id, ${SERBEST_SUTUNLARI}
       FROM sevkiyat_bekleyen WHERE is_id = $1 AND kaynak IN ('urun', 'alim')`, [isId],
  );
  await db.sorgu("UPDATE sevkiyat_bekleyen SET is_id = NULL WHERE is_id = $1 AND kaynak IN ('fason', 'fason-donus', 'elle')", [isId]);
}
export function bekleyeniKaldir(db: Db, id: number, kisiId: number): Promise<unknown> {
  return db.sorgu('UPDATE sevkiyat_bekleyen SET kaldirildi = now(), kaldiran_kisi_id = $2 WHERE id = $1 AND is_id IS NULL AND kaldirildi IS NULL', [id, kisiId]);
}
// Firmanın aktif noktası (sevkiyat_noktasi_firma_tek: en çok bir tane).
export async function firmaNoktalari(db: Db, firmaIdleri: readonly number[]): Promise<Map<number, number>> {
  if (firmaIdleri.length === 0) return new Map();
  const satirlar = await db.sorgu<{ firmaId: number; id: number }>(
    'SELECT firma_id AS "firmaId", id FROM sevkiyat_noktasi WHERE aktif AND firma_id = ANY($1::int[])', [[...new Set(firmaIdleri)]],
  );
  return new Map(satirlar.map((s) => [s.firmaId, s.id]));
}
export async function bugun(db: Db): Promise<string> {
  return (await db.tek<{ gun: string }>(`SELECT to_char(current_date, 'YYYY-MM-DD') AS gun`))!.gun;
}

export interface SevkDurumuSatiri {
  uretimEmriId: number; hazirZamani: string; kaldirildi: string | null; isId: number | null;
  isDurumu: 'havuzda' | 'planlandi' | 'yolda' | 'tamamlandi' | null; isDurumZamani: string | null; isIptalEdildi: boolean;
}
export function emirlerinSevkDurumu(db: Db, emirIdleri: readonly number[]): Promise<SevkDurumuSatiri[]> {
  return db.sorgu<SevkDurumuSatiri>(
    `SELECT DISTINCT ON (b.uretim_emri_id)
       b.uretim_emri_id AS "uretimEmriId", ${zamanMetni('b.hazir_zamani')} AS "hazirZamani", ${zamanMetni('b.kaldirildi')} AS kaldirildi,
       b.is_id AS "isId", i.durum AS "isDurumu", ${zamanMetni('i.durum_zamani')} AS "isDurumZamani", COALESCE(i.iptal_edildi IS NOT NULL, false) AS "isIptalEdildi"
     FROM sevkiyat_bekleyen b LEFT JOIN sevkiyat_isi i ON i.id = b.is_id
     WHERE b.kaynak = 'urun' AND b.uretim_emri_id = ANY($1::int[])
     -- Kısmi sevkte emrin yeri en geride kalan parçasıdır; kaldırılan parça ancak başka parça yoksa görünür.
     ORDER BY b.uretim_emri_id, b.kaldirildi IS NOT NULL,
       CASE WHEN b.is_id IS NULL OR i.iptal_edildi IS NOT NULL THEN 0 ELSE array_position(ARRAY['havuzda', 'planlandi', 'yolda', 'tamamlandi'], i.durum) END,
       i.durum_zamani DESC NULLS FIRST, b.id`,
    [[...new Set(emirIdleri)]],
  );
}
// İleri izlenebilirlik (E-12): emrin ürününü taşıyan iptal edilmemiş işler, bırakış noktası ve firması.
export interface EmirSevkiSatiri {
  uretimEmriId: number; isId: number; tarih: string; durum: 'havuzda' | 'planlandi' | 'yolda' | 'tamamlandi'; durumZamani: string;
  adet: string | null; noktaId: number | null; noktaAdi: string | null; firmaId: number | null;
}
export function emirlerinSevkleri(db: Db, emirIdleri: readonly number[]): Promise<EmirSevkiSatiri[]> {
  return db.sorgu<EmirSevkiSatiri>(
    `SELECT b.uretim_emri_id AS "uretimEmriId", i.id AS "isId", i.tarih::text AS tarih, i.durum, ${zamanMetni('i.durum_zamani')} AS "durumZamani",
       b.adet::text AS adet, n.id AS "noktaId", n.ad AS "noktaAdi", COALESCE(b.firma_id, n.firma_id) AS "firmaId"
     FROM sevkiyat_bekleyen b JOIN sevkiyat_isi i ON i.id = b.is_id LEFT JOIN sevkiyat_noktasi n ON n.id = i.birakis_noktasi_id
     WHERE b.kaynak = 'urun' AND b.uretim_emri_id = ANY($1::int[]) AND i.iptal_edildi IS NULL
     ORDER BY b.uretim_emri_id, i.id`,
    [[...new Set(emirIdleri)]],
  );
}
export async function isinFasonHareketleri(db: Db, isId: number): Promise<number[]> {
  const satirlar = await db.sorgu<{ id: number }>(
    // Tetiklenen işte parçayı depo çıkışı taşır (962 a); durum olayı yalnız tetiksiz eski yoldadır.
    `SELECT b.fason_hareket_id AS id FROM sevkiyat_bekleyen b JOIN sevkiyat_isi i ON i.id = b.is_id
      WHERE b.is_id = $1 AND b.kaynak = 'fason' AND b.fason_hareket_id IS NOT NULL AND i.tetiklendi IS NULL AND b.depo_zamani IS NULL`, [isId],
  );
  return satirlar.map((s) => s.id);
}

// İşlerin taşıdığı biten emir ürünleri (E-12): bekleme listesinden işe çevrilen ürün kaydı ve işin bırakış noktasının firması.
// Yalnız göçten önce düşmüş (otomatik) ve tetiklenmemiş kayıt: Tüm işlerden bırakılan ürünü plan onayı değil depo çıkışı oynatır (962 a).
export function islerinUrunSatirlari(db: Db, isIdleri: readonly number[]): Promise<{ isId: number; uretimEmriId: number; adet: string | null; firmaId: number | null }[]> {
  if (isIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT b.is_id AS "isId", b.uretim_emri_id AS "uretimEmriId", b.adet::text AS adet, COALESCE(b.firma_id, n.firma_id) AS "firmaId"
       FROM sevkiyat_bekleyen b JOIN sevkiyat_isi i ON i.id = b.is_id LEFT JOIN sevkiyat_noktasi n ON n.id = i.birakis_noktasi_id
      WHERE b.is_id = ANY($1::int[]) AND b.kaynak = 'urun' AND b.son_yazan_yer = 'otomatik' AND i.tetiklendi IS NULL AND b.depo_zamani IS NULL
      ORDER BY b.is_id`, [[...isIdleri]],
  );
}

// Faturanın bağlanacağı iş (260 a): türü, iptali, taşıdığı ürünün emri ve firması (alımda alış, ötekinde bırakış noktasının firması).
export function isOzeti(db: Db, id: number): Promise<{ tur: 'teslimat' | 'alim' | 'aktarma'; iptal: boolean; uretimEmriId: number | null; firmaId: number | null } | null> {
  return db.tek(
    `SELECT i.tur, i.iptal_edildi IS NOT NULL AS iptal, b.uretim_emri_id AS "uretimEmriId", COALESCE(b.firma_id, n.firma_id) AS "firmaId"
       FROM sevkiyat_isi i
       LEFT JOIN sevkiyat_bekleyen b ON b.is_id = i.id
       LEFT JOIN sevkiyat_noktasi n ON n.id = CASE WHEN i.tur = 'alim' THEN i.alis_noktasi_id ELSE i.birakis_noktasi_id END
      WHERE i.id = $1`, [id],
  );
}

// Siparişin sevkleri (302 a): emirlerin ürününü taşıyan teslimat işleri (fatura yalnız teslimata bağlanır), iptal edilenler dahil; müşteri sevk anında yazılan firma, yoksa bırakış noktasınınki.
export interface EmirIsiSatiri {
  isId: number; uretimEmriId: number; tarih: string; durum: 'havuzda' | 'planlandi' | 'yolda' | 'tamamlandi'; durumZamani: string;
  adet: string | null; firmaId: number | null; belgeNo: string | null; iptal: boolean;
}
export function emirlerinIsleri(db: Db, emirIdleri: readonly number[]): Promise<EmirIsiSatiri[]> {
  if (emirIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<EmirIsiSatiri>(
    `SELECT i.id AS "isId", b.uretim_emri_id AS "uretimEmriId", i.tarih::text AS tarih, i.durum, ${zamanMetni('i.durum_zamani')} AS "durumZamani",
       b.adet::text AS adet, COALESCE(b.firma_id, n.firma_id) AS "firmaId", i.belge_no AS "belgeNo",
       i.iptal_edildi IS NOT NULL AS iptal
     FROM sevkiyat_bekleyen b JOIN sevkiyat_isi i ON i.id = b.is_id LEFT JOIN sevkiyat_noktasi n ON n.id = i.birakis_noktasi_id
     WHERE b.kaynak = 'urun' AND b.uretim_emri_id = ANY($1::int[]) AND i.tur = 'teslimat'
     ORDER BY i.tarih, i.id, b.id`,
    [[...new Set(emirIdleri)]],
  );
}

// Okutulan ürünün sevkleri (kart #96): emrin ya da kartın kaldırılmamış ürün kayıtları; işe çevrilmişse yalnız kapanmamış
// (tamamlanmamış, iptal edilmemiş) teslimat işi.
export interface OkutulanSevkSatiri {
  bekleyenId: number; uretimEmriId: number | null; malzemeNo: number | null; adet: string | null; firmaId: number | null;
  isId: number | null; tarih: string | null; durum: 'havuzda' | 'planlandi' | 'yolda' | 'tamamlandi' | null; belgeNo: string | null;
}
export function okutulanSevkler(db: Db, s: { uretimEmriId: number | null; malzemeNo: number | null }): Promise<OkutulanSevkSatiri[]> {
  return db.sorgu<OkutulanSevkSatiri>(
    `SELECT b.id AS "bekleyenId", b.uretim_emri_id AS "uretimEmriId", b.malzeme_no AS "malzemeNo", b.adet::text AS adet,
       COALESCE(b.firma_id, n.firma_id) AS "firmaId", i.id AS "isId", i.tarih::text AS tarih, i.durum, i.belge_no AS "belgeNo"
     FROM sevkiyat_bekleyen b LEFT JOIN sevkiyat_isi i ON i.id = b.is_id LEFT JOIN sevkiyat_noktasi n ON n.id = i.birakis_noktasi_id
     WHERE b.kaynak = 'urun' AND b.kaldirildi IS NULL
       AND ($1::int IS NULL OR b.uretim_emri_id = $1) AND ($2::int IS NULL OR b.malzeme_no = $2)
       AND (b.is_id IS NULL OR (i.iptal_edildi IS NULL AND i.durum <> 'tamamlandi' AND i.tur = 'teslimat'))
     ORDER BY b.hazir_zamani, b.id LIMIT 50`,
    [s.uretimEmriId, s.malzemeNo],
  );
}

// Talebin bekleme listesindeki alım satırları (kart #1310); listeden kaldırılanlar yok sayılır, işe çevrilenler de döner.
export function talebinAlimlari(db: Db, talepId: string): Promise<{ id: number; firmaId: number | null; istenenTarih: string | null; isId: number | null; tasima: 'biz' | 'firma' | null }[]> {
  return db.sorgu(
    `SELECT id, firma_id AS "firmaId", istenen_tarih::text AS "istenenTarih", is_id AS "isId", tasima FROM sevkiyat_bekleyen
      WHERE kaynak = 'alim' AND talep_id = $1 AND kaldirildi IS NULL ORDER BY id FOR UPDATE`, [talepId]);
}
export function bekleyenTarihiYaz(db: Db, id: number, istenenTarih: string | null): Promise<unknown> {
  return db.sorgu('UPDATE sevkiyat_bekleyen SET istenen_tarih = $2 WHERE id = $1 AND is_id IS NULL', [id, istenenTarih]);
}

// ---------- tüm işler (960) ----------

// Kalemin işi (iptal edilen işteki kalem yeni açık kayda geçmiştir, listeye girmez).
export interface KalemSatiri extends BekleyenSatiri {
  isTarih: string | null; isDurumu: 'havuzda' | 'planlandi' | 'yolda' | 'tamamlandi' | null; isTetiklendi: string | null; isNoktaFirmaId: number | null;
}
const KALEM_ALANLARI = `${bekleyenAlanlari('b')}, i.tarih::text AS "isTarih", i.durum AS "isDurumu", ${zamanMetni('i.tetiklendi')} AS "isTetiklendi",
  n.firma_id AS "isNoktaFirmaId"`;
const KALEM_KAYNAKLARI = `sevkiyat_bekleyen b LEFT JOIN sevkiyat_isi i ON i.id = b.is_id
  LEFT JOIN sevkiyat_noktasi n ON n.id = CASE WHEN i.tur = 'alim' THEN i.alis_noktasi_id ELSE i.birakis_noktasi_id END`;
// Açık kalemler ve aralıkta biten kalemler (depo yaptı ya da eski akışta iş tamamlandı); gün tesis gününe göre.
export function tumIsKalemleri(db: Db, aralik: { baslangic: string; bitis: string }): Promise<KalemSatiri[]> {
  return db.sorgu<KalemSatiri>(
    `SELECT ${KALEM_ALANLARI} FROM ${KALEM_KAYNAKLARI}
      WHERE b.kaldirildi IS NULL AND (b.is_id IS NULL OR i.iptal_edildi IS NULL)
        AND (COALESCE(b.depo_zamani, CASE WHEN i.durum = 'tamamlandi' THEN i.durum_zamani END) IS NULL
          OR (COALESCE(b.depo_zamani, i.durum_zamani) AT TIME ZONE 'Europe/Istanbul')::date BETWEEN $1::date AND $2::date)
      ORDER BY b.id`,
    [aralik.baslangic, aralik.bitis],
  );
}
export function kalemleriKilitle(db: Db, idler: readonly number[]): Promise<KalemSatiri[]> {
  if (idler.length === 0) return Promise.resolve([]);
  return db.sorgu<KalemSatiri>(`SELECT ${KALEM_ALANLARI} FROM ${KALEM_KAYNAKLARI} WHERE b.id = ANY($1::int[]) ORDER BY b.id FOR UPDATE OF b`, [[...new Set(idler)]]);
}
export function isinKalemleri(db: Db, isId: number): Promise<KalemSatiri[]> {
  return db.sorgu<KalemSatiri>(`SELECT ${KALEM_ALANLARI} FROM ${KALEM_KAYNAKLARI} WHERE b.is_id = $1 ORDER BY b.id FOR UPDATE OF b`, [isId]);
}
// Kalemi olan aday kaynakları: ürünün emri, açık fason gidişinin adımı, açık alımın sipariş satırı.
export async function kalemliKaynaklar(db: Db): Promise<{ urun: Set<number>; fason: Set<number>; alim: Set<number> }> {
  const satirlar = await db.sorgu<{ kaynak: string; id: number }>(
    `SELECT DISTINCT 'urun' AS kaynak, uretim_emri_id AS id FROM sevkiyat_bekleyen WHERE kaynak = 'urun'
     UNION SELECT DISTINCT 'fason', is_emri_id FROM sevkiyat_bekleyen
       WHERE kaynak = 'fason' AND is_emri_id IS NOT NULL AND depo_zamani IS NULL AND kaldirildi IS NULL AND fason_hareket_id IS NULL
     UNION SELECT DISTINCT 'alim', siparis_satiri_id FROM sevkiyat_bekleyen WHERE kaynak = 'alim' AND siparis_satiri_id IS NOT NULL AND kaldirildi IS NULL`,
  );
  const sonuc = { urun: new Set<number>(), fason: new Set<number>(), alim: new Set<number>() };
  for (const s of satirlar) sonuc[s.kaynak as keyof typeof sonuc].add(s.id);
  return sonuc;
}
export function urunKokKalemi(db: Db, uretimEmriId: number): Promise<BekleyenSatiri | null> {
  return db.tek<BekleyenSatiri>(
    `SELECT ${BEKLEYEN_ALANLARI} FROM sevkiyat_bekleyen WHERE kaynak = 'urun' AND uretim_emri_id = $1 AND ust_bekleyen_id IS NULL FOR UPDATE`, [uretimEmriId],
  );
}
// Serbest bırakma ya da erkene çevirme: serbest anı ilk bırakıştır; taşıma ve son yazan her yazımda yenilenir.
export function serbestYaz(db: Db, id: number, s: SerbestYazisi): Promise<unknown> {
  return db.sorgu(
    `UPDATE sevkiyat_bekleyen SET serbest_zamani = COALESCE(serbest_zamani, now()), tasima = $2, son_yazan_kisi_id = $3, son_yazan_yer = $4, son_yazan_zamani = now(),
       erken_zamani = CASE WHEN $5::int IS NULL THEN erken_zamani ELSE now() END, erken_kisi_id = COALESCE($5, erken_kisi_id), erken_gerekce = COALESCE($6, erken_gerekce)
      WHERE id = $1 AND kaldirildi IS NULL AND depo_zamani IS NULL`,
    [id, s.tasima, s.kisiId, s.yer, s.erken?.kisiId ?? null, s.erken?.gerekce ?? null],
  );
}
// Firma taşımasına geçen kalem işten çözülür (iş sevkiyatın kaydıdır, kalemsiz kalırsa planlayıcı iptal eder).
export function tasimaYaz(db: Db, id: number, tasima: 'biz' | 'firma', yer: SonYazanYeri, kisiId: number | null): Promise<unknown> {
  return db.sorgu(
    `UPDATE sevkiyat_bekleyen SET tasima = $2, son_yazan_kisi_id = $3, son_yazan_yer = $4, son_yazan_zamani = now(),
       is_id = CASE WHEN $2 = 'firma' THEN NULL ELSE is_id END WHERE id = $1`, [id, tasima, kisiId, yer],
  );
}
export function tetikYaz(db: Db, isId: number, kisiId: number | null): Promise<unknown> {
  return db.sorgu(
    'UPDATE sevkiyat_isi SET tetiklendi = CASE WHEN $2::int IS NULL THEN NULL ELSE now() END, tetikleyen_kisi_id = $2 WHERE id = $1', [isId, kisiId],
  );
}
export function isTetigi(db: Db, isId: number): Promise<{ durum: 'havuzda' | 'planlandi' | 'yolda' | 'tamamlandi'; tetiklendi: string | null; iptal: boolean } | null> {
  return db.tek(`SELECT durum, ${zamanMetni('tetiklendi')} AS tetiklendi, iptal_edildi IS NOT NULL AS iptal FROM sevkiyat_isi WHERE id = $1 FOR UPDATE`, [isId]);
}
// Depo: son çıkış ya da kabul bekleyen kalemler. Firma taşımasında serbest bırakma, araçla taşımada işin tetiği depoya düşürür (966 b).
export function depodakiKalemler(db: Db): Promise<KalemSatiri[]> {
  return db.sorgu<KalemSatiri>(
    `SELECT ${KALEM_ALANLARI} FROM ${KALEM_KAYNAKLARI}
      WHERE b.serbest_zamani IS NOT NULL AND b.depo_zamani IS NULL AND b.kaldirildi IS NULL
        AND ((b.tasima = 'firma') OR (i.tetiklendi IS NOT NULL AND i.iptal_edildi IS NULL))
      ORDER BY COALESCE(i.tetiklendi, b.serbest_zamani), b.id`,
  );
}
// Depo yaptı: gidişte son çıkış, gelişte kabulün tamamı. Kısmi kabulde yalnız kabul adedi artar.
export function depoYaz(db: Db, id: number, kisiId: number, kabulAdet: string | null, tamam: boolean): Promise<unknown> {
  return db.sorgu(
    `UPDATE sevkiyat_bekleyen SET kabul_adet = CASE WHEN $3::numeric IS NULL THEN kabul_adet ELSE COALESCE(kabul_adet, 0) + $3::numeric END,
       depo_zamani = CASE WHEN $4 THEN now() ELSE depo_zamani END, depo_kisi_id = CASE WHEN $4 THEN $2 ELSE depo_kisi_id END
      WHERE id = $1 AND depo_zamani IS NULL`, [id, kisiId, kabulAdet, tamam],
  );
}
export function depoGeriAl(db: Db, id: number): Promise<unknown> {
  return db.sorgu('UPDATE sevkiyat_bekleyen SET depo_zamani = NULL, depo_kisi_id = NULL WHERE id = $1', [id]);
}
export function kalemlerGetir(db: Db, idler: readonly number[]): Promise<KalemSatiri[]> {
  if (idler.length === 0) return Promise.resolve([]);
  return db.sorgu<KalemSatiri>(`SELECT ${KALEM_ALANLARI} FROM ${KALEM_KAYNAKLARI} WHERE b.id = ANY($1::int[]) ORDER BY b.id`, [[...new Set(idler)]]);
}
// Gidişlerin dönüşleri (bağlı anahtar için).
export function donusleri(db: Db, gidisIdleri: readonly number[]): Promise<{ id: number; gidisId: number }[]> {
  if (gidisIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu('SELECT id, gidis_bekleyen_id AS "gidisId" FROM sevkiyat_bekleyen WHERE gidis_bekleyen_id = ANY($1::int[])', [[...new Set(gidisIdleri)]]);
}
// Satın almanın teslim yöntemiyle açılan eski alım kalemleri (talep ve firma); aynı siparişin satırları ayrıca aday olmaz.
export async function talepAlimlari(db: Db): Promise<Set<string>> {
  const satirlar = await db.sorgu<{ talepId: string; firmaId: number }>(
    `SELECT DISTINCT talep_id AS "talepId", firma_id AS "firmaId" FROM sevkiyat_bekleyen
      WHERE kaynak = 'alim' AND siparis_satiri_id IS NULL AND kaldirildi IS NULL AND firma_id IS NOT NULL`,
  );
  return new Set(satirlar.map((s) => `${s.talepId}:${String(s.firmaId)}`));
}
