// @vitest-environment node
import Module from 'highs';
import { describe, expect, it } from 'vitest';
import { calismaOku } from '../durum.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  DEGER_VARSAYILAN_TL, darbogazlar, geriIsGunu, geriZamanla, grupSaatTL, gunAyHafta, mesaiSaatTL, pencereSaati, planUretimi, saatOku, simdiOku,
  talepHizi, tezgahPencereleri, ufukMalzemesi, ufukTakvimi, ufukVerisi, urunAileleri, yatirimTL, yillikAyarOku, yillikAyarYaz, yillikDonemler,
  yillikHedefKur, yillikModel, yillikOzet, yillikSonuc, yillikTalep, yillikVeri, zamanKur, type CozumCevabi, type Zaman,
} from './kurallar.ts';

// Uydurma veri: iki tezgâh (torna, freze), bir vardiya (08-16, yarım saat mola), hafta içi; başlangıç 2026-10-05 pazartesi.
function calisma(ek: Record<string, unknown> = {}, cek: Record<string, unknown> = {}): PlanlamaCalismasi {
  const c = calismaOku({
    surum: 2, dataVer: 3, simdi: 7,
    D: {
      meta: { baslangic: '2026-10-05' },
      vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00', molalar: [{ bas: '12:00', bit: '12:30' }] }],
      calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'] },
      tezgahlar: [{ id: 'T1', grup: 'torna', verim: 1 }, { id: 'T2', grup: 'freze', verim: 1 }],
      urunler: [{ id: 'U1', rota: [
        { k: '10', aile: 'A', tezgahlar: [{ id: 'T1', ayar: 30, cevrim: 6 }] },
        { k: '20', aile: 'B', tezgahlar: [{ id: 'T2', ayar: 0, cevrim: 3 }] },
      ] }],
      siparisler: [{ id: 'S1', urun: 'U1', adet: 100, termin: '2026-10-20', gelir: 50000, siparisTarihi: '2026-10-01', malzeme: [{ kod: 'M1', miktar: 2 }] }],
      malzemeler: [{ kod: 'M1', ad: 'Mil', birim: 'kg', stok: 50, tedarikGun: 5, muayeneGun: 1, birimFiyat: 10 }],
      ...ek,
    },
    ...cek,
  });
  if (c === null) throw new Error('çalışma okunamadı');
  return c;
}
const zaman = (c: PlanlamaCalismasi): Zaman => { const z = zamanKur(c.D); if (z === null) throw new Error('zaman yok'); return z; };

// Sayfanın kurduğu modelin gerçek HiGHS'le çözülebildiğinin kanıtı. Ekran çözücü içermez (454/6 a); burada paket yalnız testte, node'da
// yüklenir ve sunucu ucunun yaptığı tek model çözümü (zaman sınırı, istenen sütunların değeri ve gölge fiyatı) taklit edilir.
interface HighsOrnegi {
  createModel: (g: { format: 'lp'; data: string }) => {
    options: { set: (o: Record<string, unknown>) => void };
    run: () => void;
    getModelStatus: () => number;
    getObjectiveValue: () => number;
    getSolution: () => { colValue: ArrayLike<number>; colDual?: ArrayLike<number> };
    getColByName: (ad: string) => number;
    dispose: () => void;
  };
}
function modelCoz(H: HighsOrnegi, lp: string, sure: number, want: readonly string[]): CozumCevabi {
  const md = H.createModel({ format: 'lp', data: lp });
  try {
    md.options.set({ output_flag: false, time_limit: sure, mip_rel_gap: 0 });
    md.run();
    const so = md.getSolution(); const val: Record<string, number> = {}; const dual: Record<string, number | null> = {};
    for (const ad of want) { const i = md.getColByName(ad); val[ad] = so.colValue[i] ?? 0; dual[ad] = so.colDual ? so.colDual[i] ?? null : null; }
    return { s: md.getModelStatus(), ob: md.getObjectiveValue(), val, dual };
  } finally { md.dispose(); }
}
let highs: Promise<HighsOrnegi> | null = null;
const coz = async (lp: string, sure: number, want: readonly string[]) => {
  highs ??= (Module as unknown as () => Promise<HighsOrnegi>)();
  return modelCoz(await highs, lp, sure, want);
};

