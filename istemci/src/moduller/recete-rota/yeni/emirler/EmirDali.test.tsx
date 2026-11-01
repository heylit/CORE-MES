import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { OKUYAN, ornekDurum, rrAc, sunucuKur } from '../test-ortak.tsx';
import { adimDugumu, altDugumAdimlari } from './kurallar.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 1476-F C (kart 1539, karar 1553 a): çok katmanlı emrin alt parça adımı dal etiketi, parça kodu ve rotadaki op numarasıyla görünür.
type RotaAdimi = NonNullable<ReturnType<typeof ornekDurum>['routes']>[string]['steps'][number];
const rotaAdimi = (opNo: number, name: string): RotaAdimi => ({
  id: `o${String(opNo)}`, seq: opNo, opNo, opId: '21', name, stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 30, proc: null,
  chg: null, cycle: 5, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
});
// Kök 11 (rotası OP 10), alt parça 13 (rotası OP 20; emirde OP 1010, dal K1).
function durumKur(cokKatmanli: boolean) {
  const d = ornekDurum();
  d.items = [...(d.items ?? []), { ...d.items![0]!, id: '13', kayitNo: 13, code: 'YM-0013', name: 'Örnek burç', type: 'yari' }];
  d.routes = { 11: { base: null, steps: [rotaAdimi(10, 'Montaj')] }, 13: { base: null, steps: [rotaAdimi(20, 'Alt torna')] } };
  if (cokKatmanli) {
    d.emirler!.orders[0] = {
      ...d.emirler!.orders[0]!,
      dugumler: [{ dugum: '0.1', itemId: '13', carpan: 2, birim: 2, ust: '0', ustOpNo: 10, adimlar: [{ opNo: 1010, kaynakOpNo: 20, durum: 'calisiyor' }] }],
    };
  }
  return d;
}
const cokKatmanliDurum = () => durumKur(true);

describe('1476-F C adım düğümü', () => {
  it('alt düğüm adımı dal adı ve rotadaki numarayla döner; kök adımı ve tek katmanlı emir null', () => {
    const e = cokKatmanliDurum().emirler!.orders[0]!;
    expect(adimDugumu(e, 1010)).toEqual({ dal: 'K1', itemId: '13', kaynakOpNo: 20 });
    expect(altDugumAdimlari(cokKatmanliDurum(), e).map((a) => [a.opNo, a.ad, a.durum])).toEqual([[1010, 'Alt torna', 'calisiyor']]);
    expect(adimDugumu(e, 10)).toBeNull();
    expect(adimDugumu({ dugumler: undefined }, 10)).toBeNull();
  });
});

describe('1476-F C emir ayrıntısında dal', () => {
  it('çok katmanlı emirde alt parça adımı dal etiketi ve parça koduyla, kök adımı etiketsiz görünür', async () => {
    sunucuKur(OKUYAN, { durum: cokKatmanliDurum() });
    rrAc();
    const b = await screen.findByRole('region', { name: 'Üretim emirleri' });
    fireEvent.click(await within(b).findByRole('button', { name: /UE-0001/ }));
    const liste = await within(b).findByRole('list', { name: 'UE-0001 operasyonları' });
    const satirlar = within(liste).getAllByRole('listitem');
    expect(within(satirlar[0]!).getByText('K1')).toBeTruthy();
    expect(satirlar[0]!.textContent).toContain('YM-0013 · rotada OP 20');
    expect(satirlar[0]!.textContent).toContain('1010');
    expect(satirlar[1]!.textContent).toContain('10');
    expect(within(satirlar[1]!).queryByText(/^K\d/)).toBeNull();
    expect(satirlar[1]!.textContent).not.toContain('rotada OP');
  });

  it('tek katmanlı emirde liste bugünkü gibidir', async () => {
    sunucuKur(OKUYAN, { durum: durumKur(false) });
    rrAc();
    const b = await screen.findByRole('region', { name: 'Üretim emirleri' });
    fireEvent.click(await within(b).findByRole('button', { name: /UE-0001/ }));
    const liste = await within(b).findByRole('list', { name: 'UE-0001 operasyonları' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1);
    expect(liste.textContent).not.toContain('rotada OP');
  });
});
