import type { Db } from '#cekirdek/db.ts';
import type { BedelAyari, BedelAyariGovdesi, PlanAyari } from '#paylasilan/sozlesme/plan.ts';
import type { Kaynak } from './kurallar.ts';

// Hedef: null canlı plan, sayı taslak (senaryo). Canlıya yalnız canlıya alma yazar (P6).
export type Hedef = number | null;

export interface YerlesimSatiri {
  isEmriId: number; kaynak: Kaynak; baslangic: Date; bitis: Date; kilitli: boolean; dondurulmus: boolean; elleSira: number | null;
  // Elle sıranın verildiği andaki adımın rota istasyonu; bilinmiyorsa (eski satır, istasyonsuz adım) boş.
  elleIstasyonId?: number | null;
  // Makineyi planlamacı elle seçti: toptan hesap işi başka makineye taşımaz, yalnız saatini ayarlar.
  elleKaynak?: boolean;
  // Elle bölme (kart #1572): iş adediyle parçalara bölünmüşse her parçanın yeri; ana satır zarftır (ilk parçanın kaynağı, ilk başlangıç,
  // son bitiş). Boş ya da yoksa iş bölünmemiştir.
  parcalar?: ParcaSatiri[];
}
export interface ParcaSatiri {
  no: number; adet: number; kaynak: Kaynak; baslangic: Date; bitis: Date; elleSira: number | null; elleIstasyonId: number | null; elleKaynak: boolean;
}
type Ham = Omit<YerlesimSatiri, 'kaynak' | 'parcalar'> & { makineId: number | null; kisiId: number | null };
type ParcaHam = Omit<ParcaSatiri, 'kaynak' | 'baslangic' | 'bitis'> & { isEmriId: number; makineId: number | null; kisiId: number | null; baslangic: Date | null; bitis: Date | null };
const kaynakOf = (makineId: number | null, kisiId: number | null): Kaynak => (makineId !== null ? { tur: 'makine', id: makineId } : { tur: 'kisi', id: kisiId! });
const coz = ({ makineId, kisiId, ...r }: Ham): YerlesimSatiri => ({ ...r, kaynak: kaynakOf(makineId, kisiId) });
const PARCA = `is_emri_id AS "isEmriId", parca_no AS no, adet, makine_id AS "makineId", kisi_id AS "kisiId", baslangic, bitis, elle_sira AS "elleSira",
  elle_istasyon_id AS "elleIstasyonId", elle_kaynak AS "elleKaynak"`;
const PARCA_SUTUN = 'is_emri_id, parca_no, adet, makine_id, kisi_id, baslangic, bitis, elle_sira, elle_istasyon_id, elle_kaynak';
// Yerleşmiş parçalar yerleşimlere eklenir; bölünmemiş işte alan hiç yoktur (eski okuyucuların karşılaştırması değişmez).
function parcalariEkle(satirlar: YerlesimSatiri[], parcalar: readonly ParcaHam[]): YerlesimSatiri[] {
  const h = new Map<number, ParcaSatiri[]>();
  for (const { isEmriId, makineId, kisiId, baslangic, bitis, ...p } of parcalar) {
    if (baslangic !== null && bitis !== null) h.set(isEmriId, [...(h.get(isEmriId) ?? []), { ...p, baslangic, bitis, kaynak: kaynakOf(makineId, kisiId) }]);
  }
  return satirlar.map((y) => (h.has(y.isEmriId) ? { ...y, parcalar: h.get(y.isEmriId)! } : y));
}
const mk = (k: Kaynak) => (k.tur === 'makine' ? k.id : null);
const ks = (k: Kaynak) => (k.tur === 'kisi' ? k.id : null);
const YERLESIM = `is_emri_id AS "isEmriId", makine_id AS "makineId", kisi_id AS "kisiId", baslangic, bitis, kilitli, dondurulmus, elle_sira AS "elleSira", elle_istasyon_id AS "elleIstasyonId", elle_kaynak AS "elleKaynak"`;
const SY_SUTUN = 'senaryo_id, is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira, elle_istasyon_id, elle_kaynak';

export const planSurumu = async (db: Db, kilit = false): Promise<number> =>
  (await db.tek<{ surum: number }>(`SELECT surum FROM plan_durumu${kilit ? ' FOR UPDATE' : ''}`))!.surum;
