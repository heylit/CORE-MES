import { describe, expect, it } from 'vitest';
import {
  baslikOku, bekleyenKararlar, benzerlik, birimOku, eslestir, hesaplananToplam, karsilikCarpani, kararVer, paraOku, satiriBagla, satirlaraAyir, sayiOku, tabloOku,
  tarihOku, tedarikciBul, terminOku, toplamTutarMi,
} from './okuma.ts';
import { KALEMLER, SAYFA, satir } from './ornek-teklif.ts';

describe('sayı, birim, para, termin', () => {
  it('Türkçe ve İngilizce yazılışı okur; harfle karışan rakam düzeltilir ve kontrol ister', () => {
    expect(sayiOku('1.226,07')?.deger).toBe(1226.07);
    expect(sayiOku('4,85')?.deger).toBe(4.85);
    expect(sayiOku('1,226.07')?.deger).toBe(1226.07);
    expect(sayiOku('1.500')?.deger).toBe(1500);
    expect(sayiOku('12.5')?.deger).toBe(12.5);
    expect(sayiOku('2,1O')).toEqual({ deger: 2.1, ham: '2,1O', duzeltildi: true, supheli: true });
    expect(sayiOku('1,500')?.supheli).toBe(true);
    expect(sayiOku('Malzeme')).toBeNull();
    expect(sayiOku('4,85 EUR')?.deger).toBe(4.85);
    expect(sayiOku('ABC12')).toBeNull();
    expect(sayiOku('€4,85')?.deger).toBe(4.85);
  });
  it('birimleri, para birimini, tarihi ve termini tanır', () => {
    expect([birimOku('KG'), birimOku('Adet'), birimOku('MT'), birimOku('pcs'), birimOku('kutu')]).toEqual(['kg', 'adet', 'm', 'adet', null]);
    expect([paraOku('Para birimi: EUR'), paraOku('12 €'), paraOku('100 TL'), paraOku('yok')]).toEqual(['EUR', 'EUR', 'TRY', null]);
    expect(tarihOku('Tarih: 7/1/26')).toBe('2026-01-07');
    expect([terminOku('14 gün'), terminOku('4 hafta'), terminOku('3 iş günü'), terminOku('stoktan'), terminOku('belirsiz')]).toEqual([14, 28, 3, 0, null]);
    expect(terminOku('01.12.2026', '2026-11-17')).toBe(14);
  });
});

