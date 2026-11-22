import { describe, expect, it } from 'vitest';
import type { KokpitEmri } from './kurallar.ts';
import { ETIKET_HARF, ETIKET_PAYI, KUME_BOSLUK, KUME_DAR, YOGUN_SATIR, etiketEni, kumele, kumeYazisi, okunurGenislik, satirBoyuCoz, etiketYeri, bitenAdim, emirAraligi, gecKumele, gunCizelgesi, hucreAdi, hucreOzeti, hucreKipi, acikDilimler, acikYazisi, saatMetni, tarihMetni, tezgahGunleri, pencereAdimi, pencereDegeri, gecOzeti, pencereSonu, pencereYazisi, seritOzeti, gunlukDoluluk, inisGorunumu, pencereBasi, pencereOlcegi, seritSaati, seritX, kademe, siparisCubukYazisi, siparisGruplari, siparisOzeti, gorunenSatirSayisi, okKumesi, ufkaSigmayanSayisi, ufkaSigmaz, ufukCizgisi, ufukYazisi } from './yogunluk.ts';

// Uydurma örnek (ORN-). Saatler planın saat ekseninde.
const zaman = (t: number): string => `${String(Math.floor(t / 24) + 1).padStart(2, '0')}.12.2026 ${String(t % 24).padStart(2, '0')}:00`;

describe('yoğunluk T1: plan ufku', () => {
  const m = { bas: 0, son: 30 * 24 };
  it('ufuk tahtanın içindeyse saati; dışında, sınırda ya da bilinmiyorsa null', () => {
    expect(ufukCizgisi(m, 27 * 24)).toBe(27 * 24);
    expect(ufukCizgisi(m, 40 * 24)).toBeNull();
    expect(ufukCizgisi(m, 30 * 24)).toBeNull();
    expect(ufukCizgisi(m, 0)).toBeNull();
    expect(ufukCizgisi(m, null)).toBeNull();
    expect(ufukCizgisi(m, Number.NaN)).toBeNull();
  });
  it('yazı gün ve ay', () => { expect(ufukYazisi(zaman, 27 * 24)).toBe('Plan ufku · 28.12'); });
  it('ufka sığmayan emir: ufuk sonrası süresi olan', () => {
    expect(ufkaSigmaz({ ufukEksik: 3 })).toBe(true);
    expect(ufkaSigmaz({})).toBe(false);
    expect(ufkaSigmaz({ ufukEksik: 0 })).toBe(false);
    expect(ufkaSigmayanSayisi([{ ufukEksik: 1 }, {}, { ufukEksik: 5 }])).toBe(2);
  });
});

describe('yoğunluk T5: çubuk yazısı', () => {
  const tam = etiketEni('A12 ORN-Mil');
  it('yazı genişliği harf sayısından; boş yazı sıfır', () => {
    expect(tam).toBe(11 * ETIKET_HARF + ETIKET_PAYI);
    expect(etiketEni('')).toBe(0);
  });
  it('sığarsa içinde', () => { expect(etiketYeri(tam, 0, 'A12', 'ORN-Mil')).toBe('ic'); });
  it('sığmazsa sağda yer varsa dışında', () => { expect(etiketYeri(tam - 1, tam, 'A12', 'ORN-Mil')).toBe('dis'); });
  it('dışarıda da yer yoksa yalnız kod (kod sığarsa)', () => { expect(etiketYeri(etiketEni('A12'), tam - 1, 'A12', 'ORN-Mil')).toBe('kod'); });
  it('kod da sığmazsa yazısız; yazı kesilmez', () => { expect(etiketYeri(etiketEni('A12') - 1, 0, 'A12', 'ORN-Mil')).toBe('yok'); });
  it('ek yazı yoksa yalnız kod ölçülür', () => { expect(etiketYeri(etiketEni('A12'), 0, 'A12', '')).toBe('ic'); });
});

describe('yoğunluk T6: oklar', () => {
  const kart = new Set(['e1', 'e2', 'e3']);
  it('az satırda bugünkü gibi: yanan kart, yoksa odaktaki işin emri', () => {
    expect(okKumesi(kart, 'e9', 'e2', YOGUN_SATIR)).toBe(kart);
    expect([...okKumesi(null, 'e9', null, 10) ?? []]).toEqual(['e9']);
    expect(okKumesi(null, null, null, 10)).toBeNull();
  });
  it('yoğunlukta yalnız seçili emir, yoksa odaktaki işin emri; ikisi de yoksa ok yok', () => {
    expect([...okKumesi(kart, 'e9', 'e2', YOGUN_SATIR + 1) ?? []]).toEqual(['e2']);
    expect([...okKumesi(kart, 'e9', null, 300) ?? []]).toEqual(['e9']);
    expect(okKumesi(kart, null, null, 300)).toBeNull();
  });
});

