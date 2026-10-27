import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtDays, kalibrasyon, lifeChain, lifeCompute, lifeFill, lifeParams, lifeTool, openAnalysis, trSuf, type HesapliSonuc } from './analiz.ts';
import { durumKur, MALZEME, modelHesabi, state, TAKIMLAR } from './test-verisi.ts';

vi.mock('./cekirdek.ts', () => import('./test-verisi.ts'));

beforeEach(() => { durumKur(); });

describe('lifeTool', () => {
  it('cep seçimi geçerliyse o cebi, değilse ilk takımlı cebi seçer; prob atlanır', () => {
    state.life.sel = 'p:2';
    expect(lifeTool()).toMatchObject({ pocket: 2, t: { id: 'dr8' } });
    state.life.sel = 'p:3';
    expect(lifeTool()).toMatchObject({ pocket: 0, t: { id: 'em10' } });
    expect(state.life.sel).toBe('p:0');
    state.life.sel = 't:fm50';
    expect(lifeTool()).toMatchObject({ pocket: null, t: { id: 'fm50' } });
  });
});

describe('openAnalysis ve lifeParams', () => {
  it('analize açılan cebin elle girilmiş değerleri boşalır; boş değer katalogdan gelir', () => {
    Object.assign(state.life, { vc: 150, f: 0.1, tp: 2, vb: 0.2 });
    openAnalysis(1);
    expect(state.life).toMatchObject({ sel: 'p:1', vc: '', f: '', tp: '', vb: '' });
    const p = lifeParams(TAKIMLAR[0]!, MALZEME);
    expect(p).toMatchObject({ vc: 200, f: 0.05, ap: 10, ae: 3, vb: 0.3, rel: 90, cal: 1, key: 'em10|c45' });
  });
});

describe('lifeCompute', () => {
  it('parça başı süre varsa parti planı, fiyat varsa ekonomik hız hesaplanır', () => {
    Object.assign(state.life, { sel: 'p:0', tp: 2, batch: 50, price: 300 });
    const r = lifeCompute() as HesapliSonuc;
    expect(r.lives).toHaveLength(2000);
    expect(r.tp).toBe(2);
    // Sahte modelde her örnek ömür 67 dk (eta), güvenli değişim 40 dk: kenar başına 20 parça, kırılma yok.
    expect(r.batch).toMatchObject({ Q: 50, per: 20, edgesMean: 3, failMean: 0, pFail: 0 });
    expect(r.costEdge).toBe(100);
    expect(r.vOpt).toBeGreaterThan(0);
  });
  it('ölçüm probunda hesap yapılmaz', () => {
    state.life.sel = 't:probe';
    const r = lifeCompute();
    expect(r.M.err).toBe('Ölçüm probu / boş cep — aşınma takibi yapılmaz');
  });
});

describe('lifeFill', () => {
  it('kullanıcının girmediği alanlara optimum değer önerir, girdiğine dokunmaz', () => {
    state.life.sel = 'p:0';
    state.life.vc = 180;
    const oto = lifeFill(lifeCompute());
    expect(oto.vc).toBeUndefined();
    expect(oto).toMatchObject({ f: '0.05', ap: '10', ae: '3', uses: '3' });
    // Parti, değişim süresi ve saat ücreti varsayılanı dolu: kullanıcı girmiş sayılır, önerilmez.
    expect([oto.batch, oto.tc, oto.rate]).toEqual([undefined, undefined, undefined]);
    expect(oto.tp).toBeUndefined();
  });
});

describe('lifeChain', () => {
  it('katalogdan parçaya adımları sırayla kurar', () => {
    const M = modelHesabi(), p = { vc: 200, f: 0.05, ap: 10, ae: 3, ld: 3, cool: 'bor5', vb: 0.3, rel: 80, cal: 1, key: 'k' };
    const z = lifeChain({ M, p, used: 10, parts: 12, tp: 2, tpSrc: 'elle girildi', perDay: 5 });
    expect(z.steps.map((s) => s.t)).toEqual(['Katalog ömrü', 'Sizin kesme veriniz', 'Ortalama ömür', 'Güvenli değişim', 'Kullanılan', 'Parçaya çevir', 'Takvime çevir']);
    expect(z.TR).toBe(40);
    expect(z.rem).toBe(30);
    expect(z.parts).toBe(15);
    expect(z.steps[3]?.on).toBe(8);
  });
  it('kalibrasyon ve bileme katsayısı adım olarak görünür', () => {
    const M = modelHesabi(), p = { vc: 200, f: 0.05, ap: 10, ae: 3, ld: 3, cool: 'bor5', vb: 0.3, rel: 50, cal: 1.5, key: 'k' };
    const z = lifeChain({ M, p, lf: 0.9 });
    expect(z.steps.map((s) => s.t)).toContain('Gerçek ölçümünüz');
    expect(z.steps.map((s) => s.t)).toContain('Bileme / düzeltme');
    expect(z.TR).toBeCloseTo(36);
    expect(z.parts).toBeNull();
  });
});

describe('biçim yardımcıları', () => {
  it('Türkçe ek ve iş günü', () => {
    expect([1, 3, 6, 8, 9].map((n) => n + trSuf(n))).toEqual(['1\'i', '3\'ü', '6\'sı', '8\'i', '9\'u']);
    expect(fmtDays(0.5)).toBe('≈ 4,0 saat (vardiya)');
    expect(fmtDays(12)).toBe('12 iş günü');
  });
  it('kalibrasyon katsayısı gözlenen / model, 0,05-20 arasında', () => {
    const r = { M: modelHesabi(), p: { cal: 1 } } as unknown as HesapliSonuc;
    expect(kalibrasyon(r, 90)).toBeCloseTo(1.5);
    expect(kalibrasyon(r, 100000)).toBe(20);
  });
});
