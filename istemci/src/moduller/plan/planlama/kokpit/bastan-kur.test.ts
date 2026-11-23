import { describe, expect, it } from 'vitest';
import { baslamisListesi, bastanKurDugmesi, bastanKurNedeni, bastanKurOzeti, gerideKartlari, ilkSecim, kartAdi, kartAra } from './bastan-kur.ts';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import type { SiraKarti } from './yerlestirme.ts';

// Uydurma örnek (ORN-): şimdi 10. saat. ORN-UE-1: torna elle kilitli, freze başlamış, taşlama başlamamış (geride). ORN-UE-2: iki serbest iş.
// ORN-UE-3: yalnız bitmiş ve fason iş. ORN-UE-4: plansız (işi yok).
const is = (id: string, S: number, ek: Partial<KokpitIsi> = {}): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: `Adım ${id}`, m: 'T1', S, C: S + 4, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const emir = (id: string, ek: Partial<KokpitEmri> = {}): KokpitEmri => ({ id, no: `ORN-UE-${id}`, urun: `ORN-Mil ${id}`, adet: 1, termin: 40, bitis: null, durum: 'iyi', gecikme: null, adimlar: [], ...ek });
const m: Pick<KokpitModeli, 'isler' | 'simdi' | 'emirler'> = {
  simdi: 10,
  emirler: [emir('1'), emir('2'), emir('3'), emir('4', { durum: 'plansiz' })],
  isler: {
    '1.10': is('1.10', 20, { kilitli: true }), '1.20': is('1.20', 4, { basladi: true }), '1.30': is('1.30', 6),
    '2.10': is('2.10', 30), '2.20': is('2.20', 34),
    '3.10': is('3.10', 2, { basladi: true, bitti: true }), '3.20': is('3.20', 40, { fason: true }),
  },
};
const kart = (kok: string, emirler: KokpitEmri[], siparis: SiraKarti['siparis'] = null): SiraKarti => ({ kok, siparis, emirler, termin: 40, adim: 2, yerlesen: 2, durum: 'iyi' } as SiraKarti);
const kartlar = [
  kart('sp:50', [m.emirler[0]!, m.emirler[3]!], { no: 'ORN-SP-50', musteri: 'ORN Müşteri A' }),
  kart('2', [m.emirler[1]!]),
  kart('3', [m.emirler[2]!]),
];

