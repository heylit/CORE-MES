import { describe, expect, it } from 'vitest';
import type { SahneAdimi } from '#paylasilan/sozlesme/rota.ts';
import { modelBicimiBul, parcaHali, parcaIlerleyisi } from './oynatma.ts';

const VARSAYILAN_HAREKET: SahneAdimi['hareket'] = { parcalar: [], yon: '+Z', mesafeMm: 80, sureSn: 1.6, sirali: false, kamera: null };

const adim = (sira: number, parcalar: number[], ek: Partial<SahneAdimi['hareket']> = {}): SahneAdimi => ({ sira, hareket: { ...VARSAYILAN_HAREKET, parcalar, ...ek } });


describe('montaj sahnesi oynatma kuralları (3209 a)', () => {
  it('parça adım süresinde uzaktan yerine gelir; sıralı adımda parçalar sırayla girer', () => {
    const h = adim(1, [3, 4], { sureSn: 2 }).hareket;
    expect(parcaIlerleyisi(h, 3, 0)).toBe(0);
    expect(parcaIlerleyisi(h, 3, 2)).toBe(1);
    expect(parcaIlerleyisi(h, 9, 0)).toBe(1);
    const s = { ...h, sirali: true };
    expect(parcaIlerleyisi(s, 3, 1)).toBe(1);
    expect(parcaIlerleyisi(s, 4, 1)).toBe(0);
    expect(parcaIlerleyisi(s, 4, 2)).toBe(1);
  });

  it('etkin adımdan önce giren yerinde, sonra giren gizli ya da soluk, etkin adımdaki giriş yönünden kayar', () => {
    const adimlar = [adim(1, [1], { yon: '+Z', mesafeMm: 100, sureSn: 1 }), adim(2, [2], { yon: '-X', mesafeMm: 50, sureSn: 1 })];
    expect(parcaHali(adimlar, 2, 1, 0, true)).toEqual({ gorunur: true, hayalet: false, kayma: [0, 0, 0] });
    expect(parcaHali(adimlar, 1, 2, 0, false).gorunur).toBe(false);
    expect(parcaHali(adimlar, 1, 2, 0, true)).toMatchObject({ gorunur: true, hayalet: true });
    expect(parcaHali(adimlar, 2, 2, 0, true).kayma).toEqual([-50, 0, 0]);
    expect(parcaHali(adimlar, 2, 2, 1, true).kayma.map(Math.abs)).toEqual([0, 0, 0]);
    expect(parcaHali(adimlar, 1, 0, 0, true).kayma).toEqual([0, 0, 0]);
  });

  it('terminal modelin biçimini içerikten tanır: STEP başlığı step, glTF ikilisi glb, değilse iges', () => {
    const b = (s: string) => new TextEncoder().encode(s);
    expect(modelBicimiBul(b('ISO-10303-21;\nHEADER;'))).toBe('step');
    expect(modelBicimiBul(b('  \nISO-10303-21;'))).toBe('step');
    expect(modelBicimiBul(b('glTF\u0002\u0000\u0000\u0000'))).toBe('glb');
    expect(modelBicimiBul(b('                                                                        S      1'))).toBe('iges');
  });
});
