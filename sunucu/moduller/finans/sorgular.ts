import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { Dilim as ListeDilimi } from '#cekirdek/liste.ts';
import { MALIYET_TABLOLARI } from './kurallar.ts';
import type { MaliyetTuru } from './kurallar.ts';

// Örnek veri hesap adları ORNEK ile başlar; yüklü mü denetimi örnek kasaya bakar.
export async function ornekHesapVarMi(db: Db): Promise<boolean> {
  return (await db.tek("SELECT 1 FROM finans_hesap WHERE ad = 'ORNEK Kasa' LIMIT 1")) !== null;
}

// FNS-60: pasife almadan önce firmanın kapanmamış kayıtları (açık fatura, dağıtılmamış ödeme, sonuçlanmamış çek).
export interface AcikKayitlar { belge: number; belgeTl: string; avans: number; avansTl: string; cek: number; cekTl: string }
export async function firmaAcikKayitlari(db: Db, id: number): Promise<AcikKayitlar> {
  const s = await db.tek<AcikKayitlar>(
    `SELECT
       (SELECT count(*)::int FROM finans_belge b WHERE b.firma_id = $1 AND b.durum = 'acik') AS belge,
       (SELECT coalesce(sum(round((b.toplam - finans_belge_kapanan(b.id)) * b.kur, 2)), 0) FROM finans_belge b WHERE b.firma_id = $1 AND b.durum = 'acik') AS "belgeTl",
       (SELECT count(*)::int FROM finans_odeme o WHERE o.firma_id = $1 AND o.iptal_zamani IS NULL
          AND o.tutar > coalesce((SELECT sum(d.odeme_tutari) FROM finans_odeme_dagilimi d WHERE d.odeme_id = o.id AND d.iptal_zamani IS NULL), 0)) AS avans,
       (SELECT coalesce(sum(round((o.tutar - coalesce((SELECT sum(d.odeme_tutari) FROM finans_odeme_dagilimi d WHERE d.odeme_id = o.id AND d.iptal_zamani IS NULL), 0)) * o.kur, 2)), 0)
          FROM finans_odeme o WHERE o.firma_id = $1 AND o.iptal_zamani IS NULL) AS "avansTl",
       (SELECT count(*)::int FROM finans_cek c WHERE c.firma_id = $1 AND c.durum IN ('portfoy', 'tahsilde', 'bekliyor')) AS cek,
       (SELECT coalesce(sum(c.tutar_tl), 0) FROM finans_cek c WHERE c.firma_id = $1 AND c.durum IN ('portfoy', 'tahsilde', 'bekliyor')) AS "cekTl"`,
    [id]);
  return s ?? { belge: 0, belgeTl: '0', avans: 0, avansTl: '0', cek: 0, cekTl: '0' };
}

// =====================================================================
// Para kayıtları SQL'i
// =====================================================================
// Tarih (date) sütunu sürücüden zaten 'YYYY-AA-GG' metni olarak gelir (çekirdek tip ayrıştırıcısı).
const tarihMetni = (ifade: string): string => ifade;

const BELGE = `b.id, b.yon, b.tur, b.kategori, b.firma_id AS "firmaId", b.belge_no AS "belgeNo", b.aciklama,
  ${tarihMetni('b.belge_tarihi')} AS "belgeTarihi", ${tarihMetni('b.vade')} AS vade, rtrim(b.para_birimi) AS "paraBirimi", b.kur, b.tutar,
  b.kdv_orani AS "kdvOrani", b.tevkifat_pay AS "tevkifatPay", b.tevkifat_payda AS "tevkifatPayda", b.kdv_tutari AS "kdvTutari",
  b.tevkifat_tutari AS "tevkifatTutari", b.toplam, b.toplam_tl AS "toplamTl", finans_belge_kapanan(b.id) AS kapanan,
  CASE WHEN b.durum = 'iptal' THEN 0 ELSE b.toplam - finans_belge_kapanan(b.id) END AS kalan, b.durum, b.kaynak,
  b.logo_kayit_no AS "logoKayitNo", b.logo_esleme AS "logoEsleme", b.duzenli_odeme_id AS "duzenliOdemeId", b.iptal_nedeni AS "iptalNedeni",
  b.siparis_id AS "siparisId", b.sevkiyat_isi_id AS "sevkiyatIsiId", b.iade_belge_id AS "iadeBelgeId",
  CASE WHEN b.satin_alma_talep_id IS NULL THEN NULL
       ELSE json_build_object('talepId', b.satin_alma_talep_id, 'teklifId', b.satin_alma_teklif_id) END AS "satinAlmaSiparisi",
  ${zamanMetni('b.olusturma')} AS olusturma, b.surum`;
const ODEME = `o.id, o.yon, o.firma_id AS "firmaId", ${tarihMetni('o.tarih')} AS tarih, o.yontem, o.hesap_id AS "hesapId", o.cek_id AS "cekId",
  rtrim(o.para_birimi) AS "paraBirimi", o.kur, o.tutar, o.tutar_tl AS "tutarTl",
  coalesce((SELECT sum(d.odeme_tutari) FROM finans_odeme_dagilimi d WHERE d.odeme_id = o.id AND d.iptal_zamani IS NULL), 0) AS dagitilan,
  CASE WHEN o.iptal_zamani IS NOT NULL THEN 0
       ELSE o.tutar - coalesce((SELECT sum(d.odeme_tutari) FROM finans_odeme_dagilimi d WHERE d.odeme_id = o.id AND d.iptal_zamani IS NULL), 0) END AS kalan,
  o.aciklama, o.kaynak, o.iptal_zamani IS NOT NULL AS iptal, o.iptal_nedeni AS "iptalNedeni", ${zamanMetni('o.olusturma')} AS olusturma, o.surum`;
const DAGILIM = `id, odeme_id AS "odemeId", belge_id AS "belgeId", belge_tutari AS "belgeTutari", odeme_tutari AS "odemeTutari",
  capraz_kur AS "caprazKur", kur_farki_tl AS "kurFarkiTl", ${tarihMetni('tarih')} AS tarih, iptal_zamani IS NOT NULL AS iptal`;
const MAHSUP = `id, firma_id AS "firmaId", satis_belge_id AS "satisBelgeId", alis_belge_id AS "alisBelgeId", satis_tutari AS "satisTutari",
  alis_tutari AS "alisTutari", capraz_kur AS "caprazKur", ${tarihMetni('tarih')} AS tarih, iptal_zamani IS NOT NULL AS iptal, surum`;
const CEK = `c.id, c.yon, c.tur, c.firma_id AS "firmaId", c.banka, c.seri_no AS "seriNo", ${tarihMetni('c.duzenleme_tarihi')} AS "duzenlemeTarihi",
  ${tarihMetni('c.vade')} AS vade, rtrim(c.para_birimi) AS "paraBirimi", c.kur, c.tutar, c.tutar_tl AS "tutarTl", c.durum,
  ${tarihMetni('c.sonuc_tarihi')} AS "sonucTarihi", c.sonuc_hesap_id AS "sonucHesapId",
  (SELECT o.id FROM finans_odeme o WHERE o.cek_id = c.id AND o.yontem IN ('cek', 'senet') AND o.iptal_zamani IS NULL) AS "odemeId",
  (SELECT o.id FROM finans_odeme o WHERE o.cek_id = c.id AND o.yontem = 'ciro' AND o.iptal_zamani IS NULL) AS "ciroOdemeId", c.surum`;
const HESAP = `id, ad, tur, rtrim(para_birimi) AS "paraBirimi", acilis_bakiyesi AS "acilisBakiyesi", ${tarihMetni('acilis_tarihi')} AS "acilisTarihi",
  banka_adi AS "bankaAdi", logo_kodu AS "logoKodu", aktif, finans_hesap_bakiyesi(id) AS bakiye, surum`;
const VIRMAN = `id, kaynak_hesap_id AS "kaynakHesapId", hedef_hesap_id AS "hedefHesapId", ${tarihMetni('tarih')} AS tarih, tutar, aciklama,
  iptal_zamani IS NOT NULL AS iptal, surum`;
const DUZENLI = `id, ad, kategori, firma_id AS "firmaId", hesap_id AS "hesapId", rtrim(para_birimi) AS "paraBirimi", tutar, kdv_orani AS "kdvOrani",
  ayin_gunu AS "ayinGunu", aktif, surum`;
const AYAR = `sirket_adi AS "sirketAdi", sektor, nakit_esigi AS "nakitEsigi", beklenen_aylik_satis AS "beklenenAylikSatis",
  beklenen_tahsil_gunu AS "beklenenTahsilGunu", risk_toleransi AS "riskToleransi", simulasyon_sayisi AS "simulasyonSayisi",
  cek_karsiliksiz_olasiligi AS "cekKarsiliksizOlasiligi", batik_gunu AS "batikGunu", anomali_esigi AS "anomaliEsigi",
  agirlik_likidite AS "agirlikLikidite", agirlik_nakit AS "agirlikNakit", agirlik_karlilik AS "agirlikKarlilik",
  agirlik_verimlilik AS "agirlikVerimlilik", agirlik_borcluluk AS "agirlikBorcluluk", bilanco_donen AS "bilancoDonen",
  bilanco_stok AS "bilancoStok", bilanco_kvb AS "bilancoKvb", bilanco_toplam_borc AS "bilancoToplamBorc",
  bilanco_ozkaynak AS "bilancoOzkaynak", bilanco_birikmis_kar AS "bilancoBirikmisKar", kurulum_tamam AS "kurulumTamam",
  capraz_kur_payi AS "caprazKurPayi", faiz_birimi AS "faizBirimi", surum`;

