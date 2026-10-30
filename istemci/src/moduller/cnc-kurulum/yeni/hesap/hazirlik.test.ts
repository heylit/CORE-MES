import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prototipYukle } from '../../prototip-html.ts';
import { fmtN, upTR } from '../bicim.ts';
import { durumKur, state } from '../depo.ts';
import { machine, toolLib, tools } from '../secici.ts';
import {
  denemeBitti, gkodKur, hamKaynagiKur, PR, prAllSig, prChecks, prFixN, prIsDone, prProg, prRawTs, PS, prSeq, prSig, prSrcText, prStep,
  prStk, prStkLabel, prStkVol, prSuggest, prToolNote, prTs, type GkodProgrami, type HazirlikAdimi,
} from './hazirlik.ts';

// Taşıma prototipin kendi işlevleriyle sınanır: işlev gövdesi eski ekranın yüklediği prototipten alınır, bağımlılıkları
// taşınmış çekirdekten verilir; aynı girdide aynı imza ve sonuç beklenir.
let HTML = '';
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
function parca(bas: string, son: string): string {
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${bas}`);
  return HTML.slice(i, HTML.indexOf(son, i) + son.length);
}
type Islev = (...a: unknown[]) => unknown;
function prototipIslevi(ad: string, bag: Record<string, unknown>, ek = ''): Islev {
  const adlar = Object.keys(bag);
  return new Function(...adlar, `${ek}\n${islev(`function ${ad}(`)}\nreturn ${ad};`)(...adlar.map((a) => bag[a])) as Islev;
}

const SATIRLAR = [
  '0 BEGIN PGM ORNEK MM',
  '1 BLK FORM 0.1 Z X+0 Y+0 Z-30',
  '; -- ALIN FREZE D50 --',
  '3 TOOL CALL 1 Z S2000 F800',
  '4 ; PARMAK FREZE D10 KABA',
  '5 TOOL CALL 2 Z S6000',
  '6 TOOL CALL 5 Z S800 ; KILAVUZ M8',
  '7 TOOL CALL "KUGEL" Z',
];
const PROGRAM: GkodProgrami = {
  name: '', tools: [1, 2, 5, 'KUGEL'], warn: [], lines: SATIRLAR, heid: true,
  blk: { min: { x: 0, y: 0, z: -30 }, max: { x: 120, y: 80, z: 0 } },
  stat: { perTool: { 1: { t: 12, len: 900, S: 2000 }, 2: { t: 30, len: 1500, S: 6000 }, 5: { t: 4, len: 50, S: 800 } }, feedT: 46 },
  total: 60,
};
const ORNEK = 'ornek program metni';

beforeAll(async () => {
  HTML = await prototipYukle();
  gkodKur({
    gParse: () => structuredClone(PROGRAM), tStation: (T) => T,
    SAMPLE_HEID: ORNEK, SAMPLE_ISO: `${ORNEK} iso`,
  });
});
beforeEach(() => {
  durumKur(null, null);
  PR.seq = []; PR.at = 0; PR.prog = null; PR.progKey = ''; PR.magP = null; PR.q = {};
  hamKaynagiKur(() => null);
  denemeBitti(false);
});

// Sunucunun son onay kuralının (sunucu/moduller/cnc-kurulum/kurallar.ts sonOnayAdimlariTamamMi) biçim beklentisi: önce altı adım,
// sonra takım adımları (magazin ya da T<n> imzaları), sonra soğutma, ölçüm, sarf; en sonda parti adedi.
function sunucuBicimi(): boolean {
  const p = PS(), imza = p.fin?.sig ?? '', done = p.done;
  const once = ['machine', 'prog', 'fixture', 'jaw', 'material', 'zero'].map((k) => done[k]);
  const sonra = ['cool', 'gauges', 'cons'].map((k) => done[k]);
  if ([...once, ...sonra].some((x) => !x)) return false;
  const adet = imza.lastIndexOf('#');
  const govde = imza.slice(0, adet), bas = `${once.join('#')}#`, kuyruk = `#${sonra.join('#')}`;
  if (!govde.startsWith(bas) || !govde.endsWith(kuyruk)) return false;
  const takimlar = govde.slice(bas.length, govde.length - kuyruk.length);
  if (done['mag'] && takimlar === done['mag']) return true;
  return takimlar === Object.keys(done).filter((k) => /^T\d+$/.test(k)).map((k) => done[k]).join('#');
}
function hepsiniOnayla(): void {
  PR.seq = prSeq();
  for (const s of PR.seq) if (s.g !== 'final' && s.g !== 'trial') PS().done[s.key] = prSig(s);
  PS().fin = { sig: prAllSig() };
}

