import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type {
  AlanGovdesi, BirimDurumu, BirimOlayi, BirimOlayKaydi, MarkalamaAlani, MarkalamaBirimi, SayacKapsami,
} from '#paylasilan/sozlesme/markalama.ts';

export interface TanimSatiri {
  id: number;
  malzemeId: number;
  opNo: number;
  seriSablonu: string;
  sayacKapsami: SayacKapsami;
  baslangicSirasi: number;
  dogrulama: boolean;
  modelBelgeId: number | null;
  modelRevizyon: string | null;
  surum: number;
  degismeZamani: string;
}

const TANIM_SUTUNLARI = `id, malzeme_id AS "malzemeId", op_no AS "opNo", seri_sablonu AS "seriSablonu", sayac_kapsami AS "sayacKapsami",
  baslangic_sirasi AS "baslangicSirasi", dogrulama, model_belge_id AS "modelBelgeId", model_revizyon AS "modelRevizyon", surum,
  ${zamanMetni('degisme_zamani')} AS "degismeZamani"`;

export function tanimlariOku(db: Db, malzemeId: number | null): Promise<TanimSatiri[]> {
  return db.sorgu<TanimSatiri>(
    `SELECT ${TANIM_SUTUNLARI} FROM markalama_tanimi WHERE ($1::int IS NULL OR malzeme_id = $1) ORDER BY malzeme_id, op_no`,
    [malzemeId],
  );
}

export function tanimOku(db: Db, id: number): Promise<TanimSatiri | null> {
  return db.tek<TanimSatiri>(`SELECT ${TANIM_SUTUNLARI} FROM markalama_tanimi WHERE id = $1`, [id]);
}

export interface TanimYazimi {
  seriSablonu: string;
  sayacKapsami: SayacKapsami;
  baslangicSirasi: number;
  dogrulama: boolean;
  modelBelgeId: number | null;
  modelRevizyon: string | null;
}

export async function tanimEkle(db: Db, malzemeId: number, opNo: number, y: TanimYazimi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO markalama_tanimi (malzeme_id, op_no, seri_sablonu, sayac_kapsami, baslangic_sirasi, dogrulama, model_belge_id,
       model_revizyon, degistiren_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [malzemeId, opNo, y.seriSablonu, y.sayacKapsami, y.baslangicSirasi, y.dogrulama, y.modelBelgeId, y.modelRevizyon, kisiId],
  );
  if (satir === null) throw new Error('markalama_tanimi eklenemedi');
  return satir.id;
}

