import { describe, expect, it } from 'vitest';
import {
  aralikDakika, basHarfler, eskiKalemler, etkinMakine, geceyiGecer, gunListesi, gunSaati, haftaSaati, kapasiteKaynagi, kategoriler, malzemeSuz,
  minimumAltinda, ondalik, oranMetni, planEkleri, sayiGirdisi, sonrakiKod, vardiyaHaftaSaati, yetkinler, yetkinlikDegistir,
} from './kurallar.ts';

// Örnek veriler uydurmadır.
describe('R2 saf hesapları', () => {
  it('sayı girişi: virgül ve nokta kabul, boş null, eksi, harf ve sınır üstü reddedilir', () => {
    expect(sayiGirdisi('3,5')).toEqual({ tamam: true, deger: 3.5 });
    expect(sayiGirdisi(' 12.25 ')).toEqual({ tamam: true, deger: 12.25 });
    expect(sayiGirdisi('')).toEqual({ tamam: true, deger: null });
    expect(sayiGirdisi('-1').tamam).toBe(false);
    expect(sayiGirdisi('abc').tamam).toBe(false);
    expect(sayiGirdisi('100000').tamam).toBe(false);
    expect(sayiGirdisi('100000', 1e9)).toEqual({ tamam: true, deger: 100000 });
  });

  it('ondalık metin sayıya; yoksa null, sıfır uydurulmaz; oran metni', () => {
    expect(ondalik('12.50')).toBe(12.5);
    expect(ondalik(null)).toBeNull();
    expect(ondalik('')).toBeNull();
    expect(oranMetni(null)).toBe('—');
    expect(oranMetni(12.34)).toBe('%12,3');
  });

  const kartlar = [
    { code: 'HM-1', name: 'Çelik çubuk', type: 'ham', kategori: 'c', kategoriAdi: 'Çelik' },
    { code: 'HM-2', name: 'Alüminyum', type: 'ham', kategori: 'a', kategoriAdi: null },
    { code: 'MM-1', name: 'Mil', type: 'mamul', kategori: null, kategoriAdi: null },
  ];
  it('malzeme süzgeci: tür, kategori ve Türkçe küçük harfle arama', () => {
    expect(malzemeSuz(kartlar, { arama: 'ÇELİK', tur: '', kategori: '' }).map((k) => k.code)).toEqual(['HM-1']);
    expect(malzemeSuz(kartlar, { arama: '', tur: 'ham', kategori: 'a' }).map((k) => k.code)).toEqual(['HM-2']);
    expect(malzemeSuz(kartlar, { arama: 'mil', tur: 'ham', kategori: '' })).toEqual([]);
  });

  it('kategoriler yalnız tür seçilince ve sırasıyla; adı yoksa anahtarı', () => {
    expect(kategoriler(kartlar, '')).toEqual([]);
    expect(kategoriler(kartlar, 'ham')).toEqual([['c', 'Çelik'], ['a', 'a']]);
  });

  it('minimum altı: stok ya da minimum yoksa, minimum sıfırsa hayır', () => {
    expect(minimumAltinda(2, 5)).toBe(true);
    expect(minimumAltinda(5, 5)).toBe(false);
    expect(minimumAltinda(null, 5)).toBe(false);
    expect(minimumAltinda(0, 0)).toBe(false);
  });

  it('eski kalemler: belgede kartı olmayan kalemler; bozuk satır atlanır, belge yoksa boş', () => {
    const belge = { items: [{ id: 'i1', code: 'ESK-1', name: 'Eski sac', type: 'ham' }, { id: '11', code: 'MM-0001' }, null, { code: 'kimliksiz' }] };
    expect(eskiKalemler(belge, new Set(['11']))).toEqual([{ id: 'i1', kod: 'ESK-1', ad: 'Eski sac', tur: 'ham' }]);
    expect(eskiKalemler(null, new Set())).toEqual([]);
    expect(eskiKalemler({ items: 'x' }, new Set())).toEqual([]);
  });

  const vardiyalar = [{ id: 'v1', netDakika: 450 }, { id: 'v2', netDakika: 420 }];
  const hafta = { 1: ['v1', 'v2'], 2: ['v1'], 3: [], 4: [], 5: ['v1', 'yok'], 6: [], 0: [] };
  it('vardiya saatleri: gün, hafta ve vardiya satırı; takvimde olmayan vardiya sayılmaz, hafta yoksa sıfır', () => {
    expect(gunSaati(hafta, 1, vardiyalar)).toBe(14.5);
    expect(gunSaati(hafta, 5, vardiyalar)).toBe(7.5);
    expect(haftaSaati(hafta, vardiyalar)).toBe(14.5 + 7.5 + 7.5);
    expect(vardiyaHaftaSaati(hafta, vardiyalar[0]!)).toBe(22.5);
    expect(haftaSaati(undefined, vardiyalar)).toBe(0);
  });

  it('saat aralığı gece yarısını geçebilir; geçersiz saat null', () => {
    expect(aralikDakika('08:00', '16:30')).toBe(510);
    expect(aralikDakika('22:00', '06:00')).toBe(480);
    expect(aralikDakika('8', '16:00')).toBeNull();
    expect(geceyiGecer('22:00', '06:00')).toBe(true);
    expect(geceyiGecer('08:00', '16:00')).toBe(false);
  });

  it('kapasite kaynağı: seçim önce, yoksa türden (kalite, montaj, depo personel), tür de yoksa makine', () => {
    expect(kapasiteKaynagi('talasli', 'insan')).toBe('insan');
    expect(kapasiteKaynagi('montaj', null)).toBe('insan');
    expect(kapasiteKaynagi('talasli', null)).toBe('makine');
    expect(kapasiteKaynagi(null, null)).toBe('makine');
  });

  it('etkin makine: tanımlıysa aktifler, değilse paralel adet (en az 1); yetkin kişi aktif ve yetkinliği olan', () => {
    const ms = [{ stationId: '31', status: 'aktif' }, { stationId: '31', status: 'bakim' }, { stationId: '32', status: 'aktif' }];
    expect(etkinMakine('31', 5, ms)).toBe(1);
    expect(etkinMakine('33', 3, ms)).toBe(3);
    expect(etkinMakine('33', 0, ms)).toBe(1);
    const kisiler = [{ skills: ['31'], active: true }, { skills: ['31'], active: false }, { skills: ['32'], active: true }];
    expect(yetkinler('31', kisiler)).toHaveLength(1);
  });

  it('önerilen kod, baş harfler ve yetkinlik listesi', () => {
    expect(sonrakiKod(['IM-10', 'IM-20', 'X-90'], 'IM')).toBe('IM-30');
    expect(sonrakiKod([], 'IS', 1)).toBe('IS-01');
    expect(basHarfler('ayşe yılmaz kaya')).toBe('AY');
    expect(basHarfler('  ')).toBe('?');
    expect(yetkinlikDegistir(['31', '32'], '31')).toEqual([32]);
    expect(yetkinlikDegistir(['31'], '33')).toEqual([31, 33]);
  });

  it('plan ekleri belgeden yalnız okunur; bozuk satır atlanır, günler sırasıyla yazılır', () => {
    const belge = { plan: { fasoncular: [{ id: 'f1', ad: 'Fason A', kapasite: 2, sureGun: 5, cikisSaat: '16:00', cikisGunleri: ['cum', 'pzt', 3] }, { ad: 'kimliksiz' }],
      aparatlar: [{ id: 'a1', ad: 'Mengene', adet: 'iki' }] } };
    const e = planEkleri(belge);
    expect(e.fasoncular).toEqual([{ id: 'f1', ad: 'Fason A', kapasite: 2, sureGun: 5, cikisSaat: '16:00', cikisGunleri: ['cum', 'pzt'] }]);
    expect(e.aparatlar).toEqual([{ id: 'a1', ad: 'Mengene', adet: null }]);
    expect(gunListesi(e.fasoncular[0]!.cikisGunleri)).toBe('Pzt, Cum');
    expect(planEkleri(null)).toEqual({ fasoncular: [], aparatlar: [] });
  });
});
