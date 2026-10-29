import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type {
  Aciliyet, EmirDurumu, EtkiAnalizi, FaiDurumu, FaiTuru, GecerlilikTuru, GecmisOlayi, KararHedefi, KararKodu, KararModu, ListeKapsami,
  OlayIlgilisi, OlayTuru, Sinif, TalepDurumu,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import type { Cevaplar } from './kurallar.ts';

// Değişiklik yönetiminin SQL'i. Her durum değiştiren yazma sürüm koşulludur ve ana satırın sürümünü artırır.

/* ---------------- Talep ---------------- */

export interface TalepSatiri {
  id: number; no: string; baslik: string; aciklama: string | null; onSinif: Sinif | null; sinif: Sinif | null; aciliyet: Aciliyet;
  durum: TalepDurumu; cevaplar: Cevaplar | null; etki: EtkiAnalizi | null; musteriReferansi: string | null;
  acanKisiId: number; acilis: string; surum: number;
}

const TALEP_SECIMI = `t.id, t.no, t.baslik, t.aciklama, t.on_sinif AS "onSinif", t.sinif, t.aciliyet, t.durum, t.cevaplar, t.etki,
  t.musteri_referansi AS "musteriReferansi", t.acan_kisi_id AS "acanKisiId", ${zamanMetni('t.acilis')} AS acilis, t.surum`;

export async function talepEkle(
  db: Db, g: { baslik: string; aciklama: string | null; onSinif: Sinif | null; aciliyet: Aciliyet; acanKisiId: number; malzemeIdleri: readonly number[] },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO degisiklik_yonetimi_talep (baslik, aciklama, on_sinif, aciliyet, acan_kisi_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [g.baslik, g.aciklama, g.onSinif, g.aciliyet, g.acanKisiId],
  );
  if (satir === null) throw new Error('Talep yazılamadı.');
  await db.sorgu(
    `INSERT INTO degisiklik_yonetimi_talep_kalemi (talep_id, malzeme_id, sira)
     SELECT $1, m.id, m.sira FROM unnest($2::int[]) WITH ORDINALITY AS m(id, sira)`,
    [satir.id, g.malzemeIdleri],
  );
  return satir.id;
}

export function talepGetir(db: Db, id: number): Promise<TalepSatiri | null> {
  return db.tek<TalepSatiri>(`SELECT ${TALEP_SECIMI} FROM degisiklik_yonetimi_talep t WHERE t.id = $1`, [id]);
}

// Komut önce satırı kilitler: durum kuralı ve sürüm denetimi eşzamanlı komutla sırayla koşar.
export function talepKilitle(db: Db, id: number): Promise<TalepSatiri | null> {
  return db.tek<TalepSatiri>(`SELECT ${TALEP_SECIMI} FROM degisiklik_yonetimi_talep t WHERE t.id = $1 FOR UPDATE`, [id]);
}

export async function talepVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM degisiklik_yonetimi_talep WHERE id = $1', [id])) !== null;
}

export interface TalepYazimi {
  durum: TalepDurumu;
  sinif?: Sinif;
  aciliyet?: Aciliyet;
  cevaplar?: Cevaplar;
  etki?: EtkiAnalizi;
  musteriReferansi?: string;
}

