import { describe, expect, it } from 'vitest';
import type { IsMalzemesi, Kalem } from '../veri/tipler.ts';
import { famOf, fmtDur, lifeKind, lifeModel, lifeOpt, lifeRefs, progParams, vbShape, type KesmeKosulu, type OmurModeli } from './omur.ts';

// Beklenen değerler omur.ts'teki formülden elle hesaplanmıştır (Taylor + Weibull modeli); katalog verisine dayanılmaz.
// Değerler modelin bugünkü davranışını sabitler; atölye ölçümüyle doğrulanmış değer değildir.

function takim(kind: string, ek: Partial<Kalem> = {}): Kalem { return { id: `t_${kind}`, name: 'Takım', kind, ...ek }; }
function malzeme(ek: Partial<IsMalzemesi> = {}): IsMalzemesi {
  return { id: 'm', name: 'Deneme', code: '', iso: 'P', vcK: 200, vcH: 30, fk: 0.8, color: 0, isoCol: '', col: '', kind: 'mat', desc: '', tags: '', ...ek };
}
// Takımın kendi referans koşulu: bütün oranlar 1, soğutma bor5 (P grubunda 1).
function referansKosul(t: Kalem, m: IsMalzemesi, ek: Partial<KesmeKosulu> = {}): KesmeKosulu {
  const R = lifeRefs(t, m);
  return { vc: R.vref, f: R.fref, ap: R.apRef, ae: R.aeRef, ld: 3, cool: 'bor5', vb: 0.3, rel: 50, cal: 1, ...ek };
}
function model(t: Kalem, m: IsMalzemesi, p: KesmeKosulu): OmurModeli {
  const M = lifeModel(t, m, p);
  if (M.err !== undefined) throw new Error(M.err);
  return M;
}
const FREZE = takim('endmill', { d: 10, z: 4, tm: 'K', cut: { fz: 0.05 } });

describe('famOf', () => {
  it.each([
    [takim('tap', { tm: 'H' }), 60, 2.4, 0.14, 'HSS kılavuz'],
    [takim('endmill', { tm: 'H' }), 45, 2.4, 0.14, 'HSS takım'],
    [takim('lt_ext'), 15, 3.5, 0.25, 'Torna kesici ucu'],
    [takim('lt_udrill'), 25, 3.5, 0.25, 'U-matkap ucu'],
    [takim('idrill'), 25, 3.5, 0.25, 'U-matkap ucu'],
    [takim('shoulder'), 25, 3.5, 0.25, 'Uçlu freze'],
    [takim('boring2'), 40, 3.5, 0.25, 'Baralama ucu'],
    [takim('drill'), 45, 3, 0.25, 'Karbür matkap'],
    [takim('reamer'), 60, 3, 0.25, 'Karbür rayba'],
    [takim('endmill'), 35, 3, 0.25, 'Karbür freze'],
  ])('%o', (t, tref, beta, n, name) => {
    expect(famOf(t)).toEqual({ tref, beta, n, name });
  });
});

describe('lifeKind', () => {
  it('çapsız torna takımı tornalama, delik takımı delme, gerisi frezedir', () => {
    expect(lifeKind(takim('lt_ext'))).toEqual({ turning: true, drilling: false, milling: false });
    expect(lifeKind(takim('lt_udrill'))).toEqual({ turning: true, drilling: true, milling: false });
    expect(lifeKind(takim('drill', { d: 8 }))).toEqual({ turning: false, drilling: true, milling: false });
    expect(lifeKind(FREZE)).toEqual({ turning: false, drilling: false, milling: true });
  });
});

