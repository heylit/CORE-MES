import { describe, expect, test } from 'vitest';
import type { AyarliTablolar, HamTablolar } from './kaynak.ts';
import {
  aileEkle, anahtarUret, ayarVerisi, bosAyar, cakismaYaz, iceAktar, kaliteKaydet, kalipYaz, kalitelerTopluGizle, kategoriEkle, kuralVarsayilanaDon,
  listeDegerEkle, listeDegistiMi, listeEkiSil, listeGizleDegistir, listeHicbiriniKullanma, listeTabani, listeVarsayilanaDon, ozellikEkle, sinifEkle,
  varsayilanYaz, zorunluYaz,
} from './islemler.ts';

// Uydurma, küçük tablolar: kural yalnız biçime bakar.
const TABAN: HamTablolar = {
  FAMS: {
    metal: {
      ad: 'Metal', kod: 'MET', c: '', desc: '', sert: '', forms: ['levha'],
      opts: [{ k: 'durum', ad: 'Durum', type: 'select', from: 'durum' }, { k: 'ambalaj', ad: 'Ambalaj', type: 'select', opts: ['Paletli'] }],
      classes: {
        a: { ad: 'A', kod: 'A', std: '', grades: [{ kod: 'K1', ad: 'K1', p: {}, std: '', eq: {} }], durum: ['D1', 'D2'] },
        b: { ad: 'B', kod: 'B', std: '', grades: [], durum: ['D2', 'D3'] },
      },
    },
  },
  PROPS: [{ k: 'ro', ad: 'Yoğunluk', u: 'g/cm³' }],
  SERTIFIKA: ['S1', 'S2'],
  BIRIMLER: ['adet'],
  BIRIM_T: { mamul: ['adet', 'set'] },
  TOLP: { levha: { metal: ['T1'] } },
  DOCTIPS: ['Föy'],
  ALAN: { ym_tanim: [{ k: 'tip', ad: 'Tip', tip: 'sec', opts: ['X'] }, { k: 'rev', ad: 'Rev', tip: 'text', oneri: ['A'] }, { k: 'ad', ad: 'Ad', tip: 'text' }] },
  SARF_KAT: { kaynak: { ad: 'Kaynak', kod: 'KYN', alanlar: [{ k: 'cap', ad: 'Çap', tip: 'num', oneri: [0.8] }] } },
  DB_KAT: { makine: { ad: 'Makine', kod: 'MAK', alanlar: [] } },
};
const T: AyarliTablolar = { FAMS: TABAN.FAMS, PROPS: TABAN.PROPS, SARF_KAT: TABAN.SARF_KAT, DB_KAT: TABAN.DB_KAT, HM_GRUP: {} };

describe('liste kimlikleri', () => {
  test('her kimlik kendi yerleşik değerlerini verir; sınıfa bağlı liste sınıfların birleşimidir', () => {
    expect(listeTabani('sertifika', TABAN)).toEqual(['S1', 'S2']);
    expect(listeTabani('belge', TABAN)).toEqual(['Föy']);
    expect(listeTabani('birim|mamul', TABAN)).toEqual(['adet', 'set']);
    expect(listeTabani('birim|yok', TABAN)).toEqual([]);
    expect(listeTabani('tol|levha|metal', TABAN)).toEqual(['T1']);
    expect(listeTabani('opt|metal|durum', TABAN)).toEqual(['D1', 'D2', 'D3']);
    expect(listeTabani('opt|metal|ambalaj', TABAN)).toEqual(['Paletli']);
    expect(listeTabani('alan|ALAN.ym_tanim|tip', TABAN)).toEqual(['X']);
    expect(listeTabani('alan|SARF.kaynak|cap', TABAN)).toEqual([0.8]);
  });
  test('tanınmayan kimlik ve listesi olmayan alan null', () => {
    expect(listeTabani('opt|metal|yok', TABAN)).toBeNull();
    expect(listeTabani('alan|ALAN.ym_tanim|yok', TABAN)).toBeNull();
    expect(listeTabani('baska', TABAN)).toBeNull();
  });
});

