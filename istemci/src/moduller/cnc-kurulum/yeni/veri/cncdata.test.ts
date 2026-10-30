import { beforeAll, describe, expect, it } from 'vitest';
import { prototipYukle } from '../../prototip-html.ts';
import { D } from './cncdata.ts';
import { htype } from './takim-turu.ts';

// Taşıma prototipin verisiyle bire bir aynı olmalı: prototipin VERİ betiği ve CNC3D'nin htype'ı, eski ekranın yüklediği
// prototipten alınıp koşturulur.
let HTML = '';


function betik(baslangic: string): string {
  const i = HTML.indexOf(baslangic);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${baslangic}`);
  return HTML.slice(i, HTML.indexOf('</script>', i));
}

// Süslü ayraç dengesiyle tek işlev gövdesi.
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

type Kalemsi = { kind: string; d?: number; tm?: string };
let prototipHtype: (t: Kalemsi) => string = () => '';
let prototip: Record<string, unknown> = {};
beforeAll(async () => {
  HTML = await prototipYukle();
  prototipHtype = new Function(`${islev('function htype(t)')}; return htype;`)() as (t: Kalemsi) => string;
  prototip = new Function('CNC3D', `${betik('var CNCDATA = (function')}; return CNCDATA;`)({ htype: prototipHtype }) as Record<string, unknown>;
});

describe('CNCDATA taşıması', () => {
  it('anahtarlar aynı', () => {
    expect(Object.keys(D).sort()).toEqual(Object.keys(prototip).sort());
  });

  it.each(Object.keys(D).filter((k) => k !== 'holderId'))('%s prototiptekiyle aynı', (anahtar) => {
    expect(JSON.parse(JSON.stringify((D as Record<string, unknown>)[anahtar]))).toEqual(JSON.parse(JSON.stringify(prototip[anahtar])));
  });

  it('holderId prototiptekiyle aynı', () => {
    const p = prototip['holderId'] as (taper: string, ht: string, s?: number) => string | null;
    for (const taper of ['BT40', 'BT50', 'HSK-A63', 'Capto C6', 'yok']) {
      for (const ht of ['weldon', 'er', 'shrink', 'hyd', 'arbor', 'tap', 'bilinmez']) {
        for (const s of [undefined, 6, 12.5]) expect(D.holderId(taper, ht, s)).toBe(p(taper, ht, s));
      }
    }
  });

  it('htype prototiptekiyle aynı (çapı olmayan takım dahil)', () => {
    const turler = [...new Set([...D.MILL, ...D.LATHE].map((t) => t.kind)), 'shoulder', 'hfmi', 'bilinmez'];
    for (const kind of turler) {
      for (const t of [{ kind }, { kind, d: 10 }, { kind, d: 30 }, { kind, d: 50 }, { kind, d: 10, tm: 'H' }]) expect(htype(t)).toBe(prototipHtype(t));
    }
  });
});
