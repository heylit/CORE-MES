import { describe, expect, it } from 'vitest';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import { adimYeri, bosYerler, ilkKart, kartAnahtari, kokCozucu, kokKimligi, siparisAramasi, siraKartlari, siradakiAdim, tasimaAdaylari, uygunTezgahlar, type SiparisBaglari } from './yerlestirme.ts';

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

describe('Kokpit sipariş kartları (3297-5 a)', () => {
  // Emir 1 ve 2 aynı siparişte (iki kalem), 3 başka siparişte ve okunamıyor (no ve müşteri null), 4 siparişsiz.
  const bag: SiparisBaglari = {
    '1': { siparis: '50', no: 'ORN-SP-50', musteri: 'ORN-Müşteri A', kalem: 1 }, '2': { siparis: '50', no: 'ORN-SP-50', musteri: 'ORN-Müşteri A', kalem: 2 },
    '3': { siparis: '51', no: null, musteri: null, kalem: null },
  };

  it('kart anahtarı: siparişe bağlı emir ve düğümü siparişte, bağsız emir kökünde; bağ yoksa kök', () => {
    expect(['1', '1-Y1', '2/2', '3', '4', '4-Y1'].map((id) => kartAnahtari(id, bag))).toEqual(['sp:50', 'sp:50', 'sp:50', 'sp:51', '4', '4']);
    expect(kartAnahtari('1-Y1', null)).toBe('1');
    expect(kartAnahtari('1')).toBe('1');
  });

  it('aynı siparişin emirleri tek kartta; termin en erken emrinki; durum en ağırı; adım ve yerleşen toplanır; siparişsiz emir kendi kartında', () => {
    const m = { emirler: [emir('1', 'iyi', 40), emir('1-Y1', 'iyi', null), emir('2', 'gec', 25), emir('3', 'iyi', 30), emir('4', 'iyi', 10)], isler: isler('1.10', '1-Y1.10', '2.10', '3.10', '4.10') };
    const l = siraKartlari(m, bag);
    expect(l.map((k) => [k.kok, k.siparis, k.emirler.map((e) => e.id), k.termin, k.adim, k.yerlesen, k.durum])).toEqual([
      ['4', null, ['4'], 10, 1, 1, 'iyi'],
      ['sp:50', { no: 'ORN-SP-50', musteri: 'ORN-Müşteri A' }, ['2', '1', '1-Y1'], 25, 3, 3, 'gec'],
      ['sp:51', { no: null, musteri: null }, ['3'], 30, 1, 1, 'iyi'],
    ]);
  });

  it('sipariş kartında yerleşmesi eksik emir önce, sonra termine göre; kök düğümlerinin başında kalır', () => {
    const m = { emirler: [emir('2', 'iyi', 5), emir('1-Y1', 'plansiz', null), emir('1', 'iyi', 40)], isler: isler('2.10', '1.10') };
    expect(siraKartlari(m, bag)[0]?.emirler.map((e) => e.id)).toEqual(['1', '1-Y1', '2']);
  });

  it('bağ verilmezse kartlar bugünkü gibi kök emirdir', () => {
    const m = { emirler: [emir('1', 'iyi', 40), emir('2', 'iyi', 25)], isler: {} };
    expect(siraKartlari(m).map((k) => [k.kok, k.siparis])).toEqual([['2', null], ['1', null]]);
    expect(siraKartlari(m, null).map((k) => k.kok)).toEqual(['2', '1']);
  });

  it('arama sipariş no ve müşteri adıyla bulur; boş arama, bağsız emir ve okunamayan sipariş bulmaz', () => {
    expect(siparisAramasi('1', bag, 'sp-50')).toBe(true);
    expect(siparisAramasi('2/2', bag, 'müşteri a')).toBe(true);
    expect(siparisAramasi('1', bag, '  ')).toBe(false);
    expect(siparisAramasi('4', bag, 'sp-50')).toBe(false);
    expect(siparisAramasi('3', bag, 'sp')).toBe(false);
    expect(siparisAramasi('1', null, 'sp-50')).toBe(false);
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

  it('biten iş, planda olmayan ve emrin olmayan adım aday vermez; süren iş aday verir (taşınınca durdurulur)', () => {
    expect(tasimaAdaylari(model({ basladi: true, bitti: true }), e, '5.20', 6)).toEqual([]);
    expect(tasimaAdaylari(model({ basladi: true }), e, '5.20', 6).length).toBe(2);
    expect(tasimaAdaylari({ ...model(), isler: {} }, e, '5.20', 6)).toEqual([]);
    expect(tasimaAdaylari(model(), e, '8.10', 6)).toEqual([]);
  });
});

// 3483: partinin plandaki kimliği sunucudaki kendi emir kimliğidir ("7/2" değil); kökünü numarası ("ORN-7/2") söyler.
describe('Kokpit partili emir (3483)', () => {
  const parti = (id: string, no: string, termin: number | null = 5): KokpitEmri => ({ ...emir(id, 'iyi', termin), no });

  it('çözücü partiyi numarasıyla kök emre indirir; partinin partisi de köke iner; kök yoksa kardeşler en küçük numaralıda toplanır', () => {
    const k = kokCozucu([emir('7', 'iyi', 9), parti('11', 'ORN-7/1'), parti('12', 'ORN-7/2'), parti('13', 'ORN-7/1/1'), parti('21', 'ORN-8/3'), parti('22', 'ORN-8/2'), emir('9', 'iyi', 1)]);
    expect(['7', '11', '12', '13', '21', '22', '9', '7-Y1'].map(k)).toEqual(['7', '7', '7', '7', '22', '22', '9', '7']);
  });

  it('siparişsiz partiler ana emrin kartında, ana emir başta, partiler numara sırasıyla (/2, /10\'dan önce)', () => {
    const m = { emirler: [parti('30', 'ORN-7/10', 1), emir('7', 'iyi', 50), parti('12', 'ORN-7/2', 2), emir('9', 'iyi', 20)], isler: {} };
    const l = siraKartlari(m);
    expect(l.map((x) => [x.kok, x.emirler.map((e) => e.no)])).toEqual([['9', ['ORN-9']], ['7', ['ORN-7', 'ORN-7/2', 'ORN-7/10']]]);
  });

  it('siparişli kartta partiler ana emrinin ardında öbeklenir, araya başka kalem girmez', () => {
    const bag: SiparisBaglari = Object.fromEntries(['7', '8', '11', '12'].map((id) => [id, { siparis: '50', no: 'ORN-SP-50', musteri: null, kalem: 1 }]));
    const m = { emirler: [parti('12', 'ORN-7/2', 1), emir('8', 'iyi', 3), emir('7', 'iyi', 9), parti('11', 'ORN-7/1', 2)], isler: {} };
    const l = siraKartlari(m, bag);
    expect(l).toHaveLength(1);
    const no = l[0]?.emirler.map((e) => e.no) ?? [];
    expect(no.indexOf('ORN-7/1')).toBe(no.indexOf('ORN-7') + 1);
    expect(no.indexOf('ORN-7/2')).toBe(no.indexOf('ORN-7') + 2);
  });

  it('kart anahtarı çözücüyle: parti kök emrin kartını bulur; bağ partinin kendi kimliğinde olsa da sipariş kartı', () => {
    const k = kokCozucu([emir('7', 'iyi', 9), parti('11', 'ORN-7/1')]);
    expect(kartAnahtari('11', null, k)).toBe('7');
    expect(kartAnahtari('11', { '11': { siparis: '5', no: null, musteri: null, kalem: null } }, k)).toBe('sp:5');
  });
});
