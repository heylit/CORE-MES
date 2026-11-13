import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, ornekDurum, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';

// 2564 a: Gerçekleşen hücresinde ortanca, ölçüm sayısı ve aralık; Kabul et ortancayı ister; hücrede sapma %; süzgeçler; plan sütunu yalnız
// plan teorikten farklıysa. Veriler uydurmadır.
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
const satir = (adimId: number, opNo: number, opId: number, kod: string, ek: Partial<SurelerCevabi['adimlar'][number]> = {}) => ({
  adimId, opNo, sira: opNo / 10, ad: kod, operasyonTipi: { id: opId, kod, ad: kod }, kaynak: null,
  teorik: { hazirlikDk: '10', islemDk: '2', degisimDk: null, degisimOraniYuzde: null },
  sonKayit: { hazirlik: null, islem: null, degisim: null }, olcum: { hazirlik: null, islem: null, degisim: null },
  ozet: { hazirlik: null, islem: null, degisim: null },
  etkin: { hazirlikDk: '10', birimSureDk: '2', islemDk: '2', degisimDk: '0', degisimOraniYuzde: null }, fason: false, ...ek,
});
const sureler = (rev: number, malzemeId: number, adimlar: SurelerCevabi['adimlar']): SurelerCevabi => ({
  revizyon: { id: rev, harf: 'A', durum: 'yururlukte', malzemeId }, makineId: null, adimlar,
});
const OLCUM = { id: 90, sureDk: '2.6', kaynak: 'terminal' as const, isEmriId: 5, makineId: 3, yazan: { id: 1, ad: 'Deneme' }, zaman: '2026-11-09T08:00:00.000Z' };
// MM-0001 OP 10: işlem ölçümü 5 kez, ortanca 2,6 (teorik 2 → +%30, eşik üstü); OP 20: tek ölçüm 2,1 (+%5). MM-0013: ölçüm yok, plan farklı.
const kur = (kisi = YONETICI) => sunucuKur(kisi, {
  durum: durum(),
  yazmalar: {
    'GET /rota/revizyonlar/7/sureler': () => json(200, sureler(7, 11, [
      satir(41, 10, 21, 'TOR', {
        sonKayit: { hazirlik: null, islem: 90, degisim: null }, olcum: { hazirlik: null, islem: OLCUM, degisim: null },
        ozet: { hazirlik: null, islem: { n: 5, ortancaDk: '2.6', enAzDk: '2.4', enCokDk: '3.1' }, degisim: null },
      }),
      satir(42, 20, 22, 'FRZ', {
        sonKayit: { hazirlik: null, islem: 91, degisim: null }, olcum: { hazirlik: null, islem: { ...OLCUM, id: 91, sureDk: '2.1', kaynak: 'elle' }, degisim: null },
        ozet: { hazirlik: null, islem: { n: 1, ortancaDk: '2.1', enAzDk: '2.1', enCokDk: '2.1' }, degisim: null },
      }),
    ])),
    'GET /rota/revizyonlar/8/sureler': () => json(200, sureler(8, 13, [
      satir(43, 10, 22, 'FRZ', { etkin: { hazirlikDk: '15', birimSureDk: '2', islemDk: '2', degisimDk: null, degisimOraniYuzde: null } }),
    ])),
    'POST /rota/adimlar/41/gerceklesen-sure/kabul': () => json(200, { taslak: { id: 9, durum: 'taslak', surum: 2 }, sureler: sureler(7, 11, []), uyari: null }),
  },
});

async function ac(kisi = YONETICI) {
  const istekler = kur(kisi);
  rrAc('/recete-rota/sureler');
  const bolge = await screen.findByRole('region', { name: 'Süreler' });
  const tablo = await within(bolge).findByRole('table', { name: 'Süreler' });
  await within(tablo).findByRole('row', { name: 'MM-0001 OP 10 süreleri' });
  await within(tablo).findByRole('row', { name: 'MM-0013 OP 10 süreleri' });
  return { istekler, bolge, tablo };
}

