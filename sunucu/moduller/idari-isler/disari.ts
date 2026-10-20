import type { Db } from '#cekirdek/db.ts';
import type { DemirbasTuru } from '#paylasilan/sozlesme/idari-isler.ts';
import { demirbasNo } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

export interface AcikZimmet {
  demirbasId: number;
  demirbasNo: string;
  tur: DemirbasTuru;
  markaModel: string | null;
  seriNo: string | null;
  verilis: string | null;
}

// 244 a (İK işten çıkış uyarısı IK-74 ve kişi sayfası): kişilerin iade edilmemiş zimmetleri, kisi.id ile. Zimmeti olmayan kişi haritada
// yoktur. Kişiye bağlanmamış (İK'dan kişisiz taşınmış) zimmet burada görünmez; İdari İşler ekranında "kişiye bağlanmamış" uyarısıyla
// bağlanır. Yetki ve kapsam çağıranın ucundadır.
export async function kisilerinAcikZimmetleri(db: Db, kisiIdleri: number[]): Promise<Map<number, AcikZimmet[]>> {
  const benzersiz = [...new Set(kisiIdleri)];
  const harita = new Map<number, AcikZimmet[]>();
  if (benzersiz.length === 0) return harita;
  for (const s of await sorgular.kisilerinAcikZimmetleri(db, benzersiz)) {
    const liste = harita.get(s.kisi_id) ?? [];
    liste.push({ demirbasId: s.demirbas_id, demirbasNo: demirbasNo(s.demirbas_id), tur: s.tur, markaModel: s.marka_model, seriNo: s.seri_no, verilis: s.verilis });
    harita.set(s.kisi_id, liste);
  }
  return harita;
}
