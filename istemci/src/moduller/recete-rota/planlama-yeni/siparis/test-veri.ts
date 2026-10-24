import { calismaOku } from '../durum.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';

// P2 testlerinin uydurma çalışması: iki sipariş, biri fason adımlı ve geç, öteki zamanında. Ad, kod ve sayılar uydurmadır.
// Başlangıç 2026-10-19 Pazartesi 00:00; S1 termini 2026-10-21 17:00 (65. saat), plan 80. saatte bitiriyor: 15 saat geç.
export const CALISMA_DEGERI = {
  surum: 2,
  dataVer: 3,
  D: {
    meta: { baslangic: '2026-10-19' },
    siparisler: [
      { id: 'S1', urun: 'U1', adet: 10, termin: '2026-10-21 17:00', gelir: 1000 },
      { id: 'S2', urun: 'U1', adet: 4, termin: '2026-10-30 17:00' },
    ],
    urunler: [{ id: 'U1', ad: 'Deneme parca', rota: [{ k: 'a1' }, { k: 'a2', fason: 'F1', bag: [['a1', 'FS']] }, { k: 'a3', bag: [['a2', 'FS']] }] }],
    tezgahlar: [{ id: 'M1', ad: 'Deneme tezgah' }],
    fasoncular: [{ id: 'F1', ad: 'Deneme fason', sureGun: 2 }],
  },
  plan: {
    dataVer: 3,
    ops: {
      'S1.a1': { job: 'S1', m: 'M1', S: 8, C: 20 },
      'S1.a2': { job: 'S1', m: 'fF1', S: 20, C: 68, fas: 1 },
      'S1.a3': { job: 'S1', m: 'M1', S: 70, C: 80 },
      'S2.a1': { job: 'S2', m: 'M1', S: 20, C: 30 },
    },
    J: { S1: { C: 80, T: 15 }, S2: { C: 30, T: 0 } },
    warn: [],
  },
};

export const calismaKur = (degisiklik: (c: typeof CALISMA_DEGERI) => void = () => undefined): PlanlamaCalismasi => {
  const c = structuredClone(CALISMA_DEGERI); degisiklik(c);
  const x = calismaOku(c); if (x === null) throw new Error('test çalışması okunamadı');
  return x;
};
