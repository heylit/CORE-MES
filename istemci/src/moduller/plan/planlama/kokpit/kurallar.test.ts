import { describe, expect, it } from 'vitest';
import { derle, girdiKur, planOku, plandanBitenler } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import {
  firmaYazilari, adimBaglari, adimBeklemesi, aralikYuku, bagimlilik, okUcu, okYolu, aramaUyar, darbogaz, emirGunleri, enCokBekleyen, tezgahGunundeMi, durumYazisi, ilkBosluk, matrisSirasi, modelKur, olcekKomsusu, onizlemeBitisi, satirKimligi, sayim, sorunlular, sureYaz,
  acigaOtur, darPanoYani, agacAdimBasligi, agacNotlari, emirNotlari, kolNotlari, durusOkunmadi, DURUS_OKUNMADI, durdurmaBekleyenler, durusYazisi, ekMesaiYazisi, mesaiButcesi, operatorSorunu, uygunOperatorler, vardiyaAdi, planliDurusYazisi, hucreler3B, suAndakiDurus, onayliGecSayisi, yeriDegisti, tasimaSaati, tasinabilir, turAdaylari, yukSinifi, yukYuzdesi, SAAT_ENI, YAKIN_EN_AZ, YAKIN_EN_COK, sigdirma, surguDegeri, surgudenEn, yakinOlcegi, yakinSinirla, ustBeklemeleri, ustEmirNotu, type AdimBeklemesi, type KokpitEmri, type KokpitIsi, type KokpitModeli,
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
  isler: Object.fromEntries(isler.map((x) => [x.id, x])), emirler, bas: 0, son: 336, acik: {}, durus: {},
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

  it('3484 c: ufuk sonrasına uzayan adımın emri gerçek bitişiyle değerlendirilir, ufuk sonrası saat yazılır', () => {
    const { c, p, cx } = ornek();
    const id = Object.keys(p?.ops ?? {}).find((k) => k.startsWith('3.')) ?? '';
    const q = p && { ...p, ops: { ...p.ops, [id]: { ...p.ops[id], ufukDisi: 12 } } } as typeof p;
    const e = modelKur(c, q, cx, (x) => x).emirler.find((x) => x.id === id.split('.')[0]);
    const once = modelKur(c, p, cx, (x) => x).emirler.find((x) => x.id === e?.id);
    expect(e).toMatchObject({ durum: once?.durum, ufukEksik: 12 });
    expect(e && durumYazisi(e)).toBe(once && durumYazisi(once));
    expect(modelKur(c, p, cx, (x) => x).emirler.find((x) => x.id === e?.id)?.ufukEksik).toBeUndefined();
  });

  it('kilit simgesi yalnız kullanıcının kilidinden gelir; motorun sabitlediği iş kilitli sayılmaz', () => {
    const { c, p, cx } = ornek();
    const sabit = Object.entries(p?.ops ?? {}).find(([, x]) => x.pin)?.[0];
    expect(sabit).toBeDefined();
    expect(Object.values(modelKur({ ...c, locks: {} }, p, cx, (id) => id).isler).some((x) => x.kilitli)).toBe(false);
    const m = modelKur({ ...c, locks: { [sabit ?? '']: { m: 'x', S: 0 } } }, p, cx, (id) => id);
    expect(Object.values(m.isler).filter((x) => x.kilitli).map((x) => x.id)).toEqual([sabit]);
  });

  it('durdurulup taşınan iş sahada sürerken "terminalde durdurulmayı bekliyor" diye işaretlenir; durunca ya da bitince işaret kalkar', () => {
    const { c, p, cx } = ornek();
    const kur = (w: Record<string, unknown>, gercek: Record<string, unknown>) => modelKur({ ...c, w: { ...c.w, ...w }, gercek } as typeof c, p, cx, (id) => id).isler['2.20'];
    expect(kur({ durdurulan: { '2.20': 1 } }, { '2.20': { m: '3', S: 100, A: 10, n: 4 } })?.durdurmaBekliyor).toBe(true);
    expect(kur({ durdurulan: { '2.20': 1 } }, {})?.durdurmaBekliyor).toBeUndefined();
    expect(kur({ durdurulan: { '2.20': 1 } }, { '2.20': { m: '3', S: 100, C: 120 } })?.durdurmaBekliyor).toBeUndefined();
    expect(kur({}, { '2.20': { m: '3', S: 100 } })?.durdurmaBekliyor).toBeUndefined();
    expect([...durdurmaBekleyenler({ ...c, w: { ...c.w, durdurulan: { '2.20': 1, '3.10': 1 } }, gercek: { '2.20': { S: 1 } } } as typeof c)]).toEqual(['2.20']);
  });

  it('kodu olmayan tezgâh satırı kimliğiyle değil adıyla yazılır', () => {
    const { c, p, cx } = ornek();
    const ilk = c.D.tezgahlar.find((t) => cx.M[t.id]);
    const D = { ...c.D, tezgahlar: c.D.tezgahlar.map((t) => (t.id === ilk?.id ? { id: t.id, ad: 'Deneme el işi' } : t)) };
    const t = modelKur({ ...c, D }, p, cx, (id) => id).tezgahlar.find((x) => x.id === ilk?.id);
    expect(t).toMatchObject({ kod: 'Deneme el işi', ad: '' });
  });

  it('duruş: arıza olayı başlığa "arızada" yazılır, planlı duruş yazılmaz; geçmiş duruş alınmaz', () => {
    const { c } = ornek();
    const t = c.D.tezgahlar[0]?.id ?? '', u = c.D.tezgahlar[1]?.id ?? '';
    const c2 = { ...c, down: [{ m: u, from: 0, to: 1000 }], olaylar: [{ tip: 'ariza', m: t, saat: 6 }] };
    const p = planOku(c2), cx = derle(girdiKur(c2, plandanBitenler(c2, p)));
    const m = modelKur(c2, p, cx, (id) => id);
    const a = suAndakiDurus(m, t), d = suAndakiDurus(m, u);
    expect(a).toMatchObject({ ariza: true, a: m.simdi, b: m.simdi + 6 });
    expect(d).toBeNull();
    expect(m.durus[u]?.[0]).toMatchObject({ ariza: false, neden: 'arıza' });
    // 3282 2a-1: planlı duruşun nedeni çalışmanın satırından; tahtada adıyla yazılır.
    const c3 = { ...c, down: [{ m: u, from: 0, to: 1000, neden: 'bakım' }] };
    const m3 = modelKur(c3, planOku(c3), derle(girdiKur(c3, plandanBitenler(c3, planOku(c3)))), (id) => id);
    expect(m3.durus[u]?.[0]).toMatchObject({ ariza: false, neden: 'bakım' });
    expect(planliDurusYazisi(m3.durus[u]![0]!, (x) => `s${String(x)}`)).toBe('Bakım · s0 → s1000');
    // Vardiya ekranında girilen planlı duruş: başlığıyla yazılır, arıza sayılmaz (tezgâh başlığına "arızada" yazılmaz).
    const c4 = { ...c, down: [{ m: u, from: 0, to: 1000, neden: 'planlı duruş', baslik: 'ORN-Bakım', oto: 1, bakim: 'vd:1' }] };
    const m4 = modelKur(c4, planOku(c4), derle(girdiKur(c4, plandanBitenler(c4, planOku(c4)))), (id) => id);
    expect(m4.durus[u]?.[0]).toEqual({ a: 0, b: 1000, ariza: false, neden: 'duruş', baslik: 'ORN-Bakım' });
    expect(planliDurusYazisi(m4.durus[u]![0]!, (x) => `s${String(x)}`)).toBe('Planlı duruş (ORN-Bakım) · s0 → s1000');
    expect(suAndakiDurus(m4, u)).toBeNull();
    expect(a && durusYazisi(a, () => '13.11 Cum 18:00')).toBe('arızada · Cum 18:00');
    expect(suAndakiDurus(modelKur(c, planOku(c), derle(girdiKur(c, plandanBitenler(c, planOku(c)))), (id) => id), t)).toBeNull();
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

  it('sürekli yakınlaştırma: sürgü logaritmik ve uçlarda sınırlı, en yakın ölçek düğmesi, sığdırma kenarlarda pay bırakır (3365)', () => {
    expect([YAKIN_EN_AZ, YAKIN_EN_COK, YAKIN_EN_AZ / 2, YAKIN_EN_COK * 2].map(surguDegeri)).toEqual([0, 100, 0, 100]);
    expect(surgudenEn(0)).toBeCloseTo(YAKIN_EN_AZ);
    expect(surgudenEn(100)).toBeCloseTo(YAKIN_EN_COK);
    expect(surgudenEn(150)).toBeCloseTo(YAKIN_EN_COK);
    // Orta değer iki ucun geometrik ortasıdır; gidiş dönüş aynı yere döner.
    expect(surgudenEn(50)).toBeCloseTo(Math.sqrt(YAKIN_EN_AZ * YAKIN_EN_COK));
    expect(surguDegeri(surgudenEn(37))).toBe(37);
    expect([SAAT_ENI.G, SAAT_ENI['3'], SAAT_ENI.H, 30, 20, 9, YAKIN_EN_AZ, YAKIN_EN_COK].map(yakinOlcegi)).toEqual(['G', '3', 'H', 'G', '3', 'H', 'H', 'G']);
    expect(yakinSinirla(1000)).toBe(YAKIN_EN_COK);
    // 10 saatlik aralık 1000 px'e: iki yanda %7,5 pay; sığmayan uzun aralık en uzak yakın ölçekte kalır, sıfır süre yarım saat sayılır.
    const s = sigdirma(100, 110, 1000);
    expect(s.odak).toBeCloseTo(99.25);
    expect(s.px).toBeCloseTo(1000 / 11.5);
    expect(sigdirma(0, 2000, 1000).px).toBe(YAKIN_EN_AZ);
    expect(sigdirma(5, 5, 1000).px).toBe(YAKIN_EN_COK);
  });
});

describe('Kokpit taşıma ve tur', () => {
  it('taşıma saati çeyrek saate oturur ve şimdiden önce olamaz; süren iş taşınır, biten ve fason iş taşınmaz', () => {
    expect(tasimaSaati(10.1, 0)).toBe(10);
    expect(tasimaSaati(3, 8.1)).toBe(8.25);
    expect(tasinabilir(is('a.1', 'T1', 0, 1))).toBeNull();
    expect(tasinabilir(is('a.1', 'T1', 0, 1, { basladi: true }))).toBeNull();
    expect(tasinabilir(is('a.1', 'T1', 0, 1, { basladi: true, bitti: true }))).toMatch(/Biten/);
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

// 3282 2a-2: ek mesai operatörü. Kural sunucunun operatorSorunu'nun aynısıdır; örnek çalışma 2026-10-19 pazartesi başlar.
describe('ek mesai operatörü (3282 2a-2)', () => {
  const k = (personel: string, ek: { tezgah?: string; gun?: number; vardiya?: string } = {}) => ({ tezgah: '1', gun: 1, vardiya: '2', personel, ...ek });
  it('her ret nedeni ayrı yazılır; uygun kişide null', () => {
    const c = ornekCalisma();
    expect(operatorSorunu(c, k('4'))).toBeNull();
    expect(operatorSorunu(c, k('99'))).toBe('Operatör çalışmanın personelinde yok.');
    expect(operatorSorunu(c, k('5', { tezgah: '1' }))).toBe('Operatör bu tezgâhı çalıştırmıyor.');
    expect(operatorSorunu(c, k('4', { gun: 14 }))).toBe('Operatör o gün devamsız.');
    expect(operatorSorunu(c, k('4', { vardiya: '1' }))).toBe('Ek vardiya operatörün kendi vardiyasıyla çakışıyor.');
    // Gece vardiyası (16:00–00:00) ertesi günün 08:00'ine değmez; önceki günün kendi vardiyası denetlenir.
    expect(operatorSorunu(c, k('5', { tezgah: '3', vardiya: '1', gun: 2 }))).toBeNull();
    const c2 = { ...c, ekMesai: [{ m: '2', gun: 1, vardiya: '2', personel: '4' }] };
    expect(operatorSorunu(c2, k('4'))).toBe('Operatör o gün ve vardiyada başka bir ek mesaide.');
  });

  it('önceki gün başlayan gece vardiyası ertesi sabahın ek mesaisiyle kesişir (gece yarısı aşımı)', () => {
    const c = ornekCalisma();
    const gece = { ...c, D: { ...c.D,
      vardiyalar: [...(c.D.vardiyalar ?? []), { id: '3', bas: '22:00', bit: '06:00' }, { id: '9', bas: '04:00', bit: '08:00' }],
      calismaGunleri: { ...c.D.calismaGunleri, pzt: ['1', '3'] },
      personel: [...(c.D.personel ?? []), { id: '30', ad: 'Örnek Gece', vardiya: '3', gruplar: ['1'] }] } };
    expect(operatorSorunu(gece, k('30', { gun: 1, vardiya: '9' }))).toBe('Ek vardiya operatörün kendi vardiyasıyla çakışıyor.');
    expect(operatorSorunu(gece, k('30', { gun: 2, vardiya: '9' }))).toBeNull();
  });

  it('uygun liste ve boşsa en sık neden; bütçe molasız net saatle', () => {
    const c = ornekCalisma();
    expect(uygunOperatorler(c, { tezgah: '1', gun: 1, vardiya: '1' }).kisiler.map((x) => x.id)).toEqual(['2', '14']);
    const yalniz = { ...c, D: { ...c.D, personel: c.D.personel!.filter((p) => p.id === '4') } };
    expect(uygunOperatorler(yalniz, { tezgah: '1', gun: 1, vardiya: '1' })).toEqual({ kisiler: [], neden: 'Uygun operatör yok: ek vardiya operatörün kendi vardiyasıyla çakışıyor.' });
    expect(uygunOperatorler({ ...c, D: { ...c.D, personel: [] } }, { tezgah: '1', gun: 1, vardiya: '1' }).neden).toBe('Çalışmada operatör yok.');
    const b = mesaiButcesi({ ...c, ekMesai: [{ m: '1', gun: 2, vardiya: '1' }, { m: '1', gun: 7, vardiya: '1' }] }, 1);
    expect([b.kullanilan, b.sinir, b.vardiyaSaati('2')]).toEqual([7.5, 8, 7.5]);
    expect(mesaiButcesi({ ...c, param: { ...c.param, mesaiHafta: 0 } }, 1).sinir).toBeNull();
    expect(vardiyaAdi(c, '2')).toBe('16:00–00:00');
  });

  it('model tezgâhın gelecek ek mesailerini taşır; satır başlığı yazısı', () => {
    const { c } = ornek();
    const c2 = { ...c, ekMesai: [{ m: '1', gun: 400, vardiya: '1', personel: '2' }, { m: '1', gun: 0, vardiya: '1' }] };
    const m = modelKur(c2, planOku(c2), derle(girdiKur(c2, plandanBitenler(c2, planOku(c2)))), (id) => id);
    expect(m.mesai?.['1']?.map((e) => e.gun)).toEqual(m.bas > 0 ? [400] : [0, 400]);
    expect(ekMesaiYazisi([{ m: '1', gun: 2, vardiya: '1', personel: null, vardiyaAd: '08:00–16:00' }], (x) => `21.10 Çar ${x === 48 ? '00:00' : '?'}`)).toBe('Ek mesai: 21.10 Çar 08:00–16:00');
  });
});

describe('Kokpit bağ okları (3330)', () => {
  it('model adımın bitmemiş öncüllerini bağ türüyle taşır; ilk adımda öncül yoktur', () => {
    const { m } = ornek();
    const e = m.emirler.find((x) => x.adimlar.length === 3)!;
    expect(e.adimlar.map((a) => a.onculler ?? [])).toEqual([[], [[e.adimlar[0]!.id, 'b']], [[e.adimlar[1]!.id, 'b']]]);
    // Öncül, emrin operasyon listesindeki sıra numarası ve adıyla yazılır (iç anahtarla değil).
    expect(e.adimlar.map((a) => bagimlilik(e, a)?.kisa ?? null)).toEqual([null, `1 ${e.adimlar[0]!.ad} bitince`, `2 ${e.adimlar[1]!.ad} bitince`]);
    const iki = { adimlar: [{ id: 'x.a', ad: 'Torna', adaylar: [] }, { id: 'x.b', ad: 'Freze', adaylar: [] }, { id: 'x.c', ad: 'Çapak', adaylar: [], onculler: [['x.a', 'o'], ['x.b', 'b'], ['x.yok', 'b']] as const }] };
    expect(bagimlilik(iki, iki.adimlar[2]!)).toEqual({ uzun: '1 Torna · örtüşmeli (bitmeden başlayabilir); 2 Freze · bitince', kisa: '1 Torna ile örtüşmeli · 2 Freze bitince' });
  });
  it('derlemedeki örtüşmeli bağ (tür "o") modelde örtüşmeli kalır; başka her tür "bitince" sayılır', () => {
    const { c, p, cx } = ornek();
    const j = Object.values(cx.jobs).find((x) => x.ops.length === 3)!;
    const [a1, a2, a3] = j.ops as [typeof j.ops[number], typeof j.ops[number], typeof j.ops[number]];
    const cx2 = { ...cx, jobs: { ...cx.jobs, [j.id]: { ...j, ops: [a1, { ...a2, pr: [[a1.id, 'o']] }, { ...a3, pr: [[a2.id, 'ss']] }] } } } as typeof cx;
    const e = modelKur(c, p, cx2, (id) => id).emirler.find((x) => x.id === j.id)!;
    expect(e.adimlar.map((a) => a.onculler ?? [])).toEqual([[], [[a1.id, 'o']], [[a2.id, 'b']]]);
  });
  it('bağ yalnız iki ucu da planda olan adımlar arasında çizilir; bitince bağlı ardıl öncül bitmeden başlıyorsa terstir, örtüşmelide değildir', () => {
    const e = emir('1', { adimlar: [
      { id: '1.10', ad: '', adaylar: ['T1'] }, { id: '1.20', ad: '', adaylar: ['T2'], onculler: [['1.10', 'b']] },
      { id: '1.30', ad: '', adaylar: ['T1'], onculler: [['1.20', 'o']] }, { id: '1.40', ad: '', adaylar: ['T1'], onculler: [['1.30', 'b']] },
    ] });
    const isler = Object.fromEntries([is('1.10', 'T1', 0, 4), is('1.20', 'T2', 3, 6), is('1.30', 'T1', 5, 8)].map((x) => [x.id, x]));
    expect(adimBaglari([e], isler)).toEqual([
      { kimden: '1.10', kime: '1.20', tur: 'b', ters: true },
      { kimden: '1.20', kime: '1.30', tur: 'o', ters: false },
    ]);
    isler['1.20'] = is('1.20', 'T2', 4, 6);
    expect(adimBaglari([e], isler)[0]).toEqual({ kimden: '1.10', kime: '1.20', tur: 'b', ters: false });
  });
  it('3662: öncül 12:15 biter, ardıl 12:15 başlar (aynı dakika) ters değildir; bir dakika erken başlarsa terstir', () => {
    const e = emir('1', { adimlar: [{ id: '1.10', ad: '', adaylar: ['T1'] }, { id: '1.20', ad: '', adaylar: ['T2'], onculler: [['1.10', 'b']] }] });
    const ters = (bas: number) => adimBaglari([e], Object.fromEntries([is('1.10', 'T1', 8, 12.25), is('1.20', 'T2', bas, bas + 1)].map((x) => [x.id, x])))[0]?.ters;
    expect(ters(12.25)).toBe(false);
    expect(ters(12.25 - 0.004)).toBe(false);
    expect(ters(12.25 - 1 / 60)).toBe(true);
  });
  it('ok yolu satır aralarından yürür: bitince öncülün sağından, örtüşmeli ardıla bakan kenarından çıkar; aradaki satırda işe denk gelen dikey geçiş işin sağına kayar; ardılın sol ortasına soldan girer', () => {
    const kutu = (x1: number, x2: number, y: number) => ({ x1, x2, y, h: 30, satir: 40 });
    const noktalar = (d: string) => d.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g)!.map((n) => n.split(',').map(Number));
    const a = kutu(100, 200, 20);
    // Komşu satır: sağdan çık, iki satırın sınırından (y 40) yürü, ardılın soluna in, soldan gir.
    const komsu = okYolu(a, kutu(300, 360, 60), 'b');
    expect(komsu).toBe('M200,20 L204,20 Q208,20 208,24 L208,30 Q208,40 218,40 L282,40 Q292,40 292,50 L292,56 Q292,60 296,60 L300,60');
    // Yatay parçalar yalnız satır sınırındadır (öncülün ve ardılın orta hizasındaki kısa çıkış ve giriş dışında).
    const yataylar = (d: string) => { const n = noktalar(d); return n.slice(1).flatMap((p, i) => (Math.abs(p[1]! - n[i]![1]!) < 0.05 && Math.abs(p[0]! - n[i]![0]!) > 12 ? [p[1]!] : [])); };
    expect(yataylar(komsu)).toEqual([40]);
    // İki satır aşağı: aradaki satırda (y 60) dikey geçişin hizasında iş varsa geçiş işin sağına kayar; yoksa öncülün hemen sağından iner.
    const uzak = kutu(400, 460, 100);
    expect(noktalar(okYolu(a, uzak, 'b')).some((p) => p[0] === 208 && p[1]! > 40 && p[1]! < 80)).toBe(true);
    const engelli = noktalar(okYolu(a, uzak, 'b', [{ x1: 190, x2: 250, y: 60 }, { x1: 500, x2: 560, y: 60 }, { x1: 190, x2: 250, y: 140 }]));
    expect(engelli.some((p) => p[0] === 208 && p[1]! > 40 && p[1]! < 80)).toBe(false);
    expect(engelli.some((p) => p[0] === 258 && p[1]! > 40 && p[1]! < 80)).toBe(true);
    expect(engelli.at(-1)).toEqual([400, 100]);
    // Örtüşmeli: öncülün alt kenarından, ardılın başlangıç hizasında (150) çıkar; ardıl yukarıdaysa üst kenarından.
    expect(okYolu(a, kutu(150, 240, 60), 'o').startsWith('M150,35 ')).toBe(true);
    expect(okYolu(a, kutu(150, 240, -20), 'o').startsWith('M150,5 ')).toBe(true);
    // Aynı satırda art arda iki iş arasında düz; araya iş girebilecek kadar uzaksa satırın alt sınırından dolaşır.
    expect(okYolu(a, kutu(210, 260, 20), 'b')).toBe('M200,20 L210,20');
    expect(yataylar(okYolu(a, kutu(400, 460, 20), 'b'))).toEqual([40]);
    expect(okUcu(kutu(260, 320, 70))).toBe('M260,70 l-6,-3.5 v7 z');
  });
});

// 3330 a: fason adımın firma tarihi satır yazısı. Örnekte ürün 2'nin üçüncü adımı (k 30) fasondur; veriler uydurmadır.
describe('Kokpit firma tarihi yazısı (3330-3c)', () => {
  const c = ornekCalisma();
  const s = c.D.siparisler.find((x) => x.urun === '2')!;
  const id = `${s.id}.30`;
  const yer = (fasonSiparis?: unknown): unknown => ({ orders: [], opStatus: {}, opYer: { [`${s.id}|root|3`]: { fasonId: '5', terminGun: 2, stationId: null, setup: null, cycle: null, ...(fasonSiparis ? { fasonSiparis } : {}) } } });

  it('tarih ve sipariş numarası yazar; numara gelmediyse yalnız tarih; sipariş yoksa adım haritada yoktur', () => {
    expect(firmaYazilari(c, yer({ tarih: '2026-11-24', siparisNo: 'ORN-SA-7' }), '2026-11-20')).toEqual({ [id]: { yazi: 'Firma tarihi 24.11 · sipariş ORN-SA-7', gecti: false, gun: '24.11' } });
    expect(firmaYazilari(c, yer({ tarih: '2026-11-24', siparisNo: null }), '2026-11-20')[id]).toEqual({ yazi: 'Firma tarihi 24.11', gecti: false, gun: '24.11' });
    expect(firmaYazilari(c, yer(), '2026-11-20')).toEqual({});
    expect(firmaYazilari(c, null, '2026-11-20')).toEqual({});
  });

  it('tarih tesisin gününden önceyse geçmiştir; aynı gün geçmiş değildir', () => {
    expect(firmaYazilari(c, yer({ tarih: '2026-11-24', siparisNo: null }), '2026-11-25')[id]?.gecti).toBe(true);
    expect(firmaYazilari(c, yer({ tarih: '2026-11-24', siparisNo: null }), '2026-11-24')[id]?.gecti).toBe(false);
  });

  it('elle girilmiş dönüş termini firma tarihinden farklıysa ikisi de yazar; aynı günse yalnız firma tarihi', () => {
    const elle = (gun: string) => ({ ...c, D: { ...c.D, fasonTermin: { [id]: `${gun} 16:00` } } }) as typeof c;
    expect(firmaYazilari(elle('2026-11-26'), yer({ tarih: '2026-11-24', siparisNo: 'ORN-SA-7' }), '2026-11-20')[id]?.yazi).toBe('Firma 24.11 · elle 26.11, plan firma tarihine göre');
    expect(firmaYazilari(elle('2026-11-24'), yer({ tarih: '2026-11-24', siparisNo: 'ORN-SA-7' }), '2026-11-20')[id]?.yazi).toBe('Firma tarihi 24.11 · sipariş ORN-SA-7');
  });

  it('çok katmanlı emrin alt düğümünde tarih siparişin dugumFirma alanından okunur, kökün yerinden değil', () => {
    const dugumlu = { ...c, D: { ...c.D, siparisler: c.D.siparisler.map((x) => (x.id === s.id ? { ...x, dugum: 'Y1', dugumFirma: { 30: '2026-12-01' } } : x)) } } as typeof c;
    expect(firmaYazilari(dugumlu, yer({ tarih: '2026-11-24', siparisNo: 'ORN-SA-7' }), '2026-11-20')).toEqual({ [id]: { yazi: 'Firma tarihi 01.12', gecti: false, gun: '01.12' } });
  });
});

// 3513: üst emrin adımına bildirilen bekleme partinin aynı adımında da görünür (motor girdisi ustBeklemesiUygula ile aynı kural, 3511).
describe('üst emirden gelen bekleme (3513)', () => {
  const B: AdimBeklemesi = { kadar: 200, neden: 'malzeme' };
  const bos = { siparis: new Set<string>(), adim: new Set<string>() };
  const kaynak = (...bag: [string, string][]) => ({ orders: [{ id: '2' }, ...bag.map(([id, parentId]) => ({ id, parentId }))] });
  const m = (basladi: string[] = [], emirler = ['2', '3', '4', '5']) => model(
    emirler.flatMap((e) => ['10', '20'].map((k) => is(`${e}.${k}`, 'T1', 0, 10, { basladi: basladi.includes(`${e}.${k}`) }))), emirler.map((e) => emir(e, { no: `E-${e}` })));

  it('parti üst emrin beklemesini kaynağıyla alır; beklemesi olmayan adım, üst bağı olmayan emir ve emir kaynağı yokken kimse almaz', () => {
    expect(ustBeklemeleri({ '2.20': B }, kaynak(['3', '2']), bos, m())).toEqual({ '2.20': B, '3.20': { ...B, ust: '2' } });
    expect(ustBeklemeleri({ '2.20': B }, null, bos, m())).toEqual({ '2.20': B });
    expect(ustBeklemeleri({ '2.20': B }, { orders: [{ id: '3', parentId: '' }, { id: '4', parentId: null }] }, bos, m())).toEqual({ '2.20': B });
  });

  it('partinin kendi beklemesi üst emrinkinin yerine geçer', () => {
    const kendi: AdimBeklemesi = { kadar: 120, neden: 'kisi' };
    expect(ustBeklemeleri({ '2.20': B, '3.20': kendi }, kaynak(['3', '2']), bos, m())).toEqual({ '2.20': B, '3.20': kendi });
  });

  it('üst emir kapandıysa, üst emrin adımı bittiyse ya da başladıysa bekleme geçmez; partinin biten ya da başlamış adımına yazılmaz', () => {
    const k = kaynak(['3', '2']);
    expect(ustBeklemeleri({ '2.20': B }, k, { ...bos, siparis: new Set(['2']) }, m())['3.20']).toBeUndefined();
    expect(ustBeklemeleri({ '2.20': B }, k, { ...bos, adim: new Set(['2.20']) }, m())['3.20']).toBeUndefined();
    expect(ustBeklemeleri({ '2.20': B }, k, bos, m(['2.20']))['3.20']).toBeUndefined();
    expect(ustBeklemeleri({ '2.20': B }, k, { ...bos, adim: new Set(['3.20']) }, m())['3.20']).toBeUndefined();
    expect(ustBeklemeleri({ '2.20': B }, k, bos, m(['3.20']))['3.20']).toBeUndefined();
  });

  it('partiden bölünen parti en yakın üst emrin kaydını alır; kapanan ara parti zinciri koparmaz; bağ döngüsü sonsuza gitmez', () => {
    const ara: AdimBeklemesi = { kadar: 120, neden: 'kisi' }, k = kaynak(['3', '2'], ['4', '3']);
    expect(ustBeklemeleri({ '2.20': B }, k, bos, m())['4.20']).toEqual({ ...B, ust: '2' });
    expect(ustBeklemeleri({ '2.20': B, '3.20': ara }, k, bos, m())['4.20']).toEqual({ ...ara, ust: '3' });
    expect(ustBeklemeleri({ '2.20': B, '3.20': ara }, k, { ...bos, siparis: new Set(['3']) }, m())['4.20']).toEqual({ ...B, ust: '2' });
    expect(ustBeklemeleri({ '5.20': B }, { orders: [{ id: '4', parentId: '5' }, { id: '5', parentId: '4' }] }, bos, m())).toEqual({ '5.20': B, '4.20': { ...B, ust: '5' } });
  });

  it('kaynak notu üst emrin numarasını ek almayan kalıpta yazar; kendi beklemesinde not yoktur', () => {
    expect(ustEmirNotu(m(), { ...B, ust: '2' })).toBe(' · üst emirden (E-2)');
    expect(ustEmirNotu(m([], ['3']), { ...B, ust: '2' })).toBe(' · üst emirden (2)');
    expect(ustEmirNotu(m(), B)).toBe('');
  });
});

// 3523: adım ortasından bölünen partinin (kol) üst emirle bağı yazıyla söylenir (aralık ve adımın sahibi motor girdisiyle aynı kural, 3512).
describe('adım ortasından bölünen partinin notları (3523)', () => {
  const ROTA = [{ k: '10', ad: 'Torna' }, { k: '20', ad: 'Freze' }, { k: '30', ad: 'Taşlama' }, { k: '40' }];
  const D = (ek: Record<string, unknown> = {}) => ({ siparisler: ['2', '3', '4'].map((id) => ({ id, urun: 'U', adet: 1, ...(id === '3' ? ek : {}) })), urunler: [{ id: 'U', rota: ROTA }] }) as unknown as Parameters<typeof kolNotlari>[1];
  const adim = (id: string) => ({ id, ad: id, adaylar: [] });
  // Modelde emrin yalnız bitmemiş kendi adımları durur.
  const m = (adimlar: Record<string, string[]> = { 2: ['10', '20', '30', '40'], 3: ['20', '30'], 4: ['30'] }) =>
    model([], Object.entries(adimlar).map(([e, l]) => emir(e, { no: `E-${e}`, adimlar: l.map((k) => adim(`${e}.${k}`)) })));
  const kaynak = (...kollar: [string, string, unknown][]) => ({ orders: [{ id: '2' }, ...kollar.map(([id, parentId, kol]) => ({ id, parentId, kol }))] });

  it('ortadan ayrılıp katılan parti: öncesini ve sonrasını kimin yaptığı partinin satırında, bekleme üst emrin katılma adımında yazar', () => {
    const y = kolNotlari(m(), D(), kaynak(['3', '2', { n: 1, m: 4 }]));
    expect(y.emir).toEqual({ 3: 'Torna adımını üst emir (E-2) yapar; bu parti Freze adımından başlar. Taşlama adımından sonra üst emre (E-2) katılır; 40 adımından itibaren üst emirle sürer.' });
    expect(y.adim).toEqual({ '2.40': 'bekliyor: parti E-3' });
    expect([...y.partiler]).toEqual(['3']);
  });

  it('baştan ayrılan parti yalnız katılmayı, sona kadar giden parti yalnız başlangıcı yazar; birden çok adım sayıyla söylenir', () => {
    expect(kolNotlari(m(), D(), kaynak(['3', '2', { n: 0, m: 3 }])).emir).toEqual({ 3: 'Freze adımından sonra üst emre (E-2) katılır; Taşlama adımından itibaren üst emirle sürer.' });
    const sona = kolNotlari(m(), D(), kaynak(['3', '2', { n: 2, m: 5 }]));
    expect(sona.emir).toEqual({ 3: 'İlk 2 adımı üst emir (E-2) yapar; bu parti Taşlama adımından başlar.' });
    expect(sona.adim).toEqual({});
  });

  it('partinin son adımı bittiyse ya da parti kapandıysa üst emir beklemez; partinin satırı kalır', () => {
    const k = kaynak(['3', '2', { n: 1, m: 4 }]);
    expect(kolNotlari(m({ 2: ['40'], 3: ['20'] }), D(), k).adim).toEqual({});
    const kapali = kolNotlari(m({ 2: ['40'] }), D(), k);
    expect(kapali.adim).toEqual({});
    expect(Object.keys(kapali.emir)).toEqual(['3']);
  });

  it('partiden bölünen parti: adımın sahibi o yeri kendi işleyen en yakın üst emirdir; aynı adıma katılan partiler tek satırda', () => {
    const y = kolNotlari(m(), D(), kaynak(['3', '2', { n: 1, m: 4 }], ['4', '3', { n: 2, m: 4 }]));
    expect(y.emir['4']).toBe('İlk 2 adımı üst emir (E-3) yapar; bu parti Taşlama adımından başlar. Taşlama adımından sonra üst emre (E-2) katılır; 40 adımından itibaren üst emirle sürer.');
    expect(y.adim).toEqual({ '2.40': 'bekliyor: parti E-3, E-4' });
  });

  it('rotaya uymayan aralık, üst bağı olmayan emir, çok katmanlı emrin düğümü ve emir kaynağı yokken not yoktur; bağ döngüsü sonsuza gitmez', () => {
    const bos = { emir: {}, adim: {}, partiler: new Set() };
    for (const kol of [{ n: 1, m: 2 }, { n: 1, m: 6 }, { n: -1, m: 3 }, { n: 1.5, m: 4 }, null, 'x']) expect(kolNotlari(m(), D(), kaynak(['3', '2', kol]))).toEqual(bos);
    expect(kolNotlari(m(), D(), { orders: [{ id: '3', parentId: '', kol: { n: 1, m: 4 } }] })).toEqual(bos);
    expect(kolNotlari(m(), D({ dugum: 'Y1' }), kaynak(['3', '2', { n: 1, m: 4 }]))).toEqual(bos);
    expect(kolNotlari(m(), D(), null)).toEqual(bos);
    const dongu = kolNotlari(m(), D(), { orders: [{ id: '3', parentId: '4', kol: { n: 1, m: 4 } }, { id: '4', parentId: '3', kol: { n: 2, m: 4 } }] });
    expect(Object.keys(dongu.emir).sort()).toEqual(['3', '4']);
  });

  it('aynı adlı iki adım varsa ad kaçıncısı olduğuyla yazılır (rotadaki sırayla değil); adı boş adım anahtarıyla', () => {
    // Baştaki ve sondaki boşluk ekranda ayırt edilmez: "Torna " ikinci Torna'dır, yalnız boşluk olan ad yoktur.
    const rota = [{ k: '10', ad: 'Torna' }, { k: '20', ad: 'Freze' }, { k: '30', ad: 'Torna ' }, { k: '40', ad: '  ' }];
    const D2 = { siparisler: ['2', '3'].map((id) => ({ id, urun: 'U', adet: 1 })), urunler: [{ id: 'U', rota }] } as unknown as Parameters<typeof kolNotlari>[1];
    expect(kolNotlari(m(), D2, kaynak(['3', '2', { n: 1, m: 4 }])).emir).toEqual({ 3: '1. Torna adımını üst emir (E-2) yapar; bu parti Freze adımından başlar. 2. Torna adımından sonra üst emre (E-2) katılır; 40 adımından itibaren üst emirle sürer.' });
  });

  it('üst emir modelde yoksa numarası yerine kimliği yazar', () => {
    expect(kolNotlari(m({ 3: ['20', '30'] }), D(), kaynak(['3', '2', { n: 1, m: 4 }])).emir['3']).toContain('üst emir (2) yapar');
  });
});

// Vardiya'nın planlı duruşlarının okunduğu pencerenin sonu sunucunun okumasından, çalışmayla gelir (duruşu okunmayan ilk gün); ötesi bilinmez.
describe('bitişi duruş okuma penceresinin ötesindeki emir (3522, 3527)', () => {
  it('bitişi pencerenin sonundan sonra olan emir işaretlenir; son bilinmiyorsa hiçbir emir işaretlenmez', () => {
    expect(durusOkunmadi({ durusSonu: 8808 }, { bitis: 8808 })).toBe(false);
    expect(durusOkunmadi({ durusSonu: 8808 }, { bitis: 8808.25 })).toBe(true);
    expect(durusOkunmadi({ durusSonu: 8808 }, { bitis: null })).toBe(false);
    expect([{ durusSonu: null }, { durusSonu: undefined }, {}].map((m) => durusOkunmadi(m, { bitis: 99999 }))).toEqual([false, false, false]);
    // Planın 0. saati de bir sınırdır; yok sayılmaz.
    expect(durusOkunmadi({ durusSonu: 0 }, { bitis: 0.25 })).toBe(true);
  });

  it('model sonu çalışmadaki günden kurar: o günün başı, plan saatiyle; şimdiye bağlı değildir; gün yoksa ya da okunamıyorsa null', () => {
    const { c, p, cx } = ornek();
    const sonu = (gun: unknown, an = cx): number | null | undefined => modelKur({ ...c, durusOkumaSonu: gun as string | null }, p, an, (id) => id).durusSonu;
    // Örnek plan 2026-10-19'da başlar: 2027-10-21 planın 367. günüdür.
    expect(sonu('2027-10-21')).toBe(367 * 24);
    expect(sonu('2026-10-19')).toBe(0);
    expect(sonu('2027-10-21', { ...cx, now: cx.now + 48 })).toBe(367 * 24);
    expect([null, undefined, '', '21.10.2027', 20271021].map((g) => sonu(g))).toEqual([null, null, null, null, null]);
    expect(modelKur(c, p, cx, (id) => id).durusSonu).toBeNull();
  });
});

// 3525: Emirler ağacında açılan emrin not satırı. Emrin notları önce, adım notları adım satırının başlığıyla; koşullar adımı listeleyen düzenlerle aynı.
describe('ağaçta açılan emrin not satırı (3525)', () => {
  type M = Parameters<typeof agacNotlari>[0];
  const zaman = (t: number): string => `s${String(t)}`;
  const e = { id: '2', bitis: 100, adimlar: ['Torna', 'Freze', 'Taşlama', 'Kontrol'].map((ad, i) => ({ id: `2.${String(i + 1)}0`, ad, adaylar: [] })) };
  // 2.10 başlamış, 2.20 ve 2.30 başlamamış, 2.40'ın planda yeri yok.
  const m = { simdi: 10, durusSonu: 8808, emirler: [{ id: '2', no: 'E-2' }, { id: '7', no: 'E-7' }], isler: { '2.10': { basladi: true }, '2.20': { basladi: false }, '2.30': { basladi: false } } } as unknown as M;

  it('not yoksa boştur; emrin notları sırayla: önce bitişin erken görünebileceği, sonra partinin bağı', () => {
    expect(agacNotlari(m, e, {}, zaman)).toEqual([]);
    expect(agacNotlari(m, e, { kol: { emir: { 2: 'Parti bağı.', 3: 'Başka emir.' }, adim: {} } }, zaman)).toEqual(['Parti bağı.']);
    const uzak = { ...e, bitis: 9000 };
    expect(agacNotlari(m, uzak, { kol: { emir: { 2: 'Parti bağı.' }, adim: {} } }, zaman)).toEqual([DURUS_OKUNMADI, 'Parti bağı.']);
    expect(emirNotlari(m, uzak, { emir: { 2: 'Parti bağı.' } })).toEqual([DURUS_OKUNMADI, 'Parti bağı.']);
    expect(emirNotlari(m, uzak)).toEqual([DURUS_OKUNMADI]);
    expect(emirNotlari(m, e)).toEqual([]);
  });

  it('adım notları rota sırasıyla, adım satırının başlığıyla yazar; aynı adımın notları bekleme, parti, uzama sırasıyla tek satırda birleşir', () => {
    const n = {
      kol: { emir: {}, adim: { '2.30': 'bekliyor: parti E-2/1' } },
      adimBekle: { '2.30': { kadar: 50, neden: 'malzeme' as const }, '2.20': { kadar: 60, neden: 'kisi' as const, ust: '7' } },
      adimEk: { '2.30': 1.5, '2.20': 0.5 },
    };
    expect(agacNotlari(m, e, n, zaman)).toEqual([
      "2. Freze: bekliyor: kişi yok, s60'e kadar · üst emirden (E-7) · uzadı +0,5 sa",
      "3. Taşlama: bekliyor: malzeme yok, s50'e kadar · bekliyor: parti E-2/1 · uzadı +1,5 sa",
    ]);
    expect(agacAdimBasligi(2, e.adimlar[2]!)).toBe('3. Taşlama');
    // Emrin notu adım notlarından önce gelir.
    expect(agacNotlari(m, e, { ...n, kol: { ...n.kol, emir: { 2: 'Parti bağı.' } } }, zaman)[0]).toBe('Parti bağı.');
  });

  it('başlamış adımda bekleme ve parti notu yazmaz, uzama yazar; planda yeri olmayan adımın notu yoktur', () => {
    const n = { kol: { emir: {}, adim: { '2.10': 'bekliyor: parti E-2/1', '2.40': 'bekliyor: parti E-2/2' } }, adimBekle: { '2.10': { kadar: 50, neden: 'malzeme' as const }, '2.40': { kadar: 50, neden: 'kisi' as const } }, adimEk: { '2.10': 2, '2.40': 3 } };
    expect(agacNotlari(m, e, n, zaman)).toEqual(['1. Torna: uzadı +2 sa']);
  });
});

describe('darPanoYani (3681 G1 ve 3663 satır tıklaması)', () => {
  it('çubuğa basılınca iki yanda da 200 px altı yer varsa pano kartın üstüne taşarak üstte açılır', () => {
    expect(darPanoYani(110, 93, 380, null, false)).toEqual({ yan: 'ust', genis: true });
  });
  it('satır tıklamasında (tablo kipi) kural işlemez: eski yan seçimi kalır, alt sayfa sol tabloyu örtmez', () => {
    expect(darPanoYani(110, 93, 380, null, true)).toEqual({ yan: 'ust', genis: false });
    expect(darPanoYani(60, 150, 380, null, true)).toEqual({ yan: 'alt', genis: false });
  });
  it('200 px ve üstü yerde genişleme olmaz; altında önceki yan korunsa da genişler', () => {
    expect(darPanoYani(260, 90, 380, null, false)).toEqual({ yan: 'ust', genis: false });
    expect(darPanoYani(170, 400, 380, 'ust', false)).toEqual({ yan: 'ust', genis: true });
  });
});