// Verilmeyen alan değişmez.
export function talepGuncelle(db: Db, id: number, surum: number, y: TalepYazimi): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE degisiklik_yonetimi_talep
        SET durum = $3, sinif = COALESCE($4, sinif), aciliyet = COALESCE($5, aciliyet), cevaplar = COALESCE($6::jsonb, cevaplar),
            etki = COALESCE($7::jsonb, etki), musteri_referansi = COALESCE($8, musteri_referansi), surum = surum + 1
      WHERE id = $1 AND surum = $2
      RETURNING id`,
    [id, surum, y.durum, y.sinif ?? null, y.aciliyet ?? null, y.cevaplar === undefined ? null : JSON.stringify(y.cevaplar),
      y.etki === undefined ? null : JSON.stringify(y.etki), y.musteriReferansi ?? null],
  );
}

export async function talebinEmri(db: Db, talepId: number): Promise<number | null> {
  return (await db.tek<{ id: number }>('SELECT id FROM degisiklik_yonetimi_emir WHERE talep_id = $1', [talepId]))?.id ?? null;
}

export async function talepMalzemeleri(db: Db, talepIdleri: readonly number[]): Promise<{ talepId: number; malzemeId: number }[]> {
  if (talepIdleri.length === 0) return [];
  return db.sorgu(
    `SELECT talep_id AS "talepId", malzeme_id AS "malzemeId" FROM degisiklik_yonetimi_talep_kalemi
      WHERE talep_id = ANY($1::int[]) ORDER BY talep_id, sira`,
    [talepIdleri],
  );
}

const TALEP_ACIK = `t.durum NOT IN ('emir_acildi', 'reddedildi')`;
const kapsamKosulu = (kapsam: ListeKapsami, acik: string): string => (kapsam === 'acik' ? acik : kapsam === 'kapali' ? `NOT (${acik})` : 'true');

export interface TalepSuzgeci { kapsam: ListeKapsami; durum?: TalepDurumu | undefined; sinif?: Sinif | undefined; ara?: string | undefined }

function talepNerede(s: TalepSuzgeci): { sql: string; parametreler: unknown[] } {
  return {
    sql: `WHERE ${kapsamKosulu(s.kapsam, TALEP_ACIK)} AND ($1::text IS NULL OR t.durum = $1) AND ($2::text IS NULL OR t.sinif = $2)
            AND ($3::text IS NULL OR t.no ILIKE '%' || $3 || '%' OR t.baslik ILIKE '%' || $3 || '%')`,
    parametreler: [s.durum ?? null, s.sinif ?? null, s.ara?.replace(/[\\%_]/g, '\\$&') ?? null],
  };
}

export async function talepSay(db: Db, s: TalepSuzgeci): Promise<number> {
  const n = talepNerede(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM degisiklik_yonetimi_talep t ${n.sql}`, n.parametreler))?.toplam ?? 0;
}

export interface TalepListeSatiriHam {
  id: number; no: string; baslik: string; sinif: Sinif | null; aciliyet: Aciliyet; durum: TalepDurumu; acilis: string; acanKisiId: number;
  emirNo: string | null;
}

export function talepListesi(db: Db, s: TalepSuzgeci, dilim: Dilim): Promise<TalepListeSatiriHam[]> {
  const n = talepNerede(s);
  return db.sorgu<TalepListeSatiriHam>(
    `SELECT t.id, t.no, t.baslik, t.sinif, t.aciliyet, t.durum, ${zamanMetni('t.acilis')} AS acilis, t.acan_kisi_id AS "acanKisiId",
            e.no AS "emirNo"
       FROM degisiklik_yonetimi_talep t
       LEFT JOIN degisiklik_yonetimi_emir e ON e.talep_id = t.id
       ${n.sql}
      ORDER BY t.id DESC
      LIMIT $4 OFFSET $5`,
    [...n.parametreler, dilim.sinir, dilim.atla],
  );
}

/* ---------------- Emir ---------------- */

export interface EmirSatiri {
  id: number; no: string; talepId: number | null; talepNo: string | null; baslik: string; sinif: Sinif; aciliyet: Aciliyet; durum: EmirDurumu;
  musteriReferansi: string | null; gecerlilikTuru: GecerlilikTuru | null; gecerlilikSonUrunId: number | null; gecerlilikIlkSeri: number | null;
  gecerlilikTarihi: string | null; kararKaynagiBagli: boolean | null; koordinatorKisiId: number; acilis: string; acilisTarihi: string;
  yayinZamani: string | null; kapanis: string | null; surum: number;
}

const EMIR_SECIMI = `e.id, e.no, e.talep_id AS "talepId", t.no AS "talepNo", e.baslik, e.sinif, e.aciliyet, e.durum,
  e.musteri_referansi AS "musteriReferansi", e.gecerlilik_turu AS "gecerlilikTuru", e.gecerlilik_son_urun_id AS "gecerlilikSonUrunId",
  e.gecerlilik_ilk_seri AS "gecerlilikIlkSeri", e.gecerlilik_tarihi::text AS "gecerlilikTarihi", e.karar_kaynagi_bagli AS "kararKaynagiBagli",
  e.koordinator_kisi_id AS "koordinatorKisiId", ${zamanMetni('e.acilis')} AS acilis, (e.acilis::date)::text AS "acilisTarihi",
  ${zamanMetni('e.yayin_zamani')} AS "yayinZamani", e.kapanis::text AS kapanis, e.surum`;
const EMIR_KAYNAGI = 'degisiklik_yonetimi_emir e LEFT JOIN degisiklik_yonetimi_talep t ON t.id = e.talep_id';

