import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cozumGirdisi, planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 1476-D: çok katmanlı emrin alt düğümleri motorda montaj bağıyla ayrı iştir (durum.betik mtStUygula, kancalar.betik montajUygula).
// Kök ürün 50 (OP10, OP20), alt düğüm 0.1 ürün 60 (OP10 -> emirde 1010, OP20 -> 1020; kök başına 2), onun altı 0.1.1 ürün 70
// (OP10 -> 1030 bitti, OP20 -> 1040; kök başına 6). 0.1 kökün OP20'sinde, 0.1.1 düğüm 0.1'in OP10'unda tüketilir. Veriler uydurmadır.

const KAYIT = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
const D0 = { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] };
const calisma = (D: Record<string, unknown>): Record<string, unknown> => ({
  D, rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
const adim = (urun: string, op: number, ins: { itemId: string; qty: number }[] = []) =>
  ({ id: `${urun}-o${String(op)}`, seq: op, opNo: op, opId: '13', stationId: '10', setup: 10, cycle: 2, alts: [], altTimes: {}, ins });
type Dugum = { dugum: string; itemId: string; carpan: number | null; birim: number | null; ust: string; ustOpNo: number | null; adimlar: { opNo: number; kaynakOpNo: number; durum: string; fasonId?: string; terminGun?: number | null }[] };
const DUGUMLER: Dugum[] = [
  { dugum: '0.1.1', itemId: '70', carpan: 6, birim: 3, ust: '0.1', ustOpNo: 10,
    adimlar: [{ opNo: 1030, kaynakOpNo: 10, durum: 'tamam' }, { opNo: 1040, kaynakOpNo: 20, durum: 'bekliyor' }] },
  { dugum: '0.1', itemId: '60', carpan: 2, birim: 2, ust: '0', ustOpNo: 20,
    adimlar: [{ opNo: 1010, kaynakOpNo: 10, durum: 'bekliyor' }, { opNo: 1020, kaynakOpNo: 20, durum: 'bekliyor' }] },
];
const durum = (dugumler: Dugum[] | undefined, status = 'serbest') => ({
  stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'adet', stock: 0 },
    { id: '60', code: 'YM-1', name: 'Ornek mil', type: 'yari', unit: 'adet', stock: 0 },
    { id: '70', code: 'YM-2', name: 'Ornek pim', type: 'yari', unit: 'adet', stock: 0 },
  ],
  opdefs: [{ id: '13', code: 'TOR', name: 'Tornalama' }],
  routes: {
    50: { steps: [adim('50', 10), adim('50', 20, [{ itemId: '60', qty: 2 }])] },
    60: { steps: [adim('60', 10, [{ itemId: '70', qty: 3 }]), adim('60', 20)] },
    70: { steps: [adim('70', 10), adim('70', 20)] },
  },
  routeRevs: ['50', '60', '70'].map((itemId, i) => ({ id: String(i + 1), itemId, status: 'yururlukte' })),
  emirler: {
    orders: [{ id: '7', no: 'UE-7', itemId: '50', qty: 5, start: '2026-10-19', due: '2026-10-30', priority: 2, note: '', status, ...(dugumler ? { dugumler } : {}) }],
    opStatus: {}, opProg: {},
  },
});
type Siparis = { id: string; urun: string; adet: number; termin: string | null; ust?: string; ustAdim?: string; birim?: number; gelir?: number | null };
type Sonuc = { S: { D: Record<string, unknown> & { siparisler: Siparis[] } }; st: { D: { siparisler: Siparis[] }; bitti?: Record<string, number>; montaj?: Record<string, unknown> } };
const kur = (dugumler: Dugum[] | undefined, D: Record<string, unknown> = D0, status?: string): Sonuc =>
  planGirdisi({ calisma: calisma(D), kayit: KAYIT, kaynak: { durum: durum(dugumler, status), ek: null }, bugun: '2026-10-19' }) as unknown as Sonuc;

