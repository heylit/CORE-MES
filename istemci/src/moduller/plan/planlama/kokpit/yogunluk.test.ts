import { describe, expect, it } from 'vitest';
import type { KokpitEmri } from './kurallar.ts';
import { ETIKET_HARF, ETIKET_PAYI, KUME_BOSLUK, KUME_DAR, YOGUN_SATIR, etiketEni, kumele, kumeYazisi, okunurGenislik, satirBoyuCoz, etiketYeri, bitenAdim, emirAraligi, inisGorunumu, kademe, siparisCubukYazisi, siparisGruplari, siparisOzeti, gorunenSatirSayisi, okKumesi, ufkaSigmayanSayisi, ufkaSigmaz, ufukCizgisi, ufukYazisi } from './yogunluk.ts';

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