// Talebin parçaları sırasıyla kaleme geçer.
export async function emirEkle(
  db: Db, g: { talepId: number; baslik: string; sinif: Sinif; aciliyet: Aciliyet; musteriReferansi: string | null; koordinatorKisiId: number },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO degisiklik_yonetimi_emir (talep_id, baslik, sinif, aciliyet, musteri_referansi, koordinator_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [g.talepId, g.baslik, g.sinif, g.aciliyet, g.musteriReferansi, g.koordinatorKisiId],
  );
  if (satir === null) throw new Error('Değişiklik emri yazılamadı.');
  await db.sorgu(
    `INSERT INTO degisiklik_yonetimi_emir_kalemi (emir_id, malzeme_id, sira)
     SELECT $1, malzeme_id, sira FROM degisiklik_yonetimi_talep_kalemi WHERE talep_id = $2`,
    [satir.id, g.talepId],
  );
  return satir.id;
}

export function emirGetir(db: Db, id: number): Promise<EmirSatiri | null> {
  return db.tek<EmirSatiri>(`SELECT ${EMIR_SECIMI} FROM ${EMIR_KAYNAGI} WHERE e.id = $1`, [id]);
}

export function emirKilitle(db: Db, id: number): Promise<EmirSatiri | null> {
  return db.tek<EmirSatiri>(`SELECT ${EMIR_SECIMI} FROM ${EMIR_KAYNAGI} WHERE e.id = $1 FOR UPDATE OF e`, [id]);
}

export async function emirVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM degisiklik_yonetimi_emir WHERE id = $1', [id])) !== null;
}

export interface EmirYazimi {
  durum: EmirDurumu;
  gecerlilik?: { tur: GecerlilikTuru; sonUrunId: number | null; ilkSeri: number | null; tarih: string | null };
  kararKaynagiBagli?: boolean;
  yayinlandi?: boolean;
  kapandi?: boolean;
}

// Durum ve (yayında) geçerlilik; alt tabloyu değiştiren yazmalar da sürümü bununla artırır.
export function emirGuncelle(db: Db, id: number, surum: number, y: EmirYazimi): Promise<{ id: number } | null> {
  const g = y.gecerlilik;
  return db.tek<{ id: number }>(
    `UPDATE degisiklik_yonetimi_emir
        SET durum = $3,
            gecerlilik_turu = CASE WHEN $4::boolean THEN $5 ELSE gecerlilik_turu END,
            gecerlilik_son_urun_id = CASE WHEN $4::boolean THEN $6::int ELSE gecerlilik_son_urun_id END,
            gecerlilik_ilk_seri = CASE WHEN $4::boolean THEN $7::int ELSE gecerlilik_ilk_seri END,
            gecerlilik_tarihi = CASE WHEN $4::boolean THEN $8::date ELSE gecerlilik_tarihi END,
            karar_kaynagi_bagli = COALESCE($9, karar_kaynagi_bagli),
            yayin_zamani = CASE WHEN $10::boolean THEN now() ELSE yayin_zamani END,
            kapanis = CASE WHEN $11::boolean THEN current_date ELSE kapanis END,
            surum = surum + 1
      WHERE id = $1 AND surum = $2
      RETURNING id`,
    [id, surum, y.durum, g !== undefined, g?.tur ?? null, g?.sonUrunId ?? null, g?.ilkSeri ?? null, g?.tarih ?? null,
      y.kararKaynagiBagli ?? null, y.yayinlandi === true, y.kapandi === true],
  );
}

const EMIR_ACIK = `e.durum <> 'kapandi'`;

export interface EmirSuzgeci { kapsam: ListeKapsami; durum?: EmirDurumu | undefined; sinif?: Sinif | undefined; ara?: string | undefined }

function emirNerede(s: EmirSuzgeci): { sql: string; parametreler: unknown[] } {
  return {
    sql: `WHERE ${kapsamKosulu(s.kapsam, EMIR_ACIK)} AND ($1::text IS NULL OR e.durum = $1) AND ($2::text IS NULL OR e.sinif = $2)
            AND ($3::text IS NULL OR e.no ILIKE '%' || $3 || '%' OR e.baslik ILIKE '%' || $3 || '%')`,
    parametreler: [s.durum ?? null, s.sinif ?? null, s.ara?.replace(/[\\%_]/g, '\\$&') ?? null],
  };
}

