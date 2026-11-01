import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prototipYukle } from '../../prototip-html.ts';
import { durumKur } from '../depo.ts';
import { allMachines } from '../secici.ts';
import type { Tezgah } from '../veri/tipler.ts';
import { CAP_DEF, capDefOf } from './sinirlar.ts';

// Taşıma prototiptekiyle aynı sonucu vermeli: prototipin işlevleri eski ekranın yüklediği prototipten alınıp koşturulur.
let HTML = '';
function parca(bas: string, son: string): string {
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${bas}`);
  return HTML.slice(i, HTML.indexOf(son, i) + son.length);
}
function islev(imza: string): string {
  const i = HTML.indexOf(imza);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${imza}`);
  let derinlik = 0;
  for (let j = HTML.indexOf('{', i); j < HTML.length; j += 1) {
    if (HTML[j] === '{') derinlik += 1;
    else if (HTML[j] === '}') { derinlik -= 1; if (derinlik === 0) return HTML.slice(i, j + 1); }
  }
  throw new Error('Kapanmayan işlev');
}

type Islev = (...a: unknown[]) => unknown;
let P: Record<string, unknown> = {};
beforeAll(async () => {
  HTML = await prototipYukle();
  const kod = [parca('var CAP_DEF = {', '\n  };'), islev('function capDefOf(m)')].join('\n');
  P = new Function(`${kod}\nreturn { CAP_DEF, capDefOf };`)() as Record<string, unknown>;
});
beforeEach(() => { durumKur(null, null); });
const p = (ad: string): Islev => P[ad] as Islev;

describe('sığma sınırları', () => {
  it('CAP_DEF prototiptekiyle aynı', () => {
    expect(CAP_DEF).toEqual(P['CAP_DEF']);
  });

  it('capDefOf her tezgâhta, kopya tezgâhta ve girilen bilgide aynı', () => {
    const ilk = allMachines()[0] as Tezgah;
    const tezgahlar: Tezgah[] = [
      ...allMachines(),
      { ...ilk, id: 'f5a_2' },
      { ...ilk, id: 'yok' },
      { ...ilk, id: 'f5b', info: { xT: '700', zDay: '', tbl: '900x500', load: null } },
      { ...ilk, id: 'tcy', info: { zT: 400 } },
      { ...ilk, id: 'f5c', info: { tbl: 'Ø 500' } },
    ];
    for (const m of tezgahlar) {
      expect(capDefOf(m)).toEqual(p('capDefOf')(m));
    }
  });
});
