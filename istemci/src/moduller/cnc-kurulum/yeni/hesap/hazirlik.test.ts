import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { durumKur } from '../depo.ts';
import {
  denemeBitti, gkodKur, hamKaynagiKur, PR, prAllSig, prChecks, prIsDone, PS, prSeq, prSig, prStk, prSuggest, prToolNote, type GkodProgrami,
} from './hazirlik.ts';

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

beforeAll(() => {
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
  it('programlı sıra ve son onay imzası sunucunun beklediği biçimde', () => {
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
});

describe('ham ölçü', () => {
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
  it('program satırındaki takım notu okunur; öneri listesi boş değildir', () => {
    expect(prToolNote(1)).toBe('ALIN FREZE D50');
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