export async function emirSay(db: Db, s: EmirSuzgeci): Promise<number> {
  const n = emirNerede(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM degisiklik_yonetimi_emir e ${n.sql}`, n.parametreler))?.toplam ?? 0;
}

export interface EmirListeSatiriHam extends EmirSatiri { bekleyenKarar: number; bekleyenFai: number }

export function emirListesi(db: Db, s: EmirSuzgeci, dilim: Dilim): Promise<EmirListeSatiriHam[]> {
  const n = emirNerede(s);
  return db.sorgu<EmirListeSatiriHam>(
    `SELECT ${EMIR_SECIMI},
            (SELECT count(*)::int FROM degisiklik_yonetimi_karar k WHERE k.emir_id = e.id AND k.verilen_kod IS NULL) AS "bekleyenKarar",
            (SELECT count(*)::int FROM degisiklik_yonetimi_ilk_parca f WHERE f.emir_id = e.id AND f.durum = 'bekliyor') AS "bekleyenFai"
       FROM ${EMIR_KAYNAGI}
       ${n.sql}
      ORDER BY e.id DESC
      LIMIT $4 OFFSET $5`,
    [...n.parametreler, dilim.sinir, dilim.atla],
  );
}

/* ---------------- Kalem ---------------- */

export interface KalemSatiri {
  id: number; emirId: number; malzemeId: number; eskiCizimRevizyonuId: number | null; yeniCizimRevizyonuId: number | null;
  eskiRotaRevizyonuId: number | null; yeniRotaRevizyonuId: number | null; eskiYeniyeUyar: 'evet' | 'hayir' | null;
  yeniEskiyeUyar: 'evet' | 'hayir' | null; yeniParcaNo: string | null; yeniParcaAdi: string | null; ozet: string;
}

const KALEM_SECIMI = `id, emir_id AS "emirId", malzeme_id AS "malzemeId", eski_cizim_revizyonu_id AS "eskiCizimRevizyonuId",
  yeni_cizim_revizyonu_id AS "yeniCizimRevizyonuId", eski_rota_revizyonu_id AS "eskiRotaRevizyonuId", yeni_rota_revizyonu_id AS "yeniRotaRevizyonuId",
  eski_yeniye_uyar AS "eskiYeniyeUyar", yeni_eskiye_uyar AS "yeniEskiyeUyar", yeni_parca_no AS "yeniParcaNo", yeni_parca_adi AS "yeniParcaAdi", ozet`;

export function emirKalemleri(db: Db, emirId: number): Promise<KalemSatiri[]> {
  return db.sorgu<KalemSatiri>(`SELECT ${KALEM_SECIMI} FROM degisiklik_yonetimi_emir_kalemi WHERE emir_id = $1 ORDER BY sira`, [emirId]);
}

export function kalemYaz(
  db: Db, emirId: number, kalemId: number,
  k: Omit<KalemSatiri, 'id' | 'emirId' | 'malzemeId' | 'eskiCizimRevizyonuId' | 'eskiRotaRevizyonuId'>,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE degisiklik_yonetimi_emir_kalemi
        SET yeni_cizim_revizyonu_id = $3, yeni_rota_revizyonu_id = $4, eski_yeniye_uyar = $5, yeni_eskiye_uyar = $6, yeni_parca_no = $7,
            yeni_parca_adi = $8, ozet = $9
      WHERE id = $2 AND emir_id = $1
      RETURNING id`,
    [emirId, kalemId, k.yeniCizimRevizyonuId, k.yeniRotaRevizyonuId, k.eskiYeniyeUyar, k.yeniEskiyeUyar, k.yeniParcaNo, k.yeniParcaAdi, k.ozet],
  );
}

/* ---------------- Karar ---------------- */

export interface KararSatiriHam {
  id: number; emirId: number; hedef: KararHedefi; hedefId: number; onerilenKod: KararKodu; mod: KararModu; gerekce: string;
  izinliKodlar: KararKodu[]; verilenKod: KararKodu | null; verenKisiId: number | null; verilme: string | null; sapmaReferansi: string | null;
  not: string | null;
}

const KARAR_SECIMI = `id, emir_id AS "emirId", hedef, hedef_id AS "hedefId", onerilen_kod AS "onerilenKod", mod, gerekce, izinli_kodlar AS "izinliKodlar",
  verilen_kod AS "verilenKod", veren_kisi_id AS "verenKisiId", ${zamanMetni('verilme')} AS verilme, sapma_referansi AS "sapmaReferansi", not_metni AS "not"`;