describe('yoğunluk T6: görünen satır', () => {
  const e = (id: string, n: number) => ({ id, adimlar: Array.from({ length: n }, (_, i) => ({ id: `${id}.${String(i)}`, ad: 'Adım', adaylar: [] })) });
  it('Tezgâh gözünde tezgâh sayısı; Sipariş gözünde emirler ve açık emirlerin adımları', () => {
    expect(gorunenSatirSayisi('T', 24, [e('a', 3)], null)).toBe(24);
    expect(gorunenSatirSayisi('S', 24, [e('a', 3), e('b', 5)], null)).toBe(2);
    expect(gorunenSatirSayisi('S', 24, [e('a', 3), e('b', 5)], new Set(['b']))).toBe(7);
  });
});

describe('yoğunluk T3: gerçek uzunluk ve küme (S1 a)', () => {
  it('okunur genişlik yalnız Gün ve 3 gün', () => {
    expect(okunurGenislik('G')).toBe(true);
    expect(okunurGenislik('3')).toBe(true);
    for (const o of ['H', 'A', 'Y'] as const) expect(okunurGenislik(o)).toBe(false);
  });
  it('dar ve yakın komşular tek küme; geniş iş ve uzak iş ayrı kalır; sıra sola göre', () => {
    const d = KUME_DAR - 2, b = KUME_BOSLUK - 1;
    const l = [
      { id: 'c', sol: 2 * (d + b), en: d }, { id: 'a', sol: 0, en: d }, { id: 'b', sol: d + b, en: d },
      { id: 'uzak', sol: 200, en: d }, { id: 'genis', sol: 200 + d + 1, en: 40 }, { id: 'son', sol: 241 + d + 1, en: d },
    ];
    expect(kumele(l)).toEqual([
      { idler: ['a', 'b', 'c'], sol: 0, en: 3 * d + 2 * b },
      { idler: ['uzak'], sol: 200, en: d },
      { idler: ['genis'], sol: 200 + d + 1, en: 40 },
      { idler: ['son'], sol: 241 + d + 1, en: d },
    ]);
  });
  it('eşik: boşluk tam eşikte ya da iş tam darlık sınırındaysa birleşmez', () => {
    expect(kumele([{ id: 'a', sol: 0, en: 5 }, { id: 'b', sol: 5 + KUME_BOSLUK, en: 5 }])).toHaveLength(2);
    expect(kumele([{ id: 'a', sol: 0, en: KUME_DAR }, { id: 'b', sol: KUME_DAR + 1, en: 5 }])).toHaveLength(2);
  });
  it('küme yazısı', () => { expect(kumeYazisi(5)).toBe('5 iş'); });
});

describe('yoğunluk T4: satır boyu', () => {
  it('saklı Sıkı yalnız dokunmatik değilse; bilinmeyen değer Rahat', () => {
    expect(satirBoyuCoz('siki', false)).toBe('siki');
    expect(satirBoyuCoz('siki', true)).toBe('rahat');
    expect(satirBoyuCoz(null, false)).toBe('rahat');
    expect(satirBoyuCoz('baska', false)).toBe('rahat');
  });
});

