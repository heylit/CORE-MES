import { describe, expect, it } from 'vitest';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import { adimYeri, bosYerler, ilkKart, kokKimligi, siraKartlari, siradakiAdim, tasimaAdaylari, uygunTezgahlar } from './yerlestirme.ts';

// Veri uydurmadır (ORN-).
const emir = (id: string, durum: KokpitEmri['durum'], termin: number | null, adimlar: [string, string[]][] = [['10', ['M1']]]): KokpitEmri => ({
  id, no: `ORN-${id}`, urun: 'ORN-Parça', adet: 10, termin, bitis: null, durum, gecikme: null,
  adimlar: adimlar.map(([k, adaylar]) => ({ id: `${id}.${k}`, ad: `OP${k}`, adaylar })),
});
const is = (id: string, m = 'M1'): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: id, m, S: 0, C: 1, basladi: false, fason: false, kilitli: false, sira: 0 });
const isler = (...l: string[]): Record<string, KokpitIsi> => Object.fromEntries(l.map((id) => [id, is(id)]));

describe('Kokpit sıra kartları (3297)', () => {
  it('kök kimliği: düğüm ve parça kökünde toplanır, acil iş ve düz emir kendisidir', () => {
    expect(['7', '7-Y1', '7-Y1-Y1', '7/2', '7-Y1/2', 'SP-3', 'S4'].map(kokKimligi)).toEqual(['7', '7', '7', '7', '7', 'SP-3', 'S4']);
  });

  it('kart kök emirdir: düğümler kökün kartında, kök başta; termin kökün, adım sayısı fasonsuz', () => {
    const m = {
      emirler: [emir('7-Y1', 'plansiz', null, [['10', ['M1']], ['20', ['@F1']]]), emir('7', 'iyi', 50, [['10', ['M1']], ['20', ['M2', 'M3']]]), emir('9', 'iyi', 20)],
      isler: isler('7.10', '7.20', '9.10'),
    };
    const l = siraKartlari(m);
    expect(l.map((k) => [k.kok, k.emirler.map((e) => e.id), k.termin, k.adim, k.yerlesen, k.durum])).toEqual([
      ['9', ['9'], 20, 1, 1, 'iyi'],
      ['7', ['7', '7-Y1'], 50, 3, 2, 'plansiz'],
    ]);
  });

  it('sıra termine göredir, terminsiz sonda; aynı terminde sorunlu önce; kök yoksa düğümlerin en erken termini', () => {
    const m = { emirler: [emir('1', 'iyi', 30), emir('2', 'gec', 30), emir('3', 'plansiz', null), emir('4-Y1', 'iyi', 12), emir('4-Y2', 'iyi', 8)], isler: {} };
    const l = siraKartlari(m);
    expect(l.map((k) => k.kok)).toEqual(['4', '2', '1', '3']);
    expect(l[0]?.termin).toBe(8);
    expect(l[3]?.termin).toBeNull();
  });

  it('açılışta yerleşmemiş adımı olan ilk kart seçilir; hepsi yerleştiyse ilk kart; liste boşsa null', () => {
    const m = { emirler: [emir('1', 'iyi', 10), emir('2', 'plansiz', 20), emir('3', 'plansiz', 30)], isler: isler('1.10') };
    expect(ilkKart(siraKartlari(m))).toBe('2');
    expect(ilkKart(siraKartlari({ emirler: [emir('1', 'iyi', 10)], isler: isler('1.10') }))).toBe('1');
    expect(ilkKart([])).toBeNull();
  });
});

