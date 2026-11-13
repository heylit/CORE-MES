import { describe, expect, it } from 'vitest';
import { derle, girdiKur, planOku, plandanBitenler } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import {
  aralikYuku, aramaUyar, durumYazisi, ilkBosluk, matrisSirasi, modelKur, olcekKomsusu, onizlemeBitisi, satirKimligi, sayim, sorunlular, sureYaz,
  acigaOtur, tasimaSaati, tasinabilir, turAdaylari, yukSinifi, yukYuzdesi, type KokpitEmri, type KokpitIsi, type KokpitModeli,
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
    expect(onizlemeBitisi(m, e, [{ isId: 'a.2', C: 14 }])).toBe(14);
    expect(onizlemeBitisi(m, emir('x', { adimlar: [{ id: 'yok.1', ad: '', adaylar: [] }] }), [])).toBeNull();
  });

  it('süre gün, saat ve dakika ile yazılır', () => {
    expect(sureYaz(0)).toBe('0 dk');
    expect(sureYaz(0.25)).toBe('15 dk');
    expect(sureYaz(-26.5)).toBe('1 gün 2 sa 30 dk');
  });
});
