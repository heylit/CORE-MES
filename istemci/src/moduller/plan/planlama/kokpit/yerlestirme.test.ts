import { describe, expect, it } from 'vitest';
import type { KokpitEmri, KokpitIsi } from './kurallar.ts';
import { adimYeri, bosYerler, ilkKart, kokKimligi, siraKartlari, siradakiAdim, uygunTezgahlar } from './yerlestirme.ts';

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