export async function kararEkle(
  db: Db, g: { emirId: number; hedef: KararHedefi; hedefId: number; onerilenKod: KararKodu; mod: KararModu; gerekce: string; izinliKodlar: readonly KararKodu[] },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO degisiklik_yonetimi_karar (emir_id, hedef, hedef_id, onerilen_kod, mod, gerekce, izinli_kodlar)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[]) RETURNING id`,
    [g.emirId, g.hedef, g.hedefId, g.onerilenKod, g.mod, g.gerekce, g.izinliKodlar],
  );
  if (satir === null) throw new Error('Karar yazılamadı.');
  return satir.id;
}

export function emirKararlari(db: Db, emirId: number): Promise<KararSatiriHam[]> {
  return db.sorgu<KararSatiriHam>(`SELECT ${KARAR_SECIMI} FROM degisiklik_yonetimi_karar WHERE emir_id = $1 ORDER BY id`, [emirId]);
}

// Karar bir kez verilir: verilmiş satır yeniden yazılmaz.
export function kararVer(
  db: Db, g: { emirId: number; kararId: number; kod: KararKodu; kisiId: number; sapmaReferansi: string | null; not: string | null },
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE degisiklik_yonetimi_karar
        SET verilen_kod = $3, veren_kisi_id = $4, verilme = now(), sapma_referansi = $5, not_metni = COALESCE($6, not_metni)
      WHERE id = $2 AND emir_id = $1 AND verilen_kod IS NULL
      RETURNING id`,
    [g.emirId, g.kararId, g.kod, g.kisiId, g.sapmaReferansi, g.not],
  );
}

export function kararNotuYaz(db: Db, emirId: number, kararId: number, not: string): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE degisiklik_yonetimi_karar SET not_metni = $3 WHERE id = $2 AND emir_id = $1 AND verilen_kod IS NULL RETURNING id',
    [emirId, kararId, not],
  );
}

/* ---------------- İlk parça ---------------- */

export interface IlkParcaSatiri {
  id: number; emirId: number; kalemId: number; tur: FaiTuru; durum: FaiDurumu; onaylayanKisiId: number | null; onayZamani: string | null;
}

export async function ilkParcaEkle(db: Db, emirId: number, kalemId: number, tur: FaiTuru): Promise<void> {
  await db.sorgu('INSERT INTO degisiklik_yonetimi_ilk_parca (emir_id, kalem_id, tur) VALUES ($1, $2, $3)', [emirId, kalemId, tur]);
}

export function emirIlkParcalari(db: Db, emirId: number): Promise<IlkParcaSatiri[]> {
  return db.sorgu<IlkParcaSatiri>(
    `SELECT id, emir_id AS "emirId", kalem_id AS "kalemId", tur, durum, onaylayan_kisi_id AS "onaylayanKisiId", ${zamanMetni('onay_zamani')} AS "onayZamani"
       FROM degisiklik_yonetimi_ilk_parca WHERE emir_id = $1 ORDER BY id`,
    [emirId],
  );
}