// Listeler: tablo ve sütunlar sabittir; istekten yalnız sayfa ve "iptaller dahil mi" gelir.
const LISTELER = {
  belge: { secim: BELGE, kaynak: 'finans_belge b', iptal: "b.durum <> 'iptal'", sira: 'b.belge_tarihi, b.id' },
  odeme: { secim: ODEME, kaynak: 'finans_odeme o', iptal: 'o.iptal_zamani IS NULL', sira: 'o.tarih, o.id' },
  dagilim: { secim: DAGILIM, kaynak: 'finans_odeme_dagilimi', iptal: 'iptal_zamani IS NULL', sira: 'id' },
  mahsup: { secim: MAHSUP, kaynak: 'finans_mahsup', iptal: 'iptal_zamani IS NULL', sira: 'id' },
  cek: { secim: CEK, kaynak: 'finans_cek c', iptal: "c.durum <> 'iptal'", sira: 'c.vade, c.id' },
  hesap: { secim: HESAP, kaynak: 'finans_hesap', iptal: 'true', sira: 'id' },
  virman: { secim: VIRMAN, kaynak: 'finans_virman', iptal: 'iptal_zamani IS NULL', sira: 'tarih, id' },
  kur: { secim: `rtrim(para_birimi) AS "paraBirimi", ${tarihMetni('tarih')} AS tarih, kur, surum`, kaynak: 'finans_kur', iptal: 'true', sira: 'para_birimi, tarih' },
  faiz: { secim: `id, rtrim(para_birimi) AS "paraBirimi", ${tarihMetni('gecerlilik_baslangic')} AS "gecerlilikBaslangic", aylik_yuzde AS "aylikYuzde", ${zamanMetni('olusturma')} AS olusturma`, kaynak: 'finans_faiz', iptal: 'true', sira: 'id' },
  genelGider: { secim: `id, ${tarihMetni('gecerlilik_baslangic')} AS "gecerlilikBaslangic", aylik_genel_gider AS "aylikGenelGider", aylik_makine_saati AS "aylikMakineSaati",
    round(aylik_genel_gider / aylik_makine_saati, 4)::text AS "saatBasi", amortisman_dahil AS "amortismanDahil", aciklama, ${zamanMetni('olusturma')} AS olusturma`,
    kaynak: 'finans_genel_gider_orani', iptal: 'true', sira: 'gecerlilik_baslangic, id' },
  kdv: { secim: `oran, ${tarihMetni('gecerlilik_baslangic')} AS "gecerlilikBaslangic", ${tarihMetni('gecerlilik_bitis')} AS "gecerlilikBitis", surum`, kaynak: 'finans_kdv_orani', iptal: 'true', sira: 'oran, gecerlilik_baslangic' },
  duzenli: { secim: DUZENLI, kaynak: 'finans_duzenli_odeme', iptal: 'true', sira: 'id' },
  butce: { secim: `kategori, ${tarihMetni('baslangic_ayi')} AS "baslangicAyi", aylik_tutar AS "aylikTutar", surum`, kaynak: 'finans_butce', iptal: 'true', sira: 'kategori, baslangic_ayi' },
  esitleme: { secim: `id, hesap_id AS "hesapId", ${tarihMetni('tarih')} AS tarih, gercek_bakiye AS "gercekBakiye", fark, ${zamanMetni('olusturma')} AS olusturma`, kaynak: 'finans_bakiye_esitleme', iptal: 'true', sira: 'id' },
  oneri: { secim: `bulgu_kimligi AS "bulguKimligi", durum, ${tarihMetni('ertele_bitis')} AS "erteleBitis"`, kaynak: 'finans_oneri_durumu', iptal: 'true', sira: 'bulgu_kimligi' },
  kapanis: { secim: 'rtrim(donem) AS donem, madde, isaretli', kaynak: 'finans_kapanis', iptal: 'true', sira: 'donem, madde' },
  skor: { secim: `${tarihMetni('gun')} AS gun, skor, nakit`, kaynak: 'finans_skor', iptal: 'true', sira: 'gun' },
} as const;
export type ListeAdi = keyof typeof LISTELER;

