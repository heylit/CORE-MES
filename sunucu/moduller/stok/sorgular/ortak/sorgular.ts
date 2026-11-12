import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import { AYRILMIS_KONUM_TURLERI, KULLANILABILIR_KALITE, hareketinFisBagi } from '../../kurallar.ts';
import type { HareketYeni } from '../bakiye/sorgular.ts';

// Sabit tür adları; kullanıcı girdisi değildir.
export const AYRILMIS_SQL = AYRILMIS_KONUM_TURLERI.map((t) => `'${t}'`).join(', ');
export const KULLANILABILIR_SQL = `kalite_durumu IN (${KULLANILABILIR_KALITE.map((t) => `'${t}'`).join(', ')})`;

// Metin süzgeçleri Türkçe harfi dil ayarına bırakmaz (C.UTF-8'de 'IŞIK' ILIKE 'ışık' yanlıştır): sütun public.arama_sade'den geçer,
// desen paylasilan/kayit-aramasi.ts ile sadeleşir ve joker karakterleri kaçırılır. ILIKE yazılmaz.
export const S = (sutun: string): string => `public.arama_sade(${sutun})`;
export const icinde = (metin: string | undefined | null): string | null => (metin == null ? null : icindeDeseni(metin));
export const HAREKET_SECIMI = `SELECT h.id, ${zamanMetni('h.zaman')} AS zaman, h.tur, h.malzeme_id AS "malzemeId", h.parti_id AS "partiId",
  p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId",
  h.kaynak_konum_id AS "kaynakKonumId", h.hedef_konum_id AS "hedefKonumId", kk.kod AS "kaynakKonumKod", hk.kod AS "hedefKonumKod", h.miktar,
  h.onayli_eksi AS "onayliEksi", h.giris_kaynagi AS "girisKaynagi", h.cikis_nedeni AS "cikisNedeni", h.uretim_emri_id AS "uretimEmriId",
  h.geri_alinan_id AS "geriAlinanId", EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id) AS "geriAlindi",
  EXISTS (SELECT 1 FROM stok_mal_kabul_satiri s WHERE s.hareket_id = h.id OR s.fason_cikis_hareket_id = h.id) AS "malKabulSatiriMi", h.kisi_id AS "kisiId", h.aciklama,
  h.kaynak_statu_id AS "kaynakStatuId", h.hedef_statu_id AS "hedefStatuId", h.kaynak_kalite_durumu AS "kaynakKaliteDurumu",
  h.hedef_kalite_durumu AS "hedefKaliteDurumu", fs.fis_id AS "fisId", (SELECT f.no FROM stok_fis f WHERE f.id = fs.fis_id) AS "fisNo",
  hs.fis_id AS "hareketFisiId", (SELECT f.no FROM stok_hareket_fisi f WHERE f.id = hs.fis_id) AS "hareketFisiNo",
  (SELECT f.akis FROM stok_hareket_fisi f WHERE f.id = hs.fis_id) AS "akis",
  (SELECT m.no FROM stok_mal_kabul_satiri s JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id
    WHERE m.tur = 'baslangic' AND s.hareket_id IN (h.id, h.geri_alinan_id) LIMIT 1) AS "baslangicBelgeNo"`;
export const HAREKET_BAGLARI = `FROM stok_hareketi h LEFT JOIN stok_parti p ON p.id = h.parti_id LEFT JOIN stok_fis_satiri fs ON fs.hareket_id = h.id LEFT JOIN stok_hareket_fisi_satiri hs ON hs.hareket_id = h.id
  LEFT JOIN stok_konum kk ON kk.id = h.kaynak_konum_id LEFT JOIN stok_konum hk ON hk.id = h.hedef_konum_id`;