describe('PDF sayfası', () => {
  const satirlar = satirlaraAyir(SAYFA);
  const b = baslikOku(satirlar);
  const okunan = tabloOku(satirlar, b.tarih.deger);

  it('başlık bilgileri okunur; iskonto hiç emin değildir, varsayılan seçim yoktur', () => {
    expect([b.teklifNo.deger, b.tarih.deger, b.gecerlilik.deger, b.paraBirimi.deger, b.vadeGun.deger, b.toplam.deger, b.vergiNo])
      .toEqual(['ORN-TK-2026-118', '2026-11-17', '2026-12-01', 'EUR', 60, 1016.18, '0000000001']);
    expect(b.iskontoYuzde).toMatchObject({ deger: 3, durum: 'kontrol' });
  });

  it('tablo başlığından sütunlar ayrılır; nakliye kaleme bağlanmaz, toplam satırında tablo biter', () => {
    expect(okunan.map((o) => [o.ad, o.miktar?.deger, o.birim, o.fiyat?.deger, o.terminGun, o.ek])).toEqual([
      ['AL 6061-T6 Ø50 çubuk 3 m', 120, 'kg', 4.85, 14, null],
      ['C45 +C Ø30 mm', 80, 'kg', 1.92, 14, null],
      ['POM-C Ø80 (siyah)', 14.2, 'kg', 7.4, 21, null],
      ['42CrMo4 ıslah Ø 60', 45, 'kg', 2.1, 28, null],
      ['Nakliye (Kocaeli teslim)', 1, 'set', 45, null, 'nakliye'],
    ]);
  });

  it('kalemlerle eşleşir: temiz satır emin, birim farkı ve düzeltilmiş fiyat kontrol, PDF\'te olmayan kalem bulunamadı ve fiyatı boş', () => {
    const { eslesmeler, artan } = eslestir(KALEMLER, okunan);
    expect(eslesmeler.map((e) => [e.kalem.id, e.okunan?.no ?? null, e.durum, e.bekleyen, e.fiyat])).toEqual([
      ['k1', 1, 'emin', [], 4.85],
      ['k2', 2, 'emin', [], 1.92],
      ['k3', 3, 'kontrol', ['birim'], 7.4],
      ['k4', 4, 'kontrol', ['fiyat'], 2.1],
      ['k5', null, 'yok', [], null],
    ]);
    expect(artan.map((o) => o.ek)).toEqual(['nakliye']);
  });

  it('birim kararı: karşılıktan çevrilir; çevirmeden ya da fiyatsız karar kapanmaz', () => {
    const { eslesmeler } = eslestir(KALEMLER, okunan);
    const pom = eslesmeler[2]!;
    expect(pom.cevirmeCarpani).toBeCloseTo(14.2 / 6, 6);
    expect(kararVer(pom, 'birim')).toBe(pom);
    const cevrildi = kararVer(pom, 'birim', { cevir: true });
    expect([cevrildi.fiyat, cevrildi.durum, cevrildi.bekleyen]).toEqual([17.5133, 'emin', []]);
    expect(cevrildi.nedenler).toEqual(['Çevrildi: 7,4 / kg yerine 17,5133 / m.']);
    const elle = kararVer(pom, 'birim', { fiyat: 17 });
    expect([elle.fiyat, elle.durum]).toEqual([17, 'emin']);
    expect(karsilikCarpani({ ...KALEMLER[2]!, karsilik: null }, 'kg')).toBeNull();
  });

  it('PDF toplamı hesaplanandan farklıysa tutmaz; iskonto ayrıca seçilirse iki seçim iki toplam verir', () => {
    const { eslesmeler } = eslestir(KALEMLER, okunan);
    const uygulanmis = hesaplananToplam(okunan, eslesmeler, 3, 'uygulanmis');
    expect(uygulanmis).toBe(980.18);
    expect(toplamTutarMi(b.toplam.deger, uygulanmis)).toBe(false);
    expect(toplamTutarMi(980.18, uygulanmis)).toBe(true);
    expect(hesaplananToplam(okunan, eslesmeler, 3, 'ayrica')).toBe(950.77);
    expect(toplamTutarMi(null, uygulanmis)).toBeNull();
  });

  it('bekleyen her karar ayrı sayılır: tedarikçi onayı, para birimi, iskonto ve satır kararları', () => {
    const { eslesmeler } = eslestir(KALEMLER, okunan);
    expect(bekleyenKararlar(eslesmeler, b, { tedarikciId: 'f1', tedarikciOnay: false, paraBirimi: 'EUR', iskonto: null })).toEqual([
      'Tedarikçi onaylanmadı', 'İskonto: uygulanmış mı, ayrıca mı?', 'ORN-POM-C Ø80 çubuk: birim çevirme', 'ORN-42CrMo4 +QT Ø60: fiyat onayı',
    ]);
    const bitti = eslesmeler.map((e) => (e.kalem.id === 'k3' ? kararVer(e, 'birim', { cevir: true }) : e.kalem.id === 'k4' ? kararVer(e, 'fiyat') : e));
    expect(bekleyenKararlar(bitti, b, { tedarikciId: 'f1', tedarikciOnay: true, paraBirimi: 'EUR', iskonto: 'uygulanmis' })).toEqual([]);
    expect(bekleyenKararlar(bitti, b, { tedarikciId: null, tedarikciOnay: false, paraBirimi: null, iskonto: 'uygulanmis' })).toEqual(['Tedarikçi seçilmedi', 'Para birimi seçilmedi']);
    // PDF'te nakliye yoksa sıfır sayılmaz: tutar ya da "fiyata dahil" kararı beklenir.
    const tamam = { tedarikciId: 'f1', tedarikciOnay: true, paraBirimi: 'EUR' as const, iskonto: 'uygulanmis' as const };
    expect(bekleyenKararlar(bitti, b, { ...tamam, nakliye: null })).toEqual(['Nakliye: fiyata dahil mi, tutarı ne?']);
    expect(bekleyenKararlar(bitti, b, { ...tamam, nakliye: null, nakliyeDahil: true })).toEqual([]);
    expect(bekleyenKararlar(bitti, b, { ...tamam, nakliye: 0 })).toEqual([]);
  });

  it('tedarikçi vergi numarasından ya da addan bulunur ama kullanıcı onayı ister; tanınmazsa boş kalır', () => {
    const firmalar = [{ id: 'f1', ad: 'ORN-Ege Metal', vergiNo: '0000000001' }, { id: 'f2', ad: 'ORN-Marmara Metal', vergiNo: '' }];
    expect(tedarikciBul(b, satirlar, firmalar)).toEqual({ id: 'f1', neden: 'Vergi numarası eşleşti; onaylayın.' });
    expect(tedarikciBul({ ...b, vergiNo: null }, satirlar, firmalar).id).toBe('f1');
    expect(tedarikciBul({ ...b, vergiNo: null }, satirlar, [{ id: 'f9', ad: 'ORN-Başka Firma', vergiNo: '' }]).id).toBeNull();
  });
});

