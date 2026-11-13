import { describe, expect, it } from 'vitest';
import { derle, girdiKur, planOku, plandanBitenler } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import {
  adimBeklemesi, aralikYuku, aramaUyar, darbogaz, emirGunleri, enCokBekleyen, tezgahGunundeMi, durumYazisi, ilkBosluk, matrisSirasi, modelKur, olcekKomsusu, onizlemeBitisi, satirKimligi, sayim, sorunlular, sureYaz,
  acigaOtur, hucreler3B, onayliGecSayisi, yeriDegisti, tasimaSaati, tasinabilir, turAdaylari, yukSinifi, yukYuzdesi, type KokpitEmri, type KokpitIsi, type KokpitModeli,
} from './kurallar.ts';

// Örnek çalışma uydurmadır: iki emir (biri geç, biri riskli), beş tezgâh, bir fason adım.
function ornek() {
  const c = ornekCalisma(), p = planOku(c);
  const cx = derle(girdiKur(c, plandanBitenler(c, p)));
  return { c, p, cx, m: modelKur(c, p, cx, (id) => `ORN-${id}`) };
}
const is = (id: string, m: string, S: number, C: number, ek: Partial<KokpitIsi> = {}): KokpitIsi => ({ id, job: id.split('.')[0] ?? id, ad: id, m, S, C, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const emir = (id: string, ek: Partial<KokpitEmri>): KokpitEmri => ({ id, no: id, urun: 'Deneme', adet: 1, termin: null, bitis: null, durum: 'iyi', gecikme: null, adimlar: [], ...ek });
const model = (isler: KokpitIsi[], emirler: KokpitEmri[], simdi = 0): KokpitModeli => ({
  simdi, tezgahlar: [{ id: 'T1', kod: 'T1', ad: '', fason: false }, { id: 'T2', kod: 'T2', ad: '', fason: false }],
  isler: Object.fromEntries(isler.map((x) => [x.id, x])), emirler, bas: 0, son: 336, acik: {},
});

describe('Kokpit modeli', () => {
  it('çalışmadan emirleri, işleri ve durumları kurar; fason adım tek satırda toplanır', () => {
    const { m } = ornek();
    expect(m.emirler.map((e) => [e.no, e.durum])).toEqual([['ORN-2', 'gec'], ['ORN-3', 'risk']]);
    expect(sayim(m.emirler)).toEqual({ gec: 1, risk: 1, plansiz: 0 });
    const fason = Object.values(m.isler).find((x) => x.fason);
    expect(fason && satirKimligi(fason)).toBe('@');
    expect(m.tezgahlar.at(-1)).toMatchObject({ id: '@', fason: true });
    const gec = m.emirler[0];
    expect(gec?.gecikme).toBeCloseTo((gec?.bitis ?? 0) - (gec?.termin ?? 0));
    expect(gec && durumYazisi(gec)).toMatch(/ geç$/);
  });

  it('kilit simgesi yalnız kullanıcının kilidinden gelir; motorun sabitlediği iş kilitli sayılmaz', () => {
    const { c, p, cx } = ornek();
    const sabit = Object.entries(p?.ops ?? {}).find(([, x]) => x.pin)?.[0];
    expect(sabit).toBeDefined();
    expect(Object.values(modelKur({ ...c, locks: {} }, p, cx, (id) => id).isler).some((x) => x.kilitli)).toBe(false);
    const m = modelKur({ ...c, locks: { [sabit ?? '']: { m: 'x', S: 0 } } }, p, cx, (id) => id);
    expect(Object.values(m.isler).filter((x) => x.kilitli).map((x) => x.id)).toEqual([sabit]);
  });

  it('plan yokken her emir plansızdır; sıfır bitiş uydurulmaz', () => {
    const { c, cx } = ornek();
    const m = modelKur(c, null, cx, (id) => id);
    expect(m.emirler.length).toBeGreaterThan(0);
    expect(m.emirler.every((e) => e.durum === 'plansiz' && e.bitis === null && e.gecikme === null)).toBe(true);
    expect(Object.keys(m.isler)).toEqual([]);
  });

  it('sorunlular en ağırdan başlar, matris sorunluları üste alır; arama emir no, ürün ve tezgâh kodunda arar', () => {
    const l = [emir('A', { durum: 'iyi', termin: 5 }), emir('B', { durum: 'risk', termin: 9 }), emir('C', { durum: 'gec', gecikme: 2 }), emir('D', { durum: 'gec', gecikme: 7 }), emir('E', { durum: 'plansiz' })];
    expect(sorunlular(l).map((e) => e.id)).toEqual(['D', 'C', 'B', 'E']);
    expect(matrisSirasi(l).map((e) => e.id).slice(-1)).toEqual(['A']);
    const { m } = ornek();
    const e = m.emirler[0];
    if (!e) throw new Error('emir yok');
    expect(aramaUyar(e, m, 'orn-2')).toBe(true);
    expect(aramaUyar(e, m, 'flanş')).toBe(true);
    expect(aramaUyar(e, m, 'fason')).toBe(true);
    expect(aramaUyar(e, m, 'yok-böyle')).toBe(false);
  });
});

describe('Kokpit yükü ve ölçeği', () => {
  it('tezgâhın gün yükü açık saate oranlanır; kapalı günde yüzde yoktur', () => {
    const { m, cx } = ornek();
    // Vardiya içinde başlayan bir iş (gece yarısını aşan işin ilk gününde açık saat olmayabilir).
    const x = Object.values(m.isler).find((y) => !y.fason && !y.basladi);
    if (!x) throw new Error('iş yok');
    const gun = Math.floor(x.S / 24) * 24;
    const y = aralikYuku(cx, Object.values(m.isler), x.m, gun, gun + 24);
    expect(y.acik).toBeGreaterThan(0);
    expect(y.plan).toBeGreaterThan(0);
    expect(y.plan).toBeLessThanOrEqual(y.acik + 1e-6);
    expect(yukYuzdesi({ acik: 0, plan: 0 })).toBeNull();
    expect(yukSinifi({ acik: 0, plan: 0 })).toBe('kapali');
    expect([0.2, 0.6, 0.9, 1.2].map((o) => yukSinifi({ acik: 10, plan: o * 10 }))).toEqual(['hafif', 'orta', 'dolu', 'asim']);
    expect(aralikYuku(cx, [], 'yok', 0, 24)).toEqual({ acik: 0, plan: 0 });
  });

  it('ölçek komşusu uçlarda durur', () => {
    expect(olcekKomsusu('G', -1)).toBe('G');
    expect(olcekKomsusu('G', 1)).toBe('3');
    expect(olcekKomsusu('Y', 1)).toBe('Y');
  });
});

describe('Kokpit taşıma ve tur', () => {
  it('taşıma saati çeyrek saate oturur ve şimdiden önce olamaz; başlamış ve fason iş taşınmaz', () => {
    expect(tasimaSaati(10.1, 0)).toBe(10);
    expect(tasimaSaati(3, 8.1)).toBe(8.25);
    expect(tasinabilir(is('a.1', 'T1', 0, 1))).toBeNull();
    expect(tasinabilir(is('a.1', 'T1', 0, 1, { basladi: true }))).toMatch(/Başlamış/);
    expect(tasinabilir(is('a.1', '@F', 0, 1, { fason: true }))).toMatch(/Fason/);
  });

  it('ilk boşluk süreye yeten ilk aralıktır; taşınan işin kendi yeri boş sayılır', () => {
    const m = model([is('a.1', 'T1', 0, 4), is('b.1', 'T1', 5, 9), is('c.1', 'T1', 20, 24)], []);
    expect(ilkBosluk(m, 'T1', 1, 0)).toBe(4);
    expect(ilkBosluk(m, 'T1', 3, 0)).toBe(9);
    expect(ilkBosluk(m, 'T1', 3, 0, 'b.1')).toBe(4);
    expect(ilkBosluk(m, 'T2', 3, 2)).toBe(2);
    // Başlangıç tezgâhın açık saatine oturur; pencere kalmadıysa an olduğu gibi kalır.
    expect(ilkBosluk({ ...m, acik: { T2: [[8, 16], [32, 40]] } }, 'T2', 3, 2)).toBe(8);
    expect(ilkBosluk({ ...m, acik: { T1: [[0, 6], [30, 40]] } }, 'T1', 3, 0)).toBe(30);
    expect(acigaOtur([[8, 16]], 20)).toBe(20);
    expect(acigaOtur([[8, 16]], 10)).toBe(10);
  });

  it('tur adayı yalnız bugünkü yerinden erken olan yerdir; öncül adım beklenir; plansız emre aday yoktur', () => {
    const e = emir('a', { durum: 'gec', termin: 30, bitis: 44, gecikme: 14, adimlar: [{ id: 'a.1', ad: 'Torna', adaylar: ['T1'] }, { id: 'a.2', ad: 'Freze', adaylar: ['T1', 'T2', '@F'] }] });
    const m = model([is('a.1', 'T1', 2, 6), is('a.2', 'T1', 40, 44, { sira: 1 }), is('b.1', 'T1', 6, 40), is('c.1', 'T2', 0, 10)], [e], 1);
    // Bekleyen her adım denenir, en çok öne alan başta; ikinci adım için T1'de erken yer yok, T2'de 10'da var, fason aday sayılmaz.
    expect(turAdaylari(m, e)).toEqual([{ isId: 'a.2', tezgah: 'T2', baslangic: 10 }, { isId: 'a.1', tezgah: 'T1', baslangic: 1 }]);
    expect(turAdaylari(m, e, null, 1)).toHaveLength(1);
    expect(turAdaylari(m, e, 'a.2')).toEqual([{ isId: 'a.2', tezgah: 'T2', baslangic: 10 }]);
    expect(turAdaylari(m, emir('p', { durum: 'plansiz', adimlar: e.adimlar }))).toEqual([]);
    // Hiçbir adımı planda olmayan emir plana alınır: ilk adımın fason olmayan aday tezgâhları, şimdiden sonraki ilk açık an.
    const acik = { ...m, acik: { T2: [[8, 16]] as const } };
    expect(turAdaylari(acik, emir('p', { durum: 'plansiz', adimlar: [{ id: 'p.1', ad: 'Torna', adaylar: ['T1', '@F', 'T2'] }, { id: 'p.2', ad: 'Freze', adaylar: ['T2'] }] })))
      .toEqual([{ isId: 'p.1', tezgah: 'T1', baslangic: 1, planaAl: 'p' }, { isId: 'p.1', tezgah: 'T2', baslangic: 8, planaAl: 'p' }]);
    expect(onizlemeBitisi(m, e, [{ isId: 'a.2', C: 14 }])).toBe(14);
    expect(onizlemeBitisi(m, emir('x', { adimlar: [{ id: 'yok.1', ad: '', adaylar: [] }] }), [])).toBeNull();
  });

  it('süre gün, saat ve dakika ile yazılır', () => {
    expect(sureYaz(0)).toBe('0 dk');
    expect(sureYaz(0.25)).toBe('15 dk');
    expect(sureYaz(-26.5)).toBe('1 gün 2 sa 30 dk');
  });
});

describe('Kokpit matrisi', () => {
  // A: T1'de 0-10, sonra T2'de 40-50 (T2'yi B tutuyor: 30 saat sıra); termin 30, bitiş 50: geç. B: T2'de 0-40, zamanında.
  const adim = (id: string) => ({ id, ad: id, adaylar: ['T1', 'T2'] });
  const A = emir('A', { durum: 'gec', termin: 30, bitis: 50, gecikme: 20, adimlar: [adim('A.1'), adim('A.2')] });
  const B = emir('B', { termin: 100, bitis: 40, adimlar: [adim('B.1')] });
  const m = model([is('A.1', 'T1', 0, 10), is('A.2', 'T2', 40, 50, { sira: 1 }), is('B.1', 'T2', 0, 40)], [A, B]);

  it('adımın beklemesi önceki adım bitince başlar; başlamış, fason ve plansız adım beklemez', () => {
    expect(adimBeklemesi(m, A, 0)).toBeNull();
    expect(adimBeklemesi(m, A, 1)).toEqual({ bas: 10, son: 40, acik: 30, sure: 30 });
    expect(enCokBekleyen(m, A)).toMatchObject({ k: 1, tezgah: 'T2' });
    expect(enCokBekleyen(m, B)).toBeNull();
    const basladi = model([is('A.1', 'T1', 0, 10), is('A.2', 'T2', 40, 50, { basladi: true })], [A]);
    expect(adimBeklemesi(basladi, A, 1)).toBeNull();
    const fason = model([is('A.1', 'T1', 0, 10), is('A.2', '@x', 40, 50, { fason: true })], [A]);
    expect(adimBeklemesi(fason, A, 1)).toBeNull();
    expect(adimBeklemesi(model([is('A.1', 'T1', 0, 10)], [A]), A, 1)).toBeNull();
  });

  it('bekleme eşiği tezgâhın açık saatiyle ölçülür: kapalı saatte geçen süre sıra sayılmaz', () => {
    const gece: KokpitModeli = { ...m, acik: { T2: [[0, 12], [38, 60]] } };
    // 10-40 arasında T2 yalnız 10-12 ve 38-40 açık: 4 saat açık, 30 saat duvar saati.
    expect(adimBeklemesi(gece, A, 1)).toMatchObject({ acik: 4, sure: 30 });
    const kapali: KokpitModeli = { ...m, acik: { T2: [[0, 10], [39, 60]] } };
    expect(enCokBekleyen(kapali, A)).toBeNull();
  });

  it('darboğaz geç emirlerin en çok beklediği tezgâhtır; geç emir yokken null', () => {
    expect(darbogaz(m)).toEqual({ tezgah: 'T2', sure: 30, emir: 1 });
    expect(darbogaz({ ...m, emirler: [B] })).toBeNull();
  });

  it('emrin günleri: süren adımlar, sırada beklenen gün, termin günü ve terminden sonrası', () => {
    const g = emirGunleri(m, A, 4);
    expect(g.map((x) => x.adimlar)).toEqual([[0], [1], [1], []]);
    // İlk gün işi var (bekleme çizilmez); termin (30. saat) ikinci gündedir; üçüncü gün terminden sonra sürer.
    expect(g.map((x) => x.bekle)).toEqual([false, false, false, false]);
    expect(g.map((x) => x.termin)).toEqual([false, true, false, false]);
    expect(g.map((x) => x.sonra)).toEqual([false, false, true, false]);
    // Araya iş girmeyen gün beklemedir.
    const uzun = model([is('A.1', 'T1', 0, 10), is('A.2', 'T2', 80, 90, { sira: 1 })], [A]);
    expect(emirGunleri(uzun, A, 4).map((x) => x.bekle)).toEqual([false, true, true, false]);
  });

  it('yük hücresi süzgeci o tezgâhta o gün işi olan emri tutar', () => {
    expect(tezgahGunundeMi(m, A, 'T2', 1)).toBe(true);
    expect(tezgahGunundeMi(m, A, 'T2', 0)).toBe(false);
    expect(tezgahGunundeMi(m, B, 'T2', 0)).toBe(true);
    expect(tezgahGunundeMi(m, B, 'T1', null)).toBe(false);
  });
});

describe('3B hücreleri', () => {
  it('tezgâh-gün yükü Matris ile aynı; durum hücredeki en kötü emir; onaylı plan yoksa değişen ve önce boş', () => {
    const { m, cx } = ornek();
    const h = hucreler3B(m, cx, null);
    expect(h).toHaveLength(m.tezgahlar.filter((t) => !t.fason).length);
    const x = Object.values(m.isler).find((i) => !i.fason);
    if (!x) throw new Error('örnekte tezgâh işi yok');
    const ti = m.tezgahlar.findIndex((t) => t.id === x.m), g = Math.floor((x.S - m.bas) / 24);
    const c = h[ti]?.[g];
    const y = aralikYuku(cx, Object.values(m.isler), x.m, m.bas + g * 24, m.bas + g * 24 + 24);
    expect(c?.yuk).toBeCloseTo(y.plan / y.acik);
    const d = m.emirler.find((e) => e.id === x.job)?.durum;
    expect(c?.durum).toBe(d === 'gec' ? 'gec' : d === 'iyi' ? 'iyi' : 'risk');
    expect(h.flat().every((k) => k.degisen === null && k.once === null)).toBe(true);
    expect(h.flat().filter((k) => k.yuk === null).every((k) => k.durum === null)).toBe(true);
  });

  it('onaylı planla aynı yerdeki işler değişmiş sayılmaz; kayan işin saati değişen payına girer', () => {
    const { m, cx } = ornek();
    const ayni = Object.fromEntries(Object.values(m.isler).map((x) => [x.id, { m: x.m, S: x.S, C: x.C }]));
    const h = hucreler3B(m, cx, ayni);
    expect(h.flat().filter((k) => k.yuk !== null).every((k) => k.degisen === 0 && k.once !== null && Math.abs(k.once - (k.yuk ?? 0)) < 1e-9)).toBe(true);
    const x = Object.values(m.isler).find((i) => !i.fason);
    if (!x) throw new Error('örnekte tezgâh işi yok');
    const kayik = { ...ayni, [x.id]: { m: x.m, S: x.S - 2, C: x.C - 2 } };
    const ti = m.tezgahlar.findIndex((t) => t.id === x.m), satir = hucreler3B(m, cx, kayik)[ti] ?? [];
    expect(satir.some((k) => (k.degisen ?? 0) > 0)).toBe(true);
    expect(hucreler3B(m, cx, kayik).filter((_, i) => i !== ti).flat().every((k) => k.degisen === null || k.degisen === 0)).toBe(true);
  });

  // Örnekteki bir tezgâh işinin aralığı ikiye bölünür: aynı hücrede iki ayrı emrin birer işi olur.
  function ikiIsliHucre() {
    const { m, cx } = ornek();
    const gunu = (t: number) => Math.floor((t - m.bas) / 24);
    const x = Object.values(m.isler).find((i) => !i.fason && i.C - i.S >= 1 && gunu(i.S) === gunu(i.C - 0.01));
    if (!x) throw new Error('örnekte tek güne sığan tezgâh işi yok');
    const orta = (x.S + x.C) / 2, ti = m.tezgahlar.findIndex((t) => t.id === x.m), g = gunu(x.S);
    const a = is('A.1', x.m, x.S, orta), b = is('B.1', x.m, orta, x.C);
    const kur = (dA: KokpitEmri['durum'], dB: KokpitEmri['durum']): KokpitModeli => ({ ...m, isler: { 'A.1': a, 'B.1': b }, emirler: [emir('A', { durum: dA }), emir('B', { durum: dB })] });
    const yer = (i: KokpitIsi) => ({ m: i.m, S: i.S, C: i.C });
    return { cx, a, b, ti, g, kur, yer };
  }

  it('hücrede biri geç biri zamanında iki emir varsa durum geçtir; sıra sonucu değiştirmez', () => {
    const { cx, ti, g, kur } = ikiIsliHucre();
    expect(hucreler3B(kur('gec', 'iyi'), cx, null)[ti]?.[g]?.durum).toBe('gec');
    expect(hucreler3B(kur('iyi', 'gec'), cx, null)[ti]?.[g]?.durum).toBe('gec');
    expect(hucreler3B(kur('iyi', 'risk'), cx, null)[ti]?.[g]?.durum).toBe('risk');
    expect(hucreler3B(kur('iyi', 'iyi'), cx, null)[ti]?.[g]?.durum).toBe('iyi');
    // Plansız emrin yerleşmiş adımı riskli sayılır.
    expect(hucreler3B(kur('iyi', 'plansiz'), cx, null)[ti]?.[g]?.durum).toBe('risk');
  });

  it('iki işten biri kaymışsa değişen payı 0 ile 1 arasındadır', () => {
    const { cx, a, b, ti, g, kur, yer } = ikiIsliHucre();
    const c = hucreler3B(kur('iyi', 'iyi'), cx, { 'A.1': yer(a), 'B.1': { ...yer(b), S: b.S - 1, C: b.C - 1 } })[ti]?.[g];
    expect(c?.degisen).toBeCloseTo(0.5);
  });

  it('önce onaylı planın yüküdür: işin geldiği hücrede önce yükten küçük, onaylı planda başka tezgâhtaysa orada büyük', () => {
    const { cx, a, b, ti, g, kur, yer } = ikiIsliHucre();
    const m = kur('iyi', 'iyi');
    const baska = m.tezgahlar.findIndex((t, i) => !t.fason && i !== ti && (hucreler3B(m, cx, null)[i]?.[g]?.yuk ?? null) !== null);
    if (baska < 0) throw new Error('örnekte o gün açık ikinci tezgâh yok');
    const h = hucreler3B(m, cx, { 'A.1': yer(a), 'B.1': { ...yer(b), m: m.tezgahlar[baska]?.id ?? '' } });
    const yeni = h[ti]?.[g], eski = h[baska]?.[g];
    expect(yeni?.once ?? 1).toBeLessThan(yeni?.yuk ?? 0);
    expect(eski?.once ?? 0).toBeGreaterThan(eski?.yuk ?? 1);
  });

  it('yeri değişen iş: başka tezgâh, çeyrek saatten çok kayma ya da onaylı planda yok', () => {
    const x = is('a.1', 'T1', 10, 12);
    expect(yeriDegisti(x, { m: 'T1', S: 10.2, C: 12.2 })).toBe(false);
    expect(yeriDegisti(x, { m: 'T1', S: 10.5, C: 12.5 })).toBe(true);
    expect(yeriDegisti(x, { m: 'T2', S: 10, C: 12 })).toBe(true);
    expect(yeriDegisti(x, undefined)).toBe(true);
  });

  it('onaylı planda geç biten emir sayılır; adımı onaylı planda olmayan emir sayılmaz', () => {
    const A = emir('A', { termin: 20, adimlar: [{ id: 'A.1', ad: 'Torna', adaylar: [] }] });
    const B = emir('B', { termin: 20, adimlar: [{ id: 'B.1', ad: 'Torna', adaylar: [] }] });
    const m = model([], [A, B]);
    expect(onayliGecSayisi(m, { 'A.1': { m: 'T1', S: 10, C: 24 }, 'B.1': { m: 'T1', S: 0, C: 8 } })).toBe(1);
    expect(onayliGecSayisi(m, { 'B.1': { m: 'T1', S: 0, C: 30 } })).toBe(1);
    expect(onayliGecSayisi(m, {})).toBe(0);
  });
});