describe('2564 a Süreler ölçüm özeti', () => {
  it('hücre ortancayı virgülle, n ve aralığı, sapma yüzdesini gösterir; tek ölçümde az ölçüm uyarısı vardır', async () => {
    const { tablo } = await ac();
    const op10 = within(tablo).getByRole('row', { name: 'MM-0001 OP 10 süreleri' });
    expect(within(op10).getByRole('textbox', { name: 'Gerçekleşen işlem dakika, MM-0001 OP 10' })).toHaveProperty('value', '2,6');
    expect(op10.textContent).toContain('5 ölçüm · 2,4–3,1');
    expect(op10.textContent).toContain('+%30');
    expect(op10.textContent).not.toContain('az ölçüm');
    const op20 = within(tablo).getByRole('row', { name: 'MM-0001 OP 20 süreleri' });
    expect(op20.textContent).toContain('1 ölçüm');
    expect(op20.textContent).toContain("3'ten az ölçüm");
    expect(within(op20).getByTitle(/3'ten az ölçümden/)).toBeTruthy();
    expect(within(op10).getByTitle(/±%15 üstü uyarıdır/)).toBeTruthy();
    expect(op20.textContent).toContain('+%5');
  });

  it('Kabul et ortancayı ister: gövdede deger ortanca ve pencerenin son ölçümü', async () => {
    const { istekler, tablo } = await ac();
    const op10 = within(tablo).getByRole('row', { name: 'MM-0001 OP 10 süreleri' });
    fireEvent.click(within(op10).getByRole('button', { name: 'İşlem ortancasını kabul et, MM-0001 OP 10' }));
    await vi.waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/adimlar/41/gerceklesen-sure/kabul')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/rota/adimlar/41/gerceklesen-sure/kabul')?.govde)
      .toEqual({ tur: 'islem', olcumId: 90, deger: 'ortanca', makineId: null, okunanId: 90 });
  });

  it('süzgeçler: bekleyen ölçümü olanlar ve eşiği aşanlar', async () => {
    const { bolge, tablo } = await ac();
    const suzgec = within(bolge).getByRole('combobox', { name: 'Ölçüm süzgeci' });
    fireEvent.change(suzgec, { target: { value: 'bekleyen' } });
    expect(within(tablo).getByRole('row', { name: 'MM-0001 OP 20 süreleri' })).toBeTruthy();
    expect(within(tablo).queryByRole('row', { name: 'MM-0013 OP 10 süreleri' })).toBeNull();
    expect(tablo.textContent).toContain('MM-0013 Örnek flanş: süzgece uyan adım yok.');
    fireEvent.change(suzgec, { target: { value: 'sapan' } });
    expect(within(tablo).getByRole('row', { name: 'MM-0001 OP 10 süreleri' })).toBeTruthy();
    expect(within(tablo).queryByRole('row', { name: 'MM-0001 OP 20 süreleri' })).toBeNull();
  });

  it('plan sütunu yalnız plan teorikten farklıysa açılır ve yalnız o satırda dolar', async () => {
    const { tablo } = await ac();
    await within(tablo).findByRole('columnheader', { name: 'Plan' });
    const farkli = within(tablo).getByRole('row', { name: 'MM-0013 OP 10 süreleri' });
    expect(farkli.textContent).toContain('Teorikten farklı');
    expect(farkli.textContent).toContain('hazırlık + ayar 15');
    expect(within(tablo).getByRole('row', { name: 'MM-0001 OP 10 süreleri' }).textContent).not.toContain('Teorikten farklı');
  });

  it('plan teorikle aynıysa Plan sütunu yoktur', async () => {
    kur2();
    rrAc('/recete-rota/sureler');
    const tablo = await within(await screen.findByRole('region', { name: 'Süreler' })).findByRole('table', { name: 'Süreler' });
    await within(tablo).findByRole('row', { name: 'MM-0001 OP 10 süreleri' });
    expect(within(tablo).queryByRole('columnheader', { name: 'Plan' })).toBeNull();
  });
});

const kur2 = () => sunucuKur(YONETICI, {
  durum: durum(),
  yazmalar: {
    'GET /rota/revizyonlar/7/sureler': () => json(200, sureler(7, 11, [satir(41, 10, 21, 'TOR')])),
    'GET /rota/revizyonlar/8/sureler': () => json(200, sureler(8, 13, [satir(43, 10, 22, 'FRZ')])),
  },

});

describe('3165 a Süreler yetkisi', () => {
  it('3165 a: gerçekleşen süre eylemi olmayan Kabul et ve süre girişini görmez, istek gitmez', async () => {
    const { istekler, tablo } = await ac({ ...YONETICI, islemler: YONETICI.islemler.filter((i) => i !== 'rota.sure-kabul') });
    const satirEl = within(tablo).getByRole('row', { name: 'MM-0001 OP 10 süreleri' });
    expect(within(satirEl).queryByRole('button', { name: /ortancasını kabul et/ })).toBeNull();
    expect(within(satirEl).queryByLabelText(/^Gerçekleşen .* dakika/)).toBeNull();
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
  });
});
