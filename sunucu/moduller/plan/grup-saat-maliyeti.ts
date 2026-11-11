import type { Db } from '#cekirdek/db.ts';
import type { GrupSaatMaliyetleriCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { grupSaatMaliyetleri as ikGrupSaatMaliyetleri } from '../ik/disari.ts';
import { grupSaatEkrani, varsayilanMaliyetAyi } from './kurallar.ts';

// 2618 (2602-a): planlamanın mesai ve maliyet görünümü kişi ücreti yerine departman değerini okur. Kaynak yalnız İK'nın ekrana gidebilen
// işlevidir; hesap içi işlev (küçük grupta gerçek değer) burada kullanılmaz. Yetkiyi uç denetler.
// 2626 1/2 b: her zaman son tam ay; ay seçilmez (ardışık ayların karşılaştırılması da böylece kapanır).
export async function grupSaatMaliyetleri(db: Db, an: Date = new Date()): Promise<GrupSaatMaliyetleriCevabi> {
  const secilen = varsayilanMaliyetAyi(tesisGunu(an));
  return { ay: secilen, gruplar: grupSaatEkrani((await ikGrupSaatMaliyetleri(db, secilen)).values()) };
}
