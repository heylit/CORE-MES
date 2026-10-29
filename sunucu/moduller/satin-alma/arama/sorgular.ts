import type { Db } from '#cekirdek/db.ts';
import type { TalepDurumu } from '#paylasilan/sozlesme/satin-alma.ts';

export interface TalepAramaSatiri {
  id: string;
  no: string;
  baslik: string;
  durum: TalepDurumu;
}

export interface AlimAramaSatiri {
  id: number;
  talepId: string;
  // TMI numarası (SP-yıl-sıra); numarasız eski siparişte yalnız elle girilen Logo/tedarikçi numarası vardır.
  no: string | null;
  siparisNo: string;
  firmaId: number | null;
  tedarikciAdi: string;
  talepNo: string;
}

// Desenler çekirdekte sadeleşmiş ve kaçırılmış gelir (KayitAramaIstegi). Sütun da aynı işlevden geçer: Türkçe harf eşlemesi
// veritabanının dil ayarına bırakılmaz (1233). Trigram ifade dizini 20261029129000'dedir.
interface Desen { sade: string; icindeDeseni: string; basDeseni: string; sinir: number }
const S = (sutun: string): string => `public.arama_sade(${sutun})`;

// Metin talep no'da, başlıkta ya da bir kalemin adında geçer. kisiId verilirse yalnız o kişinin açtığı ya da adına
// açılan talepler (talepSatirlariOku ile aynı süzgeç).
export function talepAra(db: Db, d: Desen, kisiId: number | null): Promise<TalepAramaSatiri[]> {
  return db.sorgu<TalepAramaSatiri>(
    `SELECT t.id, t.no, t.baslik, t.durum FROM satin_alma_talep t
      WHERE ($4::int IS NULL OR t.acan_kisi_id = $4 OR t.talep_eden_kisi_id = $4)
        AND (${S('t.no')} LIKE $1 OR ${S('t.baslik')} LIKE $1
          OR EXISTS (SELECT 1 FROM satin_alma_talep_kalemi k WHERE k.talep_id = t.id AND ${S('k.ad')} LIKE $1))
      ORDER BY (${S('t.no')} = $2) DESC, (${S('t.no')} LIKE $3) DESC, t.olusturma DESC, t.sayi_id DESC LIMIT $5`,
    [d.icindeDeseni, d.sade, d.basDeseni, kisiId, d.sinir],
  );
}

// Metin TMI sipariş no'sunda ya da elle girilen Logo/tedarikçi numarasında geçer.
export function alimAra(db: Db, d: Desen): Promise<AlimAramaSatiri[]> {
  return db.sorgu<AlimAramaSatiri>(
    `SELECT s.id, s.talep_id AS "talepId", s.no, s.siparis_no AS "siparisNo", tk.firma_id AS "firmaId", tk.tedarikci_adi AS "tedarikciAdi", t.no AS "talepNo"
       FROM satin_alma_siparis s
       JOIN satin_alma_teklif tk ON tk.talep_id = s.talep_id AND tk.id = s.teklif_id
       JOIN satin_alma_talep t ON t.id = s.talep_id
      WHERE ${S('s.no')} LIKE $1 OR ${S('s.siparis_no')} LIKE $1
      ORDER BY (${S('s.no')} = $2 OR ${S('s.siparis_no')} = $2) DESC, (${S('s.no')} LIKE $3 OR ${S('s.siparis_no')} LIKE $3) DESC, s.id DESC LIMIT $4`,
    [d.icindeDeseni, d.sade, d.basDeseni, d.sinir],
  );
}