describe('plan girdisi: çok katmanlı emrin düğümleri montaj bağıyla (1476-D)', () => {
  test('alt düğüm ayrı iştir: ürünü, adedi, tüketen üst adımı ve üst başına adedi; termini ve geliri yok', () => {
    const r = kur(DUGUMLER);
    const s = Object.fromEntries(r.st.D.siparisler.map((x) => [x.id, x]));
    assert.deepEqual(r.st.D.siparisler.map((x) => x.id), ['7', '7-Y1-Y1', '7-Y1']);
    assert.deepEqual([s['7-Y1']!.urun, s['7-Y1']!.adet, s['7-Y1']!.ust, s['7-Y1']!.ustAdim, s['7-Y1']!.birim, s['7-Y1']!.termin], ['60', 10, '7', '20', 2, null]);
    assert.deepEqual([s['7-Y1-Y1']!.urun, s['7-Y1-Y1']!.adet, s['7-Y1-Y1']!.ust, s['7-Y1-Y1']!.ustAdim, s['7-Y1-Y1']!.birim], ['70', 30, '7-Y1', '10', 3]);
    assert.equal(s['7-Y1']!.gelir, null, 'gelir yalnız kök emrindir');
    assert.deepEqual(Object.keys(r.st.montaj ?? {}).sort(), ['7-Y1', '7-Y1-Y1']);
    assert.deepEqual(r.st.bitti, { '7-Y1-Y1.10': 1 }, 'düğümün biten adımı düşer');
  });

  test('motor tüketen üst adımı alt düğümün son adımından sonra başlatır', () => {
    const r = kur(DUGUMLER);
    const cx = motorYukle().compile(r.st as never) as { byId: Record<string, { pr: [string, string][] }> };
    assert.ok(cx.byId['7.20']!.pr.some(([p]) => p === '7-Y1.20'), 'kökün OP20\'si 0.1\'in son adımını bekler');
    assert.ok(cx.byId['7-Y1.10']!.pr.some(([p]) => p === '7-Y1-Y1.20'), '0.1\'in OP10\'u 0.1.1\'in son adımını bekler');
  });

  test('emirdeki adım numarası düğüm siparişinin rotadaki adımına eşlenir (kuyruk, kimlik)', () => {
    const anahtarlar = ['UE-7|1040', 'UE-7|1010', 'UE-7|1020', 'UE-7|10', 'UE-7|20'];
    const g = cozumGirdisi({
      calisma: calisma(D0), kayit: KAYIT, kaynak: { durum: durum(DUGUMLER), ek: null },
      istek: { simdi: '2026-10-19T05:00:00Z', kuyruklar: [{ makineId: 100, anahtarlar }], sabitler: [], calisanlar: [] },
    });
    assert.ok(g);
    assert.deepEqual(g.yerlesmeyen, [], 'hepsinin motorda karşılığı var (tezgâhın vardiyası olmadığı için dizilmez)');
    assert.deepEqual(Object.fromEntries(Object.entries(g.kimlik).filter(([id]) => id.includes('-Y'))),
      { '7-Y1-Y1.10': 'UE-7|1030', '7-Y1-Y1.20': 'UE-7|1040', '7-Y1.10': 'UE-7|1010', '7-Y1.20': 'UE-7|1020' });
  });

  test('reddedilen: rotası olmayan düğüm ve çarpanı okunamayan düğüm plana girmez, adımı yerleşmez; tüketen adım yoksa bağ uydurulmaz', () => {
    const rotasiz = kur([{ ...DUGUMLER[1]!, itemId: '99' }]);
    assert.deepEqual(rotasiz.st.D.siparisler.map((x) => x.id), ['7']);
    assert.deepEqual(kur([{ ...DUGUMLER[1]!, carpan: null }]).st.D.siparisler.map((x) => x.id), ['7']);
    const g = cozumGirdisi({
      calisma: calisma(D0), kayit: KAYIT, kaynak: { durum: durum([{ ...DUGUMLER[1]!, itemId: '99' }]), ek: null },
      istek: { simdi: '2026-10-19T05:00:00Z', kuyruklar: [{ makineId: 100, anahtarlar: ['UE-7|1010', 'UE-7|10'] }], sabitler: [], calisanlar: [] },
    });
    assert.deepEqual(g?.yerlesmeyen, ['UE-7|1010']);
    const bagsiz = kur([{ ...DUGUMLER[1]!, ustOpNo: null }]).st.D.siparisler.find((x) => x.id === '7-Y1')!;
    assert.equal(bagsiz.ust, undefined);
    assert.equal(bagsiz.termin, '2026-10-30 23:59', 'bağsız düğüm emrin terminiyle bağımsız iştir');
  });

  test('tek katmanlı emir değişmez; biten kök emrin düğümleri de düşer; aynı okuma ikinci açılışta çalışmayı değiştirmez', () => {
    assert.deepEqual(kur(undefined).st.D.siparisler.map((x) => x.id), ['7']);
    assert.deepEqual(kur(DUGUMLER, D0, 'tamam').st.D.siparisler, []);
    const ilk = kur(DUGUMLER);
    assert.deepEqual(kur(DUGUMLER, ilk.S.D).S.D, ilk.S.D);
  });

  // 1559 a: emirde fasona alınan alt düğüm adımı (dugumler[].adimlar[].fasonId) düğüm siparişinin emre özel ürün kopyasında fason adım olur;
  // tezgâhı yoktur, kuyruğa girmez (988 a'nın kökteki kuralı). Fasonsuz düğüm ve kök emir ürünü değişmez.
  test('1559 a: alt düğümde fasona alınan adım motorda fason adımdır; kuyruktaki anahtarı tezgâha dizilmez', () => {
    const fasonlu = DUGUMLER.map((d) => (d.dugum !== '0.1' ? d : { ...d, adimlar: d.adimlar.map((a) => (a.opNo === 1020 ? { ...a, fasonId: '5', terminGun: 4 } : a)) }));
    const g = cozumGirdisi({
      calisma: calisma(D0), kayit: KAYIT, kaynak: { durum: durum(fasonlu), ek: null },
      istek: { simdi: '2026-10-19T05:00:00Z', kuyruklar: [{ makineId: 100, anahtarlar: ['UE-7|1010', 'UE-7|1020', 'UE-7|10'] }], sabitler: [], calisanlar: [] },
    }) as unknown as { st: { D: { siparisler: Siparis[]; urunler: { id: string; rota: { k: string; fason?: string; tezgahlar?: unknown[] }[] }[]; fasoncular: { id: string; sureGun: number }[] } } } | null;
    assert.ok(g);
    const D = g.st.D;
    const sip = Object.fromEntries(D.siparisler.map((x) => [x.id, x]));
    assert.equal(sip['7-Y1']!.urun, '60#7-Y1', 'düğüm siparişi emre özel ürün kopyasına geçer');
    assert.equal(sip['7']!.urun, '50', 'kök emrin ürünü değişmez');
    assert.equal(sip['7-Y1-Y1']!.urun, '70', 'fasonsuz düğüm değişmez');
    const rota = D.urunler.find((u) => u.id === '60#7-Y1')!.rota;
    assert.deepEqual([rota[0]!.fason, rota[1]!.fason], [undefined, '~60#7-Y1.20']);
    assert.deepEqual(rota[1]!.tezgahlar, []);
    assert.equal(D.urunler.find((u) => u.id === '60')!.rota[1]!.fason, undefined, 'ortak ürün rotası değişmez');
    assert.equal(D.fasoncular.find((f) => f.id === '~60#7-Y1.20')!.sureGun, 4);
  });

  test('1559 a reddedilen: düğüm rotasında olmayan op numarası ve fasonsuz adım fason kurmaz; termin günü yoksa varsayılan 7 gün', () => {
    const yerli = (adimlar: Dugum['adimlar']) => cozumGirdisi({
      calisma: calisma(D0), kayit: KAYIT, kaynak: { durum: durum([{ ...DUGUMLER[1]!, adimlar }]), ek: null },
      istek: { simdi: '2026-10-19T05:00:00Z', kuyruklar: [{ makineId: 100, anahtarlar: ['UE-7|1010', 'UE-7|10'] }], sabitler: [], calisanlar: [] },
    }) as unknown as { st: { D: { siparisler: Siparis[]; fasoncular?: { id: string; sureGun: number }[] } } };
    const yok = yerli([{ opNo: 1010, kaynakOpNo: 10, durum: 'bekliyor' }, { opNo: 1020, kaynakOpNo: 99, durum: 'bekliyor', fasonId: '5', terminGun: 4 }]);
    assert.equal(yok.st.D.siparisler.find((x) => x.id === '7-Y1')!.urun, '60', 'rotada karşılığı olmayan adım için kopya kurulmaz');
    assert.equal(yerli(DUGUMLER[1]!.adimlar).st.D.siparisler.find((x) => x.id === '7-Y1')!.urun, '60');
    const varsayilan = yerli([{ opNo: 1010, kaynakOpNo: 10, durum: 'bekliyor', fasonId: '5', terminGun: null }]);
    assert.equal(varsayilan.st.D.fasoncular!.find((f) => f.id === '~60#7-Y1.10')!.sureGun, 7);
  });
});