describe('lifeOpt', () => {
  it('aşınma sınırı: finiş 0,2, kaba 0,4, diğer 0,3 mm', () => {
    expect(lifeOpt(takim('ball')).vb).toBe(0.2);
    expect(lifeOpt(takim('endmill', { name: 'Finiş freze' })).vb).toBe(0.2);
    expect(lifeOpt(takim('rougher')).vb).toBe(0.4);
    expect(lifeOpt(takim('endmill', { name: 'Kaba freze' })).vb).toBe(0.4);
    expect(lifeOpt(FREZE).vb).toBe(0.3);
    expect(lifeOpt(takim('lt_ext', { cut: { fr: 0.1 } })).vb).toBe(0.2);
    expect(lifeOpt(takim('lt_ext', { cut: { fr: 0.3 } })).vb).toBe(0.4);
  });

  it('delik derinliği ve kullanım sayısı', () => {
    expect(lifeOpt(takim('drill', { name: 'Matkap 5×D' })).ld).toBe(5);
    expect(lifeOpt(takim('spot')).ld).toBe(1);
    expect(lifeOpt(takim('tap')).ld).toBe(2);
    expect(lifeOpt(takim('drill')).ld).toBe(3);
    expect(lifeOpt(takim('lt_ext', { tm: 'I' })).uses).toBe(2);
    expect(lifeOpt(FREZE).uses).toBe(3);
  });
});

describe('lifeRefs', () => {
  it('karbür freze: Vc katalogdan, f = fz · f çarpanı, kavrama tür tablosundan × çap', () => {
    // endmill [1 × Ø, 0,3 × Ø], Ø 10
    expect(lifeRefs(FREZE, malzeme())).toMatchObject({ vref: 200, apRef: 10, aeRef: 3, hss: false, fz: true, pitch: undefined });
    expect(lifeRefs(FREZE, malzeme()).fref).toBeCloseTo(0.04, 12);
  });

  it('eksi değer mm sayılır', () => {
    // facemill [2 mm, 0,7 × Ø], Ø 63
    const R = lifeRefs(takim('facemill', { d: 63, cut: { fz: 0.15 } }), malzeme());
    expect(R.apRef).toBe(2);
    expect(R.aeRef).toBe(44.1);
  });

  it('HSS takım HSS kesme hızını ve takım çarpanını kullanır', () => {
    expect(lifeRefs(takim('endmill', { tm: 'H', vm: 1.2, d: 10 }), malzeme()).vref).toBeCloseTo(36, 12);
    expect(lifeRefs(takim('endmill', { tm: 'H', d: 10 }), malzeme({ vcH: 0 })).vref).toBe(0);
  });

  it('tornada talaş derinliği ilerlemeye göre 2 ya da 0,5 mm; delmede kavrama yoktur', () => {
    expect(lifeRefs(takim('lt_ext', { cut: { fr: 0.3 } }), malzeme())).toMatchObject({ apRef: 2, aeRef: 0 });
    expect(lifeRefs(takim('lt_ext', { cut: { fr: 0.1 } }), malzeme()).apRef).toBe(0.5);
    expect(lifeRefs(takim('drill', { d: 8, cut: { fr: 0.1 } }), malzeme())).toMatchObject({ apRef: 0, aeRef: 0 });
  });

  it('kesme verisi yoksa ilerleme diş adımı ya da 0,1', () => {
    expect(lifeRefs(takim('tap', { d: 8, cut: { pitch: 1.25 } }), malzeme())).toMatchObject({ fref: 1.25, pitch: 1.25 });
    expect(lifeRefs(takim('endmill', { d: 8 }), malzeme()).fref).toBe(0.1);
  });
});

describe('vbShape', () => {
  it('aşınma eğrisi', () => {
    expect(vbShape(0)).toBe(0);
    expect(vbShape(0.5)).toBeCloseTo(0.4790678, 6);
    expect(vbShape(1)).toBeCloseTo(0.9999985, 6);
  });
});