// Sürüm tutmazsa satır dönmez; çağıran surumluGuncelle ile 404/409 ayırır.
export function tanimGuncelle(db: Db, id: number, y: TanimYazimi & { surum: number }, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE markalama_tanimi
        SET seri_sablonu = $2, sayac_kapsami = $3, baslangic_sirasi = $4, dogrulama = $5, model_belge_id = $6, model_revizyon = $7,
            degistiren_kisi_id = $8, degisme_zamani = now(), surum = surum + 1
      WHERE id = $1 AND surum = $9
      RETURNING id`,
    [id, y.seriSablonu, y.sayacKapsami, y.baslangicSirasi, y.dogrulama, y.modelBelgeId, y.modelRevizyon, kisiId, y.surum],
  );
}

export async function tanimVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM markalama_tanimi WHERE id = $1', [id])) !== null;
}

interface AlanSatiri extends Omit<MarkalamaAlani, 'yer'> {
  tanimId: number;
  mx: number | null; my: number | null; mz: number | null;
  nx: number | null; ny: number | null; nz: number | null;
  en: number | null; boy: number | null; aci: number | null;
}

export async function alanlariOku(db: Db, tanimIdleri: readonly number[]): Promise<Map<number, MarkalamaAlani[]>> {
  const sonuc = new Map<number, MarkalamaAlani[]>();
  if (tanimIdleri.length === 0) return sonuc;
  const satirlar = await db.sorgu<AlanSatiri>(
    `SELECT tanim_id AS "tanimId", sira, ad, icerik, sabit_metin AS "sabitMetin", kod_turu AS "kodTuru", yontem,
            yazi_yuksekligi_mm::float8 AS "yaziYuksekligiMm",
            yazi_derinligi_mm::float8 AS "yaziDerinligiMm", yazi_tipi AS "yaziTipi", program, yuzey,
            merkez_x::float8 AS mx, merkez_y::float8 AS my, merkez_z::float8 AS mz,
            normal_x::float8 AS nx, normal_y::float8 AS ny, normal_z::float8 AS nz,
            en_mm::float8 AS en, boy_mm::float8 AS boy, aci_derece::float8 AS aci
       FROM markalama_alani WHERE tanim_id = ANY($1::int[]) ORDER BY tanim_id, sira`,
    [[...new Set(tanimIdleri)]],
  );
  for (const s of satirlar) {
    const yer = s.mx === null ? null : {
      merkez: [s.mx, s.my ?? 0, s.mz ?? 0] as [number, number, number],
      normal: [s.nx ?? 0, s.ny ?? 0, s.nz ?? 0] as [number, number, number],
      enMm: s.en ?? 0, boyMm: s.boy ?? 0, aciDerece: s.aci ?? 0,
    };
    const liste = sonuc.get(s.tanimId) ?? [];
    liste.push({
      sira: s.sira, ad: s.ad, icerik: s.icerik, sabitMetin: s.sabitMetin, kodTuru: s.kodTuru, yontem: s.yontem,
      yaziYuksekligiMm: s.yaziYuksekligiMm,
      yaziDerinligiMm: s.yaziDerinligiMm, yaziTipi: s.yaziTipi, program: s.program, yuzey: s.yuzey, yer,
    });
    sonuc.set(s.tanimId, liste);
  }
  return sonuc;
}

// Markalar tanımla birlikte bütün olarak yazılır; ana satırın sürümü çağıranın güncellemesiyle artar.
export async function alanlariYaz(db: Db, tanimId: number, alanlar: readonly AlanGovdesi[]): Promise<void> {
  await db.sorgu('DELETE FROM markalama_alani WHERE tanim_id = $1', [tanimId]);
  for (const [i, a] of alanlar.entries()) {
    const y = a.yer;
    await db.sorgu(
      `INSERT INTO markalama_alani (tanim_id, sira, ad, icerik, sabit_metin, kod_turu, yontem, yazi_yuksekligi_mm, yazi_derinligi_mm, yazi_tipi,
         program, yuzey, merkez_x, merkez_y, merkez_z, normal_x, normal_y, normal_z, en_mm, boy_mm, aci_derece)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [tanimId, i + 1, a.ad, a.icerik, a.sabitMetin, a.kodTuru, a.yontem, a.yaziYuksekligiMm, a.yaziDerinligiMm, a.yaziTipi, a.program, a.yuzey,
        y?.merkez[0] ?? null, y?.merkez[1] ?? null, y?.merkez[2] ?? null, y?.normal[0] ?? null, y?.normal[1] ?? null, y?.normal[2] ?? null,
        y?.enMm ?? null, y?.boyMm ?? null, y?.aciDerece ?? null],
    );
  }
}

// Sayaç tek satırda artar; ilk numara tanımın başlangıç sırasıdır. Satır kilidi aynı kapsamdaki eşzamanlı markalamayı sıraya koyar.
export async function sayaciArtir(db: Db, malzemeId: number, anahtar: string, baslangic: number): Promise<number> {
  const satir = await db.tek<{ sira: number }>(
    `INSERT INTO markalama_sayaci (malzeme_id, kapsam_anahtari, son_sira) VALUES ($1, $2, $3)
     ON CONFLICT (malzeme_id, kapsam_anahtari) DO UPDATE SET son_sira = markalama_sayaci.son_sira + 1
     RETURNING son_sira AS sira`,
    [malzemeId, anahtar, baslangic],
  );
  if (satir === null) throw new Error('markalama_sayaci artırılamadı');
  return satir.sira;
}

export async function sonSira(db: Db, malzemeId: number, anahtar: string): Promise<number | null> {
  return (await db.tek<{ sira: number }>(
    'SELECT son_sira AS sira FROM markalama_sayaci WHERE malzeme_id = $1 AND kapsam_anahtari = $2', [malzemeId, anahtar],
  ))?.sira ?? null;
}

const BIRIM_SUTUNLARI = `id, seri_no AS "seriNo", tanim_id AS "tanimId", malzeme_id AS "malzemeId", uretim_emri_id AS "uretimEmriId",
  istasyon_id AS "istasyonId", durum, ${zamanMetni('dogrulama_zamani')} AS "dogrulamaZamani", surum, ${zamanMetni('zaman')} AS zaman`;

