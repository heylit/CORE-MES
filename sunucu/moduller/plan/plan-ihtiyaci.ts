import type { Db } from '#cekirdek/db.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { urunAgaci } from '../rota/disari.ts';
import { planIhtiyaclariniYaz } from '../satin-alma/disari.ts';
import { emirlerinNetSarfi, malzemeStokDurumlari } from '../stok/disari.ts';
import { emirDurumlari, emirlerinMalzemeIhtiyaci, emirNolari, isEmriPlanBilgileri } from '../uretim-emirleri/disari.ts';
import { acilacakUrunler, planIhtiyaclari, type PlanIhtiyaci } from './plan-ihtiyaci-kurallar.ts';
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
  const serbestOku = async (nolar: number[]) => [...(await malzemeStokDurumlari(db, nolar))].map(([no, s]) => [no, s.serbest] as const);
  const temel = {
    emirler: acik.map((id) => ({ id, no: nolar.get(id) ?? String(id) })),
    ihtiyaclar,
    sarflar: await emirlerinNetSarfi(db, acik),
    baslangiclar,
    kartlar: await malzemeOzetleri(db, malzemeler),
    serbest: new Map(await serbestOku(malzemeler)),
  };
  // 1542 a: stokla karşılanamayan yarı mamul ve mamul ürün ağacıyla açılır (ağaç bu miktarla okunur, birim başına çevrilir).
  const agaclar = new Map<number, Map<number, number>>();
  for (const [urun, miktar] of acilacakUrunler(temel)) {
    const a = await urunAgaci(db, urun, miktar);
    if (a !== null) agaclar.set(urun, new Map(a.toplamlar.map((t) => [t.malzeme.id, Number(t.miktar) / miktar])));
  }
  const alt = [...new Set([...agaclar.values()].flatMap((m) => [...m.keys()]))].filter((no) => !temel.kartlar.has(no));
  return planIhtiyaclari({
    ...temel,
    kartlar: new Map([...temel.kartlar, ...(await malzemeOzetleri(db, alt))]),
    serbest: new Map([...temel.serbest, ...(await serbestOku(alt))]),
    agaclar,
  });
}
// Canlıya almanın sonunda, aynı işlemde: liste her seferinde tamdır, plan artık istemiyorsa satın almadaki satır silinir.
export async function planIhtiyaclariniBildir(db: Db): Promise<void> {
  await planIhtiyaclariniYaz(db, await canliPlanIhtiyaclari(db));
}
export type { PlanIhtiyaci };
