import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { KaliteDurumu } from '#paylasilan/sozlesme/stok.ts';

// Etiket Merkezi'nin bekleyen etiket listesi (2223-1 a) bu iki okumadan türetilir; stok kendi kaydetme akışında etiketi bilmez.
// Liste kısa bir zaman aralığına bakar ve en çok EN_COK satır döner: eski kayıt bekleyen sayılmaz.
const EN_COK = 500;

export interface EtiketMalKabulu { malKabulId: number; no: string; irsaliyeNo: string | null; zaman: string; partiIdler: number[] }

// Lotu olan satırlar; düzeltme kabulü de kendi lotlarını açtığı için listeye girer.
export const etiketMalKabulleri = (db: Db, baslangic: string): Promise<EtiketMalKabulu[]> => db.sorgu(
  `SELECT mk.id AS "malKabulId", mk.no, mk.irsaliye_no AS "irsaliyeNo", ${zamanMetni('mk.zaman')} AS zaman,
          array_agg(s.parti_id::int ORDER BY s.sira) AS "partiIdler"
     FROM stok_mal_kabul mk JOIN stok_mal_kabul_satiri s ON s.mal_kabul_id = mk.id
    WHERE mk.zaman >= $1::timestamptz AND s.parti_id IS NOT NULL
    GROUP BY mk.id ORDER BY mk.zaman DESC, mk.id DESC LIMIT ${String(EN_COK)}`, [baslangic]);

export interface EtiketKaliteDegisimi {
  bakiyeId: number; lotNo: string; malzemeId: number; konumKod: string; miktar: string; kaliteDurumu: KaliteDurumu; degisim: string;
}

// Kalite durumunu değiştiren yer içi hareket (karantina, karar, şartlı, red, serbest bırakma) ve onun vardığı dolu bakiye satırı.
// Girişte kabulde basılmaz (897 b): yalnız iki konumlu (kaynaklı) hareket sayılır. Aynı durumda yer değiştirme sayılmaz.
export const etiketKaliteDegisimleri = (db: Db, baslangic: string): Promise<EtiketKaliteDegisimi[]> => db.sorgu(
  `WITH d AS (
     SELECT h.parti_id, h.hedef_konum_id, coalesce(h.hedef_kalite_durumu, 'serbest') AS kalite, max(h.zaman) AS z
       FROM stok_hareketi h
      WHERE h.zaman >= $1::timestamptz AND h.parti_id IS NOT NULL AND h.kaynak_konum_id IS NOT NULL AND h.hedef_konum_id IS NOT NULL
        AND coalesce(h.hedef_kalite_durumu, 'serbest') <> coalesce(h.kaynak_kalite_durumu, 'serbest')
      GROUP BY 1, 2, 3
   )
   SELECT b.id::int AS "bakiyeId", p.lot_no AS "lotNo", b.malzeme_id AS "malzemeId", k.kod AS "konumKod", b.miktar::text AS miktar,
          b.kalite_durumu AS "kaliteDurumu", ${zamanMetni('d.z')} AS degisim
     FROM d JOIN stok_bakiye b ON b.parti_id = d.parti_id AND b.konum_id = d.hedef_konum_id AND b.kalite_durumu = d.kalite
     JOIN stok_parti p ON p.id = b.parti_id JOIN stok_konum k ON k.id = b.konum_id
    WHERE b.miktar > 0
    ORDER BY d.z DESC, b.id DESC LIMIT ${String(EN_COK)}`, [baslangic]);
