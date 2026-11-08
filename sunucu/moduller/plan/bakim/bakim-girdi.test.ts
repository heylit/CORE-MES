import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { planGirdisi } from '../plan-girdisi.ts';

// 2319 (2311 S10): bakım aralığı motor girdisinde tezgâhın duruş satırı olur (girdi.js otoBakimUygula). Veriler uydurmadır; gün gerçek
// saatten ileri seçilir (betik "şimdi"yi saatten okur).
const GUN = 86_400_000;
const bugun = tesisSaati(Date.now()).slice(0, 10);
const ileri = (g: number, saat: string) => `${tesisSaati(Date.now() + g * GUN).slice(0, 10)} ${saat}`;
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 6, alts: [], altTimes: {}, ins: [] }] } },
  orders: [], cal: { shifts: [{ id: '3', start: '08:00', end: '16:00' }], holidays: [] },
  wcs: [{ id: 'w-atolye', week: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }],
};
const ILK = {
  D: { meta: { ad: 'Ornek', baslangic: bugun }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
};
const durum = { stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }], machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }] };
const kaynak = (bakimlar: unknown) => ({ durum, ek: { bakimlar } });
const oku = (calisma: unknown, k: unknown) => planGirdisi({ calisma, kayit: KAYIT, kaynak: k as never, bugun })!;
type Satir = { m: string; from: number; to: number; neden?: string; oto?: number; bakim?: string };
const satirlar = (S: Record<string, unknown>) => (S.down as Satir[]).filter((d) => d.bakim !== undefined);
const B1 = { anahtar: 'pl-1|a', m: '100', bas: ileri(3, '08:00'), bit: ileri(3, '09:30'), baslik: 'Yağ' };
const B2 = { anahtar: 'pl-1|b', m: '100', bas: ileri(10, '08:00'), bit: ileri(10, '09:30'), baslik: 'Yağ' };

function oturmus(): Record<string, unknown> {
  let S = oku(ILK, kaynak(null)).S;
  for (let i = 0; i < 3; i++) S = oku(S, kaynak(null)).S;
  return S;
}

describe('bakım duruşu motor girdisinde', () => {
  test('BG-01: bakım bakım nedenli oto duruş satırı olur, planı eskitir, arıza alanında görünür; motor durumuna girer', () => {
    const S = oturmus();
    const r = oku(S, kaynak([B1, B2]));
    const l = satirlar(r.S);
    assert.deepEqual(l.map((d) => [d.m, d.neden, d.oto, d.bakim]), [['100', 'bakım', 1, 'pl-1|a'], ['100', 'bakım', 1, 'pl-1|b']]);
    assert.ok(Math.abs(l[0]!.to - l[0]!.from - 1.5) < 1e-9);
    assert.ok(Number(r.S.dataVer) > Number(S.dataVer));
    assert.ok(r.kaynakDegisikligi?.alanlar.includes('ariza'), JSON.stringify(r.kaynakDegisikligi));
    assert.ok((r.st.down as Satir[]).some((d) => d.neden === 'bakım' && d.m === '100'));
  });

  test('BG-02: aynı liste yeniden okununca değişmez; bakım okunmadıysa (null) dokunulmaz', () => {
    const r1 = oku(oturmus(), kaynak([B1]));
    const r2 = oku(r1.S, kaynak([B1]));
    assert.equal(r2.kaynakDegisikligi, null);
    assert.equal(satirlar(r2.S).length, 1);
    const r3 = oku(r2.S, kaynak(null));
    assert.equal(r3.kaynakDegisikligi, null);
    assert.equal(satirlar(r3.S).length, 1);
  });

  test('BG-03: planlamacının sildiği satır geri gelmez; listeden çıkan anahtarın başlamamış satırı düşer', () => {
    const r1 = oku(oturmus(), kaynak([B1, B2]));
    const silinmis = { ...r1.S, down: (r1.S.down as Satir[]).filter((d) => d.bakim !== 'pl-1|a') };
    const r2 = oku(silinmis, kaynak([B1, B2]));
    assert.deepEqual(satirlar(r2.S).map((d) => d.bakim), ['pl-1|b']);
    const r3 = oku(r2.S, kaynak([B1]));
    assert.deepEqual(satirlar(r3.S).map((d) => d.bakim), []);
    assert.ok(Number(r3.S.dataVer) > Number(r2.S.dataVer));
  });

  test('BG-04: geçersiz satır (saat okunamaz, bitiş başlangıçtan önce) atlanır', () => {
    const r = oku(oturmus(), kaynak([{ ...B1, bas: 'yok' }, { ...B2, bit: ileri(9, '08:00') }, { m: '100' }]));
    assert.deepEqual(satirlar(r.S), []);
  });

  test('BG-05 (2320): bakım yoksa ya da okunmadıysa girdi bakımsız yolla aynıdır (motor eşitliği)', () => {
    const S = oturmus();
    const bakimsiz = oku(S, { durum, ek: null });
    for (const k of [kaynak([]), kaynak(null), { durum, ek: {} }]) {
      const r = oku(S, k);
      assert.deepEqual(r.S, bakimsiz.S);
      assert.deepEqual(r.st.down, bakimsiz.st.down);
      assert.equal(r.kaynakDegisikligi, null);
    }
  });
});