describe('lifeModel', () => {
  it('prob, boş cep ve Vc tanımsız HSS ömür vermez', () => {
    expect(lifeModel(takim('probe'), malzeme(), referansKosul(FREZE, malzeme()))).toHaveProperty('err');
    expect(lifeModel(null, malzeme(), referansKosul(FREZE, malzeme()))).toHaveProperty('err');
    const hss = takim('endmill', { tm: 'H', d: 10 });
    expect(lifeModel(hss, malzeme({ vcH: 0 }), referansKosul(FREZE, malzeme()))).toEqual({ err: 'Bu malzemede HSS takım önerilmez (Vc tanımsız)' });
  });

  it('referans koşulda ömür ailenin referans ömrüdür', () => {
    // Karbür freze 35 dk; %50 güvende TR = Tm; eta = Tm / ln2^(1/3)
    const M = model(FREZE, malzeme(), referansKosul(FREZE, malzeme()));
    expect(M.T03).toBe(35);
    expect(M.Tm).toBeCloseTo(35, 4);
    expect(M.TR).toBeCloseTo(35, 4);
    expect(M.eta).toBeCloseTo(39.54815, 3);
    expect(M.P).toMatchObject({ n: 0.25, xf: 1.6, xap: 0.45, xae: 0.35, Tref: 35, beta: 3 });
    expect(M.capped).toBe(false);
    expect(M.lowV).toBe(false);
  });

  it('Taylor: kesme hızı iki katına çıkınca ömür 2^(-1/n) katına iner', () => {
    const m = malzeme(), R = lifeRefs(FREZE, m);
    const M = model(FREZE, m, referansKosul(FREZE, m, { vc: R.vref * 2 }));
    expect(M.f.V).toBeCloseTo(0.0625, 12);
    expect(M.T03).toBeCloseTo(2.1875, 12);
  });

  it('düşük hızda çarpan 4\'te, toplam çarpan 6\'da kesilir', () => {
    const m = malzeme(), R = lifeRefs(FREZE, m);
    const yari = model(FREZE, m, referansKosul(FREZE, m, { vc: R.vref / 2 }));
    expect(yari.f.V).toBe(4);
    expect(yari.T03).toBe(140);
    expect(yari.capped).toBe(true);
    expect(yari.lowV).toBe(true);
    // fV 4 · fF 2^1,6 ≈ 12,1 > 6
    const ikisi = model(FREZE, m, referansKosul(FREZE, m, { vc: R.vref / 2, f: R.fref / 2 }));
    expect(ikisi.f.F).toBeCloseTo(3.0314331, 6);
    expect(ikisi.T03).toBe(210);
  });

  it('malzemenin ömür üssü çarpanı Taylor üssüne girer', () => {
    // S grubu nk 0,7: 0,25 · 0,7 = 0,175
    const m = malzeme({ iso: 'S' });
    expect(model(FREZE, m, referansKosul(FREZE, m)).P.n).toBe(0.175);
  });

  it('soğutma çarpanı; HSS\'te farkı 1,5 katına çıkar', () => {
    const m = malzeme();
    expect(model(FREZE, m, referansKosul(FREZE, m, { cool: 'air' })).T03).toBeCloseTo(26.25, 12);
    // HSS takım 45 dk, hava P 0,75 → 1 + (0,75 - 1) · 1,5 = 0,625
    const hss = takim('endmill', { tm: 'H', d: 10, cut: { fz: 0.05 } });
    expect(model(hss, m, referansKosul(hss, m, { cool: 'air' })).T03).toBeCloseTo(28.125, 12);
  });

  it('delmede iç soğutma ek 1,15, derin delik √(3 / derinlik)', () => {
    const m = malzeme(), matkap = takim('drill', { d: 8, cut: { fr: 0.1 } });
    // Karbür matkap 45 dk; tsc P 1,2 · 1,15
    expect(model(matkap, m, referansKosul(matkap, m, { cool: 'tsc' })).T03).toBeCloseTo(62.1, 9);
    expect(model(matkap, m, referansKosul(matkap, m, { ld: 12 })).T03).toBeCloseTo(22.5, 9);
    const punta = takim('spot', { d: 8, cut: { fr: 0.1 } });
    expect(model(punta, m, referansKosul(punta, m, { ld: 12 })).f.ld).toBe(1);
  });

  it('diş adımlı takımda ilerleme ömrü değiştirmez', () => {
    const m = malzeme(), kilavuz = takim('tap', { d: 8, cut: { pitch: 1.25 } });
    expect(model(kilavuz, m, referansKosul(kilavuz, m, { f: 0.1 })).f.F).toBe(1);
  });

  it('kavrama üsleri: karbürde ap 0,45, ae 0,35; HSS\'te 0,6 ve 0,4', () => {
    const m = malzeme(), R = lifeRefs(FREZE, m);
    // Kavrama iki katına çıkınca ömür (1/2)^üs katına iner
    expect(model(FREZE, m, referansKosul(FREZE, m, { ap: R.apRef * 2 })).T03).toBeCloseTo(35 * Math.pow(0.5, 0.45), 9);
    expect(model(FREZE, m, referansKosul(FREZE, m, { ae: R.aeRef * 2 })).T03).toBeCloseTo(35 * Math.pow(0.5, 0.35), 9);
    const hss = takim('endmill', { tm: 'H', d: 10, cut: { fz: 0.05 } }), Rh = lifeRefs(hss, m);
    expect(model(hss, m, referansKosul(hss, m, { ap: Rh.apRef * 2 })).T03).toBeCloseTo(45 * Math.pow(0.5, 0.6), 9);
    expect(model(hss, m, referansKosul(hss, m, { ae: Rh.aeRef * 2 })).T03).toBeCloseTo(45 * Math.pow(0.5, 0.4), 9);
    // Tornada ap girer, ae girmez; delmede ikisi de girmez
    const torna = takim('lt_ext', { cut: { fr: 0.3 } });
    expect(model(torna, m, referansKosul(torna, m, { ap: 4 })).T03).toBeCloseTo(15 * Math.pow(0.5, 0.45), 9);
    expect(model(torna, m, referansKosul(torna, m, { ae: 5 })).f.ae).toBe(1);
    const matkap = takim('drill', { d: 8, cut: { fr: 0.1 } });
    expect(model(matkap, m, referansKosul(matkap, m, { ap: 5, ae: 5 })).f).toMatchObject({ ap: 1, ae: 1 });
  });

  it('kalibrasyon çarpanı ömrü doğrudan çarpar', () => {
    const m = malzeme();
    expect(model(FREZE, m, referansKosul(FREZE, m, { cal: 2 })).T03).toBe(70);
  });

  it('aşınma sınırı eğride hedefe denk gelen süreyi verir; güvenlik Weibull ile kısaltır', () => {
    const m = malzeme();
    const M = model(FREZE, m, referansKosul(FREZE, m, { vb: 0.2 }));
    expect(vbShape(M.Tm / M.T03)).toBeCloseTo(0.2 / 0.3, 6);
    const G = model(FREZE, m, referansKosul(FREZE, m, { rel: 80 }));
    // (−ln 0,8 / ln 2)^(1/3)
    expect(G.TR / G.Tm).toBeCloseTo(0.6853614, 6);
  });
});