export async function listeSay(db: Db, ad: ListeAdi, iptalDahil: boolean): Promise<number> {
  const l = LISTELER[ad];
  return (await db.tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${l.kaynak} WHERE ($1 OR ${l.iptal})`, [iptalDahil]))?.n ?? 0;
}
// Günlük skor bütün geçmişi ister (ekranın sayfa sayfa okuduğu listenin tamamı, aynı sırayla).
export function listeTumu<T>(db: Db, ad: ListeAdi): Promise<T[]> {
  const l = LISTELER[ad];
  return db.sorgu<T>(`SELECT ${l.secim} FROM ${l.kaynak} WHERE ${l.iptal} ORDER BY ${l.sira}`);
}
export function listeSatirlari<T>(db: Db, ad: ListeAdi, iptalDahil: boolean, dilim: ListeDilimi): Promise<T[]> {
  const l = LISTELER[ad];
  return db.sorgu<T>(`SELECT ${l.secim} FROM ${l.kaynak} WHERE ($1 OR ${l.iptal}) ORDER BY ${l.sira} LIMIT $2 OFFSET $3`, [iptalDahil, dilim.sinir, dilim.atla]);
}

// ---- tekil okumalar (kilitli) ----
export const belgeGetir = <T>(db: Db, id: number, kilit = false) => db.tek<T>(`SELECT ${BELGE} FROM finans_belge b WHERE b.id = $1${kilit ? ' FOR UPDATE OF b' : ''}`, [id]);
export const odemeGetir = <T>(db: Db, id: number, kilit = false) => db.tek<T>(`SELECT ${ODEME} FROM finans_odeme o WHERE o.id = $1${kilit ? ' FOR UPDATE OF o' : ''}`, [id]);
export const cekGetir = <T>(db: Db, id: number, kilit = false) => db.tek<T>(`SELECT ${CEK} FROM finans_cek c WHERE c.id = $1${kilit ? ' FOR UPDATE OF c' : ''}`, [id]);
export const hesapGetir = <T>(db: Db, id: number, kilit = false) => db.tek<T>(`SELECT ${HESAP} FROM finans_hesap WHERE id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
export const mahsupGetir = <T>(db: Db, id: number, kilit = false) => db.tek<T>(`SELECT ${MAHSUP} FROM finans_mahsup WHERE id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
export const virmanGetir = <T>(db: Db, id: number, kilit = false) => db.tek<T>(`SELECT ${VIRMAN} FROM finans_virman WHERE id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
export const duzenliGetir = <T>(db: Db, id: number, kilit = false) => db.tek<T>(`SELECT ${DUZENLI} FROM finans_duzenli_odeme WHERE id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
export const duzenliAydaOdendiMi = async (db: Db, id: number, tarih: string) => (await db.tek<{ var: boolean }>(
  `SELECT EXISTS (SELECT 1 FROM finans_belge WHERE duzenli_odeme_id = $1 AND durum <> 'iptal'
     AND date_trunc('month', belge_tarihi::timestamp) = date_trunc('month', $2::date::timestamp)) AS var`, [id, tarih]))?.var === true;
export const ayarGetir = <T>(db: Db, kilit = false) => db.tek<T>(`SELECT ${AYAR} FROM finans_ayar WHERE id = 1${kilit ? ' FOR UPDATE' : ''}`);
export const dagilimGetir = (db: Db, id: number) => db.tek<{ id: number; odemeId: number; belgeId: number; iptal: boolean }>(`SELECT ${DAGILIM} FROM finans_odeme_dagilimi WHERE id = $1 FOR UPDATE`, [id]);
export const kdvOranlari = (db: Db) => db.sorgu<{ oran: string; gecerlilikBaslangic: string; gecerlilikBitis: string | null }>(
  `SELECT oran, ${tarihMetni('gecerlilik_baslangic')} AS "gecerlilikBaslangic", ${tarihMetni('gecerlilik_bitis')} AS "gecerlilikBitis" FROM finans_kdv_orani`);
export const hesapHareketiVarMi = async (db: Db, id: number) => (await db.tek<{ v: boolean }>(
  `SELECT EXISTS (SELECT 1 FROM finans_odeme WHERE hesap_id = $1) OR EXISTS (SELECT 1 FROM finans_cek WHERE sonuc_hesap_id = $1)
     OR EXISTS (SELECT 1 FROM finans_virman WHERE kaynak_hesap_id = $1 OR hedef_hesap_id = $1)
     OR EXISTS (SELECT 1 FROM finans_bakiye_esitleme WHERE hesap_id = $1) AS v`, [id]))?.v ?? false;
export const varMi = async (db: Db, tablo: 'finans_belge' | 'finans_odeme' | 'finans_cek' | 'finans_hesap' | 'finans_mahsup' | 'finans_virman' | 'finans_duzenli_odeme', id: number) =>
  (await db.tek(`SELECT 1 FROM ${tablo} WHERE id = $1`, [id])) !== null;

// ---- yazmalar ----
export interface BelgeYazimi {
  yon: string; tur: string; kategori: string; firmaId: number | null; belgeNo: string | null; aciklama: string | null; belgeTarihi: string; vade: string;
  paraBirimi: string; kur: string; tutar: string; kdvOrani: string; tevkifatPay: number | null; tevkifatPayda: number | null; duzenliOdemeId?: number | null;
  siparisId?: number | null; sevkiyatIsiId?: number | null; iadeBelgeId?: number | null;
}
export async function belgeEkle(db: Db, b: BelgeYazimi, kisi: number): Promise<number> {
  const s = await db.tek<{ id: number }>(
    `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_no, aciklama, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani,
       tevkifat_pay, tevkifat_payda, duzenli_odeme_id, siparis_id, sevkiyat_isi_id, iade_belge_id, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
    [b.yon, b.tur, b.kategori, b.firmaId, b.belgeNo, b.aciklama, b.belgeTarihi, b.vade, b.paraBirimi, b.kur, b.tutar, b.kdvOrani,
      b.tevkifatPay, b.tevkifatPayda, b.duzenliOdemeId ?? null, b.siparisId ?? null, b.sevkiyatIsiId ?? null, b.iadeBelgeId ?? null, kisi]);
  return (s as { id: number }).id;
}
export function belgeGuncelle(db: Db, id: number, surum: number, b: Omit<BelgeYazimi, 'yon' | 'tur'>, kisi: number) {
  return db.tek<{ id: number }>(
    `UPDATE finans_belge SET kategori = $3, firma_id = $4, belge_no = $5, aciklama = $6, belge_tarihi = $7, vade = $8, para_birimi = $9, kur = $10,
       tutar = $11, kdv_orani = $12, tevkifat_pay = $13, tevkifat_payda = $14, guncelleyen_id = $15, guncelleme = now(), surum = surum + 1
     WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, b.kategori, b.firmaId, b.belgeNo, b.aciklama, b.belgeTarihi, b.vade, b.paraBirimi, b.kur, b.tutar, b.kdvOrani, b.tevkifatPay, b.tevkifatPayda, kisi]);
}
export function belgeIptalYaz(db: Db, id: number, surum: number, neden: string | null, kisi: number) {
  return db.tek<{ id: number }>(
    `UPDATE finans_belge SET durum = 'iptal', iptal_eden_id = $3, iptal_zamani = now(), iptal_nedeni = $4, surum = surum + 1
     WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum, kisi, neden]);
}
export interface OdemeYazimi {
  yon: string; firmaId: number | null; tarih: string; yontem: string; hesapId: number | null; cekId: number | null; paraBirimi: string; kur: string; tutar: string; aciklama: string | null;
}
export async function odemeEkle(db: Db, o: OdemeYazimi, kisi: number): Promise<number> {
  const s = await db.tek<{ id: number }>(
    `INSERT INTO finans_odeme (yon, firma_id, tarih, yontem, hesap_id, cek_id, para_birimi, kur, tutar, aciklama, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [o.yon, o.firmaId, o.tarih, o.yontem, o.hesapId, o.cekId, o.paraBirimi, o.kur, o.tutar, o.aciklama, kisi]);
  return (s as { id: number }).id;
}
export function odemeIptalYaz(db: Db, id: number, neden: string | null, kisi: number, surum: number | null) {
  return db.tek<{ id: number }>(
    `UPDATE finans_odeme SET iptal_eden_id = $2, iptal_zamani = now(), iptal_nedeni = $3, surum = surum + 1
     WHERE id = $1 AND iptal_zamani IS NULL AND ($4::int IS NULL OR surum = $4) RETURNING id`, [id, kisi, neden, surum]);
}
export function dagilimEkle(db: Db, odemeId: number, d: { belgeId: number; belgeTutari: string; odemeTutari: string; caprazKur: string }, tarih: string, kisi: number) {
  return db.sorgu(
    `INSERT INTO finans_odeme_dagilimi (odeme_id, belge_id, belge_tutari, odeme_tutari, capraz_kur, tarih, olusturan_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [odemeId, d.belgeId, d.belgeTutari, d.odemeTutari, d.caprazKur, tarih, kisi]);
}
export const dagilimIptal = (db: Db, kosul: 'odeme' | 'belge' | 'id', id: number, kisi: number) =>
  db.sorgu(`UPDATE finans_odeme_dagilimi SET iptal_eden_id = $2, iptal_zamani = now()
            WHERE ${kosul === 'odeme' ? 'odeme_id' : kosul === 'belge' ? 'belge_id' : 'id'} = $1 AND iptal_zamani IS NULL`, [id, kisi]);
export const mahsupIptal = (db: Db, kosul: 'belge' | 'id', id: number, kisi: number) =>
  db.sorgu(`UPDATE finans_mahsup SET iptal_eden_id = $2, iptal_zamani = now(), surum = surum + 1
            WHERE ${kosul === 'belge' ? '(satis_belge_id = $1 OR alis_belge_id = $1)' : 'id = $1'} AND iptal_zamani IS NULL`, [id, kisi]);
export async function mahsupEkle(db: Db, m: { firmaId: number; satisBelgeId: number; alisBelgeId: number; satisTutari: string; alisTutari: string; tarih: string }, kisi: number): Promise<number> {
  const s = await db.tek<{ id: number }>(
    `INSERT INTO finans_mahsup (firma_id, satis_belge_id, alis_belge_id, satis_tutari, alis_tutari, tarih, olusturan_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [m.firmaId, m.satisBelgeId, m.alisBelgeId, m.satisTutari, m.alisTutari, m.tarih, kisi]);
  return (s as { id: number }).id;
}
export async function cekEkle(db: Db, c: { yon: string; tur: string; firmaId: number; banka: string | null; seriNo: string | null; duzenlemeTarihi: string; vade: string; paraBirimi: string; kur: string; tutar: string }, kisi: number): Promise<number> {
  const s = await db.tek<{ id: number }>(
    `INSERT INTO finans_cek (yon, tur, firma_id, banka, seri_no, duzenleme_tarihi, vade, para_birimi, kur, tutar, durum, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $1 = 'alinan' THEN 'portfoy' ELSE 'bekliyor' END, $11) RETURNING id`,
    [c.yon, c.tur, c.firmaId, c.banka, c.seriNo, c.duzenlemeTarihi, c.vade, c.paraBirimi, c.kur, c.tutar, kisi]);
  return (s as { id: number }).id;
}
export function cekDuzelt(db: Db, id: number, surum: number, c: { banka: string | null; seriNo: string | null; vade: string }, kisi: number) {
  return db.tek<{ id: number }>(`UPDATE finans_cek SET banka = $3, seri_no = $4, vade = $5, guncelleyen_id = $6, guncelleme = now(), surum = surum + 1
    WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum, c.banka, c.seriNo, c.vade, kisi]);
}
export function cekDurumYaz(db: Db, id: number, surum: number, durum: string, sonucTarihi: string | null, hesapId: number | null, kisi: number) {
  return db.tek<{ id: number }>(`UPDATE finans_cek SET durum = $3, sonuc_tarihi = $4, sonuc_hesap_id = $5, guncelleyen_id = $6, guncelleme = now(), surum = surum + 1
    WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum, durum, sonucTarihi, hesapId, kisi]);
}
export const cekOdemeleri = (db: Db, cekId: number) => db.sorgu<{ id: number; yontem: string }>(
  'SELECT id, yontem FROM finans_odeme WHERE cek_id = $1 AND iptal_zamani IS NULL FOR UPDATE', [cekId]);
export async function hesapEkle(db: Db, h: { ad: string; tur: string; paraBirimi: string; acilisBakiyesi: string; acilisTarihi: string; bankaAdi: string | null; logoKodu: string | null }, kisi: number): Promise<number> {
  const s = await db.tek<{ id: number }>(`INSERT INTO finans_hesap (ad, tur, para_birimi, acilis_bakiyesi, acilis_tarihi, banka_adi, logo_kodu, olusturan_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [h.ad, h.tur, h.paraBirimi, h.acilisBakiyesi, h.acilisTarihi, h.bankaAdi, h.logoKodu, kisi]);
  return (s as { id: number }).id;
}
export function hesapGuncelle(db: Db, id: number, surum: number, h: { ad: string; tur: string; paraBirimi: string; acilisBakiyesi: string; acilisTarihi: string; bankaAdi: string | null; logoKodu: string | null }) {
  return db.tek<{ id: number }>(`UPDATE finans_hesap SET ad = $3, tur = $4, para_birimi = $5, acilis_bakiyesi = $6, acilis_tarihi = $7, banka_adi = $8, logo_kodu = $9, surum = surum + 1
    WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum, h.ad, h.tur, h.paraBirimi, h.acilisBakiyesi, h.acilisTarihi, h.bankaAdi, h.logoKodu]);
}
export const hesapAktiflik = (db: Db, id: number, surum: number, aktif: boolean) =>
  db.tek<{ id: number }>('UPDATE finans_hesap SET aktif = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, aktif]);
export const esitlemeEkle = (db: Db, hesapId: number, tarih: string, gercek: string, fark: string, kisi: number) =>
  db.tek<{ id: number }>('INSERT INTO finans_bakiye_esitleme (hesap_id, tarih, gercek_bakiye, fark, olusturan_id) VALUES ($1, $2, $3, $4, $5) RETURNING id', [hesapId, tarih, gercek, fark, kisi]);
export async function virmanEkle(db: Db, v: { kaynakHesapId: number; hedefHesapId: number; tarih: string; tutar: string; aciklama: string | null }, kisi: number): Promise<number> {
  const s = await db.tek<{ id: number }>(`INSERT INTO finans_virman (kaynak_hesap_id, hedef_hesap_id, tarih, tutar, aciklama, olusturan_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [v.kaynakHesapId, v.hedefHesapId, v.tarih, v.tutar, v.aciklama, kisi]);
  return (s as { id: number }).id;
}
export const virmanIptal = (db: Db, id: number, surum: number, kisi: number) =>
  db.tek<{ id: number }>('UPDATE finans_virman SET iptal_eden_id = $3, iptal_zamani = now(), surum = surum + 1 WHERE id = $1 AND surum = $2 AND iptal_zamani IS NULL RETURNING id', [id, surum, kisi]);
export const kurEkle = (db: Db, k: { paraBirimi: string; tarih: string; kur: string }, kisi: number) =>
  db.tek<{ surum: number }>('INSERT INTO finans_kur (para_birimi, tarih, kur, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING surum', [k.paraBirimi, k.tarih, k.kur, kisi]);
export const kurGuncelle = (db: Db, k: { paraBirimi: string; tarih: string; kur: string; surum: number }, kisi: number) =>
  db.tek<{ surum: number }>('UPDATE finans_kur SET kur = $3, surum = surum + 1, guncelleyen_id = $5, guncelleme = now() WHERE para_birimi = $1 AND tarih = $2 AND surum = $4 RETURNING surum', [k.paraBirimi, k.tarih, k.kur, k.surum, kisi]);
// B-008, B-009: referans çapraz kur iki para biriminin o günkü TL kurunun oranıdır; pay finans ayarındadır (göç 20261008154024).
const referansCevabi = (s: { k: string | null; pay: string } | null) => ({ referans: s?.k == null ? null : Number(s.k), payYuzde: Number(s?.pay ?? 20) });
export async function caprazReferansKuru(db: Db, kaynak: { pb: string; kur: string }, hedef: { pb: string; kur: string }, tarih: string) {
  return referansCevabi(await db.tek<{ k: string | null; pay: string }>(
    'SELECT (finans_referans_kur($1, $3, $2) / nullif(finans_referans_kur($4, $3, $5), 0))::text AS k, (finans_capraz_kur_payi() * 100)::text AS pay',
    [kaynak.pb, kaynak.kur, tarih, hedef.pb, hedef.kur]));
}
export async function dagitimReferansKuru(db: Db, belgePb: string, belgeKur: string, odemeId: number, tarih: string) {
  return referansCevabi(await db.tek<{ k: string | null; pay: string }>(
    `SELECT (finans_referans_kur($1, $3, $2) / nullif(finans_referans_kur(o.para_birimi, $3, o.kur), 0))::text AS k, (finans_capraz_kur_payi() * 100)::text AS pay
     FROM finans_odeme o WHERE o.id = $4`, [belgePb, belgeKur, tarih, odemeId]));
}
// Tarihte kur girilmemişse o güne kadar girilen son kur geçerlidir; sonraki günün kuru geçmişe yayılmaz.
export interface KurSatiri { paraBirimi: string; kur: string; tarih: string }
export const sonKurlar = (db: Db, paraBirimi: string | null, tarih: string) =>
  db.sorgu<KurSatiri>(
    `SELECT DISTINCT ON (para_birimi) rtrim(para_birimi) AS "paraBirimi", kur::text AS kur, ${tarihMetni('tarih')} AS tarih
       FROM finans_kur WHERE ($1::char(3) IS NULL OR para_birimi = $1) AND tarih <= $2::date
      ORDER BY para_birimi, tarih DESC`, [paraBirimi, tarih]);
// Düzeltmede önceki değer deftere girer; kilit, okunan değerle yazılan arasına başka düzeltme girmesin diye.
export const kurGetir = (db: Db, pb: string, tarih: string) =>
  db.tek<{ paraBirimi: string; tarih: string; kur: string; surum: number }>(
    `SELECT rtrim(para_birimi) AS "paraBirimi", ${tarihMetni('tarih')} AS tarih, kur::text AS kur, surum FROM finans_kur WHERE para_birimi = $1 AND tarih = $2 FOR UPDATE`, [pb, tarih]);
export const kurVarMi = async (db: Db, pb: string, tarih: string) => (await db.tek('SELECT 1 FROM finans_kur WHERE para_birimi = $1 AND tarih = $2', [pb, tarih])) !== null;
export const faizEkle = (db: Db, f: { paraBirimi: string; gecerlilikBaslangic: string; aylikYuzde: string }, kisi: number) =>
  db.tek<{ id: number }>('INSERT INTO finans_faiz (para_birimi, gecerlilik_baslangic, aylik_yuzde, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [f.paraBirimi, f.gecerlilikBaslangic, f.aylikYuzde, kisi]);
// O güne kadar başlamış son oran geçerlidir; aynı güne ikinci giriş öncekini düzeltir (sonra girilen kazanır), eskisi listede kalır.
export interface FaizSatiri { paraBirimi: string; aylikYuzde: string; gecerlilikBaslangic: string }
export const sonFaizler = (db: Db, paraBirimi: string | null, tarih: string) =>
  db.sorgu<FaizSatiri>(
    `SELECT DISTINCT ON (para_birimi) rtrim(para_birimi) AS "paraBirimi", aylik_yuzde::text AS "aylikYuzde", ${tarihMetni('gecerlilik_baslangic')} AS "gecerlilikBaslangic"
       FROM finans_faiz WHERE ($1::char(3) IS NULL OR para_birimi = $1) AND gecerlilik_baslangic <= $2::date
      ORDER BY para_birimi, gecerlilik_baslangic DESC, id DESC`, [paraBirimi, tarih]);
// 1700 b: günlük faiz kendi tablosundadır; seçim kuralı aylıkla aynıdır.
export const gunlukFaizEkle = (db: Db, f: { paraBirimi: string; gecerlilikBaslangic: string; gunlukYuzde: string }, kisi: number) =>
  db.tek<{ id: number }>('INSERT INTO finans_gunluk_faiz (para_birimi, gecerlilik_baslangic, gunluk_yuzde, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [f.paraBirimi, f.gecerlilikBaslangic, f.gunlukYuzde, kisi]);
export interface GunlukFaizSatiri { paraBirimi: string; gunlukYuzde: string; gecerlilikBaslangic: string }
export const sonGunlukFaizler = (db: Db, paraBirimi: string | null, tarih: string) =>
  db.sorgu<GunlukFaizSatiri>(
    `SELECT DISTINCT ON (para_birimi) rtrim(para_birimi) AS "paraBirimi", gunluk_yuzde::text AS "gunlukYuzde", ${tarihMetni('gecerlilik_baslangic')} AS "gecerlilikBaslangic"
       FROM finans_gunluk_faiz WHERE ($1::char(3) IS NULL OR para_birimi = $1) AND gecerlilik_baslangic <= $2::date
      ORDER BY para_birimi, gecerlilik_baslangic DESC, id DESC`, [paraBirimi, tarih]);
export const faizBirimi = async (db: Db) => (await db.tek<{ b: 'aylik' | 'gunluk' }>('SELECT faiz_birimi AS b FROM finans_ayar WHERE id = 1'))?.b ?? 'aylik';
export const genelGiderOraniEkle = (db: Db, g: { gecerlilikBaslangic: string; aylikGenelGider: string; aylikMakineSaati: string; amortismanDahil: boolean; aciklama: string | null }, kisi: number) =>
  db.tek<{ id: number }>(
    `INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, aciklama, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [g.gecerlilikBaslangic, g.aylikGenelGider, g.aylikMakineSaati, g.amortismanDahil, g.aciklama, kisi]);
// Faizle aynı kural: o güne kadar başlamış son satır geçerlidir, aynı güne sonra girilen öncekini düzeltir.
export const sonGenelGiderOrani = (db: Db, gun: string) =>
  db.tek<{ aylikGenelGider: string; aylikMakineSaati: string; amortismanDahil: boolean }>(
    `SELECT aylik_genel_gider::text AS "aylikGenelGider", aylik_makine_saati::text AS "aylikMakineSaati", amortisman_dahil AS "amortismanDahil"
       FROM finans_genel_gider_orani WHERE gecerlilik_baslangic <= $1::date ORDER BY gecerlilik_baslangic DESC, id DESC LIMIT 1`, [gun]);
// Kur ve faiz şeridi: o güne kadar geçerli son kur ve faiz, son yazanı ve zamanıyla (düzeltme de giriş sayılır).
export interface KurOzetiSatiri { paraBirimi: string; tarih: string; kur: string; girenId: number; giris: string; surum: number }
export const kurOzeti = (db: Db, tarih: string) => db.sorgu<KurOzetiSatiri>(
  `SELECT DISTINCT ON (para_birimi) rtrim(para_birimi) AS "paraBirimi", ${tarihMetni('tarih')} AS tarih, kur::text AS kur,
          coalesce(guncelleyen_id, olusturan_id) AS "girenId", ${zamanMetni('coalesce(guncelleme, olusturma)')} AS giris, surum
     FROM finans_kur WHERE tarih <= $1::date ORDER BY para_birimi, tarih DESC`, [tarih]);
export interface FaizOzetiSatiri { paraBirimi: string; gecerlilikBaslangic: string; aylikYuzde: string; girenId: number; giris: string }
export const faizOzeti = (db: Db, tarih: string) => db.sorgu<FaizOzetiSatiri>(
  `SELECT DISTINCT ON (para_birimi) rtrim(para_birimi) AS "paraBirimi", ${tarihMetni('gecerlilik_baslangic')} AS "gecerlilikBaslangic",
          aylik_yuzde::text AS "aylikYuzde", olusturan_id AS "girenId", ${zamanMetni('olusturma')} AS giris
     FROM finans_faiz WHERE gecerlilik_baslangic <= $1::date ORDER BY para_birimi, gecerlilik_baslangic DESC, id DESC`, [tarih]);
export interface GunlukFaizOzetiSatiri { paraBirimi: string; gecerlilikBaslangic: string; gunlukYuzde: string; girenId: number; giris: string }
export const gunlukFaizOzeti = (db: Db, tarih: string) => db.sorgu<GunlukFaizOzetiSatiri>(
  `SELECT DISTINCT ON (para_birimi) rtrim(para_birimi) AS "paraBirimi", ${tarihMetni('gecerlilik_baslangic')} AS "gecerlilikBaslangic",
          gunluk_yuzde::text AS "gunlukYuzde", olusturan_id AS "girenId", ${zamanMetni('olusturma')} AS giris
     FROM finans_gunluk_faiz WHERE gecerlilik_baslangic <= $1::date ORDER BY para_birimi, gecerlilik_baslangic DESC, id DESC`, [tarih]);
// Şeridin son girişleri (939): kur satırı son yazılış anıyla (düzeltilmişse düzeltme), faiz satırı eklenişiyle; ileri tarihli dahil.
// Düzeltilen kurun önceki değeri tutulmaz; satır bugünkü değerini gösterir.
export interface KurFaizGecmisSatiri { tur: 'kur' | 'faiz' | 'gunluk_faiz'; paraBirimi: string; deger: string; tarih: string; duzeltme: boolean; girenId: number; giris: string }
export const kurFaizGecmisi = (db: Db, sinir: number) => db.sorgu<KurFaizGecmisSatiri>(
  `SELECT tur, "paraBirimi", deger, ${tarihMetni('gun')} AS tarih, duzeltme, "girenId", ${zamanMetni('an')} AS giris FROM (
     SELECT 'kur' AS tur, rtrim(para_birimi) AS "paraBirimi", kur::text AS deger, tarih AS gun, guncelleme IS NOT NULL AS duzeltme,
            coalesce(guncelleyen_id, olusturan_id) AS "girenId", coalesce(guncelleme, olusturma) AS an, 0 AS id FROM finans_kur
     UNION ALL SELECT 'faiz', rtrim(para_birimi), aylik_yuzde::text, gecerlilik_baslangic, false, olusturan_id, olusturma, id FROM finans_faiz
     UNION ALL SELECT 'gunluk_faiz', rtrim(para_birimi), gunluk_yuzde::text, gecerlilik_baslangic, false, olusturan_id, olusturma, id FROM finans_gunluk_faiz) g
   ORDER BY an DESC, id DESC LIMIT $1`, [sinir]);
// Toplu yükleme (1085 a): dosyadaki anahtarların kayıtlı değerleri. Faizde aynı güne sonra girilen geçerlidir.
export const kayitliKurlar = (db: Db, anahtarlar: readonly { paraBirimi: string; tarih: string }[]) => db.sorgu<{ paraBirimi: string; tarih: string; kur: string }>(
  `SELECT rtrim(k.para_birimi) AS "paraBirimi", ${tarihMetni('k.tarih')} AS tarih, k.kur::text AS kur
     FROM finans_kur k JOIN unnest($1::text[], $2::date[]) AS a(pb, gun) ON k.para_birimi = a.pb AND k.tarih = a.gun`,
  [anahtarlar.map((a) => a.paraBirimi), anahtarlar.map((a) => a.tarih)]);
export const kayitliFaizler = (db: Db, anahtarlar: readonly { paraBirimi: string; tarih: string }[]) => db.sorgu<{ paraBirimi: string; tarih: string; aylikYuzde: string }>(
  `SELECT DISTINCT ON (f.para_birimi, f.gecerlilik_baslangic) rtrim(f.para_birimi) AS "paraBirimi", ${tarihMetni('f.gecerlilik_baslangic')} AS tarih,
          f.aylik_yuzde::text AS "aylikYuzde"
     FROM finans_faiz f JOIN unnest($1::text[], $2::date[]) AS a(pb, gun) ON f.para_birimi = a.pb AND f.gecerlilik_baslangic = a.gun
    ORDER BY f.para_birimi, f.gecerlilik_baslangic, f.id DESC`,
  [anahtarlar.map((a) => a.paraBirimi), anahtarlar.map((a) => a.tarih)]);
export const kayitliGunlukFaizler = (db: Db, anahtarlar: readonly { paraBirimi: string; tarih: string }[]) => db.sorgu<{ paraBirimi: string; tarih: string; gunlukYuzde: string }>(
  `SELECT DISTINCT ON (f.para_birimi, f.gecerlilik_baslangic) rtrim(f.para_birimi) AS "paraBirimi", ${tarihMetni('f.gecerlilik_baslangic')} AS tarih,
          f.gunluk_yuzde::text AS "gunlukYuzde"
     FROM finans_gunluk_faiz f JOIN unnest($1::text[], $2::date[]) AS a(pb, gun) ON f.para_birimi = a.pb AND f.gecerlilik_baslangic = a.gun
    ORDER BY f.para_birimi, f.gecerlilik_baslangic, f.id DESC`,
  [anahtarlar.map((a) => a.paraBirimi), anahtarlar.map((a) => a.tarih)]);
// Önizleme ve kur grafiği (1089 a): aralıktaki kurlar; faizde aralıktaki başlangıçlar ve aralıktan önce başlamış son oran.
export const aralikKurlari = (db: Db, baslangic: string, bitis: string) => db.sorgu<{ paraBirimi: string; tarih: string; kur: string }>(
  `SELECT rtrim(para_birimi) AS "paraBirimi", ${tarihMetni('tarih')} AS tarih, kur::text AS kur
     FROM finans_kur WHERE tarih BETWEEN $1::date AND $2::date ORDER BY para_birimi, tarih`, [baslangic, bitis]);
export const aralikFaizleri = (db: Db, baslangic: string, bitis: string) => db.sorgu<{ paraBirimi: string; gecerlilikBaslangic: string; aylikYuzde: string }>(
  `SELECT "paraBirimi", ${tarihMetni('gun')} AS "gecerlilikBaslangic", "aylikYuzde" FROM (
     SELECT DISTINCT ON (para_birimi, gecerlilik_baslangic) rtrim(para_birimi) AS "paraBirimi", gecerlilik_baslangic AS gun, aylik_yuzde::text AS "aylikYuzde"
       FROM finans_faiz WHERE gecerlilik_baslangic BETWEEN $1::date AND $2::date ORDER BY para_birimi, gecerlilik_baslangic, id DESC) a
   UNION ALL SELECT "paraBirimi", ${tarihMetni('gun')}, "aylikYuzde" FROM (
     SELECT DISTINCT ON (para_birimi) rtrim(para_birimi) AS "paraBirimi", gecerlilik_baslangic AS gun, aylik_yuzde::text AS "aylikYuzde"
       FROM finans_faiz WHERE gecerlilik_baslangic < $1::date ORDER BY para_birimi, gecerlilik_baslangic DESC, id DESC) o
   ORDER BY 1, 2`, [baslangic, bitis]);
export const aralikGunlukFaizleri = (db: Db, baslangic: string, bitis: string) => db.sorgu<{ paraBirimi: string; gecerlilikBaslangic: string; gunlukYuzde: string }>(
  `SELECT "paraBirimi", ${tarihMetni('gun')} AS "gecerlilikBaslangic", "gunlukYuzde" FROM (
     SELECT DISTINCT ON (para_birimi, gecerlilik_baslangic) rtrim(para_birimi) AS "paraBirimi", gecerlilik_baslangic AS gun, gunluk_yuzde::text AS "gunlukYuzde"
       FROM finans_gunluk_faiz WHERE gecerlilik_baslangic BETWEEN $1::date AND $2::date ORDER BY para_birimi, gecerlilik_baslangic, id DESC) a
   UNION ALL SELECT "paraBirimi", ${tarihMetni('gun')}, "gunlukYuzde" FROM (
     SELECT DISTINCT ON (para_birimi) rtrim(para_birimi) AS "paraBirimi", gecerlilik_baslangic AS gun, gunluk_yuzde::text AS "gunlukYuzde"
       FROM finans_gunluk_faiz WHERE gecerlilik_baslangic < $1::date ORDER BY para_birimi, gecerlilik_baslangic DESC, id DESC) o
   ORDER BY 1, 2`, [baslangic, bitis]);
// İleri tarihli giriş dahil en son yazılan kur ya da faiz.
export const sonKurFaizGirisi = (db: Db) => db.tek<{ girenId: number; giris: string; tur: 'kur' | 'faiz' | 'gunluk_faiz' }>(
  `SELECT "girenId", ${zamanMetni('an')} AS giris, tur FROM (
     SELECT coalesce(guncelleyen_id, olusturan_id) AS "girenId", coalesce(guncelleme, olusturma) AS an, 'kur' AS tur FROM finans_kur
     UNION ALL SELECT olusturan_id, olusturma, 'faiz' FROM finans_faiz
     UNION ALL SELECT olusturan_id, olusturma, 'gunluk_faiz' FROM finans_gunluk_faiz) g ORDER BY an DESC LIMIT 1`);

// ---- Sabit kıymet (yönetim amaçlı amortisman) ----
const SABIT_KIYMET = `id, ad, makine_kodu AS "makineKodu", rtrim(para_birimi) AS "paraBirimi", bedel, kur, ${tarihMetni('alis_tarihi')} AS "alisTarihi",
  omur_ay AS "omurAy", yontem, kalinti_degeri AS "kalintiDegeri", ${tarihMetni('devir_tarihi')} AS "devirTarihi", devir_birikmis_tl AS "devirBirikmisTl",
  ${tarihMetni('pasif_tarihi')} AS "pasifTarihi", aciklama, surum, ${zamanMetni('olusturma')} AS olusturma, makine_id AS "makineId"`;
export interface SabitKiymetKaydi {
  id: number; ad: string; makineKodu: string | null; paraBirimi: string; bedel: string; kur: string; alisTarihi: string; omurAy: number;
  yontem: 'normal' | 'azalan'; kalintiDegeri: string; devirTarihi: string | null; devirBirikmisTl: string | null; pasifTarihi: string | null;
  aciklama: string | null; surum: number; olusturma: string; makineId: number | null;
}
export const sabitKiymetSay = async (db: Db) => (await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_sabit_kiymet'))?.n ?? 0;
export const sabitKiymetSatirlari = (db: Db, dilim: ListeDilimi) =>
  db.sorgu<SabitKiymetKaydi>(`SELECT ${SABIT_KIYMET} FROM finans_sabit_kiymet ORDER BY id LIMIT $1 OFFSET $2`, [dilim.sinir, dilim.atla]);
export const sabitKiymetlerHepsi = (db: Db) => db.sorgu<SabitKiymetKaydi>(`SELECT ${SABIT_KIYMET} FROM finans_sabit_kiymet ORDER BY id`);
export const makineSabitKiymetleri = (db: Db, makineKodu: string) =>
  db.sorgu<SabitKiymetKaydi>(`SELECT ${SABIT_KIYMET} FROM finans_sabit_kiymet WHERE makine_kodu = $1 ORDER BY id`, [makineKodu]);
export const makineIdSabitKiymetleri = (db: Db, makineId: number) =>
  db.sorgu<SabitKiymetKaydi>(`SELECT ${SABIT_KIYMET} FROM finans_sabit_kiymet WHERE makine_id = $1 ORDER BY id`, [makineId]);
export const sabitKiymetGetir = (db: Db, id: number, kilit = false) =>
  db.tek<SabitKiymetKaydi>(`SELECT ${SABIT_KIYMET} FROM finans_sabit_kiymet WHERE id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
export const sabitKiymetEkle = (db: Db, k: {
  ad: string; makineKodu: string | null; paraBirimi: string; bedel: string; kur: string; alisTarihi: string; omurAy: number; yontem: string;
  kalintiDegeri: string; devirTarihi: string | null; devirBirikmisTl: string | null; aciklama: string | null; makineId: number | null;
}, kisi: number) =>
  db.tek<{ id: number }>(
    `INSERT INTO finans_sabit_kiymet (ad, makine_kodu, para_birimi, bedel, kur, alis_tarihi, omur_ay, yontem, kalinti_degeri, devir_tarihi, devir_birikmis_tl, aciklama, olusturan_id, makine_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [k.ad, k.makineKodu, k.paraBirimi, k.bedel, k.kur, k.alisTarihi, k.omurAy, k.yontem, k.kalintiDegeri, k.devirTarihi, k.devirBirikmisTl, k.aciklama, kisi, k.makineId]);
// Düzeltme pasif kıymete yazmaz: pasif tarihi amortismanın bittiği yerdir, sonrası değişirse geçmiş aylar kayar.
export const sabitKiymetGuncelle = (db: Db, id: number, surum: number, k: {
  ad: string; makineKodu: string | null; paraBirimi: string; bedel: string; kur: string; alisTarihi: string; omurAy: number; yontem: string;
  kalintiDegeri: string; devirTarihi: string | null; devirBirikmisTl: string | null; aciklama: string | null; makineId: number | null;
}) =>
  db.tek<{ id: number }>(
    `UPDATE finans_sabit_kiymet SET ad = $3, makine_kodu = $4, para_birimi = $5, bedel = $6, kur = $7, alis_tarihi = $8, omur_ay = $9, yontem = $10,
       kalinti_degeri = $11, devir_tarihi = $12, devir_birikmis_tl = $13, aciklama = $14, makine_id = $15, surum = surum + 1
     WHERE id = $1 AND surum = $2 AND pasif_tarihi IS NULL RETURNING id`,
    [id, surum, k.ad, k.makineKodu, k.paraBirimi, k.bedel, k.kur, k.alisTarihi, k.omurAy, k.yontem, k.kalintiDegeri, k.devirTarihi, k.devirBirikmisTl, k.aciklama, k.makineId]);
export const sabitKiymetPasif = (db: Db, id: number, surum: number, pasifTarihi: string) =>
  db.tek<{ id: number }>('UPDATE finans_sabit_kiymet SET pasif_tarihi = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 AND pasif_tarihi IS NULL RETURNING id', [id, surum, pasifTarihi]);
export const kdvOraniEkle = (db: Db, oran: string, baslangic: string, kisi: number) =>
  db.tek('INSERT INTO finans_kdv_orani (oran, gecerlilik_baslangic, olusturan_id) VALUES ($1, $2, $3) RETURNING oran', [oran, baslangic, kisi]);
export const kdvOraniKapat = (db: Db, oran: string, baslangic: string, bitis: string, surum: number) =>
  db.tek<{ surum: number }>('UPDATE finans_kdv_orani SET gecerlilik_bitis = $3, surum = surum + 1 WHERE oran = $1 AND gecerlilik_baslangic = $2 AND surum = $4 RETURNING surum', [oran, baslangic, bitis, surum]);
export const kdvOraniVarMi = async (db: Db, oran: string, baslangic: string) => (await db.tek('SELECT 1 FROM finans_kdv_orani WHERE oran = $1 AND gecerlilik_baslangic = $2', [oran, baslangic])) !== null;
export interface DuzenliYazimi { ad: string; kategori: string; firmaId: number | null; hesapId: number | null; paraBirimi: string; tutar: string; kdvOrani: string; ayinGunu: number; aktif: boolean }
export async function duzenliEkle(db: Db, d: DuzenliYazimi, kisi: number): Promise<number> {
  const s = await db.tek<{ id: number }>(`INSERT INTO finans_duzenli_odeme (ad, kategori, firma_id, hesap_id, para_birimi, tutar, kdv_orani, ayin_gunu, aktif, olusturan_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`, [d.ad, d.kategori, d.firmaId, d.hesapId, d.paraBirimi, d.tutar, d.kdvOrani, d.ayinGunu, d.aktif, kisi]);
  return (s as { id: number }).id;
}
export const duzenliGuncelle = (db: Db, id: number, surum: number, d: DuzenliYazimi) =>
  db.tek<{ id: number }>(`UPDATE finans_duzenli_odeme SET ad = $3, kategori = $4, firma_id = $5, hesap_id = $6, para_birimi = $7, tutar = $8, kdv_orani = $9, ayin_gunu = $10, aktif = $11, surum = surum + 1
    WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum, d.ad, d.kategori, d.firmaId, d.hesapId, d.paraBirimi, d.tutar, d.kdvOrani, d.ayinGunu, d.aktif]);
export const butceYaz = (db: Db, b: { kategori: string; baslangicAyi: string; aylikTutar: string }, kisi: number) =>
  db.tek(`INSERT INTO finans_butce (kategori, baslangic_ayi, aylik_tutar, olusturan_id) VALUES ($1, $2, $3, $4)
    ON CONFLICT (kategori, baslangic_ayi) DO UPDATE SET aylik_tutar = EXCLUDED.aylik_tutar, surum = finans_butce.surum + 1 RETURNING kategori`, [b.kategori, b.baslangicAyi, b.aylikTutar, kisi]);
const AYAR_SUTUNLARI: [string, string][] = [['sirketAdi', 'sirket_adi'], ['sektor', 'sektor'], ['nakitEsigi', 'nakit_esigi'], ['beklenenAylikSatis', 'beklenen_aylik_satis'],
  ['beklenenTahsilGunu', 'beklenen_tahsil_gunu'], ['riskToleransi', 'risk_toleransi'], ['simulasyonSayisi', 'simulasyon_sayisi'], ['cekKarsiliksizOlasiligi', 'cek_karsiliksiz_olasiligi'],
  ['batikGunu', 'batik_gunu'], ['anomaliEsigi', 'anomali_esigi'], ['agirlikLikidite', 'agirlik_likidite'], ['agirlikNakit', 'agirlik_nakit'], ['agirlikKarlilik', 'agirlik_karlilik'],
  ['agirlikVerimlilik', 'agirlik_verimlilik'], ['agirlikBorcluluk', 'agirlik_borcluluk'], ['bilancoDonen', 'bilanco_donen'], ['bilancoStok', 'bilanco_stok'], ['bilancoKvb', 'bilanco_kvb'],
  ['bilancoToplamBorc', 'bilanco_toplam_borc'], ['bilancoOzkaynak', 'bilanco_ozkaynak'], ['bilancoBirikmisKar', 'bilanco_birikmis_kar'], ['kurulumTamam', 'kurulum_tamam']];
export function ayarGuncelle(db: Db, surum: number, a: Record<string, unknown>, kisi: number) {
  const atama = AYAR_SUTUNLARI.map(([, s], i) => `${s} = $${i + 3}`).join(', ');
  const pay = AYAR_SUTUNLARI.length + 3;
  return db.tek<{ surum: number }>(`UPDATE finans_ayar SET ${atama}, capraz_kur_payi = coalesce($${pay}, capraz_kur_payi),
    faiz_birimi = coalesce($${pay + 1}, faiz_birimi), guncelleyen_id = $2, guncelleme = now(),
    surum = surum + 1 WHERE id = 1 AND surum = $1 RETURNING surum`, [surum, kisi, ...AYAR_SUTUNLARI.map(([a2]) => a[a2] ?? null), a['caprazKurPayi'] ?? null, a['faizBirimi'] ?? null]);
}
export const oneriYaz = (db: Db, kimlik: string, durum: string | null, ertele: string | null, kisi: number) => durum === null
  ? db.sorgu('DELETE FROM finans_oneri_durumu WHERE bulgu_kimligi = $1', [kimlik])
  : db.sorgu(`INSERT INTO finans_oneri_durumu (bulgu_kimligi, durum, ertele_bitis, guncelleyen_id) VALUES ($1, $2, $3, $4)
      ON CONFLICT (bulgu_kimligi) DO UPDATE SET durum = EXCLUDED.durum, ertele_bitis = EXCLUDED.ertele_bitis, guncelleyen_id = EXCLUDED.guncelleyen_id, guncelleme = now()`, [kimlik, durum, ertele, kisi]);
export const kapanisYaz = (db: Db, donem: string, madde: string, isaretli: boolean, kisi: number) =>
  db.sorgu(`INSERT INTO finans_kapanis (donem, madde, isaretli, guncelleyen_id) VALUES ($1, $2, $3, $4)
    ON CONFLICT (donem, madde) DO UPDATE SET isaretli = EXCLUDED.isaretli, guncelleyen_id = EXCLUDED.guncelleyen_id, guncelleme = now()`, [donem, madde, isaretli, kisi]);
// Günlük skoru zamanlayıcı yazar (1456 b): satırın kişisi yoktur; günün satırı varsa dokunulmaz.
export const skorVarMi = async (db: Db, gun: string) =>
  (await db.tek<{ var: boolean }>('SELECT EXISTS (SELECT 1 FROM finans_skor WHERE gun = $1) AS var', [gun]))?.var === true;
export const skorYaz = (db: Db, gun: string, skor: number, nakit: string) =>
  db.sorgu(`INSERT INTO finans_skor (gun, skor, nakit, guncelleyen_id) VALUES ($1, $2, $3, NULL) ON CONFLICT (gun) DO NOTHING`, [gun, skor, nakit]);
// Ana sayfa panosu (finans.oku). Açık belgenin kalanı belgenin kendi kuruyla TL'ye çevrilir; yaklaşan ödeme bugün dahil 7 gündür.
export interface PanoRakamlari {
  gecikenSayi: number; gecikenTl: string; yaklasanSayi: number; yaklasanTl: string; cekSayi: number; cekTl: string; nakitTl: string | null;
  alacakTl: string; borcTl: string; aylikKarTl: string;
}
export async function panoRakamlari(db: Db, bugun: string): Promise<PanoRakamlari> {
  const r = await db.tek<PanoRakamlari>(
    `WITH acik AS (
       SELECT b.yon, b.vade, (b.toplam - finans_belge_kapanan(b.id)) * b.kur AS kalan_tl FROM finans_belge b WHERE b.durum = 'acik'),
     hesap AS (
       SELECT finans_hesap_bakiyesi(h.id) AS bakiye,
              CASE WHEN rtrim(h.para_birimi) = 'TRY' THEN 1
                   ELSE (SELECT k.kur FROM finans_kur k WHERE k.para_birimi = h.para_birimi AND k.tarih <= $1::date ORDER BY k.tarih DESC LIMIT 1) END AS kur
         FROM finans_hesap h WHERE h.aktif)
     SELECT (SELECT count(*)::int FROM acik WHERE yon = 'gelir' AND vade < $1::date) AS "gecikenSayi",
            (SELECT coalesce(sum(kalan_tl), 0)::numeric(18,2)::text FROM acik WHERE yon = 'gelir' AND vade < $1::date) AS "gecikenTl",
            (SELECT count(*)::int FROM acik WHERE yon = 'gider' AND vade BETWEEN $1::date AND $1::date + 7) AS "yaklasanSayi",
            (SELECT coalesce(sum(kalan_tl), 0)::numeric(18,2)::text FROM acik WHERE yon = 'gider' AND vade BETWEEN $1::date AND $1::date + 7) AS "yaklasanTl",
            (SELECT count(*)::int FROM finans_cek WHERE yon = 'alinan' AND durum IN ('portfoy', 'tahsilde')) AS "cekSayi",
            (SELECT coalesce(sum(tutar_tl), 0)::numeric(18,2)::text FROM finans_cek WHERE yon = 'alinan' AND durum IN ('portfoy', 'tahsilde')) AS "cekTl",
            (SELECT CASE WHEN bool_and(kur IS NOT NULL) THEN sum(bakiye * kur)::numeric(18,2)::text END FROM hesap) AS "nakitTl",
            -- Finans ana sayfasındaki "Alacağım", "Borcum" ve "Aylık ortalama kâr" ile aynı tanım: açık belge kalanı ile sonuçlanmamış çek;
            -- kâr son üç tamamlanmış ayın KDV hariç belge tutarıdır (açılış, KDV ödemesi ve kredi anaparası kâr/zarara girmez).
            ((SELECT coalesce(sum(kalan_tl), 0) FROM acik WHERE yon = 'gelir')
              + (SELECT coalesce(sum(tutar_tl), 0) FROM finans_cek WHERE yon = 'alinan' AND durum IN ('portfoy', 'tahsilde')))::numeric(18,2)::text AS "alacakTl",
            ((SELECT coalesce(sum(kalan_tl), 0) FROM acik WHERE yon = 'gider')
              + (SELECT coalesce(sum(tutar_tl), 0) FROM finans_cek WHERE yon = 'verilen' AND durum = 'bekliyor'))::numeric(18,2)::text AS "borcTl",
            (SELECT (coalesce(sum(CASE WHEN b.yon = 'gelir' THEN b.tutar ELSE -b.tutar END * b.kur), 0) / 3)::numeric(18,2)::text
               FROM finans_belge b
              WHERE b.durum <> 'iptal' AND b.tur <> 'acilis' AND b.kategori NOT IN ('kdv_vergi', 'kredi_anapara')
                AND b.belge_tarihi >= date_trunc('month', $1::date) - interval '3 months' AND b.belge_tarihi < date_trunc('month', $1::date)) AS "aylikKarTl"`,
    [bugun]);
  if (!r) throw new Error('Pano rakamları okunamadı.');
  return r;
}

// Aylık ortalama kârla aynı tanım: iptal, açılış, KDV ödemesi ve kredi anaparası dışında KDV hariç tutar, belgenin kuruyla TL.
export interface AylikTutar { ay: string; gelirTl: string; giderTl: string }
export const aylikGelirGider = (db: Db, ilkAy: string, sonAy: string) => db.sorgu<AylikTutar>(
  `SELECT to_char(a.ay, 'YYYY-MM') AS ay,
          coalesce(sum(CASE WHEN b.yon = 'gelir' THEN b.tutar * b.kur END), 0)::numeric(18,2)::text AS "gelirTl",
          coalesce(sum(CASE WHEN b.yon = 'gider' THEN b.tutar * b.kur END), 0)::numeric(18,2)::text AS "giderTl"
     FROM generate_series(($1 || '-01')::date, ($2 || '-01')::date, interval '1 month') AS a(ay)
     LEFT JOIN finans_belge b ON date_trunc('month', b.belge_tarihi::timestamp) = a.ay
      AND b.durum <> 'iptal' AND b.tur <> 'acilis' AND b.kategori NOT IN ('kdv_vergi', 'kredi_anapara')
    GROUP BY a.ay ORDER BY a.ay`, [ilkAy, sonAy]);
export const ilkBelgeAyi = async (db: Db): Promise<string | null> => (await db.tek<{ ay: string | null }>(
  "SELECT to_char(min(belge_tarihi), 'YYYY-MM') AS ay FROM finans_belge WHERE durum <> 'iptal' AND tur <> 'acilis'"))?.ay ?? null;

export async function menuSayaclari(db: Db): Promise<{ firmalar: number; cekler: number }> {
  const s = await db.tek<{ firmalar: number; cekler: number }>(
    `SELECT (SELECT count(DISTINCT firma_id)::int FROM finans_belge b WHERE b.yon = 'gelir' AND b.durum = 'acik' AND b.vade < current_date) AS firmalar,
            (SELECT count(*)::int FROM finans_cek WHERE durum IN ('portfoy', 'tahsilde', 'bekliyor') AND vade <= current_date + 7) AS cekler`);
  return s ?? { firmalar: 0, cekler: 0 };
}

// FNS-62: sipariş bağı satın almanın ucundan finansın komutuyla yazılır; liste rakam taşımaz (FNS-48).
export const belgeSiparisYaz = (db: Db, id: number, surum: number, siparis: { talepId: string; teklifId: string } | null, kisi: number) =>
  db.tek<{ id: number }>(`UPDATE finans_belge SET satin_alma_talep_id = $3, satin_alma_teklif_id = $4, guncelleyen_id = $5, guncelleme = now(), surum = surum + 1
    WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum, siparis?.talepId ?? null, siparis?.teklifId ?? null, kisi]);
// Kart #1124: siparişin ödeme planı ve bağlı faturaları; anahtar (talep, teklif) çiftidir.
export interface SiparisOdemesiSatiri {
  talepId: string; teklifId: string; siparisNo: string; sira: number; tur: 'avans' | 'vade'; vade: string; yontem: string; firmaId: number; paraBirimi: string; tutar: string;
}
const SIPARIS_ODEMESI = `o.satin_alma_talep_id AS "talepId", o.satin_alma_teklif_id AS "teklifId", o.siparis_no AS "siparisNo", o.sira, o.tur, ${tarihMetni('o.vade')} AS vade, o.yontem,
  o.firma_id AS "firmaId", o.para_birimi AS "paraBirimi", o.tutar`;
export const siparisOdemeleriOku = (db: Db, talepIdler: readonly string[], teklifIdler: readonly string[]) => db.sorgu<SiparisOdemesiSatiri>(
  `SELECT ${SIPARIS_ODEMESI} FROM finans_siparis_odemesi o
    JOIN unnest($1::uuid[], $2::uuid[]) AS a(talep_id, teklif_id) ON a.talep_id = o.satin_alma_talep_id AND a.teklif_id = o.satin_alma_teklif_id
   ORDER BY o.satin_alma_talep_id, o.satin_alma_teklif_id, o.sira`, [talepIdler, teklifIdler]);
export const siparisOdemeleriniSil = (db: Db, talepId: string, teklifId: string) =>
  db.sorgu('DELETE FROM finans_siparis_odemesi WHERE satin_alma_talep_id = $1 AND satin_alma_teklif_id = $2', [talepId, teklifId]);
export async function siparisOdemesiEkle(db: Db, o: SiparisOdemesiSatiri, kisiId: number): Promise<void> {
  await db.sorgu(`INSERT INTO finans_siparis_odemesi (satin_alma_talep_id, satin_alma_teklif_id, siparis_no, sira, tur, vade, yontem, firma_id, para_birimi, tutar, olusturan_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [o.talepId, o.teklifId, o.siparisNo, o.sira, o.tur, o.vade, o.yontem, o.firmaId, o.paraBirimi, o.tutar, kisiId]);
}
export const siparisFaturasiVarMi = async (db: Db, talepId: string, teklifId: string): Promise<boolean> => (await db.tek(
  `SELECT 1 FROM finans_belge WHERE satin_alma_talep_id = $1 AND satin_alma_teklif_id = $2 AND durum <> 'iptal' LIMIT 1`, [talepId, teklifId])) !== null;
export interface SiparisFaturasiSatiri { talepId: string; teklifId: string; id: number; belgeNo: string | null; belgeTarihi: string; vade: string }
export const siparisFaturalariOku = (db: Db, talepIdler: readonly string[], teklifIdler: readonly string[]) => db.sorgu<SiparisFaturasiSatiri>(
  `SELECT b.satin_alma_talep_id AS "talepId", b.satin_alma_teklif_id AS "teklifId", b.id, b.belge_no AS "belgeNo",
          ${tarihMetni('b.belge_tarihi')} AS "belgeTarihi", ${tarihMetni('b.vade')} AS vade
     FROM finans_belge b
     JOIN unnest($1::uuid[], $2::uuid[]) AS a(talep_id, teklif_id) ON a.talep_id = b.satin_alma_talep_id AND a.teklif_id = b.satin_alma_teklif_id
    WHERE b.durum <> 'iptal' ORDER BY b.belge_tarihi, b.id`, [talepIdler, teklifIdler]);
// Finansın beklenen ödemeleri: faturası henüz bağlanmamış siparişlerin plan satırları, vadeye göre.
// Kart #162: TL karşılığı TRY'de tutarın kendisi, dövizde bugüne kadar girilmiş son kurladır; kur yoksa null (uydurulmaz).
// Borç B15: aynı tedarikçinin siparişe bağlanmamış alış faturası plan yazıldıktan sonra girildiyse ya da tarihliyse satır uyarı taşır;
// tutar düşülmez, çünkü faturanın hangi siparişe ait olduğu bilinmez.
export interface BeklenenOdemeSatiri extends SiparisOdemesiSatiri { id: number; tutarTl: string | null; bagsizFatura: boolean }
const BEKLENEN_ODEME = `FROM finans_siparis_odemesi o
    WHERE NOT EXISTS (SELECT 1 FROM finans_belge b WHERE b.satin_alma_talep_id = o.satin_alma_talep_id AND b.satin_alma_teklif_id = o.satin_alma_teklif_id AND b.durum <> 'iptal')`;
const BAGSIZ_FATURA = `EXISTS (SELECT 1 FROM finans_belge f WHERE f.firma_id = o.firma_id AND f.yon = 'gider' AND f.tur = 'fatura' AND f.durum <> 'iptal'
    AND f.satin_alma_talep_id IS NULL AND (f.belge_tarihi >= o.olusturma::date OR f.olusturma >= o.olusturma))`;
const siparisTutariTl = (gun: string) => `(CASE WHEN rtrim(o.para_birimi) = 'TRY' THEN o.tutar
    ELSE o.tutar * (SELECT k.kur FROM finans_kur k WHERE k.para_birimi = o.para_birimi AND k.tarih <= ${gun}::date ORDER BY k.tarih DESC LIMIT 1) END)`;
// sonGun verilirse o güne kadarki bütün satırlar gelir (ana sayfa penceresi); verilmezse liste için ilk 500 satır.
export const beklenenOdemeler = (db: Db, bugun: string, sonGun?: string) => db.sorgu<BeklenenOdemeSatiri>(
  `SELECT o.id, ${SIPARIS_ODEMESI}, ${siparisTutariTl('$1')}::numeric(18,2)::text AS "tutarTl", ${BAGSIZ_FATURA} AS "bagsizFatura" ${BEKLENEN_ODEME}
    ${sonGun === undefined ? '' : 'AND o.vade <= $2::date'} ORDER BY o.vade, o.id ${sonGun === undefined ? 'LIMIT 500' : ''}`, sonGun === undefined ? [bugun] : [bugun, sonGun]);
// Borç B15: firmaya yapılmış, iptal edilmemiş ve faturaya dağıtılmamış ödemelerin TL toplamı (avans); firma başına.
export const firmaAvanslari = (db: Db, firmaIdler: readonly number[]) => db.sorgu<{ firmaId: number; tl: string }>(
  `SELECT o.firma_id AS "firmaId",
          sum(round((o.tutar - coalesce((SELECT sum(d.odeme_tutari) FROM finans_odeme_dagilimi d WHERE d.odeme_id = o.id AND d.iptal_zamani IS NULL), 0)) * o.kur, 2))::numeric(18,2)::text AS tl
     FROM finans_odeme o WHERE o.yon = 'gider' AND o.iptal_zamani IS NULL AND o.firma_id = ANY($1::int[]) GROUP BY o.firma_id`, [firmaIdler]);
export const alisBelgeleri = <T>(db: Db, firmaId: number) => db.sorgu<T>(
  `SELECT b.id, b.belge_no AS "belgeNo", ${tarihMetni('b.belge_tarihi')} AS "belgeTarihi", b.aciklama, b.durum,
     CASE WHEN b.satin_alma_talep_id IS NULL THEN NULL
          ELSE json_build_object('talepId', b.satin_alma_talep_id, 'teklifId', b.satin_alma_teklif_id) END AS "satinAlmaSiparisi"
   FROM finans_belge b WHERE b.firma_id = $1 AND b.yon = 'gider' AND b.durum <> 'iptal' ORDER BY b.belge_tarihi DESC, b.id DESC LIMIT 200`, [firmaId]);

// 911 b, 940 c: proje maliyetine bağlanan üretim dışı gider belgeleri. Tutar KDV hariç TL'dir (tutar x belge kuru); KDV maliyet değildir.
export interface GiderBelgesiSatiri {
  id: number; belgeNo: string | null; belgeTarihi: string; kategori: string; aciklama: string | null; durum: string; tutarTl: string; satinAlmaBagli: boolean;
}
const GIDER_BELGESI = `b.id, b.belge_no AS "belgeNo", ${tarihMetni('b.belge_tarihi')} AS "belgeTarihi", b.kategori, b.aciklama, b.durum,
  round(b.tutar * b.kur, 2)::text AS "tutarTl", (b.satin_alma_talep_id IS NOT NULL) AS "satinAlmaBagli"`;
export const giderBelgeleriOku = (db: Db, idler: readonly number[]) => db.sorgu<GiderBelgesiSatiri>(
  `SELECT ${GIDER_BELGESI} FROM finans_belge b WHERE b.id = ANY($1::int[]) AND b.yon = 'gider'`, [idler]);
// Seçici: iptal edilmemiş gider belgeleri, verilen kategorilerde; kalıp belge no ve açıklamada aranır. Yeniden eskiye, en çok 20.
export const giderBelgesiSecenekleriOku = (db: Db, kalip: string | null, kategoriler: readonly string[]) => db.sorgu<GiderBelgesiSatiri>(
  `SELECT ${GIDER_BELGESI} FROM finans_belge b
    WHERE b.yon = 'gider' AND b.durum <> 'iptal' AND b.kategori = ANY($2::text[])
      AND ($1::text IS NULL OR b.belge_no ILIKE $1 OR b.aciklama ILIKE $1)
    ORDER BY b.belge_tarihi DESC, b.id DESC LIMIT 20`, [kalip, kategoriler]);

// ---- Birim maliyetleri (kart #1187) ----
const maliyetSecimi = (t: MaliyetTuru) => {
  const m = MALIYET_TABLOLARI[t];
  return { m, sutunlar: `${m.anahtar} AS anahtar, ${m.tutar} AS "birimMaliyet", rtrim(para_birimi) AS "paraBirimi", ${zamanMetni('guncelleme')} AS guncelleme, guncelleyen_id AS "guncelleyenId", surum` };
};
export interface MaliyetKaydi { anahtar: number; birimMaliyet: string; paraBirimi: string; guncelleme: string; guncelleyenId: number; surum: number }
export const maliyetSay = async (db: Db, t: MaliyetTuru) =>
  (await db.tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${MALIYET_TABLOLARI[t].tablo}`))?.n ?? 0;
export const maliyetSatirlari = (db: Db, t: MaliyetTuru, dilim: ListeDilimi) => {
  const { m, sutunlar } = maliyetSecimi(t);
  return db.sorgu<MaliyetKaydi>(`SELECT ${sutunlar} FROM ${m.tablo} ORDER BY ${m.anahtar} LIMIT $1 OFFSET $2`, [dilim.sinir, dilim.atla]);
};
export const maliyetGetir = (db: Db, t: MaliyetTuru, anahtar: number, kilit = false) => {
  const { m, sutunlar } = maliyetSecimi(t);
  return db.tek<MaliyetKaydi>(`SELECT ${sutunlar} FROM ${m.tablo} WHERE ${m.anahtar} = $1${kilit ? ' FOR UPDATE' : ''}`, [anahtar]);
};
export const maliyetEkle = (db: Db, t: MaliyetTuru, anahtar: number, tutar: string, paraBirimi: string, kisi: number) => {
  const m = MALIYET_TABLOLARI[t];
  return db.tek<{ anahtar: number }>(
    `INSERT INTO ${m.tablo} (${m.anahtar}, ${m.tutar}, para_birimi, guncelleyen_id) VALUES ($1, $2, $3, $4) RETURNING ${m.anahtar} AS anahtar`,
    [anahtar, tutar, paraBirimi, kisi]);
};
export const maliyetGuncelle = (db: Db, t: MaliyetTuru, anahtar: number, surum: number, tutar: string, paraBirimi: string, kisi: number) => {
  const m = MALIYET_TABLOLARI[t];
  return db.tek<{ anahtar: number }>(
    `UPDATE ${m.tablo} SET ${m.tutar} = $3, para_birimi = $4, guncelleyen_id = $5, guncelleme = now(), surum = surum + 1
      WHERE ${m.anahtar} = $1 AND surum = $2 RETURNING ${m.anahtar} AS anahtar`,
    [anahtar, surum, tutar, paraBirimi, kisi]);
};
export const maliyetHepsi = (db: Db, t: MaliyetTuru) => {
  const { m, sutunlar } = maliyetSecimi(t);
  return db.sorgu<MaliyetKaydi>(`SELECT ${sutunlar} FROM ${m.tablo} ORDER BY ${m.anahtar}`);
};

// 260 a: iadenin üst sınırı için asıl faturanın iptal edilmemiş öteki iadeleri (asıl FOR UPDATE ile kilitliyken okunur).
export async function iadeToplami(db: Db, asilId: number, haricId: number): Promise<string> {
  const s = await db.tek<{ toplam: string }>(
    `SELECT coalesce(sum(toplam), 0)::text AS toplam FROM finans_belge WHERE iade_belge_id = $1 AND id <> $2 AND durum <> 'iptal'`, [asilId, haricId]);
  return s?.toplam ?? '0';
}

// FNS-68: sevkin iptal edilmemiş satış faturası. Aynı sevke eşzamanlı iki fatura girmesin diye önce sevk kimliğiyle işlem kilidi alınır.
export async function sevkFaturasi(db: Db, sevkiyatIsiId: number): Promise<{ id: number; belgeNo: string | null } | null> {
  await islemKilidiAl(db, 'finans_sevk_faturasi', sevkiyatIsiId);
  return db.tek<{ id: number; belgeNo: string | null }>(
    `SELECT id, belge_no AS "belgeNo" FROM finans_belge WHERE sevkiyat_isi_id = $1 AND tur = 'fatura' AND durum <> 'iptal' ORDER BY id LIMIT 1`, [sevkiyatIsiId]);
}

export interface SiparisFaturaSatiri {
  siparisId: number; id: number; tur: 'fatura' | 'iade'; belgeNo: string | null; belgeTarihi: string; durum: string; sevkiyatIsiId: number | null;
  iadeBelgeId: number | null; paraBirimi: string; tutar: string; toplam: string; netTl: string; toplamTl: string;
}
// Satış siparişinin iptal edilmemiş faturaları ve iadeleri; net TL = KDV hariç tutar x belge kuru.
export const siparisFaturalari = (db: Db, siparisIdler: readonly number[]) => db.sorgu<SiparisFaturaSatiri>(
  `SELECT b.siparis_id AS "siparisId", b.id, b.tur, b.belge_no AS "belgeNo", ${tarihMetni('b.belge_tarihi')} AS "belgeTarihi", b.durum,
          b.sevkiyat_isi_id AS "sevkiyatIsiId", b.iade_belge_id AS "iadeBelgeId", rtrim(b.para_birimi) AS "paraBirimi", b.tutar::text AS tutar,
          b.toplam::text AS toplam, round(b.tutar * b.kur, 2)::text AS "netTl", b.toplam_tl::text AS "toplamTl"
     FROM finans_belge b WHERE b.siparis_id = ANY($1::int[]) AND b.durum <> 'iptal' ORDER BY b.siparis_id, b.belge_tarihi, b.id`, [siparisIdler]);