describe('Baştan kur kuralları (3600)', () => {
  it('bütün plan tek yıldız yollar; sayılar başlamamış, fason olmayan işleri sayar, başlamış ve bitmiş iş dizilmez', () => {
    const o = bastanKurOzeti(m, kartlar, { kapsam: 'tum', secili: [], kilitDiz: true });
    expect(o.isler).toEqual(['*']);
    expect(o).toMatchObject({ siparis: 3, diz: 4, kilitli: 1, kalkacakKilit: 1, baslamis: 1 });
  });

  it('başlamış iş anahtarı açılınca başlamış iş de dizilir; liste yapılan ve kalanı gercek kayıttan okur, bilinmeyen sayı uydurulmaz', () => {
    const o = bastanKurOzeti(m, kartlar, { kapsam: 'tum', secili: [], kilitDiz: true, baslamisDiz: true });
    expect(o).toMatchObject({ diz: 5, kilitli: 1, kalkacakKilit: 1, baslamis: 1 });
    const l = baslamisListesi(m, kartlar, { kapsam: 'tum', secili: [], kilitDiz: true, baslamisDiz: true }, { '1.20': { S: 4, n: 3, A: 10 } });
    expect(l).toEqual([{ id: '1.20', emirNo: 'ORN-UE-1', ad: 'Adım 1.20', tezgah: 'T1', yapilan: 3, kalan: 7, calisiyor: true }]);
    expect(baslamisListesi(m, kartlar, { kapsam: 'tum', secili: [], kilitDiz: true }, null)[0]).toMatchObject({ yapilan: null, kalan: null, calisiyor: false });
    expect(baslamisListesi(m, kartlar, { kapsam: 'secili', secili: ['2'], kilitDiz: true }, null)).toEqual([]);
    expect(bastanKurDugmesi('tum', 3, true)).toBe('Devam');
  });

  it('kilitler korunursa kilitli iş dizilmez ve kilit kalkmaz', () => {
    const o = bastanKurOzeti(m, kartlar, { kapsam: 'tum', secili: [], kilitDiz: false });
    expect(o).toMatchObject({ diz: 3, kilitli: 1, kalkacakKilit: 0, baslamis: 1 });
  });

  it('seçili siparişlerde yalnız seçilenlerin planlı emirleri gider; plansız emir yalnız kısmen planlıysa girer', () => {
    const o = bastanKurOzeti(m, kartlar, { kapsam: 'secili', secili: ['2'], kilitDiz: true });
    expect(o.isler).toEqual(['2']);
    expect(o).toMatchObject({ siparis: 1, diz: 2, kilitli: 0, kalkacakKilit: 0, baslamis: 0 });
    const sp = bastanKurOzeti(m, kartlar, { kapsam: 'secili', secili: ['sp:50', '2'], kilitDiz: true });
    expect(sp.isler).toEqual(['1', '2']);
    expect(sp).toMatchObject({ siparis: 2, diz: 4, kilitli: 1, kalkacakKilit: 1, baslamis: 1 });
    expect(bastanKurOzeti(m, kartlar, { kapsam: 'secili', secili: ['yok'], kilitDiz: true }).siparis).toBe(0);
  });

  it('geride kalanlarda geride işi olan emirler gider; elle kilitli geride iş yalnız kilitliyse emir girmez', () => {
    // 1.30 (S=6, şimdi 10) başlamamış ve geride; 1.10 kilitli ama ileride, geride sayılmaz.
    expect(gerideKartlari(m, kartlar).map((k) => k.kok)).toEqual(['sp:50']);
    const o = bastanKurOzeti(m, kartlar, { kapsam: 'geride', secili: [], kilitDiz: true });
    expect(o.isler).toEqual(['1']);
    expect(o.siparis).toBe(1);
    const yok = bastanKurOzeti({ ...m, simdi: 0 }, kartlar, { kapsam: 'geride', secili: [], kilitDiz: true });
    expect(yok.isler).toEqual([]);
    expect(bastanKurNedeni(false, 'geride', yok)).toBe('Geride kalan sipariş yok.');
  });

  it('düğme kapsamı söyler; pasif neden sırayla plan yok, seçim yok, planda yeri yok', () => {
    expect(bastanKurDugmesi('tum', 3)).toBe('Bütün planı baştan kur');
    expect(bastanKurDugmesi('secili', 2)).toBe('2 siparişi baştan kur');
    expect(bastanKurDugmesi('geride', 4)).toBe('Geride kalan 4 siparişi baştan kur');
    expect(bastanKurNedeni(true, 'tum', { siparis: 3, isler: ['*'] })).toBe('Henüz plan yok; önce planı kurun.');
    expect(bastanKurNedeni(false, 'secili', { siparis: 0, isler: [] })).toBe('Önce en az bir sipariş seçin.');
    expect(bastanKurNedeni(false, 'secili', { siparis: 1, isler: [] })).toBe('Seçili siparişlerin planda yeri yok; önce yerleştirin.');
    expect(bastanKurNedeni(false, 'secili', { siparis: 1, isler: ['2'] })).toBeNull();
    expect(bastanKurNedeni(false, 'tum', { siparis: 3, isler: ['*'] })).toBeNull();
  });

  it('arama sipariş no, emir no, ürün ve müşteriyle bulur; Türkçe harf farkı aramayı bozmaz; menüden açılış seçili kartı işaretler', () => {
    expect(kartAdi(kartlar[0]!)).toBe('ORN-SP-50');
    expect(kartAdi(kartlar[1]!)).toBe('ORN-UE-2');
    expect(kartAra(kartlar, '').length).toBe(3);
    expect(kartAra(kartlar, 'sp-50').map((k) => k.kok)).toEqual(['sp:50']);
    expect(kartAra(kartlar, 'orn-mil 2').map((k) => k.kok)).toEqual(['2']);
    expect(kartAra(kartlar, 'MÜŞTERİ a').map((k) => k.kok)).toEqual(['sp:50']);
    expect(kartAra(kartlar, 'yok')).toEqual([]);
    expect(ilkSecim('secili', kartlar[1]!)).toEqual({ kapsam: 'secili', secili: ['2'] });
    expect(ilkSecim('secili', null)).toEqual({ kapsam: 'secili', secili: [] });
    expect(ilkSecim('tum', kartlar[1]!)).toEqual({ kapsam: 'tum', secili: [] });
  });
});
