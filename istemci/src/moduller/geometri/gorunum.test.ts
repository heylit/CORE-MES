import { describe, expect, it } from 'vitest';
import type { GeometriOzellik } from '#paylasilan/sozlesme/geometri.ts';
import {
  agYuzAlanlari, agYuzNormalleri, aralikMetni, cubukYeri, olcekUstu, islemAnahtari, m2Metni, PATLATMA_KATI, patlatmaKaymasi, pozitifSayi, sartnameSayisi, taslakAlanlari, tozKg,
  ucgeninYuzu, yuzGruplari, yuzSirasiUyar, type TaslakIsaret, type Yon3,
  analizKatilari, BIRIM_EKSENLER, eksenAraliklari, hamKatisi, kapsayanDaire, donelMetni, formNedeni, stokOlcuMetni, talasYuzdesi,
} from './gorunum.ts';
import type { HamStokOnerisi } from '#paylasilan/sozlesme/geometri.ts';

describe('patlatmaKaymasi (2139)', () => {
  it('sıfır oranda parça yerinde kalır', () => {
    expect(patlatmaKaymasi([40, 20, 4], [0, 0, 6], 0)).toEqual([0, 0, 0]);
  });
  it('parça merkezden dışa, uzaklıkla orantılı kayar', () => {
    const [x, y, z] = patlatmaKaymasi([40, -20, 4], [0, 0, 6], 0.5);
    expect([x, y, z]).toEqual([40 * 0.5 * PATLATMA_KATI, -20 * 0.5 * PATLATMA_KATI, -2 * 0.5 * PATLATMA_KATI]);
  });
  it('merkezdeki parça kaymaz; oran 0-1 dışına çıkmaz', () => {
    expect(patlatmaKaymasi([0, 0, 6], [0, 0, 6], 1)).toEqual([0, 0, 0]);
    expect(patlatmaKaymasi([10, 0, 0], [0, 0, 0], 5)).toEqual([10 * PATLATMA_KATI, 0, 0]);
    expect(patlatmaKaymasi([10, 0, 0], [0, 0, 0], -1)).toEqual([0, 0, 0]);
  });
});

describe('yüzey işaretleri (2144)', () => {
  const yuzler = [
    { sira: 1, tur: 'duzlem' as const, ters: false, alanMm2: 800 },
    { sira: 2, tur: 'silindir' as const, ters: true, alanMm2: 300 },
    { sira: 3, tur: 'silindir' as const, ters: false, alanMm2: 600 },
  ];
  const boya = { tur: 'rota' as const, opNo: 40, sartnameId: 5 };
  const isaretler = new Map<number, TaslakIsaret>([[1, { islem: boya, oneri: false }], [2, { islem: { tur: 'maske' }, oneri: true }]]);
  it('taslağın alanları işlem başına toplanır; işaretsiz ve toplam ayrı', () => {
    const a = taslakAlanlari(yuzler, isaretler);
    expect(a.islemler.get(islemAnahtari(boya))).toEqual({ yuzSayisi: 1, alanMm2: 800 });
    expect(a.islemler.get('maske')).toEqual({ yuzSayisi: 1, alanMm2: 300 });
    expect([a.isaretsizMm2, a.toplamMm2]).toEqual([600, 1700]);
    expect(m2Metni(1700)).toBe('0,0017 m²');
  });
  it('ağ yüz alanı üçgenlerden; yüz sırası sayı ve alanla denetlenir', () => {
    // Birim kare iki üçgen (yüz 0), yanında tek üçgen (yüz 1, alan 0,5).
    const konum = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 20, 0, 0];
    const dizin = [0, 1, 2, 0, 2, 3, 1, 4, 2];
    const alanlar = agYuzAlanlari(konum, dizin, [0, 1, 2, 2]);
    expect(alanlar).toEqual([100, 50]);
    expect(yuzSirasiUyar(alanlar, [101, 49])).toBe(true);
    expect(yuzSirasiUyar(alanlar, [50, 100])).toBe(false);
    expect(yuzSirasiUyar(alanlar, [100, 50, 3])).toBe(false);
    expect(yuzSirasiUyar([], [])).toBe(false);
  });
  it('üçgenin yüzü aralıklardan bulunur', () => {
    const araliklar = [0, 1, 2, 2, 3, 9];
    expect([0, 1, 2, 3, 9].map((t) => ucgeninYuzu(araliklar, t))).toEqual([0, 0, 1, 2, 2]);
    expect(ucgeninYuzu(araliklar, 10)).toBeNull();
  });
});