export function ilkParcaOnayla(db: Db, emirId: number, faiId: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE degisiklik_yonetimi_ilk_parca SET durum = 'onaylandi', onaylayan_kisi_id = $3, onay_zamani = now()
      WHERE id = $2 AND emir_id = $1 AND durum = 'bekliyor' RETURNING id`,
    [emirId, faiId, kisiId],
  );
}

/* ---------------- Geçmiş ve olay ---------------- */

export interface GecmisSatiriHam {
  talepId: number | null; emirId: number | null; kayitNo: string; olay: GecmisOlayi; kisiId: number; zaman: string; imzaAnlami: string | null;
  aciklama: string | null; ozet: string;
}

const GECMIS_SECIMI = `g.talep_id AS "talepId", g.emir_id AS "emirId", COALESCE(t.no, e.no) AS "kayitNo", g.olay, g.kisi_id AS "kisiId",
  ${zamanMetni('g.zaman')} AS zaman, g.imza_anlami AS "imzaAnlami", g.aciklama, g.ozet`;
const GECMIS_KAYNAGI = `degisiklik_yonetimi_gecmis g
  LEFT JOIN degisiklik_yonetimi_talep t ON t.id = g.talep_id LEFT JOIN degisiklik_yonetimi_emir e ON e.id = g.emir_id`;

export async function gecmisEkle(
  db: Db, g: { talepId?: number; emirId?: number; olay: GecmisOlayi; kisiId: number; imzaAnlami: string | null; aciklama: string | null; ozet: string },
): Promise<void> {
  await db.sorgu(
    'INSERT INTO degisiklik_yonetimi_gecmis (talep_id, emir_id, olay, kisi_id, imza_anlami, aciklama, ozet) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [g.talepId ?? null, g.emirId ?? null, g.olay, g.kisiId, g.imzaAnlami, g.aciklama, g.ozet.slice(0, 300)],
  );
}

export function talepGecmisi(db: Db, talepId: number): Promise<GecmisSatiriHam[]> {
  return db.sorgu<GecmisSatiriHam>(`SELECT ${GECMIS_SECIMI} FROM ${GECMIS_KAYNAGI} WHERE g.talep_id = $1 ORDER BY g.id`, [talepId]);
}

export function emirGecmisi(db: Db, emirId: number): Promise<GecmisSatiriHam[]> {
  return db.sorgu<GecmisSatiriHam>(`SELECT ${GECMIS_SECIMI} FROM ${GECMIS_KAYNAGI} WHERE g.emir_id = $1 ORDER BY g.id`, [emirId]);
}

export function sonGecmis(db: Db, adet: number): Promise<GecmisSatiriHam[]> {
  return db.sorgu<GecmisSatiriHam>(`SELECT ${GECMIS_SECIMI} FROM ${GECMIS_KAYNAGI} ORDER BY g.zaman DESC, g.id DESC LIMIT $1`, [adet]);
}

export async function olayEkle(db: Db, g: { tur: OlayTuru; ilgili: OlayIlgilisi | null; kayitNo: string; alanlar: Record<string, string> }): Promise<void> {
  await db.sorgu('INSERT INTO degisiklik_yonetimi_olay (tur, ilgili, kayit_no, alanlar) VALUES ($1, $2, $3, $4::jsonb)', [
    g.tur, g.ilgili, g.kayitNo, JSON.stringify(g.alanlar),
  ]);
}

export interface OlaySuzgeci { ilgili?: OlayIlgilisi | undefined; tur?: OlayTuru | undefined; ara?: string | undefined }

// Arama kayıt numarasında ve olayın veri alanlarının değerlerinde (1175 a).
function olayNerede(s: OlaySuzgeci): { sql: string; parametreler: unknown[] } {
  return {
    sql: `WHERE ($1::text IS NULL OR ilgili = $1) AND ($2::text IS NULL OR tur = $2)
            AND ($3::text IS NULL OR kayit_no ILIKE '%' || $3 || '%'
              OR EXISTS (SELECT 1 FROM jsonb_each_text(alanlar) a WHERE a.value ILIKE '%' || $3 || '%'))`,
    parametreler: [s.ilgili ?? null, s.tur ?? null, s.ara?.replace(/[\\%_]/g, '\\$&') ?? null],
  };
}

export async function olaySay(db: Db, s: OlaySuzgeci): Promise<number> {
  const n = olayNerede(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM degisiklik_yonetimi_olay ${n.sql}`, n.parametreler))?.toplam ?? 0;
}

export function olayListesi(
  db: Db, s: OlaySuzgeci, dilim: Dilim,
): Promise<{ id: number; zaman: string; tur: OlayTuru; ilgili: OlayIlgilisi | null; kayitNo: string; alanlar: Record<string, string> }[]> {
  const n = olayNerede(s);
  return db.sorgu(
    `SELECT id, ${zamanMetni('zaman')} AS zaman, tur, ilgili, kayit_no AS "kayitNo", alanlar FROM degisiklik_yonetimi_olay
      ${n.sql} ORDER BY zaman DESC, id DESC LIMIT $4 OFFSET $5`,
    [...n.parametreler, dilim.sinir, dilim.atla],
  );
}

/* ---------------- Görevlerim ---------------- */

export interface AcikTalepGorevi {
  id: number; no: string; baslik: string; sinif: Sinif | null; aciliyet: Aciliyet; durum: TalepDurumu; acanKisiId: number; sonAdim: string;
}

