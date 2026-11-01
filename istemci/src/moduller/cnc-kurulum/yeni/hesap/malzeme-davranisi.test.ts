import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prototipYukle } from '../../prototip-html.ts';
import { clamp, fmtN } from '../bicim.ts';
import { durumKur } from '../depo.ts';
import { allMaterials, byId, material } from '../secici.ts';
import type { IsMalzemesi } from '../veri/tipler.ts';
import { matBeh, matRef, mbK, mbStars, type MalzemeOzu } from './malzeme-davranisi.ts';

// Taşıma prototiptekiyle aynı sonucu vermeli: prototipin işlevleri, eski ekranın yüklediği prototipten alınıp aynı
// seçicilerle koşturulur.
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
let P: Record<string, Islev> = {};
beforeAll(async () => {
  HTML = await prototipYukle();
  const kod = [parca('var MB_ISO = {', '\n  };'), ...['matBeh(m)', 'matRef()', 'mbK(m)', 'mbStars(m)']
    .map((a) => islev(`function ${a}`))].join('\n');
  P = new Function('material', 'byId', 'allMaterials', 'clamp', 'fmtN',
    `${kod}\nreturn { matBeh, matRef, mbK, mbStars };`)(material, byId, allMaterials, clamp, fmtN) as Record<string, Islev>;
});
beforeEach(() => { durumKur(null, null); });

const p = (ad: string): Islev => { const f = P[ad]; if (!f) throw new Error(ad); return f; };
const ornekler = (): MalzemeOzu[] => [
  ...allMaterials(),
  { ...(allMaterials()[0] as IsMalzemesi), id: 'x1', iso: 'S', beh: { eng: 0.5, apT: Number.NaN, nk: '' as unknown as number, tune: '7' as unknown as number } },
  { ...(allMaterials()[0] as IsMalzemesi), id: 'x2', iso: 'M', metal: 0 },
  { ...(allMaterials()[0] as IsMalzemesi), id: 'x3', iso: 'Q' as 'P' },
];

describe('malzeme davranışı', () => {
  it('matBeh ve mbK prototiptekiyle aynı', () => {
    for (const m of ornekler()) {
      expect(matBeh(m)).toEqual(p('matBeh')(m));
      expect(mbK(m)).toEqual(p('mbK')(m));
    }
    expect(matBeh()).toEqual(p('matBeh')());
  });

  it('matRef C45, kütüphanede yoksa yedek', () => {
    expect(matRef()).toEqual(p('matRef')());
    durumKur(JSON.stringify({ matO: {} }), null);
    expect(matRef().id).toBe('c45');
  });

  it('mbStars prototipin yıldız sayısı ve oranıyla aynı', () => {
    for (const m of ornekler()) {
      const html = String(p('mbStars')(m));
      const dolu = (/">(●*)<i>/.exec(html)?.[1] ?? '').length;
      const { yildiz, oran } = mbStars(m);
      expect(yildiz).toBe(dolu);
      expect(html).toContain(`×${fmtN(oran, 1)} süre`);
    }
  });
});