describe('liste düzenleme', () => {
  test('yeni değer eklenir; aynı değer ikinci kez eklenmez; boş değer reddedilir', () => {
    const a = listeDegerEkle(bosAyar(), 'sertifika', ' S9 ', ['S1']);
    expect(a.tamam && a.ayar.listeler['sertifika']).toEqual({ ekle: ['S9'], gizle: [] });
    if (!a.tamam) throw new Error();
    expect(listeDegerEkle(a.ayar, 'sertifika', 'S9', ['S1'])).toEqual({ tamam: false, ileti: '"S9" zaten listede.' });
    expect(listeDegerEkle(bosAyar(), 'sertifika', 'S1', ['S1'])).toEqual({ tamam: false, ileti: '"S1" zaten listede.' });
    expect(listeDegerEkle(bosAyar(), 'sertifika', '  ', ['S1'])).toEqual({ tamam: false, ileti: 'Eklenecek değeri yaz.' });
  });
  test('gizlenmiş yerleşik değer "eklenince" yeniden açılır, eklenen listesine girmez', () => {
    const v = listeGizleDegistir(bosAyar(), 'sertifika', 'S1');
    const a = listeDegerEkle(v, 'sertifika', 'S1', ['S1', 'S2']);
    expect(a.tamam && a.ayar.listeler['sertifika']).toEqual({ ekle: [], gizle: [] });
  });
  test('hiçbirini kullanma bütün yerleşikleri gizler; varsayılana dön kaydı siler; girdi değişmez', () => {
    const once = bosAyar();
    const v = listeHicbiriniKullanma(once, 'sertifika', ['S1', 'S2']);
    expect(v.listeler['sertifika']?.gizle).toEqual(['S1', 'S2']);
    expect(once.listeler).toEqual({});
    expect(listeDegistiMi(v, 'sertifika')).toBe(true);
    expect(listeVarsayilanaDon(v, 'sertifika').listeler).toEqual({});
    const e = listeDegerEkle(bosAyar(), 'belge', 'Yeni', []);
    if (!e.tamam) throw new Error();
    expect(listeEkiSil(e.ayar, 'belge', 'Yeni').listeler['belge']).toEqual({ ekle: [], gizle: [] });
  });
});

describe('aile, sınıf, kalite, özellik, kategori', () => {
  test('aile: ad ve en az iki harfli kod gerekir; kod tekildir; anahtar addan kurulur', () => {
    expect(aileEkle(bosAyar(), T, { ad: 'Kauçuk', kod: 'k', kaynak: 'metal', forms: [] })).toEqual({ tamam: false, ileti: 'Aile adı ve en az 2 harfli kod gir.' });
    expect(aileEkle(bosAyar(), T, { ad: 'X', kod: 'met', kaynak: 'metal', forms: [] })).toEqual({ tamam: false, ileti: 'MET kodu başka bir ailede kullanılıyor.' });
    const a = aileEkle(bosAyar(), T, { ad: 'Kauçuk-metal', kod: 'kmt1', kaynak: 'metal', forms: ['levha'] });
    expect(a.tamam && a.ayar.aileler).toEqual([{ key: 'oz_kaucuk_metal', ad: 'Kauçuk-metal', kod: 'KMT', kaynak: 'metal', forms: ['levha'] }]);
    expect(a.anahtar).toBe('oz_kaucuk_metal');
  });
  test('anahtar doluysa sıra eklenir; addan anahtar çıkmazsa zamandan kurulur', () => {
    expect(anahtarUret('oz_', 'Ab', (k) => k === 'oz_ab' || k === 'oz_ab_2')).toBe('oz_ab_3');
    expect(anahtarUret('oz_', '***', () => false, () => 36)).toBe('oz_10');
  });
  test('sınıf aileye eklenir', () => {
    const s = sinifEkle(bosAyar(), T, 'metal', { ad: 'Yeni sınıf', kod: 'yn' });
    expect(s.tamam && s.ayar.siniflar).toEqual([{ fam: 'metal', key: 'oz_yeni_sinif', ad: 'Yeni sınıf', kod: 'YN' }]);
  });
  test('kalite: kod ailede tekildir; sayı virgülle de okunur; seçimden gelen değer metin kalır; yoğunluk yoksa uyarı', () => {
    const girdi = { kod: 's460mc', ad: '', std: 'EN 1', stds: 'EN 2, EN 1', eq: { 'W.Nr': ' 1.1 ', UNS: '' }, p: { ro: '7,85', sert: 'HB', akma: ' ' } };
    const k = kaliteKaydet(bosAyar(), T, 'metal', 'a', girdi, null, new Set(['sert']));
    if (!k.tamam) throw new Error(k.ileti);
    expect(k.ayar.kaliteler).toEqual([{ fam: 'metal', cls: 'a', kod: 'S460MC', ad: 'S460MC', std: 'EN 1', stds: ['EN 1', 'EN 2'], eq: { 'W.Nr': '1.1' }, p: { ro: 7.85, sert: 'HB' } }]);
    expect(k.yogunlukYok).toBe(false);
    expect(kaliteKaydet(bosAyar(), T, 'metal', 'b', { ...girdi, kod: 'K1' }, null, new Set())).toEqual({ tamam: false, ileti: 'K1 kodu bu ailede zaten var.' });
    const d = kaliteKaydet(k.ayar, T, 'metal', 'a', { ...girdi, ad: 'Ad', p: {} }, 'S460MC', new Set());
    expect(d.tamam && d.ayar.kaliteler.map((x) => x.ad)).toEqual(['Ad']);
    expect(d.tamam && d.yogunlukYok).toBe(true);
    expect(kaliteKaydet(bosAyar(), T, 'metal', 'a', { ...girdi, kod: '' }, null, new Set())).toEqual({ tamam: false, ileti: 'Kalite kodunu yaz.' });
  });
  test('toplu gizleme yalnız verilen yerleşik kodlara dokunur', () => {
    const v = { ...bosAyar(), gizliKaliteler: ['metal|b|X'] };
    expect(kalitelerTopluGizle(v, 'metal', 'a', ['K1'], true).gizliKaliteler).toEqual(['metal|b|X', 'metal|a|K1']);
    expect(kalitelerTopluGizle({ ...v, gizliKaliteler: ['metal|a|K1'] }, 'metal', 'a', ['K1'], false).gizliKaliteler).toEqual([]);
  });
  test('özellik ve kategori', () => {
    expect(ozellikEkle(bosAyar(), TABAN, T, { ad: ' ', u: '', f: [] })).toEqual({ tamam: false, ileti: 'Özellik adını yaz.' });
    const o = ozellikEkle(bosAyar(), TABAN, T, { ad: 'Darbe', u: ' J ', f: ['metal'] });
    expect(o.tamam && o.ayar.ozellikler).toEqual([{ k: 'oz_darbe', ad: 'Darbe', u: 'J', f: ['metal'] }]);
    expect(kategoriEkle(bosAyar(), T, 'sarf', { ad: 'K', kod: 'kyn', kal: false })).toEqual({ tamam: false, ileti: 'KYN kısaltması kullanılıyor.' });
    const k = kategoriEkle(bosAyar(), T, 'demirbas', { ad: 'Lab', kod: 'lab', kal: true });
    expect(k.tamam && k.ayar.kategoriler.demirbas).toEqual([{ key: 'oz_lab', ad: 'Lab', kod: 'LAB', kal: true }]);
    const s = kategoriEkle(bosAyar(), T, 'sarf', { ad: 'Elk', kod: 'elk', kal: true });
    expect(s.tamam && s.ayar.kategoriler.sarf).toEqual([{ key: 'oz_elk', ad: 'Elk', kod: 'ELK' }]);
  });
});

