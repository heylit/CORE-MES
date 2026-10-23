import { describe, expect, it } from 'vitest';
import { PROGRAMLAR } from '../icerik/programlar.ts';
import { bosProfil } from '../normalize.ts';
import type { Soru } from '../tipler.ts';
import { aktifSorular, gecerliCevaplar, grupYuzdesi, kuralBaglami, programKullaniliyor, puanHesapla, puanOner } from './puan.ts';

const soru = (id: string, g: string, w: 1 | 2 | 3, d = false): Soru => ({ id, g, c: `${g}.1`, w, q: id, ev: [], fix: '', d });
const ISO = PROGRAMLAR.iso9001;

describe('puanHesapla', () => {
  const qs = [soru('a', '4', 3), soru('b', '4', 1), soru('c', '5', 2), soru('d', '5', 3), soru('s', 'S', 3)];

  it('ağırlıklı yüzde; N/A ve cevapsız dışarıda; savunma eki ayrı yüzde', () => {
    const r = puanHesapla(qs, { a: '3', b: '0', c: 'na', s: '0' }, ISO);
    // a: 9/9, b: 0/3 -> 9/12 = %75; S: 0/9
    expect(r.pct).toBe(75);
    expect(r.defPct).toBe(0);
    expect(r.answered).toBe(4);
    expect(r.na).toBe(1);
    expect(r.total).toBe(5);
    expect(grupYuzdesi(r.groups['4'])).toBe(75);
    expect(grupYuzdesi(r.groups['5'])).toBeNull();
  });

  it('kritik soruda 0 majör; 1 ve altı minör; 2 gözlem; savunma eki karara girmez', () => {
    const r = puanHesapla(qs, { a: '0', b: '1', c: '2', d: '3', s: '0' }, ISO);
    expect(r.risks.map((x) => [x.q.id, x.lvl])).toEqual([['a', 'major'], ['s', 'major'], ['b', 'minor'], ['c', 'obs']]);
    expect(r.isoMajor).toBe(1);
    expect(r.isoMinor).toBe(1);
    expect(r.good).toBe(1);
    expect(r.verdict?.k).toBe('bad');
  });

  it('cevap yoksa yüzde ve karar yok (sıfır uydurulmaz)', () => {
    const r = puanHesapla(qs, {}, ISO);
    expect(r.pct).toBeNull();
    expect(r.verdict).toBeNull();
  });

  it('85 ve üstü, en çok 2 minör: hazır', () => {
    expect(puanHesapla([soru('a', '4', 3), soru('b', '4', 1)], { a: '3', b: '3' }, ISO).verdict?.k).toBe('ok');
  });
});

describe('yardımcılar', () => {
  it('puanOner kanıt işaretlerinden puan önerir', () => {
    expect(puanOner(undefined)).toBeNull();
    expect(puanOner([false, false])).toBe('0');
    expect(puanOner([true, false, false])).toBe('1');
    expect(puanOner([true, false])).toBe('2');
    expect(puanOner([true, true])).toBe('3');
  });

  it('aktifSorular tanımlı şartları yalnız seçilince alır', () => {
    const tanimli = ISO.Q.filter((x) => x.d).length;
    expect(tanimli).toBeGreaterThan(0);
    expect(aktifSorular(ISO, false).length).toBe(ISO.Q.length - tanimli);
    expect(aktifSorular(ISO, true).length).toBe(ISO.Q.length);
  });

  it('örnek kipinde örnek cevaplar gösterilir, kişinin cevabı değişmez', () => {
    const p = bosProfil();
    p.pw.iso9001.ans = { x: '1' };
    p.pw.iso9001.example = true;
    expect(gecerliCevaplar(kuralBaglami(p, 'iso9001'))).toBe(ISO.EXAMPLE);
    p.pw.iso9001.example = false;
    expect(gecerliCevaplar(kuralBaglami(p, 'iso9001'))).toEqual({ x: '1' });
  });

  it('açık program her zaman kullanılıyor sayılır', () => {
    const p = bosProfil();
    expect(programKullaniliyor(p, 'as9100', 'as9100')).toBe(true);
  });
});