export const malzemeKaynagi = (ekKartlar = '') => `FROM (SELECT malzeme_id FROM stok_bakiye UNION SELECT malzeme_id FROM stok_malzeme_ayari${ekKartlar}) m
  LEFT JOIN stok_malzeme_ayari a ON a.malzeme_id = m.malzeme_id
  LEFT JOIN LATERAL (SELECT COALESCE(sum(b.miktar), 0) AS toplam, COALESCE(sum(b.miktar) FILTER (WHERE b.statu_id IS NULL AND b.${KULLANILABILIR_SQL}), 0) AS serbest,
      COALESCE(sum(b.miktar) FILTER (WHERE b.statu_id IS NOT NULL), 0) AS statude, count(DISTINCT b.konum_id)::int AS konumlar, bool_or(b.miktar < 0) AS eksi,
      bool_or(k.tur = 'kabul') AS kabulde, bool_or(b.statu_id IS NOT NULL AND b.miktar <> 0) AS statulu FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE b.malzeme_id = m.malzeme_id) t ON true`;
export const MALZEME_KAYNAGI = malzemeKaynagi();
export const MAL_KABUL_SECIMI = `SELECT m.id, m.no, m.tur, m.irsaliye_no AS "irsaliyeNo", ${zamanMetni('m.zaman')} AS zaman, m.kisi_id AS "kisiId",
  (SELECT count(*)::int FROM stok_mal_kabul_satiri s WHERE s.mal_kabul_id = m.id) AS "satirSayisi",
  (SELECT count(*)::int FROM stok_mal_kabul_satiri s WHERE s.mal_kabul_id = m.id AND s.logo_durumu = 'fark_var') AS "farkSayisi",
  m.duzeltilen_id AS "duzeltilenId", (SELECT d.id FROM stok_mal_kabul d WHERE d.duzeltilen_id = m.id) AS "duzeltenId",
  (SELECT count(DISTINCT s.malzeme_id)::int FROM stok_mal_kabul_satiri s WHERE s.mal_kabul_id = m.id) AS "malzemeSayisi"`;
// Bakiyenin hareket toplamına eşitliği (DEP-11): fark veren eksenler. Gece karşılaştırması (1692 a) aynı seçimi kaydeder.
export const DEFTER_FARKI_SECIMI = `WITH defter AS (
     SELECT malzeme_id, konum_id, parti_id, statu_id, kalite_durumu, sum(etki) AS toplam FROM (
       SELECT malzeme_id, hedef_konum_id AS konum_id, parti_id, hedef_statu_id AS statu_id, COALESCE(hedef_kalite_durumu, 'serbest') AS kalite_durumu, miktar AS etki
         FROM stok_hareketi WHERE hedef_konum_id IS NOT NULL
       UNION ALL SELECT malzeme_id, kaynak_konum_id, parti_id, kaynak_statu_id, COALESCE(kaynak_kalite_durumu, 'serbest'), -miktar FROM stok_hareketi WHERE kaynak_konum_id IS NOT NULL) x
     GROUP BY malzeme_id, konum_id, parti_id, statu_id, kalite_durumu)
   SELECT COALESCE(b.malzeme_id, d.malzeme_id) AS malzeme_id, COALESCE(b.konum_id, d.konum_id) AS konum_id, COALESCE(b.parti_id, d.parti_id) AS parti_id,
     COALESCE(b.statu_id, d.statu_id) AS statu_id, COALESCE(b.kalite_durumu, d.kalite_durumu) AS kalite_durumu,
     COALESCE(b.miktar, 0) AS bakiye, COALESCE(d.toplam, 0) AS defter
   FROM stok_bakiye b FULL JOIN defter d ON d.malzeme_id = b.malzeme_id AND d.konum_id = b.konum_id AND d.parti_id IS NOT DISTINCT FROM b.parti_id
     AND d.statu_id IS NOT DISTINCT FROM b.statu_id AND d.kalite_durumu = b.kalite_durumu
   WHERE COALESCE(b.miktar, 0) <> COALESCE(d.toplam, 0)`;