// Görevin yaşı son adımın tesis günündedir.
export function acikTalepGorevleri(db: Db): Promise<AcikTalepGorevi[]> {
  return db.sorgu<AcikTalepGorevi>(
    `SELECT t.id, t.no, t.baslik, t.sinif, t.aciliyet, t.durum, t.acan_kisi_id AS "acanKisiId",
            (SELECT max(g.zaman)::date FROM degisiklik_yonetimi_gecmis g WHERE g.talep_id = t.id)::text AS "sonAdim"
       FROM degisiklik_yonetimi_talep t WHERE ${TALEP_ACIK} ORDER BY t.id`,
  );
}

export interface AcikEmirGorevi {
  id: number; no: string; baslik: string; sinif: Sinif; aciliyet: Aciliyet; durum: EmirDurumu; sonAdim: string;
  bekleyenKarar: number; bekleyenMrb: number; bekleyenFai: number;
}

// MRB sayısı mod ya da MRB koduyla; kural sözleşmedeki mrbKarariMi ile aynıdır (öneri MRB koduysa karar MRB'dedir).
export function acikEmirGorevleri(db: Db, mrbKodlari: readonly string[]): Promise<AcikEmirGorevi[]> {
  return db.sorgu<AcikEmirGorevi>(
    `SELECT e.id, e.no, e.baslik, e.sinif, e.aciliyet, e.durum,
            (SELECT max(g.zaman)::date FROM degisiklik_yonetimi_gecmis g WHERE g.emir_id = e.id)::text AS "sonAdim",
            (SELECT count(*)::int FROM degisiklik_yonetimi_karar k
              WHERE k.emir_id = e.id AND k.verilen_kod IS NULL AND NOT (k.mod = 'mrb' OR k.onerilen_kod = ANY($1::text[]))) AS "bekleyenKarar",
            (SELECT count(*)::int FROM degisiklik_yonetimi_karar k
              WHERE k.emir_id = e.id AND k.verilen_kod IS NULL AND (k.mod = 'mrb' OR k.onerilen_kod = ANY($1::text[]))) AS "bekleyenMrb",
            (SELECT count(*)::int FROM degisiklik_yonetimi_ilk_parca f WHERE f.emir_id = e.id AND f.durum = 'bekliyor') AS "bekleyenFai"
       FROM degisiklik_yonetimi_emir e WHERE ${EMIR_ACIK} ORDER BY e.id`,
    [mrbKodlari],
  );
}

export async function bugun(db: Db): Promise<string> {
  return (await db.tek<{ bugun: string }>('SELECT current_date::text AS bugun'))?.bugun ?? '';
}

export async function simdi(db: Db): Promise<string> {
  return (await db.tek<{ an: string }>(`SELECT ${zamanMetni('now()')} AS an`))?.an ?? '';
}

/* ---------------- Konfigürasyon ve raporlar ---------------- */

// Kalemlerde ve seri geçerliliklerinde geçen malzemeler.
export function sonUrunAdaylari(db: Db): Promise<number[]> {
  return db.sorgu<{ id: number }>(
    `SELECT DISTINCT id FROM (
       SELECT malzeme_id AS id FROM degisiklik_yonetimi_emir_kalemi
       UNION SELECT malzeme_id FROM degisiklik_yonetimi_talep_kalemi
       UNION SELECT gecerlilik_son_urun_id FROM degisiklik_yonetimi_emir WHERE gecerlilik_son_urun_id IS NOT NULL
     ) m ORDER BY id`,
  ).then((s) => s.map((x) => x.id));
}

export function malzemeninAcikDegisiklikleri(db: Db, malzemeId: number): Promise<
  { tur: 'talep' | 'emir'; id: number; no: string; baslik: string; sinif: Sinif | null; durum: string }[]
> {
  return db.sorgu(
    `SELECT 'talep' AS tur, t.id, t.no, t.baslik, t.sinif, t.durum FROM degisiklik_yonetimi_talep t
      WHERE ${TALEP_ACIK} AND EXISTS (SELECT 1 FROM degisiklik_yonetimi_talep_kalemi k WHERE k.talep_id = t.id AND k.malzeme_id = $1)
     UNION ALL
     SELECT 'emir', e.id, e.no, e.baslik, e.sinif, e.durum FROM degisiklik_yonetimi_emir e
      WHERE ${EMIR_ACIK} AND (e.gecerlilik_son_urun_id = $1
        OR EXISTS (SELECT 1 FROM degisiklik_yonetimi_emir_kalemi k WHERE k.emir_id = e.id AND k.malzeme_id = $1))
     ORDER BY tur, id`,
    [malzemeId],
  );
}

