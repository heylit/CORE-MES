import { describe, expect, it } from 'vitest';
import { mesaiIsisi } from './EkMesaiPlani.tsx';
import { takvimKur } from './kurallar.ts';
import { ornekCalisma } from './test-verisi.ts';

// 3052: ek mesai satırı tezgâhın koduyla yazılır; anahtar iç kimlik kalır, kodu olmayan tezgâh iç kimlikle görünür.
describe('ek mesai ısısı satır adı', () => {
  it('kodu olan tezgâh kodla, olmayan iç kimlikle', () => {
    const c = ornekCalisma({ D: { tezgahlar: [
      { id: 'T1', kod: 'ORN-CNC-T1', ad: 'Deneme torna', grup: 'TORNA', ucret: 100, verim: 1 },
      { id: 'T2', ad: 'Deneme freze', grup: 'FREZE', ucret: 100, verim: 1 },
    ] } });
    const v = mesaiIsisi(c, takvimKur(c));
    if (!('satirlar' in v)) throw new Error('ısı yok');
    const s = Object.fromEntries(v.satirlar.map((r) => [r.k, r.ad]));
    expect(s).toEqual({ T1: 'ORN-CNC-T1', T2: 'T2' });
  });
});