describe('boya ve maske, prototip v3 (2144d)', () => {
  // 120 x 80 plaka: üst, alt, iki yan düzlem; Ø24 ve iki Ø10 delik (birine havşa bağlı), dış silindir göbek, bir pah, bir koni.
  const yuzler = [
    { sira: 1, tur: 'duzlem' as const, ters: false, alanMm2: 9000 },
    { sira: 2, tur: 'duzlem' as const, ters: false, alanMm2: 9000 },
    { sira: 3, tur: 'duzlem' as const, ters: false, alanMm2: 1800 },
    { sira: 4, tur: 'duzlem' as const, ters: false, alanMm2: 1200 },
    { sira: 5, tur: 'silindir' as const, ters: true, alanMm2: 1700 },
    { sira: 6, tur: 'silindir' as const, ters: true, alanMm2: 470 },
    { sira: 7, tur: 'silindir' as const, ters: true, alanMm2: 470 },
    { sira: 8, tur: 'koni' as const, ters: true, alanMm2: 90 },
    { sira: 9, tur: 'silindir' as const, ters: false, alanMm2: 4700 },
    { sira: 10, tur: 'koni' as const, ters: false, alanMm2: 60 },
    { sira: 11, tur: 'torus' as const, ters: false, alanMm2: 40 },
  ];
  const oz = (o: Partial<GeometriOzellik> & Pick<GeometriOzellik, 'sira' | 'tur' | 'yuzler'>): GeometriOzellik => ({
    ust: null, capMm: null, yaricapMm: null, derinlikMm: null, aciDerece: null, genislikMm: null, boyMm: null, gecis: null, dip: null, ic: null,
    eksen: null, konum: null, ...o,
  });
  const ozellikler = [
    oz({ sira: 1, tur: 'delik', capMm: 24, yuzler: [5] }),
    oz({ sira: 2, tur: 'delik', capMm: 10, yuzler: [6] }),
    oz({ sira: 3, tur: 'delik', capMm: 10.02, yuzler: [7] }),
    oz({ sira: 4, tur: 'havsa', ust: 3, yuzler: [8] }),
    oz({ sira: 5, tur: 'pah', yuzler: [10] }),
  ];
  const normaller: (Yon3 | null)[] = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [1, 0, 0], null, null, null, null, null, null, null];
  it('gruplar: delikler çapa göre (bağlı havşa delikle), yön bilinince üst, alt (bant), yan; kalanlar türüyle', () => {
    const g = yuzGruplari(yuzler, ozellikler, normaller);
    expect(g.map((x) => [x.ad, x.yuzler, x.tapa, x.bant])).toEqual([
      ['Delik Ø24', [5], 1, false],
      ['Delik Ø10 × 2', [6, 7, 8], 2, false],
      ['Dış silindir', [9], 0, false],
      ['Üst yüz', [1], 0, false],
      ['Alt yüz (oturma)', [2], 0, true],
      ['Yan yüz × 2', [3, 4], 0, false],
      ['Pah', [10], 0, false],
      ['Diğer yüz', [11], 0, false],
    ]);
  });
  it('gruplar: yön bilinmiyorsa düzlemler tek grup; özellik yoksa delikler iç silindirdir', () => {
    const g = yuzGruplari(yuzler, null, null);
    expect(g.map((x) => [x.anahtar, x.yuzler])).toEqual([
      ['dis', [9]], ['duzlem', [1, 2, 3, 4]], ['ic', [5, 6, 7]], ['diger', [8, 10, 11]],
    ]);
  });
  it('ağ yüz normali alanla ağırlıklı ve birimdir; üçgensiz yüz null', () => {
    const konum = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0];
    expect(agYuzNormalleri(konum, [0, 1, 2, 0, 2, 3, 0, 2, 1], [0, 1, 2, 2, 3, 2])).toEqual([[0, 0, 1], [0, 0, -1], null]);
  });
  it('şartnameden kalınlık, yoğunluk ve verim: birim ya da anahtarla; sayı, aralık, metin ve mm çevrimi', () => {
    type Deger = number | [number, number] | string | string[] | boolean | null;
    const p = (anahtar: string, birim: string | null, deger: Deger) => ({ anahtar, ad: anahtar, birim, deger });
    expect(sartnameSayisi([p('renk', null, 'RAL 9005'), p('kat', 'µm', 70)], 'kalinlik')).toBe(70);
    expect(sartnameSayisi([p('kalinlik', 'µm', [60, 80])], 'kalinlik')).toBe(70);
    expect(sartnameSayisi([p('kalinlik', null, '12 µm (Fe/Zn12)')], 'kalinlik')).toBe(12);
    expect(sartnameSayisi([p('kalinlik', 'mm', 0.08)], 'kalinlik')).toBeCloseTo(80);
    expect(sartnameSayisi([p('kalinlik', 'µm', null), p('toz', 'g/cm³', '1,5')], 'kalinlik')).toBeNull();
    expect(sartnameSayisi([p('toz', 'g/cm³', '1,5')], 'yogunluk')).toBe(1.5);
    expect(sartnameSayisi([p('verim', '%', 60)], 'verim')).toBe(60);
    expect(sartnameSayisi([p('renk', null, true)], 'kalinlik')).toBeNull();
  });
  it('toz miktarı: m² x µm x g/cm³ / 1000 / verim x adet; eksik girdi null', () => {
    expect(tozKg(18000, 70, 1.5, 60, 20)).toBeCloseTo(0.063);
    expect(tozKg(18000, null, 1.5, 60, 1)).toBeNull();
    expect([pozitifSayi('1,5'), pozitifSayi(''), pozitifSayi('-2'), pozitifSayi('x')]).toEqual([1.5, null, null, null]);
  });
});

