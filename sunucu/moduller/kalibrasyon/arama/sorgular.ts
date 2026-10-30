import type { Db } from '#cekirdek/db.ts';
import type { AletSatiri } from '../sorgular.ts';

export interface AletAramaSatiri extends AletSatiri {
  // Sertifika numarasından bulunduysa en yeni eşleşen kaydın numarası; alet kendi alanlarından bulunduysa null.
  sertifika_no: string | null;
}

// Sütun ve sorgu aynı işlevle sadeleşir (paylasilan/kayit-aramasi.ts); ifade göçteki trigram indeksleriyle birebir aynıdır
// (20261029135000), değişirse indeks kullanılmaz.
const S = (sutun: string) => `public.arama_sade(${sutun})`;
const ALET_UYAR = `${S('a.no')} LIKE $1 OR ${S('a.ad')} LIKE $1 OR ${S('a.yer')} LIKE $1 OR ${S('t.ad')} LIKE $1`;

// Metin aletin numarasında, adında, yerinde, türünde ya da bir kaydının sertifika numarasında geçer. Numarası tam tutan önce,
// sonra numarası metinle başlayan, sonra kullanımdakiler, sonra numaraya göre. Desenler sadeleşmiş ve kaçırılmış gelir.
export function aletAra(db: Db, d: { sade: string; icinde: string; bas: string; sinir: number }): Promise<AletAramaSatiri[]> {
  return db.sorgu<AletAramaSatiri>(
    `SELECT a.id, a.no, a.tur_id, t.ad AS tur, a.ad, a.olcme_araligi, a.yer, a.periyot_gun,
            a.kullanim_disi, a.kullanim_disi_nedeni, a.surum,
            (SELECT max(k.tarih) FROM kalibrasyon_kaydi k WHERE k.alet_id = a.id AND k.sonuc = 'uygun')::text AS son_uygun,
            current_date::text AS bugun,
            CASE WHEN ${ALET_UYAR} THEN NULL
                 ELSE (SELECT k.sertifika_no FROM kalibrasyon_kaydi k
                        WHERE k.alet_id = a.id AND ${S('k.sertifika_no')} LIKE $1 ORDER BY k.tarih DESC, k.id DESC LIMIT 1)
            END AS sertifika_no
       FROM olcu_aleti a JOIN olcu_aleti_turu t ON t.id = a.tur_id
      WHERE ${ALET_UYAR}
         OR a.id IN (SELECT k.alet_id FROM kalibrasyon_kaydi k WHERE ${S('k.sertifika_no')} LIKE $1)
      ORDER BY (${S('a.no')} = $2) DESC, (${S('a.no')} LIKE $3) DESC, a.kullanim_disi, a.no
      LIMIT $4`,
    [d.icinde, d.sade, d.bas, d.sinir],
  );
}
