import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, ornekDurum, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';

// 2559 a/3: Operasyonlar'daki "Kullanım: n adım" Süreler'i o operasyona süzülmüş açar; süzgeç ürünleri ve adım satırlarını daraltır. Veriler uydurmadır.
beforeEach(() => { try { window.localStorage.clear(); } catch { /* depo kapalı */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const adim = (id: string, seq: number, opId: string) => ({
  id, seq, opNo: seq, opId, name: 'Adım', stationId: null, machineId: null, kisiId: null, fasonId: null, terminGun: null, setup: 10, proc: 2, chg: null, cycle: 2,
  dep: 'bagimli' as const, depQty: null, rejectPct: 0, split: 'tek' as const, minLot: null, resetup: true, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
});
function durum(): DurumCevabi {
  const d = ornekDurum();
  d.opdefs = [
    { id: '21', code: 'TOR', abbr: 'T', name: 'Tornalama', group: 'talasli', groupName: 'Talaşlı', stationId: null, setup: 30, cycle: 5, aktif: true },
    { id: '22', code: 'FRZ', abbr: 'F', name: 'Frezeleme', group: 'talasli', groupName: 'Talaşlı', stationId: null, setup: 20, cycle: 4, aktif: true },
  ];
  d.items = [...(d.items ?? []), { id: '13', kayitNo: 13, code: 'MM-0013', name: 'Örnek flanş', type: 'mamul', unit: 'adet', cost: null, stock: null, min: null,
    aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }];
  const r11 = { base: null, steps: [adim('a', 10, '21'), adim('b', 20, '22')] };
  const r13 = { base: null, steps: [adim('c', 10, '22')] };
  d.routes = { 11: r11, 13: r13 };
  d.routeRevs = [
    { id: '7', itemId: '11', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: r11 },
    { id: '8', itemId: '13', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: r13 },
  ];
  return d;
}
const satir = (adimId: number, opNo: number, opId: number, kod: string) => ({
  adimId, opNo, sira: opNo / 10, ad: kod, operasyonTipi: { id: opId, kod, ad: kod }, kaynak: null,
  teorik: { hazirlikDk: '10', islemDk: '2', degisimDk: null, degisimOraniYuzde: null },
  sonKayit: { hazirlik: null, islem: null, degisim: null }, olcum: { hazirlik: null, islem: null, degisim: null },
  etkin: { hazirlikDk: '10', birimSureDk: '2', islemDk: '2', degisimDk: '0', degisimOraniYuzde: null }, fason: false,
});
const sureler = (rev: number, malzemeId: number, adimlar: SurelerCevabi['adimlar']): SurelerCevabi => ({
  revizyon: { id: rev, harf: 'A', durum: 'yururlukte', malzemeId }, makineId: null, adimlar,
});
const kur = () => sunucuKur(YONETICI, {
  durum: durum(),
  yazmalar: {
    'GET /rota/revizyonlar/7/sureler': () => json(200, sureler(7, 11, [satir(41, 10, 21, 'TOR'), satir(42, 20, 22, 'FRZ')])),
    'GET /rota/revizyonlar/8/sureler': () => json(200, sureler(8, 13, [satir(43, 10, 22, 'FRZ')])),
  },
});

describe('2559 Süreler operasyon süzgeci', () => {
  it('Operasyonlar\'dan gelince yalnız o operasyonu kullanan ürün ve adım satırı görünür; "Tüm operasyonlar" hepsini geri getirir', async () => {
    kur();
    rrAc('/recete-rota/ops');
    const ops = await screen.findByRole('region', { name: 'Operasyonlar' });
    fireEvent.click(await within(ops).findByRole('button', { name: '1 adım' }));
    const bolge = await screen.findByRole('region', { name: 'Süreler' });
    const tablo = await within(bolge).findByRole('table', { name: 'Süreler' });
    await within(tablo).findByRole('row', { name: 'MM-0001 OP 10 süreleri' });
    expect(within(tablo).queryByRole('row', { name: 'MM-0001 OP 20 süreleri' })).toBeNull();
    expect(within(tablo).queryByRole('rowgroup', { name: 'MM-0013 Örnek flanş' })).toBeNull();
    fireEvent.change(within(bolge).getByRole('combobox', { name: 'Operasyon' }), { target: { value: '' } });
    await within(tablo).findByRole('row', { name: 'MM-0001 OP 20 süreleri' });
    await within(tablo).findByRole('row', { name: 'MM-0013 OP 10 süreleri' });
  });

  it('Süreler\'de elle seçilen operasyon iki ürünün o adımlarını gösterir', async () => {
    kur();
    rrAc('/recete-rota/sureler');
    const bolge = await screen.findByRole('region', { name: 'Süreler' });
    fireEvent.change(await within(bolge).findByRole('combobox', { name: 'Operasyon' }), { target: { value: '22' } });
    const tablo = within(bolge).getByRole('table', { name: 'Süreler' });
    await within(tablo).findByRole('row', { name: 'MM-0001 OP 20 süreleri' });
    await within(tablo).findByRole('row', { name: 'MM-0013 OP 10 süreleri' });
    expect(within(tablo).queryByRole('row', { name: 'MM-0001 OP 10 süreleri' })).toBeNull();
  });
});
