import type { Db } from '#cekirdek/db.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { emirlerinNetSarfi, malzemeStokDurumlari } from '../stok/disari.ts';
import { emirDurumlari, emirlerinMalzemeIhtiyaci, emirNolari, isEmriPlanBilgileri } from '../uretim-emirleri/disari.ts';
import { planIhtiyaclari, type PlanIhtiyaci } from './plan-ihtiyaci-kurallar.ts';
import { yerlesimler } from './sorgular.ts';

// 898 a, 902 a: canlı planın malzeme eksiği. Okumalar sunucunun içindendir (eksik-stok.ts gibi): canlıya alanın stok ya da malzeme okuma
// yetkisi olmasa da hesap aynıdır. Deneme işleri (eksi kimlik) canlıda yoktur.
export async function canliPlanIhtiyaclari(db: Db): Promise<PlanIhtiyaci[]> {
  const yerler = (await yerlesimler(db, null)).filter((y) => y.isEmriId >= 0);
  const bilgi = await isEmriPlanBilgileri(db, yerler.map((y) => y.isEmriId));
  const baslangiclar = new Map<string, number>();
  for (const y of yerler) {
    const b = bilgi.get(y.isEmriId);
    if (!b) continue;
    const k = `${b.uretimEmriId}:${b.opNo}`;
    baslangiclar.set(k, Math.min(baslangiclar.get(k) ?? Infinity, y.baslangic.getTime()));
  }
  const durumlar = await emirDurumlari(db, [...new Set([...bilgi.values()].map((b) => b.uretimEmriId))]);
  const acik = [...durumlar].filter(([, d]) => (ACIK_EMIR_DURUMLARI as readonly string[]).includes(d)).map(([id]) => id);
  if (acik.length === 0) return [];
  const nolar = await emirNolari(db, acik);
  const ihtiyaclar = await emirlerinMalzemeIhtiyaci(db, acik);
  const malzemeler = [...new Set([...ihtiyaclar.values()].flatMap((l) => (l ?? []).map((m) => m.malzemeNo)))];
  const stok = await malzemeStokDurumlari(db, malzemeler);
  return planIhtiyaclari({
    emirler: acik.map((id) => ({ id, no: nolar.get(id) ?? String(id) })),
    ihtiyaclar,
    sarflar: await emirlerinNetSarfi(db, acik),
    baslangiclar,
    kartlar: await malzemeOzetleri(db, malzemeler),
    serbest: new Map([...stok].map(([no, s]) => [no, s.serbest])),
  });
}
export type { PlanIhtiyaci };
