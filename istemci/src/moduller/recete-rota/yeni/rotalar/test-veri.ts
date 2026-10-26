import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { ornekDurum } from '../test-ortak.tsx';

// R1 testlerinin uydurma durumu: örnek mamulün (11) yürürlükteki Rev A rotası tek adım (OP 10 Tornalama, giren ham madde 12).
type RotaAdimi = NonNullable<DurumCevabi['routeRevs']>[number]['data']['steps'][number];
type RotaRevizyonu = NonNullable<DurumCevabi['routeRevs']>[number];

export const adimOrnegi = (ek: Partial<RotaAdimi> = {}): RotaAdimi => ({
  id: 'o10', seq: 10, opNo: 10, opId: '21', name: 'Tornalama', stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 30, proc: 5, chg: null, cycle: 5, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: true,
  alts: [], altTimes: {}, digerAdaylar: [], ins: [{ itemId: '12', qty: 2, scrap: 0 }], outs: [], ...ek,
});

export const revizyonOrnegi = (id: string, no: string, status: RotaRevizyonu['status'], surum: number, steps: RotaAdimi[] = [adimOrnegi()]): RotaRevizyonu => ({
  id, itemId: '11', no, status, surum, note: '', created: Date.UTC(2026, 9, 1) + Number(id), approvedAt: status === 'yururlukte' ? Date.UTC(2026, 9, 2) : null,
  data: { base: null, steps },
});

export function rotaDurumu(revler: RotaRevizyonu[] = [revizyonOrnegi('71', 'A', 'yururlukte', 3)]): DurumCevabi {
  const d = ornekDurum();
  const yururlukte = revler.find((r) => r.status === 'yururlukte');
  return {
    ...d,
    items: [...(d.items ?? []), { id: '12', kayitNo: 12, code: 'HM-0012', name: 'Örnek çubuk', type: 'ham', unit: 'kg', cost: null, stock: null, min: null,
      aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }],
    routes: yururlukte ? { 11: yururlukte.data } : {},
    routeRevs: revler,
  };
}