describe('zaman ve takvim', () => {
  it('saat ekseni başlangıç günü 00:00\'dan; başlangıç yoksa zaman kurulmaz; şimdi 07:00\'den önce olmaz', () => {
    const c = calisma();
    const z = zaman(c);
    expect(saatOku(z, '2026-10-06 08:30')).toBe(32.5);
    expect(saatOku(z, '')).toBeNull();
    expect(saatOku(z, 'yarın')).toBeNull();
    expect(gunAyHafta(z, 32.5)).toBe('06.10 Sal');
    expect(zamanKur(calisma({ meta: {} }).D)).toBeNull();
    expect(simdiOku(c)).toBe(7);
    expect(simdiOku(calisma({}, { simdi: 50 }))).toBe(50);
  });

  it('açık pencereler motorla aynı kuralda: mola düşer, tatil kapalı, ek mesai eklenir, arıza düşer, ışıksız tezgâh bütün gün', () => {
    const c = calisma();
    const W = tezgahPencereleri(c, zaman(c));
    expect(pencereSaati(W.T1 ?? [], 0, 63 * 24)).toBe(45 * 7.5);
    const t = calisma({ tatiller: ['2026-10-06'] });
    expect(pencereSaati(tezgahPencereleri(t, zaman(t)).T1 ?? [], 0, 24 * 7)).toBe(4 * 7.5);
    const e = calisma({}, { ekMesai: [{ m: 'T1', gun: 5, vardiya: 'V1' }], down: [{ m: 'T1', from: 8, to: 10 }] });
    expect(pencereSaati(tezgahPencereleri(e, zaman(e)).T1 ?? [], 0, 24 * 7)).toBe(6 * 7.5 - 2);
    const i = calisma({ tezgahlar: [{ id: 'T1', grup: 'torna', isiksiz: true }] });
    expect(pencereSaati(tezgahPencereleri(i, zaman(i)).T1 ?? [], 0, 24 * 7)).toBe(5 * 24);
  });

  it('ufuk takvimi molasız vardiya süresi; geriye iş günü tatil ve hafta sonunu atlar', () => {
    const c = calisma();
    const cal = ufukTakvimi(c.D, zaman(c));
    expect(cal.tezSaat({ id: 'T1' }, 0)).toBe(8);
    expect(cal.tezSaat({ id: 'T1' }, 5)).toBe(0);
    // Pazartesi (gün 7) 00:00'dan bir iş günü geri: cuma (gün 4) 00:00.
    expect(geriIsGunu(cal, 7 * 24, 1)).toBe(4 * 24);
    expect(geriIsGunu(cal, 7 * 24, 0.5)).toBe(4 * 24 + 12);
  });
});

describe('talep hızı', () => {
  it('giriş yoksa hız yok (sıfır yazılmaz); 12 haftadan az girişte en az 12 haftaya bölünür', () => {
    const c = calisma();
    const z = zaman(c);
    expect(talepHizi(calisma({ siparisler: [] }).D, z, 7)).toEqual({ hafta: 0, hiz: null, dusuk: true });
    const h = talepHizi(c.D, z, 7);
    expect(h.dusuk).toBe(true);
    expect(h.hiz?.U1).toBeCloseTo(100 / 12);
    // Terminden sonraki giriş ya da 52 haftadan eski giriş sayılmaz.
    expect(talepHizi(calisma({ siparisler: [{ id: 'S9', urun: 'U1', adet: 5, termin: null, siparisTarihi: '2025-01-01' }] }).D, z, 7).hiz).toBeNull();
  });
});