describe('önizleme katıları (2396)', () => {
  // L kesitli çubuk: x boyunca 0-100; kesit (y, z) iki kol, biri 0-40 x 0-10, öteki 0-10 x 0-40.
  const kesit: [number, number][] = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40]];
  const L = new Float32Array(kesit.flatMap(([y, z]) => [0, y, z, 100, y, z]));
  const oneri = (form: HamStokOnerisi['form'], olcu: Record<string, number>, kesimBoyuMm: number | null): HamStokOnerisi => ({
    malzemeNo: 1, kod: 'H', ad: null, kalite: null, form, olcu, aile: null, kaliteKodu: null, yogunluk: null, kesimBoyuMm, hamHacimMm3: 1, kesimEnMm: null, eksen: 'a' as const,
  });

  it('kapsayan daire kutu merkezinde değildir (L kesit)', () => {
    const d = kapsayanDaire(kesit)!;
    // En uzak iki köşe (40,0) ve (0,40): merkez (20,20); kutu merkezi de (20,20) ama yarıçap köşegenin yarısıdır.
    expect(d.r).toBeCloseTo(Math.hypot(40, 40) / 2, 6);
    // Eksantrik kesit: kutu merkezi (25, 5), dairenin merkezi (25, 0).
    const e = kapsayanDaire([[0, 0], [50, 0], [25, 10]])!;
    expect([e.x, e.y]).toEqual([25, 0]);
    expect(e.r).toBeCloseTo(25, 6);
    expect(kapsayanDaire([])).toBeNull();
  });

  it('çubuk hamı uzun eksende, merkezi kapsayan dairenin merkezi; boy kesim boyu', () => {
    const k = hamKatisi(oneri('cubuk', { d: 60, l: 3000 }, 106), BIRIM_EKSENLER, L)!;
    expect(k.sekil).toBe('silindir');
    expect(k.boyut).toEqual([106, 60, 60]);
    expect(k.merkez[0]).toBeCloseTo(50, 6);
    expect(k.merkez[1]).toBeCloseTo(20, 6);
    expect(k.merkez[2]).toBeCloseTo(20, 6);
  });

  it('lama, levha ve blok kutudur; ölçüler büyükten küçüğe eksenlere', () => {
    expect(hamKatisi(oneri('lama', { a: 20, b: 50, l: 1000 }, 106), BIRIM_EKSENLER, L)!.boyut).toEqual([106, 50, 20]);
    expect(hamKatisi(oneri('levha', { t: 12, w: 50, l: 2000 }, 106), BIRIM_EKSENLER, L)!.boyut).toEqual([106, 50, 12]);
    const blok = hamKatisi(oneri('blok', { a: 45, b: 110, h: 50 }, null), BIRIM_EKSENLER, L)!;
    expect(blok.boyut).toEqual([110, 50, 45]);
    expect(blok.merkez).toEqual([50, 20, 20]);
    expect(hamKatisi(oneri('blok', { a: 1, b: 1, h: 1 }, null), BIRIM_EKSENLER, new Float32Array())).toBeNull();
  });

  it('3321-1: dönel formda katı hamın eksenine çizilir (flanşta kısa kenar); disk kalınlık boyunda silindir, levha kesim eniyle', () => {
    // Disk: z boyunca 0-10 kalın, x-y'de Ø100 çevresindeki noktalar.
    const disk = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => {
      const t = (i * Math.PI) / 4;
      return [50 * Math.cos(t), 50 * Math.sin(t), 0, 50 * Math.cos(t), 50 * Math.sin(t), 10];
    }));
    const k = hamKatisi({ ...oneri('cubuk', { d: 105, l: 3000 }, 17), eksen: 'c' }, BIRIM_EKSENLER, disk)!;
    expect(k.sekil).toBe('silindir');
    expect(k.eksenler[0]).toEqual([0, 0, 1]);
    expect(k.boyut).toEqual([17, 105, 105]);
    expect(k.merkez[2]).toBeCloseTo(5, 6);
    const d = hamKatisi({ ...oneri('disk', { d: 105, t: 15 }, null), eksen: 'c' }, BIRIM_EKSENLER, disk)!;
    expect([d.sekil, d.boyut]).toEqual(['silindir', [15, 105, 105]]);
    const b = hamKatisi({ ...oneri('boru', { D: 105, t: 30, l: 6000 }, 17), eksen: 'c' }, BIRIM_EKSENLER, disk)!;
    expect(b.boyut).toEqual([17, 105, 105]);
    expect(hamKatisi({ ...oneri('levha', { t: 12, w: 1000, l: 2000 }, 110), kesimEnMm: 55 }, BIRIM_EKSENLER, L)!.boyut).toEqual([110, 55, 12]);
  });

  it('3321-1: neden metinleri; boru ve disk ölçü yazımı; talaş yüzdesi', () => {
    expect(donelMetni({ kenar: 'c', capMm: 100, boyMm: 10, icCapMm: 30 })).toBe('dönme ekseni kısa kenar (10 mm), dış çap Ø100, eksenel delik Ø30');
    expect([formNedeni('cubuk', true), formNedeni('blok', true), formNedeni('lama', false), formNedeni('cubuk', false)])
      .toEqual(['dönel parça, çubuktan', null, 'prizmatik, lamadan', null]);
    expect(stokOlcuMetni({ form: 'boru', olcu: { D: 104, t: 39, l: 6000 } })).toBe('Ø 104 x 39 et x 6.000 mm');
    expect(stokOlcuMetni({ form: 'disk', olcu: { d: 104, t: 14 } })).toBe('Ø 104 x 14 mm');
    expect([talasYuzdesi(46000, 100000), talasYuzdesi(null, 1), talasYuzdesi(1, 0)]).toEqual([54, null, null]);
  });

  it('analiz: dış kutu ve döndürülmüş kutu ağın aralığının ortasında', () => {
    const [dis, don] = analizKatilari(BIRIM_EKSENLER, [100, 40, 40], [100, 40, 40], L);
    expect(dis!.merkez).toEqual([50, 20, 20]);
    expect(don!.boyut).toEqual([100, 40, 40]);
    const ar = eksenAraliklari(L, [[0, Math.SQRT1_2, Math.SQRT1_2]])!;
    expect(ar.en[0]).toBeCloseTo(0, 5);
    expect(ar.ust[0]).toBeCloseTo(50 * Math.SQRT1_2, 4);
  });
});