export interface BirimYazimi {
  seriNo: string;
  tanimId: number;
  malzemeId: number;
  uretimEmriId: number;
  istasyonId: number | null;
  sira: number;
  durum: BirimDurumu;
}

export async function birimEkle(db: Db, y: BirimYazimi, kisiId: number): Promise<MarkalamaBirimi> {
  const satir = await db.tek<MarkalamaBirimi>(
    `INSERT INTO markalama_birimi (seri_no, tanim_id, malzeme_id, uretim_emri_id, istasyon_id, sira, durum, kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${BIRIM_SUTUNLARI}`,
    [y.seriNo, y.tanimId, y.malzemeId, y.uretimEmriId, y.istasyonId, y.sira, y.durum, kisiId],
  );
  if (satir === null) throw new Error('markalama_birimi eklenemedi');
  return satir;
}

export function birimOku(db: Db, id: number, kilitle = false): Promise<MarkalamaBirimi | null> {
  return db.tek<MarkalamaBirimi>(`SELECT ${BIRIM_SUTUNLARI} FROM markalama_birimi WHERE id = $1${kilitle ? ' FOR UPDATE' : ''}`, [id]);
}

export function seridenBirimOku(db: Db, seriNo: string, kilitle = false): Promise<MarkalamaBirimi | null> {
  return db.tek<MarkalamaBirimi>(
    `SELECT ${BIRIM_SUTUNLARI} FROM markalama_birimi WHERE seri_no = $1${kilitle ? ' FOR UPDATE' : ''}`, [seriNo],
  );
}

export function birimleriOku(
  db: Db, s: { seriNo: string | null; emirId: number | null; durum: BirimDurumu | null }, sinir: number,
): Promise<MarkalamaBirimi[]> {
  return db.sorgu<MarkalamaBirimi>(
    `SELECT ${BIRIM_SUTUNLARI} FROM markalama_birimi
      WHERE ($1::text IS NULL OR seri_no = $1) AND ($2::int IS NULL OR uretim_emri_id = $2) AND ($3::text IS NULL OR durum = $3)
      ORDER BY id DESC LIMIT $4`,
    [s.seriNo, s.emirId, s.durum, sinir],
  );
}

export function birimDurumuYaz(db: Db, id: number, durum: BirimDurumu): Promise<MarkalamaBirimi | null> {
  return db.tek<MarkalamaBirimi>(
    `UPDATE markalama_birimi SET durum = $2, surum = surum + 1 WHERE id = $1 RETURNING ${BIRIM_SUTUNLARI}`, [id, durum],
  );
}

export function birimDogrulandi(db: Db, id: number): Promise<MarkalamaBirimi | null> {
  return db.tek<MarkalamaBirimi>(
    `UPDATE markalama_birimi SET dogrulama_zamani = now(), surum = surum + 1 WHERE id = $1 RETURNING ${BIRIM_SUTUNLARI}`, [id],
  );
}

export async function olayYaz(
  db: Db, birimId: number, olay: BirimOlayi, kisiId: number, ek: { hurdaNedeniId?: number | null; aciklama?: string | null } = {},
): Promise<void> {
  await db.sorgu(
    'INSERT INTO markalama_birim_olayi (birim_id, olay, hurda_nedeni_id, aciklama, kisi_id) VALUES ($1, $2, $3, $4, $5)',
    [birimId, olay, ek.hurdaNedeniId ?? null, ek.aciklama ?? null, kisiId],
  );
}

export function olaylariOku(db: Db, birimId: number): Promise<BirimOlayKaydi[]> {
  return db.sorgu<BirimOlayKaydi>(
    `SELECT id::int AS id, olay, hurda_nedeni_id AS "hurdaNedeniId", aciklama, kisi_id AS "kisiId", ${zamanMetni('zaman')} AS zaman
       FROM markalama_birim_olayi WHERE birim_id = $1 ORDER BY id`,
    [birimId],
  );
}

export async function emirSayilari(db: Db, emirId: number): Promise<{ durum: BirimDurumu; adet: number; dogrulanan: number }[]> {
  return db.sorgu<{ durum: BirimDurumu; adet: number; dogrulanan: number }>(
    `SELECT durum, count(*)::int AS adet, count(dogrulama_zamani)::int AS dogrulanan
       FROM markalama_birimi WHERE uretim_emri_id = $1 GROUP BY durum`,
    [emirId],
  );
}