describe('Kokpit seç-yerleştir (3297)', () => {
  const e = emir('5', 'plansiz', 40, [['10', ['M1', 'M2']], ['20', ['@F1']], ['30', ['M3', '@F2']]]);

  it('adımın yeri: planda varsa yerli, fason adım fason, tezgâhı seçilen seçili, kalan boş', () => {
    const [a10, a20, a30] = e.adimlar;
    if (!a10 || !a20 || !a30) throw new Error('adım');
    expect(adimYeri({ isler: isler('5.10') }, a10, {})).toBe('yerli');
    expect(adimYeri({ isler: {} }, a20, {})).toBe('fason');
    expect(adimYeri({ isler: {} }, a30, { '5.30': { tezgah: 'M3' } })).toBe('secili');
    expect(adimYeri({ isler: {} }, a30, { '5.30': { baslangic: 12 } })).toBe('bos');
  });

  it('sıradaki adım: tezgâhı seçilmemiş ilk tezgâh adımı; fason atlanır; hepsi seçilince null', () => {
    expect(siradakiAdim({ isler: {} }, e, {})).toBe('5.10');
    expect(siradakiAdim({ isler: {} }, e, { '5.10': { tezgah: 'M2' } })).toBe('5.30');
    expect(siradakiAdim({ isler: {} }, e, { '5.10': { tezgah: 'M2' }, '5.30': { tezgah: 'M3' } })).toBeNull();
  });

  it('uygun tezgâhlar adımın rotadaki adaylarıdır; fason adayı tezgâh değildir; adım yoksa boş', () => {
    expect(uygunTezgahlar(e, '5.10')).toEqual(['M1', 'M2']);
    expect(uygunTezgahlar(e, '5.30')).toEqual(['M3']);
    expect(uygunTezgahlar(e, '5.20')).toEqual([]);
    expect(uygunTezgahlar(e, null)).toEqual([]);
  });

  it('boş yerler: her aday tezgâhın önizlemesinden o adımın yeri; en erken biten başta ve işaretli; geçersiz önizleme ve başka tezgâha düşen yer aday değildir', () => {
    const l = bosYerler('5.10', [
      { tezgah: 'M1', gecerli: true, isler: [{ isId: '5.10', tezgah: 'M1', S: 20, C: 26 }, { isId: '5.30', tezgah: 'M3', S: 30, C: 32 }] },
      { tezgah: 'M2', gecerli: true, isler: [{ isId: '5.10', tezgah: 'M2', S: 9, C: 15 }] },
      { tezgah: 'M4', gecerli: false, isler: [{ isId: '5.10', tezgah: 'M4', S: 1, C: 2 }] },
      { tezgah: 'M5', gecerli: true, isler: [{ isId: '5.10', tezgah: 'M1', S: 1, C: 2 }] },
    ]);
    expect(l).toEqual([
      { adimId: '5.10', tezgah: 'M2', S: 9, C: 15, enErken: true },
      { adimId: '5.10', tezgah: 'M1', S: 20, C: 26, enErken: false },
    ]);
    expect(bosYerler('5.10', [])).toEqual([]);
  });
});

describe('Kokpit planlı adımı taşıma adayları (3297-4)', () => {
  // İki adımlı emir: OP10 M1'de 10-12, OP20 M2'de 20-24 (aday M2, M3, fason). M2'de 12-16 dolu; M3 boş.
  const e = emir('5', 'iyi', 60, [['10', ['M1']], ['20', ['M2', 'M3', '@F1']]]);
  const yer = (id: string, m: string, S: number, C: number, basladi = false): KokpitIsi => ({ ...is(id, m), S, C, basladi });
  const model = (ek: Partial<KokpitIsi> = {}): KokpitModeli => ({
    simdi: 8, bas: 0, son: 336, acik: {}, durus: {}, emirler: [e], tezgahlar: ['M1', 'M2', 'M3'].map((id) => ({ id, kod: id, ad: '', fason: false })),
    isler: { '5.10': yer('5.10', 'M1', 10, 12), '5.20': { ...yer('5.20', 'M2', 20, 24), ...ek }, '8.10': yer('8.10', 'M2', 12, 16) },
  });

  it('her aday tezgâhta önceki adım bittikten sonraki ilk boşluk; fason aday değildir', () => {
    expect(tasimaAdaylari(model(), e, '5.20', 6)).toEqual([{ tezgah: 'M2', baslangic: 16 }, { tezgah: 'M3', baslangic: 12 }]);
  });

  it('adımın bugünkü yeri aday değildir; sınır aday sayısını keser', () => {
    expect(tasimaAdaylari(model({ S: 16, C: 20 }), e, '5.20', 6)).toEqual([{ tezgah: 'M3', baslangic: 12 }]);
    expect(tasimaAdaylari(model(), e, '5.20', 1)).toEqual([{ tezgah: 'M2', baslangic: 16 }]);
  });

  it('başlamış iş, planda olmayan ve emrin olmayan adım aday vermez', () => {
    expect(tasimaAdaylari(model({ basladi: true }), e, '5.20', 6)).toEqual([]);
    expect(tasimaAdaylari({ ...model(), isler: {} }, e, '5.20', 6)).toEqual([]);
    expect(tasimaAdaylari(model(), e, '8.10', 6)).toEqual([]);
  });
});
