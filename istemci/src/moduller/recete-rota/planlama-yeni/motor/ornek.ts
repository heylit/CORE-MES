import type { PlanlamaCalismasi } from '../tipler.ts';

// Testlerin sentetik çalışması: iki tezgâh, bir fasoncu, üç sipariş; plan çözülmüş ve güncel. Ad ve kodlar uydurmadır.
export function ornekCalisma(): PlanlamaCalismasi {
  return {
    surum: 2,
    simdi: 8,
    D: {
      meta: { baslangic: '2026-10-19' },
      tezgahlar: [{ id: 'T1', ad: 'Torna bir', grup: 'Torna' }, { id: 'F1', ad: 'Freze bir', grup: 'Freze' }],
      fasoncular: [{ id: 'K', ad: 'Kaplamacı' }],
      urunler: [{ id: 'U1', ad: 'Mil' }, { id: 'U2', ad: 'Flanş' }],
      siparisler: [
        { id: 'S1', urun: 'U1', adet: 10, termin: '2026-10-19 20:00' },
        { id: 'S2', urun: 'U2', adet: 5, termin: '2026-10-19 12:00', oncelik: 1 },
        { id: 'S3', urun: 'U1', adet: 2, termin: '2026-10-25 12:00' },
      ],
    },
    down: [], ekMesai: [], locks: {}, pref: {}, kapali: [], bedel: null, olaylar: [], senaryolar: [], canli: null, canliSurum: 0, tabanSurum: 0, iz: [],
    w: { dondurma: 4, famK: 0.3, mat: 'karma', sure: 10 },
    param: { tampon: true, tamponZ: 1.28, acilPay: 0.05, maxChg: 15, chgTL: 50, bolmeKip: 'otomatik', bolmeMin: 5, bolmeMaks: 3, bolmeEsik: 1000 },
    dataVer: 3,
    plan: {
      dataVer: 3, zaman: Date.UTC(2026, 9, 19, 7), kim: 'Deneme Yonetici',
      ops: {
        'S1.10': { id: 'S1.10', job: 'S1', m: 'T1', S: 9, C: 12, why: null },
        'S1.20': { id: 'S1.20', job: 'S1', m: 'F1', S: 14, C: 17, why: null },
        'S2.10': { id: 'S2.10', job: 'S2', m: 'T1', S: 12, C: 15, why: null },
        'S2.20': { id: 'S2.20', job: 'S2', m: '@K', S: 15, C: 40, fas: 1, why: null },
        'S3.10': { id: 'S3.10', job: 'S3', m: 'F1', S: 17, C: 19, why: null },
      },
      fail: ['S9.10'],
      ozet: { wT: 28, onT: 0, late: 1, n: 3, suH: 1.5, Cmax: 40 },
      J: { S1: { C: 17, T: 0 }, S2: { C: 40, T: 28 }, S3: { C: 19, T: 0 } },
      util: { T1: { u: 0.82 }, F1: { u: 0.3 } },
      warn: [{ t: 'malzeme', job: 'S3' }],
    },
  };
}