describe('sınıf varsayılanı ve tür kuralları', () => {
  test('boşalan varsayılan kaydı silinir', () => {
    const v = varsayilanYaz(bosAyar(), 'metal', 'a', 'durum', 'D1');
    expect(v.varsayilanlar).toEqual({ 'metal|a': { opts: { durum: 'D1' } } });
    expect(varsayilanYaz(v, 'metal', 'a', 'durum', '').varsayilanlar).toEqual({});
  });
  test('kalıp, zorunlu ve çakışma; boşalan kural silinir', () => {
    let v = kalipYaz(bosAyar(), 'mamul', 'ac1', ' {OTO}; {musteri} ');
    expect(v.kurallar).toEqual({ mamul: { ac: ['', '{OTO}; {musteri}', ''] } });
    v = zorunluYaz(v, 'mamul', { k: 'musteri' }, true);
    v = zorunluYaz(v, 'mamul', { k: 'ad', gerekli: true }, true);
    expect(v.kurallar?.['mamul']?.zorunlu).toEqual({ musteri: true });
    v = cakismaYaz(v, 'mamul', '_ad', true);
    expect(v.kurallar?.['mamul']?.cakisma).toEqual(['_ad']);
    expect(kalipYaz(kalipYaz(bosAyar(), 'mamul', 'ad', 'X'), 'mamul', 'ad', '').kurallar).toEqual({});
    expect(kuralVarsayilanaDon(v, 'mamul').kurallar).toEqual({});
  });
});

describe('içe aktarma', () => {
  test('nesne olmayan ya da bozuk dosya reddedilir; eksik alanlar boşla tamamlanır', () => {
    expect(iceAktar('[]')).toBeNull();
    expect(iceAktar('{bozuk')).toBeNull();
    expect(iceAktar('null')).toBeNull();
    expect(iceAktar('{"favoriler":["a"]}')).toEqual({ ...bosAyar(), favoriler: ['a'] });
    expect(ayarVerisi(null)).toEqual(bosAyar());
  });
});
