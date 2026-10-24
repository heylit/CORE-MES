import { beforeEach, describe, expect, it } from 'vitest';
import { durumKur, state } from '../depo.ts';
import { gsimHazirla, SAMPLE_HEID, SAMPLE_ISO } from '../hesap/gkod.ts';
import { toolLib, machine } from '../secici.ts';
import {
  bilgi, gLoad, gOvMap, gPlay, GS, gSeek, gSeekLine, gSeekMove, hamSec, ilerle, takimSec, talasIlerle, yenidenHesapla,
} from './simulasyon.ts';

beforeEach(() => {
  durumKur(null, null);
  GS.prog = null;
});

describe('G-Kod simulasyon denetimi', () => {
  it('ornek Heidenhain programi yuklenir: ham BLK FORM, ozet ve takim degisimleri', () => {
    gLoad(SAMPLE_HEID, 'ORNEK.H (Heidenhain)');
    const p = GS.prog!;
    expect(p.heid).toBe(true);
    expect(p.tools).toEqual([1, 2, 3, 7, 9, 12]);
    expect(GS.used).toBe('blk');
    expect(GS.sb).toMatchObject({ x0: 0, y0: 0, z0: -30, x1: 120, y1: 80, z1: 0 });
    expect(GS.tcl).toHaveLength(6);
    expect((state.gsim as { name: string }).name).toBe('ORNEK.H (Heidenhain)');
    expect((state['gsimText'] as { name: string }).name).toBe('ORNEK.H (Heidenhain)');
    expect(GS.msg).toBe('');
  });

  it('BLK FORM yoksa ham kaynagi otomatige duser', () => {
    gsimHazirla().stockSrc = 'blk';
    gLoad(SAMPLE_ISO, 'O1001 (ISO)');
    expect(GS.used).toBe('auto');
    expect(gsimHazirla().stockSrc).toBe('auto');
  });

  it('Ham Malzeme hesabi yokken ham secimi BLK FORM ile calisir', () => {
    gLoad(SAMPLE_HEID, 'ORNEK.H (Heidenhain)');
    hamSec('ham');
    expect(GS.used).toBe('blk');
  });

  it('oynatma: zaman ilerler, sonda durur; satira ve harekete gidilir', () => {
    gLoad(SAMPLE_HEID, 'ORNEK.H (Heidenhain)');
    const p = GS.prog!;
    gPlay(true);
    expect(ilerle(0.1, 1)).toBe(true);
    expect(GS.t).toBeCloseTo(0.1);
    ilerle(0.1, p.total * 100);
    expect(GS.t).toBe(p.total);
    expect(GS.playing).toBe(false);
    gSeek(0);
    gSeekMove(3);
    expect(GS.idx).toBe(3);
    const ln = p.moves[10]!.ln;
    gSeekLine(ln);
    expect(p.moves[GS.idx]!.ln).toBeGreaterThanOrEqual(ln);
  });

  it('talas haritasi gecilen hareketleri damgalar, geri sarinca sifirlanir', () => {
    gLoad(SAMPLE_HEID, 'ORNEK.H (Heidenhain)');
    gSeek(GS.prog!.total / 2);
    talasIlerle(1000);
    const hm = GS.hm!;
    expect(hm.done).toBe(GS.idx);
    expect(Math.min(...hm.H)).toBeLessThan(0);
    gSeek(0);
    talasIlerle(1000);
    expect(hm.done).toBe(0);
  });

  it('takim secimi programa ozel saklanir ve takim bilgisini degistirir', () => {
    gLoad(SAMPLE_HEID, 'ORNEK.H (Heidenhain)');
    const T = GS.prog!.tools[1]!, once = bilgi(T);
    const diger = toolLib(machine()).find((t) => t.kind !== 'empty' && t.kind !== 'probe' && t.id !== once.id)!;
    takimSec(T, diger.id);
    expect(gOvMap()[String(T)]).toEqual({ id: diger.id });
    expect(bilgi(T).id).toBe(diger.id);
    takimSec(T, '');
    yenidenHesapla();
    expect(gOvMap()[String(T)]).toBeUndefined();
  });
});
