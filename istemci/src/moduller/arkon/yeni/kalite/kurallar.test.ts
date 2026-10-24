import { describe, expect, it } from 'vitest';
import type { Maint } from '../../../../../../arkon/shared/model.ts';
import { ILK_AYARLAR } from '../cekirdek/ayarlar.ts';
import {
  bekleyenNumuneSayisi, guvenilirlik, olcumDegerlendir, paretoYuzde80, planKalanGun, yaklasanBakimSayisi, type BakimPlani,
} from './kurallar.ts';

// A4 kuralları: eskisinde ekranın içinde duran hesaplar. Adlar ve ölçüler uydurmadır.

const GUN = 864e5;
const simdi = new Date(2026, 2, 9, 12).getTime();
const olcu = { min: 19.98, max: 20, gauge: false };

describe('A4 kuralları', () => {
  it('ölçüm: toleransta kayıt, virgül unutulunca öneri, seçilen değer önerisiz, mastar geçer/geçmez', () => {
    expect(olcumDegerlendir(olcu, '19,99')).toEqual({ tur: 'kayit', v: 19.99, ok: true });
    expect(olcumDegerlendir(olcu, '1999')).toEqual({ tur: 'oneri', v: 1999, alt: 19.99 });
    expect(olcumDegerlendir(olcu, '25')).toEqual({ tur: 'kayit', v: 25, ok: false });
    expect(olcumDegerlendir(olcu, undefined, 1999)).toEqual({ tur: 'kayit', v: 1999, ok: false });
    expect(olcumDegerlendir(olcu, 'abc')).toEqual({ tur: 'yok' });
    expect(olcumDegerlendir({ ...olcu, gauge: true }, undefined, 'ok')).toEqual({ tur: 'kayit', v: 'Geçer', ok: true });
    expect(olcumDegerlendir({ ...olcu, gauge: true }, undefined, 'nok')).toEqual({ tur: 'kayit', v: 'Geçmez', ok: false });
  });

  it('bekleyen numune sayısı: bekleyen ve ölçülen sayılır, karara bağlanan sayılmaz (sekme rozeti)', () => {
    expect(bekleyenNumuneSayisi([{ status: 'waiting' }, { status: 'measuring' }, { status: 'approved' }, { status: 'rejected' }, { status: 'deviation' }])).toBe(2);
    expect(bekleyenNumuneSayisi([])).toBe(0);
  });

  it('periyodik bakım: kalan gün, gecikme ve yedi gün içindeki sayı; kapalı plan sayılmaz', () => {
    const plan = (id: string, son: number, ek: Partial<BakimPlani> = {}): BakimPlani => ({ id, type: 'plan', mc: 'M1', title: id, everyDays: 30, lastAt: son, ...ek });
    expect(planKalanGun(plan('a', simdi - 35 * GUN), simdi)).toEqual({ kalan: -5, renk: 'stop', etiket: '5 gün gecikti' });
    expect(planKalanGun(plan('b', simdi - 30 * GUN), simdi)).toMatchObject({ kalan: 0, etiket: 'Bugün', renk: 'hold' });
    expect(planKalanGun(plan('c', simdi - 10 * GUN), simdi)).toMatchObject({ kalan: 20, renk: 'run' });
    const liste: Maint[] = [plan('a', simdi - 35 * GUN), plan('b', simdi - 25 * GUN), plan('c', simdi - 10 * GUN), plan('d', simdi - 40 * GUN, { active: false })];
    expect(yaklasanBakimSayisi(liste, simdi)).toBe(2);
  });

  it('makine güvenilirliği: MTTR kapanan arızadan, çalışma verisi yoksa MTBF yok', () => {
    const a = { ...ILK_AYARLAR, tesis: { wcs: [], sts: [{ id: 'S1', name: 'Torna', wc: '', t: 'cnc' as const }], mcs: [{ id: 'M1', name: 'Tezgah', st: 'S1' }] } };
    const liste: Maint[] = [
      { id: '1', type: 'ariza', st: 'S1', mc: 'M1', title: 'x', openedAt: simdi - GUN, status: 'done', repairMs: 30 * 60e3, cause: 'Mekanik' },
      { id: '2', type: 'ariza', st: 'S1', title: 'y', openedAt: simdi - 2 * GUN, status: 'done', repairMs: 90 * 60e3, cause: 'Mekanik' },
      { id: '3', type: 'ariza', st: 'S1', mc: 'M1', title: 'z', openedAt: simdi - 3 * GUN, status: 'open' },
      { id: '4', type: 'ariza', st: 'S1', mc: 'M1', title: 'eski', openedAt: simdi - 100 * GUN, status: 'done', repairMs: 1 },
    ];
    const [r] = guvenilirlik(liste, null, 90, simdi, a);
    expect(r).toMatchObject({ n: 3, open: 1, mttr: 60 * 60e3, mtbf: null, run: null, cause: ['Mekanik', 2], down: 120 * 60e3 });
  });

  it('Pareto: toplamın %80\'ine ulaşan ilk neden sayısı', () => {
    expect(paretoYuzde80([{ ms: 50 }, { ms: 30 }, { ms: 20 }])).toBe(2);
    expect(paretoYuzde80([{ ms: 90 }, { ms: 10 }])).toBe(1);
  });
});