describe('progParams', () => {
  it('programdaki devir ve ilerlemeden Vc ve f çıkar', () => {
    const q = referansKosul(FREZE, malzeme());
    expect(progParams(FREZE, { S: 3000, F: 1200, t: 1 }, q)).toBe(true);
    expect(q.vc).toBeCloseTo(Math.PI * 30, 9);
    expect(q.f).toBeCloseTo(0.1, 12);
    const matkap = takim('drill', { d: 8, cut: { fr: 0.1 } }), q2 = referansKosul(matkap, malzeme());
    expect(progParams(matkap, { S: 1000, F: 300, t: 1 }, q2)).toBe(true);
    expect(q2.f).toBeCloseTo(0.3, 12);
  });

  it('devir yoksa ya da çap yoksa program kullanılmaz', () => {
    const q = referansKosul(FREZE, malzeme());
    expect(progParams(FREZE, { S: 0, F: 100, t: 1 }, q)).toBe(false);
    expect(progParams(FREZE, null, q)).toBe(false);
    expect(progParams(takim('lt_ext'), { S: 1000, F: 100, t: 1 }, q)).toBe(false);
    expect(q.vc).toBe(200);
  });
});

describe('fmtDur', () => {
  it('saatin altı dakika, üstü saat', () => {
    expect(fmtDur(null)).toBe('');
    expect(fmtDur(0.5)).toBe('30 dk');
    expect(fmtDur(1.5)).toBe('1,5 sa');
  });
});