export const TESLIM_SECIMI = `SELECT t.id, t.no, t.kaynak_kimligi AS "kaynakKimligi", t.malzeme_id AS "malzemeId", t.miktar, t.parti_id AS "partiId", t.statu_id AS "statuId",
  t.kalite_durumu AS "kaliteDurumu", t.kaynak_konum_id AS "kaynakKonumId", t.hedef_konum_id AS "hedefKonumId", t.uretim_emri_id AS "uretimEmriId", t.istek_id AS "istekId", t.aciklama, t.durum,
  t.alinan, t.red_nedeni AS "redNedeni", t.hareket_id AS "hareketId", t.gonderen_kisi_id AS "gonderenKisiId", t.kapatan_kisi_id AS "kapatanKisiId", t.alici_kisi_id AS "aliciKisiId",
  ${zamanMetni('t.gonderim')} AS gonderim, ${zamanMetni('t.kapanis')} AS kapanis, t.surum, t.okutarak, ${zamanMetni('t.itiraz_sonu')} AS "itirazSonu",
  t.itiraz_nedeni AS "itirazNedeni", t.itiraz_kisi_id AS "itirazKisiId", ${zamanMetni('t.itiraz_zamani')} AS "itirazZamani", t.iade_teslim_id AS "iadeTeslimId" FROM stok_teslim t`;


// ---- Malzeme fişi (kart #492) ---------------------------------------------------------------------------------------------------------
// Fiş satırı değişince sayaç ve zaman ilerler; Logo giden kutusu zamanla süzer, sayaçla aynı değişikliği iki kez saymaz.
export const FIS_DEGISTI = 'degisiklik = f.degisiklik + 1, degisiklik_zamani = now()';
export async function malzemeFisineBagla(db: Db, hareketId: number, h: HareketYeni): Promise<void> {
  const bag = hareketinFisBagi(h);
  if (bag === null) return;
  if (bag.tur === 'geri_alma') {
    await db.sorgu(
      `WITH o AS (SELECT fis_id FROM stok_malzeme_fisi_hareketi WHERE hareket_id = $2),
         u AS (UPDATE stok_malzeme_fisi f SET ${FIS_DEGISTI} FROM o WHERE f.id = o.fis_id RETURNING f.id)
       INSERT INTO stok_malzeme_fisi_hareketi (hareket_id, fis_id) SELECT $1, id FROM u`, [hareketId, h.geriAlinanId]);
    return;
  }
  if ('uretimEmriId' in bag) {
    await db.sorgu(
      `WITH u AS (INSERT INTO stok_malzeme_fisi AS f (tur, uretim_emri_id, degisiklik) VALUES ($1, $2, 1)
         ON CONFLICT (uretim_emri_id, tur) WHERE uretim_emri_id IS NOT NULL DO UPDATE SET ${FIS_DEGISTI} RETURNING f.id)
       INSERT INTO stok_malzeme_fisi_hareketi (hareket_id, fis_id) SELECT $3, id FROM u`, [bag.tur, bag.uretimEmriId, hareketId]);
    return;
  }
  // Ambar fişi yalnız iki deponun Logo ambarı tanımlı ve farklıyken açılır; aynı ambarda taşıma Logo'yu ilgilendirmez.
  const ambar = bag.tur === 'ambar_adayi';
  await db.sorgu(
    `WITH u AS (INSERT INTO stok_malzeme_fisi AS f (tur, islem_kimligi, degisiklik)
         SELECT $1, pg_current_xact_id(), 1
          WHERE NOT $3::boolean OR EXISTS (
            SELECT 1 FROM stok_konum kk JOIN stok_depo kd ON kd.id = kk.depo_id, stok_konum hk JOIN stok_depo hd ON hd.id = hk.depo_id
             WHERE kk.id = $4 AND hk.id = $5 AND kd.logo_ambar_no IS NOT NULL AND hd.logo_ambar_no IS NOT NULL AND kd.logo_ambar_no <> hd.logo_ambar_no)
         ON CONFLICT (islem_kimligi, tur) WHERE islem_kimligi IS NOT NULL DO UPDATE SET ${FIS_DEGISTI} RETURNING f.id)
     INSERT INTO stok_malzeme_fisi_hareketi (hareket_id, fis_id) SELECT $2, id FROM u`,
    [ambar ? 'ambar' : bag.tur, hareketId, ambar, h.kaynakKonumId, h.hedefKonumId]);
}
