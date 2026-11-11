import type { Db } from '#cekirdek/db.ts';

export interface ParametreSatiri { sgkIsverenOrani: string | null; issizlikIsverenOrani: string | null; sgkTavani: string | null; aylikSaat: string | null }
// Ayın parametre dönemi: başlangıcı ay başından önce ya da ona eşit olan en son dönem.
export function ayinParametreleri(db: Db, ayBasi: string): Promise<ParametreSatiri | null> {
  return db.tek<ParametreSatiri>(
    `SELECT sgk_isveren_orani::text AS "sgkIsverenOrani", issizlik_isveren_orani::text AS "issizlikIsverenOrani", sgk_tavani::text AS "sgkTavani", aylik_saat::text AS "aylikSaat"
       FROM ik_parametre_donemi WHERE baslangic <= $1::date ORDER BY baslangic DESC LIMIT 1`, [ayBasi]);
}

export interface PersonelGirdisi {
  personelNo: number; kisiId: number | null; departmanNo: number; departmanAd: string; brut: string | null; saat: string;
  bordroMaliyeti: string | null; bordroMesaiSaati: string | null; bordroTatilSaati: string | null; bordroGun: string | null;
}
// Departmanı olan, iptal edilmemiş her personel: ay sonunda yürürlükteki brüt (ücret geçmişinde yoksa karttaki brüt) ve ayın puantajında
// "çalıştı" günlerinin süresi (saat). Gece yarısını geçen vardiya 24 saat eklenerek sayılır; çıkışı girilmemiş gün sayılmaz. Ayın
// kesinleşmiş, iptal edilmemiş bordrosu varsa işveren maliyeti, prim günü, fazla mesai ve resmi tatil
// çalışma saati de gelir (2632 a). Kişi ve ay başına tek etkin bordro vardır (ik_bordro_ayda_tek).
export function personelGirdileri(db: Db, ayBasi: string, aySonu: string): Promise<PersonelGirdisi[]> {
  return db.sorgu<PersonelGirdisi>(
    `WITH s AS (
       SELECT t.personel_no,
              sum(extract(epoch FROM CASE WHEN t.cikis > t.giris THEN t.cikis - t.giris ELSE t.cikis - t.giris + interval '24 hours' END)) / 3600 AS saat
         FROM ik_puantaj t
        WHERE t.durum = 'calisti' AND t.cikis IS NOT NULL AND t.tarih BETWEEN $1::date AND $2::date
        GROUP BY t.personel_no)
     SELECT p.no AS "personelNo", p.kisi_id AS "kisiId", d.no AS "departmanNo", d.ad AS "departmanAd",
            COALESCE((SELECT u.brut FROM ik_personel_ucret u WHERE u.personel_no = p.no AND u.yururluk <= $2::date
                       ORDER BY u.yururluk DESC, u.sira DESC LIMIT 1), p.brut_maas)::text AS brut,
            COALESCE(s.saat, 0)::text AS saat,
            b.maliyet::text AS "bordroMaliyeti", b.mesai_saat::text AS "bordroMesaiSaati",
            b.tatil_saat::text AS "bordroTatilSaati", b.gun::text AS "bordroGun"
       FROM ik_personel p
       JOIN ik_departman d ON d.no = p.departman_no AND NOT d.iptal
       LEFT JOIN s ON s.personel_no = p.no
       LEFT JOIN LATERAL (
         SELECT x.maliyet, x.mesai_saat, x.tatil_saat, x.gun FROM ik_bordro x
          WHERE x.personel_no = p.no AND x.donem = $1::date AND NOT x.iptal AND x.kesinlesme IS NOT NULL AND x.maliyet IS NOT NULL
          ORDER BY x.no DESC LIMIT 1) b ON true
      WHERE NOT p.iptal
      ORDER BY d.no, p.no`, [ayBasi, aySonu]);
}

export interface KapsamSatiri {
  personelNo: number; kisiId: number | null; departmanNo: number | null; departmanAd: string | null; departmanIptal: boolean | null;
  dogrudan: boolean | null; brut: string | null; iseGiris: string | null; cikis: string | null; bordroMaliyeti: string | null;
}
// 2647 a, 2659: ay içinde kayıtlı (işe giriş ay sonundan sonra değil, çıkış ay başından önce değil), iptal edilmemiş her personel;
// departmanı olmayan ya da iptal departmandaki kişi de gelir (bilinmezlik için). Brüt personelGirdileri ile aynı seçimdir; ayın kesinleşmiş,
// iptal edilmemiş bordrosu varsa işveren maliyeti de gelir.
export function personelKapsami(db: Db, ayBasi: string, aySonu: string): Promise<KapsamSatiri[]> {
  return db.sorgu<KapsamSatiri>(
    `SELECT p.no AS "personelNo", p.kisi_id AS "kisiId", d.no AS "departmanNo", d.ad AS "departmanAd", d.iptal AS "departmanIptal",
            d.dogrudan_iscilik AS dogrudan,
            COALESCE((SELECT u.brut FROM ik_personel_ucret u WHERE u.personel_no = p.no AND u.yururluk <= $2::date
                       ORDER BY u.yururluk DESC, u.sira DESC LIMIT 1), p.brut_maas)::text AS brut,
            p.ise_giris::text AS "iseGiris", p.cikis_tarihi::text AS cikis,
            (SELECT x.maliyet FROM ik_bordro x
              WHERE x.personel_no = p.no AND x.donem = $1::date AND NOT x.iptal AND x.kesinlesme IS NOT NULL AND x.maliyet IS NOT NULL
              ORDER BY x.no DESC LIMIT 1)::text AS "bordroMaliyeti"
       FROM ik_personel p
       LEFT JOIN ik_departman d ON d.no = p.departman_no
      WHERE NOT p.iptal AND (p.ise_giris IS NULL OR p.ise_giris <= $2::date) AND (p.cikis_tarihi IS NULL OR p.cikis_tarihi >= $1::date)
      ORDER BY p.no`, [ayBasi, aySonu]);
}