describe('yoğunluk dilim 3: E kademeleri (S2 a)', () => {
  const emir = (id: string, durum: KokpitEmri['durum'], adimlar: string[], gecikme: number | null = null): KokpitEmri =>
    ({ id, no: `ORN-UE-${id}`, durum, gecikme, bitis: gecikme === null ? null : 100 + gecikme, adimlar: adimlar.map((a) => ({ id: a })) }) as unknown as KokpitEmri;
  const isler = { a1: { S: 10, C: 14, bitti: true }, a2: { S: 20, C: 30, bitti: false }, b1: { S: 5, C: 8, bitti: false } };
  it('ölçeğe göre kademe: Yıl ve Ay sipariş, Hafta emir, yakın ölçekler adım', () => {
    expect((['Y', 'A', 'H', '3', 'G'] as const).map(kademe)).toEqual(['siparis', 'siparis', 'emir', 'adim', 'adim']);
  });
  it('emir aralığı planlı adımların birleşimi; planda adım yoksa null; biten adım sayılır', () => {
    expect(emirAraligi(emir('1', 'iyi', ['a1', 'a2', 'yok']), isler)).toEqual({ S: 10, C: 30 });
    expect(emirAraligi(emir('2', 'plansiz', ['yok']), isler)).toBeNull();
    expect(bitenAdim([emir('1', 'iyi', ['a1', 'a2']), emir('3', 'iyi', ['b1'])], isler)).toEqual({ biten: 1, toplam: 3 });
    expect(bitenAdim([emir('4', 'iyi', [])], isler)).toBeNull();
  });
  it('sipariş grupları görünen sırayı izler, görünmeyen emir ve emirsiz sipariş satır olmaz', () => {
    const e1 = emir('1', 'iyi', ['a1']), e2 = emir('2', 'gec', ['a2']), e3 = emir('3', 'risk', ['b1']);
    const kartlar = [{ kok: 'k1', siparis: { no: 'ORN-SIP-1' }, emirler: [e1, e2], termin: 50 }, { kok: 'k3', siparis: null, emirler: [e3], termin: null }];
    const g = siparisGruplari(kartlar, [e3, e2]);
    expect(g.map((x) => [x.kok, x.no, x.emirler.map((e) => e.id)])).toEqual([['k3', 'ORN-UE-3', ['3']], ['k1', 'ORN-SIP-1', ['2']]]);
  });
  it('sipariş özeti: aralık, durum sayıları, en kötü durum ve en büyük gecikme; yazı', () => {
    const o = siparisOzeti([emir('1', 'iyi', ['a1'], -5), emir('2', 'gec', ['a2'], 12), emir('3', 'risk', ['b1']), emir('4', 'plansiz', [])], isler);
    expect(o).toEqual({ aralik: { S: 5, C: 30 }, gec: 1, risk: 1, plansiz: 1, durum: 'gec', gecikme: 12, bitis: 112 });
    expect(siparisCubukYazisi(4, o)).toBe('4 emir · 1 geç · 1 riskli');
    expect(siparisCubukYazisi(2, { gec: 0, risk: 0 })).toBe('2 emir');
  });
  it('kademeye inerken aralık görünüme sığar: kısa aralık yakın ölçek, uzun aralık dar saat eniyle', () => {
    const kisa = inisGorunumu({ S: 10, C: 40 }, 900);
    expect(kisa.saatEni).not.toBeNull();
    expect(kisa.odak).toBeLessThan(10);
    expect((40 - kisa.odak) * (kisa.saatEni ?? 0)).toBeLessThanOrEqual(900);
    for (const gun of [20, 90]) {
      const u = inisGorunumu({ S: 0, C: gun * 24 }, 900);
      expect(u.olcek).toBe('H');
      expect((gun * 24 - u.odak) * u.saatEni).toBeLessThanOrEqual(900);
      expect(-u.odak * u.saatEni).toBeLessThan(900 * 0.1);
    }
  });
});

