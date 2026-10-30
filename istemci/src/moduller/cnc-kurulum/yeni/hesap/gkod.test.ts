import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prototipYukle } from '../../prototip-html.ts';
import { durumKur, state } from '../depo.ts';
import { bekleyenGkodAl, fmtT, gkodaGonder, gParse, gsimHazirla, gYukle, SAMPLE_HEID, SAMPLE_ISO, tStation, type GSecenek } from './gkod.ts';

// Yorumlayıcı prototiptekiyle aynı sonucu vermeli: prototipin gParse, tStation, fmtT ve örnek programları eski ekranın
// yüklediği prototipten alınıp koşturulur.
let HTML = '';
type Prototip = { gParse: (t: string, o?: GSecenek) => unknown; tStation: (T: unknown, m: unknown, h?: boolean) => unknown; fmtT: (m: unknown) => string; SAMPLE_HEID: string; SAMPLE_ISO: string };
let P: Prototip | null = null;

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

beforeAll(async () => {
  HTML = await prototipYukle();
  const govde = [
    'var PI = Math.PI, TAU = PI * 2;',
    islev('function pad2(n)'), islev('function clamp(v, a, b)'),
    parca('var SAMPLE_HEID = [', ".join('\\n');"), parca('var SAMPLE_ISO = [', ".join('\\n');"),
    islev('function tStation(T, m, heid)'), islev('function gParse(text, opt)'), islev('function fmtT(min)'),
    'return { gParse: gParse, tStation: tStation, fmtT: fmtT, SAMPLE_HEID: SAMPLE_HEID, SAMPLE_ISO: SAMPLE_ISO };',
  ].join('\n');
  P = new Function(govde)() as Prototip;
});
const proto = (): Prototip => { if (!P) throw new Error('prototip yüklenmedi'); return P; };

// Örneklerin vermediği yolları da sınar (G18 yay, G91, inç, G99, torna mm/dev, makro, M91, PLANE, polar, CR, döngü uyarıları).
const EK_ISO = ['G20 G18 G91 T5 M6', 'G0 X1 Z1 S800 M3', 'G2 X0.5 Z-0.5 R0.5 F4', 'G90 G19 G3 Y10 Z5 J2 K0', 'G99 G81 X5 Y5 Z-3 R1 F100', 'Y10', 'G80',
  '#1=5', 'G28 X0', 'G68 X0 Y0 R45', 'G41 X3', 'M30'].join('\n');
const TORNA_ISO = ['T0101', 'G50 S3000', 'G96 S200 M3', 'G95 G0 X50 Z2', 'G1 Z-30 F0.2', 'X60', 'G97 S1200', 'G1 X40 Z-40', 'G94 G1 Z-50 F100', 'M30'].join('\n');
const EK_HEID = ['0 BEGIN PGM EK MM', '1 BLK FORM 0.1 Z X-10 Y-10 Z-20', '2 0.2 IX+50 IY+40 Z+0', '3 TOOL CALL "FREZE" Z S2000 F500', '4 Q5 = +3', '5 L X+Q5 Y-Q5 R0 FMAX',
  '6 CR X+20 Y+0 R+10 DR-', '7 CT X+30 Y+5', '8 LP PR+5 PA+30', '9 RND R2', '10 APPR LT X+0 Y+0 LEN5 RL F300', '11 PLANE SPATIAL SPA+0 SPB+45 SPC+0', '12 L A+90 F MAX',
  '13 CYCL DEF 7.0 DATUM SHIFT', '14 CYCL DEF 262 THREAD MILLING', '15 CYCL DEF 1 PECKING', '16 L X+5 Y+5 R0 FMAX M89', '17 L X+6 Y+6', '18 CYCL CALL', '19 L Z+10 M91',
  '20 CALL LBL 9', '21 CALL PGM SUB', '22 FN 1: Q2 = Q1 + 1', '23 L Z+50 FMAX M30', '24 END PGM EK MM'].join('\n');