describe('hazırlık imzaları', () => {
  it('programlı sıra prototipteki gibi; son onay imzası sunucunun beklediği biçimde', () => {
    expect(prSeq().map((s) => s.key)).toEqual(['machine', 'prog', 'fixture', 'jaw', 'material', 'zero', 'T1', 'T2', 'T5', 'cool', 'gauges', 'cons', 'final', 'trial']);
    hepsiniOnayla();
    expect(sunucuBicimi()).toBe(true);
    expect(PR.seq.filter((s) => s.g !== 'trial').every(prIsDone)).toBe(true);
    PS().qty = 12;
    expect(prIsDone({ key: 'final', g: 'final' })).toBe(false);
  });

  it('programsız sıra magazin adımıyla imzalanır', () => {
    PS().src = 'none';
    expect(prSeq().map((s) => s.key)).toContain('mag');
    hepsiniOnayla();
    expect(sunucuBicimi()).toBe(true);
  });

  it('deneme adımı yalnız deneme bitince tamam', () => {
    expect(prIsDone({ key: 'trial', g: 'trial' })).toBe(false);
    denemeBitti(true);
    expect(prIsDone({ key: 'trial', g: 'trial' })).toBe(true);
  });

  it.each([['programlı', 'sh'], ['programsız', 'none'], ['ISO', 'si']])('%s: prSig, prAllSig ve prSeq prototiptekiyle aynı', (_ad, src) => {
    PS().src = src;
    PS().qty = 7;
    state.machine = 'f5a';
    const bag = {
      machine, tools, PS, prSrcText, prStkLabel, prStk, prStep, prFixN, prTs, state,
      get PR() { return PR; },
    };
    const sig = prototipIslevi('prSig', bag);
    const seq = prototipIslevi('prSeq', bag) as () => HazirlikAdimi[];
    expect(seq()).toEqual(prSeq());
    PR.seq = prSeq();
    for (const s of PR.seq) expect(sig(s)).toBe(prSig(s));
    const all = prototipIslevi('prAllSig', { ...bag, PR, prSig: sig });
    expect(all()).toBe(prAllSig());
  });
});

describe('ham ölçü', () => {
  it.each([
    { bar: 1, d: 50, l: 100, src: 'def' }, { bar: 1, d: 42.5, l: 7, src: 'man' }, { x: 120, y: 80.4, z: 30, src: 'prog' }, { x: 10, y: undefined, z: 3, src: 'man' },
  ])('etiket ve hacim prototipteki gibi: %o', (s) => {
    const bag = { fmtN, PI: Math.PI };
    expect(prototipIslevi('prStkLabel', bag)(s)).toBe(prStkLabel(s));
    expect(prototipIslevi('prStkVol', bag)(s)).toEqual(prStkVol(s));
  });

  it('kaynak sırası: program bloğu, sonra Ham Malzeme sonucu, sonra varsayılan', () => {
    expect(prStk()).toEqual({ x: 120, y: 80, z: 30, src: 'prog' });
    PS().src = 'none';
    expect(prStk()).toEqual({ x: 120, y: 80, z: 30, src: 'def' });
    hamKaynagiKur(() => ({ ok: true, type: 'block', S: [60, 40, 20] }));
    expect(prStk()).toEqual({ x: 60, y: 40, z: 20, src: 'ham' });
    hamKaynagiKur(() => ({ ok: true, type: 'bar', D: 30, L: 90 }));
    expect(prStk()).toEqual({ x: 90, y: 30, z: 30, src: 'ham' });
  });
});

describe('takım notu ve önerisi', () => {
  it('program satırındaki takım notu prototipteki gibi okunur', () => {
    const not = prototipIslevi('prToolNote', { prProg, prRawTs });
    for (const T of [1, 2, 5, 9]) expect(not(T)).toBe(prToolNote(T));
    expect(prToolNote(1)).toBe('ALIN FREZE D50');
  });

  it('öneri listesi prototipteki gibi', () => {
    const ek = parca('var SUG_KW = [', ']]];');
    const oner = prototipIslevi('prSuggest', { upTR, prToolNote, toolLib, machine, fmtN }, ek) as (T: number) => { t: { id: string }; sc: number; why: string[] }[];
    for (const T of [1, 2, 5]) {
      const a = oner(T).map((x) => ({ id: x.t.id, sc: x.sc, why: x.why }));
      const b = prSuggest(T).map((x) => ({ id: x.t.id, sc: x.sc, why: x.why }));
      expect(b).toEqual(a);
    }
    expect(prSuggest(5).length).toBeGreaterThan(0);
  });
});

describe('son kontrol', () => {
  it('onaysız adımlar ve isimle çağrılan takım kırmızı ve uyarı olur', () => {
    PR.seq = prSeq();
    const k = prChecks();
    expect(k[0]?.lvl).toBe('err');
    expect(k[0]?.go).toBe(0);
    expect(k.some((x) => x.txt.includes('KUGEL'))).toBe(true);
  });
});
