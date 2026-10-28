import { bulunamadi } from '#cekirdek/hata.ts';
import type { Db } from '#cekirdek/db.ts';
import type { ProjePlaniCevabi } from '#paylasilan/sozlesme/plan.ts';
import { projeGetir } from '../projeler/disari.ts';
import { projeninIsEmirleri } from '../uretim-emirleri/disari.ts';
import { projePlanOzeti } from './proje-plani-kurallar.ts';
import { planSapmalari } from './sapma.ts';

// 933 a: projenin plan ve gerçekleşeni, salt okunur. Ölçüler plan sapmasındakiyle aynıdır (tek hesap); iş emirleri iptal hariç.
export async function projePlani(db: Db, projeId: number, simdi?: number): Promise<ProjePlaniCevabi> {
  if ((await projeGetir(db, projeId)) === null) throw bulunamadi('Proje bulunamadı.');
  const emirler = (await projeninIsEmirleri(db, projeId)).sort((a, b) => a.emirNo.localeCompare(b.emirNo, 'tr') || a.opNo - b.opNo);
  const sapmalar = await planSapmalari(db, { isEmriIdleri: emirler.map((e) => e.isEmriId), simdi });
  const aralik = (p: { baslangic: string; bitis: string } | null) => (p === null ? null : { baslangic: p.baslangic, bitis: p.bitis });
  const isler = emirler.map((e) => {
    const s = sapmalar.get(e.isEmriId);
    return {
      isEmriId: e.isEmriId, uretimEmriId: e.uretimEmriId, emirNo: e.emirNo, opNo: e.opNo, istasyonAd: e.istasyonAd, durum: e.durum,
      taban: aralik(s?.taban ?? null), canli: aralik(s?.canli ?? null),
      gercekBaslama: s?.gercekBaslama ?? null, gercekBitis: s?.gercekBitis ?? e.bitis, tahminiBitis: s?.tahminiBitis ?? null,
      bitisKaymasiDk: s?.bitisKaymasiDk ?? null, tabanBitisKaymasiDk: s?.tabanBitisKaymasiDk ?? null,
    };
  });
  return { ozet: projePlanOzeti(isler), isler };
}
