import type { Db } from '#cekirdek/db.ts';

export interface DonemBelgesi { id: number; belgeNo: string | null; kategori: string; tutarTl: string; siparisli: boolean; eski: boolean; esikVar: boolean }
// Dönemin iptal edilmemiş gider belgeleri; tutar KDV hariç TL (tutar x belge kuru). 2643 b: siparişli belge eşikten önce
// oluşturulduysa eski. Eşik yazılmamışsa esikVar false döner; servis siparişli belgeyi bilinmiyor sayar.
export const donemBelgeleri = (db: Db, bas: string, bit: string) => db.sorgu<DonemBelgesi>(
  `SELECT b.id, b.belge_no AS "belgeNo", b.kategori, round(b.tutar * b.kur, 2)::text AS "tutarTl",
          (b.satin_alma_talep_id IS NOT NULL) AS siparisli,
          (b.satin_alma_talep_id IS NOT NULL AND b.olusturma < a.genel_gider_belge_esigi) IS TRUE AS eski,
          (a.genel_gider_belge_esigi IS NOT NULL) IS TRUE AS "esikVar"
     FROM finans_belge b LEFT JOIN finans_ayar a ON a.id = 1
    WHERE b.yon = 'gider' AND b.durum <> 'iptal' AND b.belge_tarihi BETWEEN $1::date AND $2::date
    ORDER BY b.belge_tarihi, b.id`, [bas, bit]);

export interface BelgeSatiri {
  gecerlilikBaslangic: string; aylikMakineSaati: string; aciklama: string | null; donemBaslangic: string; donemBitis: string;
  kira: string; amortisman: string; dolayliPersonel: string | null; emilmeyenDogrudan: string | null; diger: string; projesizSatinAlma: string; elleEk: string; toplam: string; eksik: string[];
}
export const belgeSatiriEkle = (db: Db, g: BelgeSatiri, kisi: number) => db.tek<{ id: number }>(
  `INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, aciklama, olusturan_id,
     kaynak, donem_baslangic, donem_bitis, kira, amortisman, dolayli_personel, emilmeyen_dogrudan, diger, projesiz_satin_alma, elle_ek, eksik, personel_gizli)
   VALUES ($1, $2, $3, $4::numeric > 0, $5, $6, 'belge', $7, $8, $9, $4, $10, $15, $11, $12, $13, $14, $10::numeric IS NULL) RETURNING id`,
  [g.gecerlilikBaslangic, g.toplam, g.aylikMakineSaati, g.amortisman, g.aciklama, kisi, g.donemBaslangic, g.donemBitis,
    g.kira, g.dolayliPersonel, g.diger, g.projesizSatinAlma, g.elleEk, g.eksik.length === 0 ? null : g.eksik, g.emilmeyenDogrudan]);

export interface BelgeSiparisi { id: number; belgeNo: string | null; firmaId: number | null; talepId: string; teklifId: string; kdvHaricTutar: string; paraBirimi: string; iptal: boolean }
// 2642 b: siparişe bağlı gider belgeleri (siparişsiz ya da gelir belgesi dönmez). Kilitli okumada satırlar id sırasıyla FOR NO KEY
// UPDATE alınır (Mimar 2642 K1): aynı belgeye iki eşleme yazımı sıraya girer, ikisi birden "toplam <= belge tutarı" denetimini geçemez;
// eşleme tablosunun yabancı anahtarının KEY SHARE kilidiyle çakışmaz.
export const belgelerinSiparisleri = (db: Db, belgeIdler: readonly number[], kilit: boolean) => db.sorgu<BelgeSiparisi>(
  `SELECT b.id, b.belge_no AS "belgeNo", b.firma_id AS "firmaId", b.satin_alma_talep_id AS "talepId", b.satin_alma_teklif_id AS "teklifId", b.tutar::text AS "kdvHaricTutar",
          rtrim(b.para_birimi) AS "paraBirimi", (b.durum = 'iptal') AS iptal
     FROM finans_belge b
    WHERE b.id = ANY($1::int[]) AND b.yon = 'gider' AND b.satin_alma_talep_id IS NOT NULL
    ORDER BY b.id${kilit ? ' FOR NO KEY UPDATE OF b' : ''}`, [belgeIdler]);