describe('gkod', () => {
  it('örnek programlar prototiptekiyle aynı', () => {
    expect(SAMPLE_HEID).toBe(proto().SAMPLE_HEID);
    expect(SAMPLE_ISO).toBe(proto().SAMPLE_ISO);
  });

  it.each([
    ['Heidenhain örneği', SAMPLE_HEID, {}],
    ['ISO örneği', SAMPLE_ISO, {}],
    ['ISO örneği torna kipinde', SAMPLE_ISO, { lathe: true, rapid: 12000 }],
    ['Heidenhain örneği ISO diye zorlanmış', SAMPLE_HEID, { dialect: 'iso' }],
    ['ek ISO yolları', EK_ISO, {}],
    ['torna ISO', TORNA_ISO, { lathe: true }],
    ['ek Heidenhain yolları', EK_HEID, {}],
    ['boş metin', '', {}],
  ] as const)('%s prototipteki gibi ayrıştırılır', (_ad, metin, secenek: GSecenek) => {
    expect(gParse(metin, secenek)).toEqual(proto().gParse(metin, secenek));
  });

  it('karşılaştırma boş değildir: örnekler hareket, ek programlar uyarı üretir', () => {
    expect(gParse(SAMPLE_HEID).moves.length).toBeGreaterThan(50);
    expect(gParse(SAMPLE_ISO).total).toBeGreaterThan(0);
    expect(gParse(EK_HEID).warn.length).toBeGreaterThan(10);
    expect(gParse(EK_ISO).warn.length).toBeGreaterThan(3);
  });

  it('tStation ve fmtT prototiptekiyle aynı', () => {
    for (const [T, m, h] of [[101, { type: 'lathe' }, false], [1203, { type: 'millturn' }, false], [101, { type: 'mill' }, false], [101, { type: 'lathe' }, true], ['AD', { type: 'lathe' }, false], [5, null, false]] as const) {
      expect(tStation(T, m, h)).toBe(proto().tStation(T, m, h));
    }
    for (const dk of [0, 0.5, 59.99, 61.25, 125.5, -3, Number.NaN, undefined, null]) expect(fmtT(dk)).toBe(proto().fmtT(dk));
  });
});

describe('program durumu', () => {
  beforeEach(() => { durumKur(null, null); });

  it('ayarlar açılışta prototipin varsayılanıyla birleşir, eski elle ham alanı taşınır', () => {
    durumKur(JSON.stringify({ gsimOpt: { lathe: true }, gstock: { x: 1 } }), null);
    const gs = gsimHazirla();
    expect(gs).toMatchObject({ lathe: true, rapid: 30000, dialect: 'auto', stockSrc: 'blk', hamOrigin: 'tlf' });
    expect(state['gtools']).toEqual({ __v2: 1 });
    expect(state['gstockMan']).toEqual({ x: 1 });
    expect(state['gstock']).toBeUndefined();
  });

  it('gYukle programı kaydeder; ham tanımı olmayan programda ham kaynağı otomatiğe döner', () => {
    const r = gYukle(SAMPLE_ISO, 'O1001');
    expect('prog' in r && r.prog.name).toBe('O1001');
    expect(state['gsimText']).toEqual({ name: 'O1001', text: SAMPLE_ISO });
    expect(gsimHazirla().stockSrc).toBe('auto');
  });

  it('gönderim bir kez alınır; Hazırlık gönderimi aynı ad yüklüyse yeniden okutmaz', () => {
    gkodaGonder('G0 X1', 'P1', { opt: { stockSrc: 'ham', lathe: true }, takimlar: { 3: { id: 'em10' } } });
    expect(state['gsimText']).toEqual({ name: 'P1', text: 'G0 X1' });
    expect(gsimHazirla()).toMatchObject({ stockSrc: 'ham', lathe: true });
    expect((state['gtools'] as Record<string, unknown>)['P1']).toEqual({ 3: { id: 'em10' } });
    expect(bekleyenGkodAl('P1')).toEqual({ name: 'P1', text: 'G0 X1' });
    expect(bekleyenGkodAl(null)).toBeNull();
    gkodaGonder('G0 X2', 'P2', { adDegisinceYukle: true });
    expect(bekleyenGkodAl('P2')).toBeNull();
    gkodaGonder('G0 X2', 'P2', { adDegisinceYukle: true });
    expect(bekleyenGkodAl('P1')).toEqual({ name: 'P2', text: 'G0 X2' });
  });
});
