import { PLANLAMA_ANAHTARI } from '../veri.ts';

// Bileşen testlerinin çalışması: iki tezgâh, bir vardiya, bir ürün, iki sipariş (biri planda). Kod, ad ve tutarlar uydurmadır.
export function calismaKaydi(ek: Record<string, unknown> = {}, cek: Record<string, unknown> = {}) {
  return [{
    anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, surum: 4,
    deger: {
      surum: 2, dataVer: 3, simdi: 7,
      D: {
        meta: { baslangic: '2026-10-05' },
        vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
        calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'] },
        tezgahlar: [{ id: 'T1', grup: 'torna', verim: 1 }, { id: 'T2', grup: 'freze', verim: 1 }],
        urunler: [{ id: 'U1', ad: 'Deneme mil', rota: [{ k: '10', aile: 'A', tezgahlar: [{ id: 'T1', ayar: 30, cevrim: 6 }] }] }],
        siparisler: [
          { id: 'S1', urun: 'U1', adet: 100, termin: '2026-10-20', gelir: 50000, siparisTarihi: '2026-10-01', malzeme: [{ kod: 'M1', miktar: 2 }] },
          { id: 'S2', urun: 'U1', adet: 10, termin: '2026-11-13', malzeme: [{ kod: 'M1', miktar: 2 }] },
        ],
        malzemeler: [{ kod: 'M1', ad: 'Deneme çubuk', birim: 'kg', stok: 50, tedarikGun: 5, muayeneGun: 1, birimFiyat: 10 }],
        ...ek,
      },
      ...cek,
    },
  }];
}

export const PLAN = { dataVer: 3, ops: { 'S1.10': { id: 'S1.10', job: 'S1', m: 'T1', S: 32, C: 40, su: 0.5, run: 7.5 } }, J: { S1: { C: 40 } }, fail: [] };