describe('yoğunluk dilim 3b: F genel bakış şeridi', () => {
  // İki tezgâh günde 8 saat açık (08-16); fason sayılmaz. İş tezgâhın açık saatinde sayılır, gece kısmı düşer.
  const pen = (g: number): [number, number][] => Array.from({ length: g }, (_, d) => [d * 24 + 8, d * 24 + 16]);
  const cx = { M: { T1: { id: 'T1', grup: '', op: 1, sw: pen(3), rw: pen(3) }, T2: { id: 'T2', grup: '', op: 1, sw: pen(3), rw: pen(3) }, F: { id: 'F', grup: '', op: 1, sw: pen(3), rw: pen(3) } } };
  const is = (id: string, m: string, S: number, C: number, fason = false) => ({ id, m, S, C, fason }) as never;
  const m = {
    bas: 0, son: 3 * 24,
    tezgahlar: [{ id: 'T1', fason: false }, { id: 'T2', fason: false }, { id: 'F', fason: true }] as never,
    isler: { a: is('a', 'T1', 10, 14), b: is('b', 'T2', 12, 24 + 12), c: is('c', 'F', 8, 16, true) },
  };
  it('günlük doluluk: açık saat fason dışı tezgâhların toplamı, plan iş başına açık saatte', () => {
    expect(gunlukDoluluk(cx, m)).toEqual([{ gun: 0, acik: 16, plan: 8 }, { gun: 1, acik: 16, plan: 4 }, { gun: 2, acik: 16, plan: 0 }]);
  });
  it('geç emirler termin gününe göre sayılır; plan dışı ya da terminsiz olan şeridin dışındadır', () => {
    const e = (durum: string, termin: number | null) => ({ durum, termin }) as never;
    expect(gecOzeti([e('gec', 50), e('gec', 30), e('gec', 40), e('gec', 30), e('risk', 10), e('gec', null), e('gec', -5), e('gec', 72)], 0, 72))
      .toEqual({ gunler: [{ gun: 1, sayi: 3 }, { gun: 2, sayi: 1 }], disarida: 3, toplam: 7 });
  });
  it('şerit özeti: en yoğun gün, aşım, geç emirler ve ufuk', () => {
    const g = [{ gun: 0, acik: 16, plan: 8 }, { gun: 1, acik: 16, plan: 20 }, { gun: 2, acik: 0, plan: 0 }];
    expect(seritOzeti(g, { gunler: [{ gun: 1, sayi: 3 }], disarida: 1, toplam: 4 }, (d) => `0${String(d + 1)}.12`, 'Plan ufku · 03.12'))
      .toBe('En yoğun gün 02.12 %125; 1 gün aşım; termini kaçan 4 emir, 1 günde, 1 tanesi şeridin dışında; Plan ufku · 03.12.');
    expect(seritOzeti([], { gunler: [], disarida: 0, toplam: 0 }, String, null)).toBe('Planda açık gün yok.');
  });
  it('şerit ve saat dönüşümü birbirinin tersi; şerit dışı sınırda kalır', () => {
    expect(seritX(36, 0, 72, 720)).toBe(360);
    expect(seritSaati(360, 0, 72, 720)).toBe(36);
    expect(seritSaati(-10, 0, 72, 720)).toBe(0);
    expect(seritSaati(900, 0, 72, 720)).toBe(72);
  });
  it('pencere başı planın içinde kalır; plandan geniş pencere başta durur', () => {
    expect(pencereBasi(30, 24, 0, 72)).toBe(30);
    expect(pencereBasi(-5, 24, 0, 72)).toBe(0);
    expect(pencereBasi(60, 24, 0, 72)).toBe(48);
    expect(pencereBasi(10, 100, 0, 72)).toBe(0);
  });
  it('pencere kenarı: aralık görünen ene sığar; Hafta\'dan dar uzak sayılır (ölçek H), en dar 6 saat', () => {
    expect(pencereOlcegi(0, 72, 1080)).toEqual({ olcek: '3', saatEni: 15 });
    const uzak = pencereOlcegi(0, 40 * 24, 960);
    expect(uzak.olcek).toBe('H');
    expect(uzak.saatEni).toBeCloseTo(1);
    expect(pencereOlcegi(0, 1, 1000).saatEni).toBe(88);
    // En dar pencere 6 saat: 300 px'e 1 saat değil 6 saat sığar.
    expect(pencereOlcegi(0, 1, 300).saatEni).toBe(50);
  });
  it('pencere sonu en az 6 saat, en çok plan sonu; yazı bütün plan görünürken söyler', () => {
    expect(pencereSonu(10, 12, 72)).toBe(16);
    expect(pencereSonu(10, 40, 72)).toBe(40);
    expect(pencereSonu(10, 90, 72)).toBe(72);
    const t = (h: number): string => `${String(h)}s`;
    expect(pencereYazisi({ S: 0, C: 30 }, 0, 72, t)).toBe('0s – 30s');
    expect(pencereYazisi({ S: 0, C: 100 }, 0, 72, t)).toBe('0s – 72s, tüm plan görünüyor');
  });
  it('pano planın ötesine kaymışken değer en çoğu aşmaz, ileri tuş pencereyi geri çekmez (Test B3)', () => {
    // Plan 0-240 sa, pencere 100 sa geniş; tahta sona kaymış ve başı 150'de (son - en = 140'tan ileride).
    expect(pencereDegeri({ S: 150, C: 250 }, 0, 240)).toEqual({ simdi: 6, max: 6 });
    expect(pencereDegeri(null, 0, 240)).toEqual({ simdi: 0, max: 0 });
    expect(pencereAdimi(150, 174, 100, 0, 240)).toBe(150);
    expect(pencereAdimi(150, 126, 100, 0, 240)).toBe(126);
    expect(pencereAdimi(30, 54, 100, 0, 240)).toBe(54);
    expect(pencereAdimi(130, 154, 100, 0, 240)).toBe(140);
    expect(pencereAdimi(10, -14, 100, 0, 240)).toBe(0);
  });
  it('dar şeritte yan yana geç noktaları birleşir; genişte ayrı kalır', () => {
    const g = [{ gun: 1, sayi: 2 }, { gun: 2, sayi: 1 }, { gun: 3, sayi: 1 }, { gun: 6, sayi: 4 }];
    expect(gecKumele(g, 11, 18)).toEqual([{ bas: 1, son: 2, sayi: 3 }, { bas: 3, son: 3, sayi: 1 }, { bas: 6, son: 6, sayi: 4 }]);
    expect(gecKumele(g, 20, 18).length).toBe(4);
    expect(gecKumele(g, 3, 18)).toEqual([{ bas: 1, son: 6, sayi: 8 }]);
  });
});