describe('başlıksız ve eksik teklif', () => {
  it('başlık yoksa satırlar tahminle ayrılır ve hepsi kontrol ister', () => {
    const s = satirlaraAyir([...satir(10, [[10, 'ORN-C45 Ø30'], [150, '80'], [180, 'kg'], [220, '1,92'], [280, '153,60']])]);
    const o = tabloOku(s);
    expect(o.map((x) => [x.ad, x.miktar?.deger, x.birim, x.fiyat?.deger, x.tutar?.deger, x.tahmini])).toEqual([['ORN-C45 Ø30', 80, 'kg', 1.92, 153.6, true]]);
    const e = satiriBagla(KALEMLER[1]!, o[0]!, 0.9);
    expect([e.durum, e.bekleyen]).toEqual(['kontrol', ['satir']]);
  });
  it('para birimi bulunamazsa boş kalır (TRY varsayılmaz); miktar × fiyat tutarı tutmazsa kontrol ister', () => {
    const s = satirlaraAyir([
      ...satir(10, [[10, 'Malzeme'], [150, 'Miktar'], [200, 'Fiyat'], [260, 'Tutar']]),
      ...satir(26, [[10, 'ORN-C45 Ø30'], [150, '80'], [200, '1,92'], [260, '160,00']]),
    ]);
    expect(baslikOku(s).paraBirimi).toMatchObject({ deger: null, durum: 'yok' });
    const e = satiriBagla(KALEMLER[1]!, tabloOku(s)[0]!);
    expect(e.bekleyen).toEqual(['tutar']);
  });
  it('benzerlik sayı taşıyan kelimeye ağırlık verir', () => {
    expect(benzerlik('ORN-6061 T6 Ø50', 'AL 6061-T6 Ø50 çubuk')).toBeGreaterThan(benzerlik('ORN-6061 T6 Ø50', 'AL 7075 T6 Ø80'));
    expect(benzerlik('ORN-POM-C Ø80 çubuk', 'POM-C @80 (siyah)')).toBe(benzerlik('ORN-POM-C Ø80 çubuk', 'POM-C Ø80 (siyah)'));
  });
});

describe('taranmış sayfa', () => {
  it('yazı tanımanın az güvenle okuduğu fiyat düzgün görünse de kontrol ister; güvenli satır emin kalır', () => {
    const guven = (y: number, c: number) => (o: { s: string; x: number; y: number; w: number; h: number }) => (o.y === y ? { ...o, conf: c } : { ...o, conf: 96 });
    const sayfa = SAYFA.map(guven(142, 62));
    const okunan = tabloOku(satirlaraAyir(sayfa));
    const { eslesmeler } = eslestir(KALEMLER, okunan);
    const c45 = eslesmeler.find((e) => e.kalem.id === 'k2')!;
    expect(c45.okunan?.fiyat).toMatchObject({ deger: 1.92, guvenDusuk: true });
    expect([c45.durum, c45.bekleyen]).toEqual(['kontrol', ['fiyat', 'miktar']]);
    expect(c45.nedenler[0]).toMatch(/az güvenle/);
    expect(eslesmeler.find((e) => e.kalem.id === 'k1')!.durum).toBe('emin');
  });
});