describe('yıllık plan', () => {
  it('dönemler: 13 hafta, sonra aylar; bir yıl (364 gün) bitince kısa kuyruk öncekine katılır', () => {
    const P = yillikDonemler(zaman(calisma()));
    expect(P.slice(0, 13).every((p) => p.tur === 'hafta' && p.b - p.a === 7)).toBe(true);
    expect(P[0]?.ad).toBe('05.10');
    expect(P[13]).toMatchObject({ a: 91, tur: 'ay', ad: 'Oca 27' });
    expect(P[P.length - 1]?.b).toBe(364);
    expect(P.every((p, i) => i === 0 || p.a === P[i - 1]?.b)).toBe(true);
  });

  it('ayar yoksa sunucudaki varsayılan; taslağa yazma eksikse kurar', () => {
    const c = calisma();
    expect(yillikAyarOku(c.D)).toMatchObject({ tahmin: 'gecmis', buyume: 10, mesaiMaks: 15, yatirim: true, teslimAy: 3, hedef: null });
    const t = structuredClone(c);
    yillikAyarYaz(t.D).buyume = 20;
    expect(yillikAyarOku(t.D).buyume).toBe(20);
    expect(yillikAyarOku(c.D).buyume).toBe(10);
  });

  it('aile en uzun adımın ailesi; kapasite açık saat × kullanılabilirlik; kişi saati daha azsa kişi dar', () => {
    const c = calisma();
    const z = zaman(c);
    expect(urunAileleri(c.D).urunAile).toEqual({ U1: 'A' });
    const v = yillikVeri(c, z, yillikAyarOku(c.D));
    expect(v.aileler).toEqual(['A']);
    expect(v.kapH.torna).toBeCloseTo(37.5 * 0.85);
    expect(v.sinir.torna).toBe('tezgah');
    // Birim saat: (100 × 6/60 + 30/60 / 100) / 100 sipariş adedi ağırlıklı.
    expect(v.saat.A?.torna).toBeCloseTo(0.1 + 0.5 / 100);
    expect(v.birimDeger.A).toBe(500);
    const k = calisma({ personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['torna'] }], maliyetSis: { verim: 100 } });
    const vk = yillikVeri(k, z, yillikAyarOku(k.D));
    expect(vk.kapH.torna).toBe(37.5);
    const az = calisma({ personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['torna', 'freze'] }] });
    const va = yillikVeri(az, z, yillikAyarOku(az.D));
    expect(va.sinir.torna).toBe('kisi');
    expect(va.kapH.torna).toBe(8 * 5 / 2);
  });

  it('gelir yoksa birim değer eski sayfanın model ağırlığıdır ve işaretlenir', () => {
    const c = calisma({ siparisler: [{ id: 'S1', urun: 'U1', adet: 10, termin: '2026-10-20', gelir: null }] });
    const v = yillikVeri(c, zaman(c), yillikAyarOku(c.D));
    expect(v.birimDeger.A).toBe(DEGER_VARSAYILAN_TL);
    expect(v.degerVarsayilan).toEqual(['A']);
  });

  it('talep: sipariş termin dönemine; elle tahmin ayın gün payıyla; dönem talebi ikisinin büyüğü', () => {
    const c = calisma({ yillik: { tahmin: 'elle', elle: { A: { '2026-10': 310 } } } });
    const z = zaman(c);
    const A = yillikAyarOku(c.D);
    const v = yillikVeri(c, z, A);
    const P = yillikDonemler(z);
    const T = yillikTalep(v, P, A, z);
    expect(T.fir.A?.[2]).toBe(100);
    expect(T.tah.A?.[0]).toBeCloseTo(310 * 7 / 31);
    expect(T.d.A?.[2]).toBe(100);
    expect(T.d.A?.[0]).toBeCloseTo(70);
    expect(T.d.A?.[5]).toBe(0);
  });

  it('mesai ve yatırım bedeli: ayar yoksa bilinmez (uydurma varsayılan kurulmaz); ayarla eski formül', () => {
    const c = calisma();
    expect(grupSaatTL(c.D, 'torna')).toBeNull();
    expect(mesaiSaatTL(c.D, 'torna')).toBeNull();
    expect(yatirimTL(c.D, 'torna')).toBeNull();
    const m = calisma({
      personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['torna'] }],
      mesaiSis: { aylikSaat: 200, sgk: 20, yanHak: 0, carp: { hi: 1.5 }, kisiEk: 80, ucret: { P1: { brut: 40000 } } },
      maliyetSis: { verim: 85, tez: { T1: { bedel: 1_200_000, omur: 10, hurda: 0 } } },
    });
    expect(grupSaatTL(m.D, 'torna')).toBe(240);
    expect(mesaiSaatTL(m.D, 'torna')).toBe(240 * 1.5 + 10);
    expect(yatirimTL(m.D, 'torna')).toBe(10000 + 240 * 200 * 2);
  });

  it('HiGHS ile: kapasite yetiyorsa açık yok; yetmiyorsa önce ek mesai, sonra acil kapasite ve gölge fiyat', async () => {
    const c = calisma({ yillik: { yatirim: false } });
    const z = zaman(c);
    const A = yillikAyarOku(c.D);
    const v = yillikVeri(c, z, A);
    const P = yillikDonemler(z);
    const T = yillikTalep(v, P, A, z);
    const m = yillikModel(c.D, v, P, T, A, { yat: false });
    expect(m.mesaiVarsayilan).toEqual(['torna', 'freze']);
    const r = await coz(m.lp, 30, m.want);
    expect(r.s).toBe(7);
    const s = yillikSonuc(c.D, v, P, T, r, r, m, r);
    const o = yillikOzet(v, s);
    expect(o.acil).toBeCloseTo(0);
    expect(o.topD).toBeGreaterThanOrEqual(100);

    // Bir haftalık kapasitenin üstünde sipariş: 400 adet × 6 dk = 40 sa > 31,9 sa.
    const b = calisma({ yillik: { yatirim: false, tahmin: 'elle', elle: {} }, siparisler: [{ id: 'S1', urun: 'U1', adet: 2000, termin: '2026-10-09', gelir: 1e7 }] });
    const Ab = yillikAyarOku(b.D);
    const vb = yillikVeri(b, z, Ab);
    const Tb = yillikTalep(vb, P, Ab, z);
    const mb = yillikModel(b.D, vb, P, Tb, Ab, { yat: false });
    const rb = await coz(mb.lp, 30, mb.want);
    const sb = yillikSonuc(b.D, vb, P, Tb, rb, rb, mb, rb);
    const ilk = sb.grup.torna?.[0];
    expect(ilk?.o).toBeCloseTo((vb.kapH.torna ?? 0) * 0.15, 3);
    expect(yillikOzet(vb, sb).gecAdet).toBeGreaterThan(0);
    expect(darbogazlar(vb, sb)[0]?.g).toBe('torna');
  });

  it('yatırım adayı bedeli bilinen grupta denenir; hedef yalnız öne üretimden kurulur', async () => {
    const c = calisma({
      personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['torna'] }],
      mesaiSis: { aylikSaat: 200, sgk: 0, yanHak: 0, ucret: { P1: { brut: 40000 } } },
      maliyetSis: { verim: 85, tez: { T1: { bedel: 100000, omur: 10 } } },
      siparisler: [{ id: 'S1', urun: 'U1', adet: 3000, termin: '2027-03-01', gelir: 3e7 }],
      yillik: { teslimAy: 1 },
    });
    const z = zaman(c);
    const A = yillikAyarOku(c.D);
    const v = yillikVeri(c, z, A);
    const P = yillikDonemler(z);
    const T = yillikTalep(v, P, A, z);
    const yatAday = (g: string, s: number): boolean => P[s]?.tur === 'ay' && yatirimTL(c.D, g) !== null;
    const m1 = yillikModel(c.D, v, P, T, A, { yat: true, yatAday });
    expect(m1.lp).toContain('Binary');
    expect(m1.lp).toContain('tek_g0:');
    // Genel gider ayarı yoksa yatırım bedeli bilinmez; aday olmaz, model doğrusal kalır.
    const y = calisma({ siparisler: c.D.siparisler });
    const vy = yillikVeri(y, z, yillikAyarOku(y.D));
    const yAday = (g: string, s: number): boolean => P[s]?.tur === 'ay' && yatirimTL(y.D, g) !== null;
    expect(yillikModel(y.D, vy, P, yillikTalep(vy, P, yillikAyarOku(y.D), z), yillikAyarOku(y.D), { yat: true, yatAday: yAday }).lp).not.toContain('Binary');
    const r1 = await coz(m1.lp, 30, m1.want);
    expect([7, 13]).toContain(r1.s);
    const s = yillikSonuc(c.D, v, P, T, r1, r1, m1, r1);
    const h = yillikHedefKur(c.D, v, P, s);
    expect(h.aile).toEqual({ U1: 'A' });
    for (const [f, t, k] of h.hedef) { expect(f).toBe('A'); expect(t).toBeLessThan(63 * 24); expect(k).toBeLessThanOrEqual(3000); }
  });

  it('plan üretimi çözülmüş planın iş bitişinden; plan yoksa bilinmez', () => {
    const h = { aile: { U1: 'A' }, hedef: [] };
    expect(planUretimi(calisma(), h, 'A', 500)).toBeNull();
    const c = calisma({}, { plan: { dataVer: 3, J: { S1: { C: 300 } }, ops: {} } });
    expect(planUretimi(c, h, 'A', 500)).toBe(100);
    expect(planUretimi(c, h, 'A', 200)).toBe(0);
  });
});