describe('süre kartı biçimleri (3278 D)', () => {
  it('toplam 10 dk üstünde tam dakika, kısa ondalıklı, 0,1 altı "< 0,1"; ölçek 5/10/25/50, aşınca 50 katı; çubuk ölçeğe göre, dar aralık en az 1', () => {
    expect(aralikMetni(4.1, 14.4, true)).toBe('4 – 14 dk');
    expect(aralikMetni(0.54, 1.89, true)).toBe('0,5 – 1,9 dk');
    expect(aralikMetni(2.7, 10.7, false)).toBe('2,7 – 10,7 dk');
    expect(aralikMetni(0.03, 0.09, false)).toBe('< 0,1 dk');
    expect(aralikMetni(0.03, 0.25, false)).toBe('< 0,1 – 0,3 dk');
    expect([olcekUstu(1.9), olcekUstu(5), olcekUstu(6), olcekUstu(14), olcekUstu(50), olcekUstu(51), olcekUstu(140)]).toEqual([5, 5, 10, 25, 50, 100, 150]);
    expect(cubukYeri(5, 15, 50)).toEqual({ x: 10, en: 20 });
    expect(cubukYeri(0.1, 0.2, 50).en).toBe(1);
    expect(cubukYeri(40, 80, 50)).toEqual({ x: 80, en: 20 });
  });
});