export function seriGecerlilikleri(db: Db, sonUrunId: number): Promise<{ emirId: number; emirNo: string; ilkSeri: number; durum: EmirDurumu }[]> {
  return db.sorgu(
    `SELECT id AS "emirId", no AS "emirNo", gecerlilik_ilk_seri AS "ilkSeri", durum FROM degisiklik_yonetimi_emir
      WHERE gecerlilik_turu = 'seri' AND gecerlilik_son_urun_id = $1 ORDER BY gecerlilik_ilk_seri, id`,
    [sonUrunId],
  );
}

export function sonUrunSapmalari(db: Db, sonUrunId: number): Promise<{ referans: string; degisiklikNo: string }[]> {
  return db.sorgu(
    `SELECT k.sapma_referansi AS referans, e.no AS "degisiklikNo" FROM degisiklik_yonetimi_karar k
       JOIN degisiklik_yonetimi_emir e ON e.id = k.emir_id
      WHERE k.sapma_referansi IS NOT NULL AND e.gecerlilik_son_urun_id = $1 ORDER BY k.id`,
    [sonUrunId],
  );
}

// Çevrim talebin açılışından emrin kapanışına; müşteri onayını bekleme, CCB onayından müşteri onayına kadardır (gün olarak).
export function kapananEmirler(db: Db, baslangic: string, bitis: string): Promise<{
  emirNo: string; sinif: Sinif; acilis: string; kapanis: string; musteriBeklemeBaslangici: string | null; musteriBeklemeBitisi: string | null;
}[]> {
  return db.sorgu(
    `SELECT e.no AS "emirNo", e.sinif, (t.acilis::date)::text AS acilis, e.kapanis::text AS kapanis,
            (SELECT (max(g.zaman)::date)::text FROM degisiklik_yonetimi_gecmis g WHERE g.talep_id = t.id AND g.olay = 'ccb_onay') AS "musteriBeklemeBaslangici",
            (SELECT (max(g.zaman)::date)::text FROM degisiklik_yonetimi_gecmis g WHERE g.talep_id = t.id AND g.olay = 'musteri_onayi') AS "musteriBeklemeBitisi"
       FROM degisiklik_yonetimi_emir e JOIN degisiklik_yonetimi_talep t ON t.id = e.talep_id
      WHERE e.kapanis BETWEEN $1::date AND $2::date ORDER BY e.kapanis, e.id`,
    [baslangic, bitis],
  );
}

// Son 90 tesis gününde (bugün dahil) kapanan emirler.
export async function kapanan90Gun(db: Db): Promise<number> {
  const r = await db.sorgu<{ adet: number }>(
    `SELECT count(*)::int AS adet FROM degisiklik_yonetimi_emir WHERE kapanis > current_date - 90 AND kapanis <= current_date`,
  );
  return r[0]?.adet ?? 0;
}

// Aralıkta açılan emirlerin verilmiş kararları, moda göre.
export function kararDagilimi(db: Db, baslangic: string, bitis: string): Promise<{ emirNo: string; otomatik: number; onayli: number; mrb: number }[]> {
  return db.sorgu(
    `SELECT e.no AS "emirNo",
            count(*) FILTER (WHERE k.mod = 'otomatik')::int AS otomatik,
            count(*) FILTER (WHERE k.mod = 'onayli')::int AS onayli,
            count(*) FILTER (WHERE k.mod = 'mrb')::int AS mrb
       FROM degisiklik_yonetimi_karar k JOIN degisiklik_yonetimi_emir e ON e.id = k.emir_id
      WHERE k.verilen_kod IS NOT NULL AND e.acilis::date BETWEEN $1::date AND $2::date
      GROUP BY e.id, e.no ORDER BY e.id`,
    [baslangic, bitis],
  );
}

export function emirNolari(db: Db, baslangic: string, bitis: string): Promise<{ emirNo: string }[]> {
  return db.sorgu('SELECT no AS "emirNo" FROM degisiklik_yonetimi_emir WHERE acilis::date BETWEEN $1::date AND $2::date ORDER BY id', [baslangic, bitis]);
}

export async function oncekiYil(db: Db): Promise<{ baslangic: string; bitis: string }> {
  return (await db.tek<{ baslangic: string; bitis: string }>(
    `SELECT (current_date - interval '12 months')::date::text AS baslangic, current_date::text AS bitis`,
  )) ?? { baslangic: '', bitis: '' };
}
