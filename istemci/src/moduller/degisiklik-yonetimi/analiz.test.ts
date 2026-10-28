import { describe, expect, it } from 'vitest';
import {
  SERIT_BOSLUK_SINIRI, gecerlilikCizgileri, ipligiYerlestir, miktarMetni, modRengi, olayVerisi, ondalikTopla, ortalamaIsGunu, seriSirasi, seritKur, soyZinciri, tlMetni,
  type AileDugumu, type Gecerlilik, type KonfigurasyonSerisi,
} from './analiz.ts';

const seri = (seriNo: string, o: Partial<KonfigurasyonSerisi> = {}): KonfigurasyonSerisi => ({
  seriNo, revizyon: 'A', mod: 1, durum: 'sahada', uyum: 'uyumlu', emirNo: null, sapmaReferansi: null, karantinada: false, ...o,
});

describe('seri sırası', () => {
  it('sondaki sayıyı okur; sayısız seri sırasızdır', () => {
    expect(seriSirasi('SN-0034')).toBe(34);
    expect(seriSirasi('0007')).toBe(7);
    expect(seriSirasi('A12-B')).toBe(12);
    expect(seriSirasi('SN-X')).toBeNull();
  });
});

describe('seri şeridi', () => {
  it('seriyi sırayla dizer, aradaki boşluğu kayıtsız kutuyla doldurur, mod seviyesine renk verir', () => {
    const s = seritKur([
      seri('SN-4', { revizyon: 'B', mod: 2, durum: 'stokta' }), seri('SN-1'), seri('SN-2', { durum: 'uretimde' }), seri('SN-5', { revizyon: 'B', mod: 2, durum: 'planli' }),
    ]);
    expect(s.hucreler.map((h) => (h.tur === 'bos' ? `bos${h.sira}` : h.seri.seriNo))).toEqual(['SN-1', 'SN-2', 'bos3', 'SN-4', 'SN-5']);
    expect(s.hucreler.flatMap((h) => (h.tur === 'seri' ? [h.renk] : []))).toEqual([0, 0, 1, 1]);
    expect(s.durumlar).toEqual({ sahada: 1, stokta: 1, uretimde: 1, planli: 1, bilinmiyor: 0 });
    expect(s.modlar).toEqual([{ mod: 1, renk: 0, adet: 2, revizyon: 'A' }, { mod: 2, renk: 1, adet: 2, revizyon: 'B' }]);
  });

  it('uzun aralıkta boşluk doldurmaz; durumu gelmeyen seri bilinmiyor sayılır; modsuz seri renksiz ve sonda', () => {
    const s = seritKur([seri('SN-1', { durum: null, mod: null }), seri(`SN-${SERIT_BOSLUK_SINIRI + 5}`)]);
    expect(s.hucreler).toHaveLength(2);
    expect(s.durumlar.bilinmiyor).toBe(1);
    expect(s.hucreler[0]).toMatchObject({ renk: null });
    expect(s.modlar.map((m) => m.mod)).toEqual([1, null]);
  });

  it('dördüncü moddan sonrası son rengi paylaşır', () => {
    expect([1, 2, 3, 4, 7, null].map(modRengi)).toEqual([0, 1, 2, 3, 3, null]);
  });

  it('geçerlilik sınırını yalnız yayınlanmış emirde ve şeritteki seride çizer', () => {
    const s = seritKur([seri('SN-1'), seri('SN-2'), seri('SN-3')]);
    const g = (emirNo: string, ilkSeri: number, durum: Gecerlilik['durum']): Gecerlilik => ({ emirId: ilkSeri, emirNo, ilkSeri, durum });
    const cizgiler = gecerlilikCizgileri(s.hucreler, [g('E1', 2, 'karar'), g('E2', 3, 'yayina_hazir'), g('E3', 9, 'kapandi')]);
    expect(cizgiler.map((c) => [c.gecerlilik.emirNo, c.konum])).toEqual([['E1', 1]]);
  });
});

describe('tutar', () => {
  it('ondalık metinleri kayıpsız toplar; hepsi yoksa null', () => {
    expect(ondalikTopla(['0.1', '0.2'])).toBe('0.3');
    expect(ondalikTopla(['10', '2.55', null])).toBe('12.55');
    expect(ondalikTopla(['-1.5', '1'])).toBe('-0.5');
    expect(ondalikTopla(['9007199254740993', '1'])).toBe('9007199254740994');
    expect(ondalikTopla([null, null])).toBeNull();
  });

  it('TL iki basamağa yarım yukarı yuvarlanır; yoksa tire', () => {
    expect(tlMetni('1234567.005')).toBe('1.234.567,01 TL');
    expect(tlMetni('0')).toBe('0,00 TL');
    expect(tlMetni('-12.5')).toBe('-12,50 TL');
    expect(tlMetni(null)).toBe('—');
  });

  it('miktar sondaki sıfırı atar', () => {
    expect(miktarMetni('1200.500')).toBe('1.200,5');
    expect(miktarMetni('3.000')).toBe('3');
  });
});

describe('rapor ve olay', () => {
  it('ortalama çevrim bir basamak; kapanan yoksa null', () => {
    const c = (isGunu: number) => ({ emirNo: 'E', sinif: 'D2' as const, acilis: '2099-01-01', kapanis: '2099-01-10', isGunu });
    expect(ortalamaIsGunu([c(10), c(5), c(6)])).toBe(7);
    expect(ortalamaIsGunu([c(1), c(2)])).toBe(1.5);
    expect(ortalamaIsGunu([])).toBeNull();
  });

  it('olay verisi ad: değer biçiminde', () => {
    expect(olayVerisi({ emir_no: 'E-1', kod: 'rework' })).toBe('emir no: E-1; kod: rework');
  });

  it('iplik düğümleri katman sütununa dizilir, bilinmeyen uçlu bağ atılır', () => {
    const d = (anahtar: string, katman: AileDugumu['katman']): AileDugumu => ({ anahtar, katman, etiket: anahtar, ayrinti: '', hal: 'yururlukte', hedef: null });
    const y = ipligiYerlestir({
      dugumler: [d('t1', 'tasarim'), d('t2', 'tasarim'), d('e1', 'emir')],
      baglar: [{ kaynak: 't1', hedef: 'e1', kesikli: false }, { kaynak: 't2', hedef: 'yok', kesikli: true }],
    });
    expect(y.dugumler.map((x) => [x.dugum.anahtar, x.x, x.y])).toEqual([['t1', 0, 46], ['t2', 0, 102], ['e1', 544, 46]]);
    expect(y.baglar).toHaveLength(1);
    expect(y.baglar[0]?.yol.startsWith('M240 69')).toBe(true);
  });

  it('soy zinciri seçilenin kaynağını ve ondan doğanları alır, kardeşi almaz', () => {
    const b = (kaynak: string, hedef: string) => ({ kaynak, hedef, kesikli: false });
    const z = soyZinciri([b('a', 'b'), b('b', 'c'), b('a', 'd'), b('x', 'c')], 'b');
    expect([...z].sort()).toEqual(['a', 'b', 'c']);
  });
});
