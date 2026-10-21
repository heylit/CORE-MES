import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

// Çalışma kaydı (recete-rota-motoru-v1:planlama) bütün kullanıcılarda ortaktır ve sürümle yazılır: açılışta yazan sayfa, aynı anda
// açan ikinci kişiye çakışma (409) uyarısı verir ve onun bütün sonraki kayıtlarını durdurur. Açılış yalnız okur; taşınan varsayılan
// ilk kayıtla yazılır. Parçalar sayfanın geri kalanı yerine küçük taklitlerle koşar. Veriler uydurmadır.

type Nesne = Record<string, unknown>;

const KAYIT = {
  version: 7, savedAt: 5,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 60, alts: [], altTimes: {}, ins: [] }] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: null, due: null, priority: 2, status: 'uretimde' }],
};

describe('planlama sayfasını açmak yazmaz', () => {
  it('kayıt çalışmadakiyle aynıysa çalışma yeniden yazılmaz; değiştiyse yazılır', () => {
    const govde = `
      let S = null; let U = { sayfa: 'tahta', hamle: null }; let yazma = 0; const geriAl = [];
      const RR = { el: null }; const SAYFA_AD = {}; const VERI = {}; let hsKaynak = null; let rrYerlestir = null;
      const rrMi = s => typeof s === 'string' && s.startsWith('rr-');
      function bildir() {} function iz() {} function render() {}
      function kaydet() { yazma++; }
      function yukle() { return null; }
      ${planlamaMotoru()}
      ${planlamaParcasi('zz27-rr-veri')}
      return { kur: () => { S = { D: rrDenemeyeCevir(${JSON.stringify(KAYIT)}), dataVer: 1, plan: null }; }, cek: () => rrCek(), S: () => S, yazma: () => yazma };`;
    const depo = new Map<string, string>([['recete-rota-motoru-v1', JSON.stringify(KAYIT)]]);
    const localStorage = { getItem: (k: string) => depo.get(k) ?? null, setItem: (k: string, v: string) => { depo.set(k, v); } };
    const window = { tmiGorunum: { kaydet: () => undefined, bildir: () => undefined } };
    const d = new Function('window', 'localStorage', 'console', govde)(window, localStorage, { error: () => undefined }) as
      { kur: () => void; cek: () => boolean; S: () => { D: Nesne }; yazma: () => number };
    d.kur();
    expect(d.cek()).toBe(false);
    expect(d.yazma()).toBe(0);
    depo.set('recete-rota-motoru-v1', JSON.stringify({ ...KAYIT, savedAt: 6, orders: [{ ...KAYIT.orders[0], qty: 12 }] }));
    expect(d.cek()).toBe(true);
    expect(d.yazma()).toBe(1);
  });

  it('16:50 kararlarının varsayılanı bellekte taşınır, işareti çalışmaya konur, açılışta yazılmaz; işaretli çalışma yeniden taşınmaz', () => {
    const ac = (S: Nesne): { S: Nesne; yazma: () => number; depo: Map<string, string> } => {
      const govde = `
        let yazma = 0;
        const ANAHTAR = 'recete-rota-motoru-v1:planlama';
        let isciAc = () => null;
        ${planlamaMotoru()}
        let S = ${JSON.stringify(S)};
        function kaydet() { yazma++; } function render() {}
        ${planlamaParcasi('zz-karar-1650')}
        return { S: () => S, yazma: () => yazma };`;
      const depo = new Map<string, string>();
      const localStorage = { getItem: (k: string) => depo.get(k) ?? null, setItem: (k: string, v: string) => { depo.set(k, v); } };
      const isler: Array<() => void> = [];
      const d = new Function('localStorage', 'setTimeout', govde)(localStorage, (f: () => void) => { isler.push(f); }) as { S: () => Nesne; yazma: () => number };
      isler.forEach((f) => { f(); });
      return { S: d.S(), yazma: d.yazma, depo };
    };
    const eski = { w: { mat: 'uyari' }, D: { planTL: { wip: { vadeBas: 'bitis' } } } };
    const a = ac(eski);
    expect(a.S).toMatchObject({ karar1650: 1, w: { mat: 'karma' }, D: { planDenge: 25, planTL: { wip: { vadeBas: 'termin' } } } });
    expect(a.yazma()).toBe(0);
    expect([...a.depo.keys()]).toEqual([]);
    expect(ac({ ...eski, karar1650: 1 }).S).toMatchObject({ w: { mat: 'uyari' }, D: { planTL: { wip: { vadeBas: 'bitis' } } } });
  });
});