describe('yoğunluk dilim 3c: G tezgâh doluluk hücreleri', () => {
  const pen = (g: number): [number, number][] => Array.from({ length: g }, (_, d) => [d * 24 + 8, d * 24 + 16]);
  const cx = { M: { T1: { id: 'T1', grup: '', op: 1, sw: pen(2), rw: pen(2) } } } as never;
  const is = (id: string, job: string, S: number, C: number) => ({ id, job, m: 'T1', S, C, fason: false, ad: 'Torna' }) as never;
  const m = {
    bas: 0, son: 48,
    isler: { a: is('a', 'E1', 10, 12), b: is('b', 'E2', 14, 24 + 10), c: { ...(is('c', 'E3', 9, 11) as object), m: 'T2' } as never },
    durus: { T1: [{ a: 30, b: 34, ariza: false, neden: 'bakım' as const }] },
  };
  it('hücre kipi yalnız Tezgâh gözünde Ay, Hafta ve Hafta\'dan dar saat eninde', () => {
    expect(hucreKipi('T', 'H', 6.5)).toBe(true);
    expect(hucreKipi('T', 'A', 1.5)).toBe(true);
    expect(hucreKipi('T', 'Y', 0.14)).toBe(false);
    expect(hucreKipi('T', '3', 15)).toBe(false);
    expect(hucreKipi('S', 'H', 6.5)).toBe(false);
  });
  it('tezgâh günleri: açık ve plan saati, iş sayısı, geç emrin işi, güne değen duruş', () => {
    const g = tezgahGunleri(cx, m, 'T1', new Set(['E2']));
    expect(g.map((x) => [x.gun, x.acik, x.plan, x.yuzde, x.isSay, x.gec, x.duruslar.length])).toEqual([[0, 8, 4, 50, 2, 1, 0], [1, 8, 2, 25, 1, 1, 1]]);
  });
  it('hücre adı doluluk, iş, geç iş ve duruşu söyler; kapalı gün', () => {
    const [, ikinci] = tezgahGunleri(cx, m, 'T1', new Set(['E2']));
    expect(hucreAdi('ORN-T01', '02.12', ikinci!)).toBe('ORN-T01 02.12: doluluk %25 (2 / 8 sa), 1 iş, 1 geç iş, bakım duruşu');
    expect(hucreAdi('ORN-T01', '03.12', { yuzde: null, acik: 0, plan: 0, gec: 0, isSay: 0, duruslar: [] })).toBe('ORN-T01 03.12: kapalı');
  });
  it('gün çizelgesi: güne değen işler başlangıç sırasıyla, gün dışı kısım kesilir', () => {
    const l = gunCizelgesi([m.isler.b, m.isler.a], 24, 48);
    expect(l.map((x) => [x.is.id, Math.round(x.sol), Math.round(x.en)])).toEqual([['b', 0, 42]]);
    expect(gunCizelgesi([m.isler.b, m.isler.a], 0, 24).map((x) => x.is.id)).toEqual(['a', 'b']);
  });
  it('Arayüz 3c Z1: panel saati ve tarihi saatYaz yazısından kesilmeden alınır; N3 özet adla aynı', () => {
    expect(saatMetni('26.11 Per 00:00')).toBe('00:00');
    expect(saatMetni('26.11 Per 08:30')).toBe('08:30');
    expect(tarihMetni('26.11 Per 08:30')).toBe('26.11 Per');
    const [, ikinci] = tezgahGunleri(cx, m, 'T1', new Set(['E2']));
    expect(hucreOzeti(ikinci!)).toBe('doluluk %25 (2 / 8 sa), 1 iş, 1 geç iş, bakım duruşu');
    expect(hucreAdi('ORN-T01', '02.12', ikinci!)).toBe(`ORN-T01 02.12: ${hucreOzeti(ikinci!)}`);
  });
  it('Arayüz 3c Z6: açık saat dilimleri gün yüzdesiyle; özet aynı pencereyi yazar', () => {
    const d = acikDilimler(pen(2), 24, 48);
    expect(d).toEqual([{ sol: (8 / 24) * 100, en: (8 / 24) * 100, s: 8, c: 16 }]);
    expect(acikYazisi(d)).toBe('08:00–16:00');
    expect(acikYazisi(acikDilimler([[0, 8.5], [16, 30]], 0, 24))).toBe('00:00–08:30, 16:00–24:00');
    expect(acikYazisi([])).toBe('kapalı');
  });
});