describe('ufuk', () => {
  const plan = { dataVer: 3, ops: {
    'S1.10': { id: 'S1.10', job: 'S1', m: 'T1', S: 32, C: 40, su: 0.5, run: 7.5 },
    'S1.20': { id: 'S1.20', job: 'S1', m: '@F1', S: 40, C: 60 },
  }, fail: [] };

  it('plan yoksa ufuk kurulmaz', () => { const c = calisma(); expect(ufukVerisi(c, zaman(c), true)).toBeNull(); });

  it('plan yükü haftasına, fason sayılmaz; plan dışı sipariş terminden geriye; kapasite takvimden × kullanılabilirlik', () => {
    const c = calisma({ siparisler: [
      { id: 'S1', urun: 'U1', adet: 100, termin: '2026-10-20' },
      { id: 'S2', urun: 'U1', adet: 10, termin: '2026-11-13', havuz: true },
    ] }, { plan });
    const v = ufukVerisi(c, zaman(c), false);
    expect(v).not.toBeNull();
    if (!v) return;
    expect(v.H).toHaveLength(52);
    expect(v.H[0]?.plan).toBe(true);
    expect(v.H[9]?.plan).toBe(false);
    expect(v.fasN).toBe(1);
    const torna = v.sat.find((s) => s.g === 'torna');
    expect(torna?.w[0]?.plan).toBeCloseTo(8);
    expect(torna?.w[0]?.kap).toBeCloseTo(40 * 0.85);
    expect(v.kaba.map((k) => k.s.id)).toEqual(['S2']);
    expect(v.kaba[0]?.havuz).toBe(true);
    expect(v.kaba[0]?.gec).toBe(0);
    expect(v.yuk.filter((y) => y.kat === 'kaba').map((y) => y.j)).toEqual(['S2', 'S2']);
  });

  it('başlangıcı bugünden önceye düşen plan dışı sipariş bugüne kayar ve "termine yetişmiyor" sayılır', () => {
    const c = calisma({ siparisler: [{ id: 'S3', urun: 'U1', adet: 500, termin: '2026-10-06' }] }, { plan: { dataVer: 3, ops: {} } });
    const v = ufukVerisi(c, zaman(c), false);
    expect(v?.kaba[0]?.gec).toBeGreaterThan(0);
    expect(v?.kaba[0]?.r.bas).toBe(7);
  });

  it('geriye zamanlama en hızlı tezgâhta, iş günü olarak; fason adım fasoncunun süresi', () => {
    const c = calisma({ fasoncular: [{ id: 'F1', sureGun: 3, cikisGunleri: ['pzt', 'per'] }] });
    const z = zaman(c);
    const cal = ufukTakvimi(c.D, z);
    const u = { id: 'U2', rota: [{ k: '10', tezgahlar: [{ id: 'T1', ayar: 60, cevrim: 6 }, { id: 'T2', ayar: 0, cevrim: 12 }] }, { k: '20', fason: 'F1' }] };
    const tezOf = Object.fromEntries(c.D.tezgahlar.map((t) => [t.id, t]));
    const r = geriZamanla(cal, u, 10, 14 * 24, 1, tezOf, { F1: { id: 'F1', sureGun: 3, cikisGunleri: ['pzt', 'per'] } }, { T1: 8, T2: 8 });
    expect(r.adim.map((a) => a.m ?? a.fas)).toEqual(['T1', 'F1']);
    expect(r.adim[1]?.a).toBe(14 * 24 - (3 + 7 / 2 / 2) * 24);
    expect(r.adim[0]?.h).toBe(2);
  });

  it('malzeme: stok önce, sonra açık sipariş öne çekilir, kalanı yeni alım; en geç talep ihtiyaç − muayene − tedarik', () => {
    const c = calisma({ satinalma: [{ kod: 'M1', miktar: 100, gelis: '2026-10-30', tedarikci: 'TD1' }], tedarikciler: [{ id: 'TD1', ortGecikmeGun: 2 }] });
    const z = zaman(c);
    const cal = ufukTakvimi(c.D, z);
    const H = Array.from({ length: 8 }, (_, k) => ({ k, a: k * 168, b: k * 168 + 168, ad: '', plan: true }));
    const wOf = (t: number) => Math.min(7, Math.max(0, Math.floor(t / 168)));
    const [m] = ufukMalzemesi(c.D, z, [{ kod: 'M1', t: 200, q: 300, kat: 'plan', j: 'S1' }], 7, false, wOf, H, cal);
    expect(m?.stok).toBe(50);
    expect(m?.one).toEqual([expect.objectContaining({ q: 100, po: 0 })]);
    expect(m?.yeniQ).toBe(150);
    // İhtiyaç 200. saat (gün 8, salı); en geç talep 6 gün önce: gün 2'nin (çarşamba) 08:00'i.
    expect(m?.ilkTalep).toBe(2 * 24 + 8);
    expect(m?.satir[1]?.son).toBe(0);
  });
});