export const planSurumuArtir = async (db: Db): Promise<number> =>
  (await db.tek<{ surum: number }>('UPDATE plan_durumu SET surum = surum + 1 RETURNING surum'))!.surum;

export async function yerlesimler(db: Db, hedef: Hedef): Promise<YerlesimSatiri[]> {
  const r = hedef === null
    ? await db.sorgu<Ham>(`SELECT ${YERLESIM} FROM plan_yerlesimi ORDER BY baslangic, is_emri_id`)
    : await db.sorgu<Ham>(`SELECT ${YERLESIM} FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 ORDER BY baslangic, is_emri_id`, [hedef]);
  const p = hedef === null
    ? await db.sorgu<ParcaHam>(`SELECT ${PARCA} FROM plan_yerlesim_parcasi ORDER BY is_emri_id, parca_no`)
    : await db.sorgu<ParcaHam>(`SELECT ${PARCA} FROM plan_senaryo_yerlesim_parcasi WHERE senaryo_id = $1 ORDER BY is_emri_id, parca_no`, [hedef]);
  return parcalariEkle(r.map(coz), p);
}

// Verilen makinelerde şimdiden ufuk sonuna dek başlayan ve henüz bitmemiş canlı yerleşimler; bölünmüş işte parçalar (393 d).
export function canliMakineAyrimlari(db: Db, makineIdleri: readonly number[], ufukDk: number): Promise<{ makineId: number; isEmriId: number; baslangic: Date }[]> {
  if (makineIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT makine_id AS "makineId", is_emri_id AS "isEmriId", baslangic FROM (
       SELECT y.makine_id, y.is_emri_id, y.baslangic, y.bitis FROM plan_yerlesimi y
        WHERE NOT EXISTS (SELECT 1 FROM plan_yerlesim_parcasi p WHERE p.is_emri_id = y.is_emri_id)
       UNION ALL
       SELECT makine_id, is_emri_id, baslangic, bitis FROM plan_yerlesim_parcasi) a
      WHERE makine_id = ANY($1::int[]) AND baslangic < now() + make_interval(mins => $2) AND bitis > now()
      ORDER BY baslangic, is_emri_id`,
    [[...makineIdleri], ufukDk],
  );
}

// Canlı plandaki verilen iş emirlerinin yerleşimi, başlangıç sırasıyla.
export async function canliYerlesimleri(db: Db, isEmriIdleri: readonly number[]): Promise<YerlesimSatiri[]> {
  const r = await db.sorgu<Ham>(`SELECT ${YERLESIM} FROM plan_yerlesimi WHERE is_emri_id = ANY($1::int[]) ORDER BY baslangic, is_emri_id`, [isEmriIdleri]);
  const p = await db.sorgu<ParcaHam>(`SELECT ${PARCA} FROM plan_yerlesim_parcasi WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, parca_no`, [isEmriIdleri]);
  return parcalariEkle(r.map(coz), p);
}

// Yersiz bölmeler: motorun yerleştiremediği bölünmüş işin parçaları (no, adet); bölme planlamacı kaldırana dek kalır.
export interface BolmeParcasi { no: number; adet: number }
export async function yersizBolmeler(db: Db, hedef: Hedef): Promise<Map<number, BolmeParcasi[]>> {
  const r = hedef === null
    ? await db.sorgu<BolmeParcasi & { isEmriId: number }>('SELECT is_emri_id AS "isEmriId", parca_no AS no, adet FROM plan_yerlesim_parcasi WHERE baslangic IS NULL ORDER BY is_emri_id, parca_no')
    : await db.sorgu<BolmeParcasi & { isEmriId: number }>('SELECT is_emri_id AS "isEmriId", parca_no AS no, adet FROM plan_senaryo_yerlesim_parcasi WHERE senaryo_id = $1 AND baslangic IS NULL ORDER BY is_emri_id, parca_no', [hedef]);
  const h = new Map<number, BolmeParcasi[]>();
  for (const { isEmriId, ...p } of r) h.set(isEmriId, [...(h.get(isEmriId) ?? []), p]);
  return h;
}

// Açık bir taslakta yerleşimi olan iş emirleri (canlıda olmasa da): "canlı planda değil" uyarısı nedenini söyler.
export async function taslaktakiIsEmirleri(db: Db, isEmriIdleri: readonly number[]): Promise<number[]> {
  const r = await db.sorgu<{ id: number }>(
    `SELECT DISTINCT y.is_emri_id AS id FROM plan_senaryo_yerlesimi y JOIN plan_senaryosu s ON s.id = y.senaryo_id
      WHERE s.durum = 'acik' AND y.is_emri_id = ANY($1::int[])`, [isEmriIdleri]);
  return r.map((x) => x.id);
}

// Taslağa yazma: iş emri başına tek yerleşim (eskisi parçalarıyla silinir); parçası verilen iş bölünmüş yazılır.
export async function yerlesimYaz(db: Db, senaryoId: number, y: YerlesimSatiri): Promise<void> {
  await db.sorgu('DELETE FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND is_emri_id = $2', [senaryoId, y.isEmriId]);
  await db.sorgu('DELETE FROM plan_senaryo_yerlesim_parcasi WHERE senaryo_id = $1 AND is_emri_id = $2', [senaryoId, y.isEmriId]);
  await db.sorgu(
    `INSERT INTO plan_senaryo_yerlesimi (${SY_SUTUN}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [senaryoId, y.isEmriId, mk(y.kaynak), ks(y.kaynak), y.baslangic, y.bitis, y.kilitli, y.dondurulmus, y.elleSira, y.elleSira === null ? null : y.elleIstasyonId ?? null, y.elleKaynak ?? false],
  );
  for (const p of y.parcalar ?? []) {
    await db.sorgu(
      `INSERT INTO plan_senaryo_yerlesim_parcasi (senaryo_id, ${PARCA_SUTUN}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [senaryoId, y.isEmriId, p.no, p.adet, mk(p.kaynak), ks(p.kaynak), p.baslangic, p.bitis, p.elleSira, p.elleSira === null ? null : p.elleIstasyonId, p.elleKaynak],
    );
  }
}
// Yerleşim kalkar; bölünmüş işin bölmesi yersiz parçalar olarak kalır (bölmeyi yalnız planlamacı kaldırır).
export async function yerlesimleriSil(db: Db, senaryoId: number, isEmriIdleri: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND is_emri_id = ANY($2::int[])', [senaryoId, [...isEmriIdleri]]);
  await db.sorgu(
    `UPDATE plan_senaryo_yerlesim_parcasi SET makine_id = NULL, kisi_id = NULL, baslangic = NULL, bitis = NULL, elle_sira = NULL, elle_istasyon_id = NULL
      WHERE senaryo_id = $1 AND is_emri_id = ANY($2::int[])`, [senaryoId, [...isEmriIdleri]]);
}
export const isaretYaz = (db: Db, senaryoId: number, isEmriIdleri: readonly number[], alan: { kilitli?: boolean; dondurulmus?: boolean }) =>
  db.sorgu(
    `UPDATE plan_senaryo_yerlesimi SET kilitli = COALESCE($3, kilitli), dondurulmus = COALESCE($4, dondurulmus)
      WHERE senaryo_id = $1 AND is_emri_id = ANY($2::int[])`,
    [senaryoId, [...isEmriIdleri], alan.kilitli ?? null, alan.dondurulmus ?? null],
  );
export async function elleSiraSil(db: Db, senaryoId: number, isEmriIdleri: readonly number[] | null = null): Promise<void> {
  const p = [senaryoId, isEmriIdleri === null ? null : [...isEmriIdleri]];
  await db.sorgu('UPDATE plan_senaryo_yerlesimi SET elle_sira = NULL, elle_istasyon_id = NULL WHERE senaryo_id = $1 AND elle_sira IS NOT NULL AND ($2::int[] IS NULL OR is_emri_id = ANY($2::int[]))', p);
  await db.sorgu('UPDATE plan_senaryo_yerlesim_parcasi SET elle_sira = NULL, elle_istasyon_id = NULL WHERE senaryo_id = $1 AND elle_sira IS NOT NULL AND ($2::int[] IS NULL OR is_emri_id = ANY($2::int[]))', p);
}

// Canlıya alma: verilen iş emirlerinin canlı yerleşimleri taslaktakiyle değişir (taslakta yoksa canlıdan kalkar). Deneme emirlerinin
// (eksi kimlik) yerleşimi canlıya geçmez.
export async function canliyaYaz(db: Db, senaryoId: number, isEmriIdleri: readonly number[], kisiId: number): Promise<void> {
  await db.sorgu('DELETE FROM plan_yerlesimi WHERE is_emri_id = ANY($1::int[])', [[...isEmriIdleri]]);
  await db.sorgu('DELETE FROM plan_yerlesim_parcasi WHERE is_emri_id = ANY($1::int[])', [[...isEmriIdleri]]);
  await db.sorgu(
    `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira, elle_istasyon_id, elle_kaynak, yazan_kisi_id)
     SELECT is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira, elle_istasyon_id, elle_kaynak, $3
       FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND is_emri_id = ANY($2::int[]) AND is_emri_id > 0`,
    [senaryoId, [...isEmriIdleri], kisiId],
  );
  await db.sorgu(
    `INSERT INTO plan_yerlesim_parcasi (${PARCA_SUTUN}) SELECT ${PARCA_SUTUN} FROM plan_senaryo_yerlesim_parcasi
      WHERE senaryo_id = $1 AND is_emri_id = ANY($2::int[]) AND is_emri_id > 0`,
    [senaryoId, [...isEmriIdleri]],
  );
}

// Taban plan (33 a): canlıya alınan adımın ilk canlı yeri. Canlıya almayla aynı işlemde, canlı plan sürümü kilitliyken yazılır;
// tabanı olan adım atlanır (benzersiz kısıt eşzamanlı ikinci yazmayı da durdurur).
export const tabanYaz = (db: Db, senaryoId: number, adimlar: readonly { isEmriId: number; uretimEmriId: number }[], kisiId: number) =>
  db.sorgu(
    `INSERT INTO plan_taban (is_emri_id, uretim_emri_id, makine_id, kisi_id, baslangic, bitis, plan_surumu, senaryo_id, yazan_kisi_id)
     SELECT y.is_emri_id, a.uretim_emri_id, y.makine_id, y.kisi_id, y.baslangic, y.bitis, (SELECT surum FROM plan_durumu), $1, $4
       FROM plan_yerlesimi y JOIN unnest($2::int[], $3::int[]) AS a(is_emri_id, uretim_emri_id) ON a.is_emri_id = y.is_emri_id
      ORDER BY y.is_emri_id
     ON CONFLICT ON CONSTRAINT plan_taban_is_emri_tek DO NOTHING`,
    [senaryoId, adimlar.map((a) => a.isEmriId), adimlar.map((a) => a.uretimEmriId), kisiId],
  );

export interface TabanSatiri {
  isEmriId: number; uretimEmriId: number; kaynak: Kaynak; baslangic: string; bitis: string; planSurumu: number; senaryoId: number;
  yazanKisiId: number; zaman: string;
}
export async function tabanOku(db: Db, g: { uretimEmriIdleri?: readonly number[]; isEmriIdleri?: readonly number[] }): Promise<TabanSatiri[]> {
  if (g.uretimEmriIdleri === undefined && g.isEmriIdleri === undefined) return [];
  const r = await db.sorgu<Omit<TabanSatiri, 'kaynak'> & { makineId: number | null; kisiId: number | null }>(
    `SELECT is_emri_id AS "isEmriId", uretim_emri_id AS "uretimEmriId", makine_id AS "makineId", kisi_id AS "kisiId",
            to_json(baslangic) #>> '{}' AS baslangic, to_json(bitis) #>> '{}' AS bitis, plan_surumu AS "planSurumu", senaryo_id AS "senaryoId",
            yazan_kisi_id AS "yazanKisiId", to_json(zaman) #>> '{}' AS zaman
       FROM plan_taban
      WHERE ($1::int[] IS NULL OR uretim_emri_id = ANY($1::int[])) AND ($2::int[] IS NULL OR is_emri_id = ANY($2::int[]))
      ORDER BY uretim_emri_id, baslangic, is_emri_id`,
    [g.uretimEmriIdleri === undefined ? null : [...g.uretimEmriIdleri], g.isEmriIdleri === undefined ? null : [...g.isEmriIdleri]],
  );
  return r.map(({ makineId, kisiId, ...x }) => ({ ...x, kaynak: kaynakOf(makineId, kisiId) }));
}

/* ---------------- ayar ---------------- */

const AYAR = `kural, yon, tampon_gun::float AS "tamponGun", dondurma_gun AS "dondurmaGun", personel_kisiti AS "personelKisiti",
  taslak_emirler AS "taslakEmirler"`;
const AYAR_SUTUN = 'kural, yon, tampon_gun, dondurma_gun, personel_kisiti, taslak_emirler';
const AYAR_ATA = `kural = k.kural, yon = k.yon, tampon_gun = k.tampon_gun, dondurma_gun = k.dondurma_gun, personel_kisiti = k.personel_kisiti,
  taslak_emirler = k.taslak_emirler`;
export const ayarOku = async (db: Db, hedef: Hedef): Promise<PlanAyari> => (hedef === null
  ? await db.tek<PlanAyari>(`SELECT ${AYAR} FROM plan_ayari`)
  : await db.tek<PlanAyari>(`SELECT ${AYAR} FROM plan_senaryo_ayari WHERE senaryo_id = $1`, [hedef]))!;
export const ayarYaz = (db: Db, senaryoId: number, a: PlanAyari) =>
  db.sorgu(
    `UPDATE plan_senaryo_ayari SET kural = $2, yon = $3, tampon_gun = $4, dondurma_gun = $5, personel_kisiti = $6, taslak_emirler = $7
      WHERE senaryo_id = $1`,
    [senaryoId, a.kural, a.yon, a.tamponGun, a.dondurmaGun, a.personelKisiti, a.taslakEmirler],
  );
export const ayariCanliyaYaz = (db: Db, senaryoId: number, kisiId: number) =>
  db.sorgu(`UPDATE plan_ayari SET ${AYAR_ATA}, degistiren_kisi_id = $2, degisme = now() FROM plan_senaryo_ayari k WHERE k.senaryo_id = $1`, [senaryoId, kisiId]);
export const ayariCanlidanAl = (db: Db, senaryoId: number) =>
  db.sorgu(`UPDATE plan_senaryo_ayari SET ${AYAR_ATA} FROM plan_ayari k WHERE plan_senaryo_ayari.senaryo_id = $1`, [senaryoId]);

/* ---------------- taslak (senaryo) ---------------- */

export interface SenaryoSatiri {
  id: number; ad: string; aciklama: string | null; durum: 'acik' | 'canliya_alindi' | 'vazgecildi'; tabanPlanSurumu: number; surum: number;
  acanKisiId: number; acilma: string;
}
const SENARYO = `id, ad, aciklama, durum, taban_plan_surumu AS "tabanPlanSurumu", surum, acan_kisi_id AS "acanKisiId", to_json(acilma) #>> '{}' AS acilma`;
export const senaryolar = (db: Db): Promise<SenaryoSatiri[]> =>
  db.sorgu(`SELECT ${SENARYO} FROM plan_senaryosu ORDER BY (durum = 'acik') DESC, id DESC LIMIT 20`);
export const senaryo = (db: Db, id: number, kilit = false): Promise<SenaryoSatiri | null> =>
  db.tek(`SELECT ${SENARYO} FROM plan_senaryosu WHERE id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
// Kişinin bugünkü canlı plandan açtığı en son açık taslak (A4: başka ekrandan gelen sıralama ona yazılır). Daha eski canlıdan açılmış
// taslakta, ekranda görülen işler olmayabilir.
export const acikTaslagi = (db: Db, kisiId: number): Promise<SenaryoSatiri | null> =>
  db.tek(`SELECT ${SENARYO} FROM plan_senaryosu WHERE durum = 'acik' AND acan_kisi_id = $1
    AND taban_plan_surumu = (SELECT surum FROM plan_durumu) ORDER BY id DESC LIMIT 1`, [kisiId]);
// Son canlıya alınan taslak: canlı plan yalnız taslağın canlıya alınmasıyla değişir (P6).
export const sonCanliyaAlma = (db: Db): Promise<{ zaman: string; kisiId: number } | null> =>
  db.tek(`SELECT to_json(kapanma) #>> '{}' AS zaman, kapatan_kisi_id AS "kisiId" FROM plan_senaryosu
           WHERE durum = 'canliya_alindi' ORDER BY kapanma DESC, id DESC LIMIT 1`);
export const acikSenaryoSayisi = async (db: Db): Promise<number> =>
  (await db.tek<{ n: number }>("SELECT count(*)::int AS n FROM plan_senaryosu WHERE durum = 'acik'"))!.n;

const CANLIYI_KOPYALA = `INSERT INTO plan_senaryo_yerlesimi (${SY_SUTUN})
  SELECT $1, is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira, elle_istasyon_id, elle_kaynak FROM plan_yerlesimi`;
const CANLI_PARCALARI_KOPYALA = `INSERT INTO plan_senaryo_yerlesim_parcasi (senaryo_id, ${PARCA_SUTUN}) SELECT $1, ${PARCA_SUTUN} FROM plan_yerlesim_parcasi`;

// Yeni taslak canlının tam kopyasıdır: yerleşimler ve ayar; taban, açıldığı andaki canlı plan sürümüdür.
export async function senaryoAc(db: Db, ad: string, aciklama: string | null, kisiId: number): Promise<number> {
  const id = (await db.tek<{ id: number }>(
    'INSERT INTO plan_senaryosu (ad, aciklama, taban_plan_surumu, acan_kisi_id) SELECT $1, $2, surum, $3 FROM plan_durumu RETURNING id',
    [ad, aciklama, kisiId],
  ))!.id;
  await db.sorgu(CANLIYI_KOPYALA, [id]);
  await db.sorgu(CANLI_PARCALARI_KOPYALA, [id]);
  await db.sorgu(`INSERT INTO plan_senaryo_ayari (senaryo_id, ${AYAR_SUTUN}) SELECT $1, ${AYAR_SUTUN} FROM plan_ayari`, [id]);
  return id;
}

// Çoğalt: kaynağın yerleşimleri, ayarı ve defteri yeni taslağa kopyalanır; taban kaynağınkidir.
export async function senaryoCogalt(db: Db, kaynakId: number, ad: string, kisiId: number): Promise<number> {
  const id = (await db.tek<{ id: number }>(
    `INSERT INTO plan_senaryosu (ad, aciklama, taban_plan_surumu, acan_kisi_id)
     SELECT $2, aciklama, taban_plan_surumu, $3 FROM plan_senaryosu WHERE id = $1 RETURNING id`,
    [kaynakId, ad, kisiId],
  ))!.id;
  await db.sorgu(`INSERT INTO plan_senaryo_yerlesimi (${SY_SUTUN})
                  SELECT $2, is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira, elle_istasyon_id, elle_kaynak FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1`,
  [kaynakId, id]);
  await db.sorgu(`INSERT INTO plan_senaryo_yerlesim_parcasi (senaryo_id, ${PARCA_SUTUN})
                  SELECT $2, ${PARCA_SUTUN} FROM plan_senaryo_yerlesim_parcasi WHERE senaryo_id = $1`, [kaynakId, id]);
  await db.sorgu(`INSERT INTO plan_senaryo_ayari (senaryo_id, ${AYAR_SUTUN}) SELECT $2, ${AYAR_SUTUN} FROM plan_senaryo_ayari WHERE senaryo_id = $1`, [kaynakId, id]);
  await db.sorgu(`INSERT INTO plan_senaryo_degisikligi (senaryo_id, tur, ozet, is_emri_idleri, veri, yazan_kisi_id)
                  SELECT $2, tur, ozet, is_emri_idleri, veri, yazan_kisi_id FROM plan_senaryo_degisikligi WHERE senaryo_id = $1 AND kaldirma IS NULL ORDER BY id`,
  [kaynakId, id]);
  return id;
}

export const senaryoBilgiYaz = (db: Db, id: number, ad: string, aciklama: string | null) =>
  db.sorgu('UPDATE plan_senaryosu SET ad = $2, aciklama = $3, surum = surum + 1 WHERE id = $1', [id, ad, aciklama]);
export const senaryoSurumArtir = (db: Db, id: number) => db.sorgu('UPDATE plan_senaryosu SET surum = surum + 1 WHERE id = $1', [id]);
export const senaryoKapat = (db: Db, id: number, durum: 'canliya_alindi' | 'vazgecildi', kisiId: number) =>
  db.sorgu("UPDATE plan_senaryosu SET durum = $2, kapanma = now(), kapatan_kisi_id = $3, surum = surum + 1 WHERE id = $1 AND durum = 'acik'", [id, durum, kisiId]);
export const tabanYenile = (db: Db, id: number) =>
  db.sorgu('UPDATE plan_senaryosu SET taban_plan_surumu = (SELECT surum FROM plan_durumu), surum = surum + 1 WHERE id = $1', [id]);

// Değişiklikleri at: taslak yeniden canlının kopyası olur, defterin kayıtları kaldırılmış olur (379 a: silinmez), taban yenilenir.
export async function senaryoSifirla(db: Db, id: number, kisiId: number): Promise<void> {
  await db.sorgu('DELETE FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1', [id]);
  await db.sorgu('DELETE FROM plan_senaryo_yerlesim_parcasi WHERE senaryo_id = $1', [id]);
  await db.sorgu(CANLIYI_KOPYALA, [id]);
  await db.sorgu(CANLI_PARCALARI_KOPYALA, [id]);
  await ayariCanlidanAl(db, id);
  await db.sorgu('UPDATE plan_senaryo_degisikligi SET kaldiran_kisi_id = $2, kaldirma = now() WHERE senaryo_id = $1 AND kaldirma IS NULL', [id, kisiId]);
  await tabanYenile(db, id);
}

// İş emirlerini canlıdaki hâline döndürür (tek değişikliği kaldırma ve yeniden temellendirme).
export async function canlidanAl(db: Db, id: number, isEmriIdleri: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND is_emri_id = ANY($2::int[])', [id, [...isEmriIdleri]]);
  await db.sorgu('DELETE FROM plan_senaryo_yerlesim_parcasi WHERE senaryo_id = $1 AND is_emri_id = ANY($2::int[])', [id, [...isEmriIdleri]]);
  await db.sorgu(`INSERT INTO plan_senaryo_yerlesimi (${SY_SUTUN})
                  SELECT $1, is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira, elle_istasyon_id, elle_kaynak FROM plan_yerlesimi
                   WHERE is_emri_id = ANY($2::int[])`, [id, [...isEmriIdleri]]);
  await db.sorgu(`${CANLI_PARCALARI_KOPYALA} WHERE is_emri_id = ANY($2::int[])`, [id, [...isEmriIdleri]]);
}

/* ---------------- değişiklik defteri ---------------- */

export interface DegisiklikSatiri {
  id: number; senaryoId: number; tur: string; ozet: string; isEmriIdleri: number[]; veri: Record<string, unknown> | null; yazma: string;
}
export const degisiklikler = (db: Db, senaryoIdleri: readonly number[]): Promise<DegisiklikSatiri[]> =>
  db.sorgu(`SELECT id, senaryo_id AS "senaryoId", tur, ozet, is_emri_idleri AS "isEmriIdleri", veri, to_json(yazma) #>> '{}' AS yazma
              FROM plan_senaryo_degisikligi WHERE senaryo_id = ANY($1::int[]) AND kaldirma IS NULL ORDER BY id`, [[...senaryoIdleri]]);
export const degisiklikEkle = (db: Db, senaryoId: number, d: { tur: string; ozet: string; isEmriIdleri: readonly number[]; veri?: unknown }, kisiId: number) =>
  db.sorgu('INSERT INTO plan_senaryo_degisikligi (senaryo_id, tur, ozet, is_emri_idleri, veri, yazan_kisi_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [senaryoId, d.tur, d.ozet.slice(0, 300), [...d.isEmriIdleri], d.veri === undefined ? null : JSON.stringify(d.veri), kisiId]);
// Acil sipariş denemesi (286 b): canlıya alınınca açılan taslak siparişin kimliği deneme kaydına yazılır; onayda kayıt kilitlenir.
export const degisiklikVerisiYaz = (db: Db, id: number, veri: unknown) =>
  db.sorgu('UPDATE plan_senaryo_degisikligi SET veri = $2 WHERE id = $1', [id, JSON.stringify(veri)]);
export const acilSiparisDenemesi = (db: Db, siparisId: number): Promise<DegisiklikSatiri | null> =>
  db.tek<DegisiklikSatiri>(`SELECT id, senaryo_id AS "senaryoId", tur, ozet, is_emri_idleri AS "isEmriIdleri", veri, to_json(yazma) #>> '{}' AS yazma
            FROM plan_senaryo_degisikligi WHERE tur = 'acil_emir' AND (veri ->> 'siparisId')::int = $1 AND kaldirma IS NULL ORDER BY id LIMIT 1 FOR UPDATE`, [siparisId]);
// 379 a: defter kaydı silinmez; kaldıran ve zaman işaretlenir, okumalar kaldırılmamışları görür.
export const degisiklikKaldir = (db: Db, senaryoId: number, ids: readonly number[], kisiId: number) =>
  db.sorgu('UPDATE plan_senaryo_degisikligi SET kaldiran_kisi_id = $3, kaldirma = now() WHERE senaryo_id = $1 AND id = ANY($2::int[]) AND kaldirma IS NULL',
    [senaryoId, [...ids], kisiId]);

/* ---------------- bedel ayarı (209 a) ---------------- */

const BEDEL_SUTUNLARI: Record<keyof BedelAyari, string> = {
  tabanBedelSaat: 'taban_bedel_saat', finansmanOraniGun: 'finansman_orani_gun', karRiskiOraniGun: 'kar_riski_orani_gun',
  yuksekEsigi: 'yuksek_esigi', dusukEsigi: 'dusuk_esigi', yuksekCarpani: 'yuksek_carpani', normalCarpani: 'normal_carpani',
  dusukCarpani: 'dusuk_carpani', sinifACarpani: 'sinif_a_carpani', sinifBCarpani: 'sinif_b_carpani', sinifCCarpani: 'sinif_c_carpani',
};
const BEDEL_ANAHTARLARI = Object.keys(BEDEL_SUTUNLARI) as (keyof BedelAyari)[];

export async function bedelAyariOku(db: Db): Promise<BedelAyari> {
  const r = (await db.tek<Record<keyof BedelAyari, string | null>>(
    `SELECT ${BEDEL_ANAHTARLARI.map((k) => `${BEDEL_SUTUNLARI[k]} AS "${k}"`).join(', ')} FROM plan_ayari`,
  ))!;
  const sayi = (k: keyof BedelAyari) => Number(r[k]);
  return {
    tabanBedelSaat: sayi('tabanBedelSaat'), finansmanOraniGun: r.finansmanOraniGun === null ? null : Number(r.finansmanOraniGun),
    karRiskiOraniGun: sayi('karRiskiOraniGun'), yuksekEsigi: sayi('yuksekEsigi'), dusukEsigi: sayi('dusukEsigi'),
    yuksekCarpani: sayi('yuksekCarpani'), normalCarpani: sayi('normalCarpani'), dusukCarpani: sayi('dusukCarpani'),
    sinifACarpani: sayi('sinifACarpani'), sinifBCarpani: sayi('sinifBCarpani'), sinifCCarpani: sayi('sinifCCarpani'),
  };
}

// Verilmeyen alan yazılmaz (bedelAyariGovdesi): finansman oranı null verilebildiği için yalnız undefined atlanır.
export function bedelAyariYaz(db: Db, a: BedelAyariGovdesi, kisiId: number) {
  const alanlar = BEDEL_ANAHTARLARI.filter((k) => a[k] !== undefined);
  return db.sorgu(
    `UPDATE plan_ayari SET ${alanlar.map((k, i) => `${BEDEL_SUTUNLARI[k]} = $${i + 1}`).join(', ')}, degistiren_kisi_id = $${alanlar.length + 1}, degisme = now()`,
    [...alanlar.map((k) => a[k]), kisiId],
  );
}

/* ---------------- elle çarpan (195 a) ---------------- */

export interface CarpanSatiri { carpan: string; gerekce: string; kisiId: number; zaman: string }
export const carpanEkle = (db: Db, siparisId: number, carpan: number, gerekce: string, kisiId: number) =>
  db.sorgu('INSERT INTO plan_siparis_carpani (siparis_id, carpan, gerekce, kisi_id) VALUES ($1, $2, $3, $4)', [siparisId, carpan, gerekce, kisiId]);
export const carpanGecmisi = (db: Db, siparisId: number) =>
  db.sorgu<CarpanSatiri>(
    `SELECT carpan, gerekce, kisi_id AS "kisiId", to_json(zaman) #>> '{}' AS zaman FROM plan_siparis_carpani WHERE siparis_id = $1 ORDER BY id DESC`,
    [siparisId],
  );
// Siparişlerin geçerli (son) çarpanı; kaydı olmayan sipariş haritada yok.
export async function gecerliCarpanlar(db: Db, siparisIdler: number[]): Promise<Map<number, number>> {
  if (siparisIdler.length === 0) return new Map();
  const r = await db.sorgu<{ siparisId: number; carpan: string }>(
    `SELECT DISTINCT ON (siparis_id) siparis_id AS "siparisId", carpan FROM plan_siparis_carpani
      WHERE siparis_id = ANY($1::int[]) ORDER BY siparis_id, id DESC`,
    [[...new Set(siparisIdler)]],
  );
  return new Map(r.map((x) => [x.siparisId, Number(x.carpan)]));
}
