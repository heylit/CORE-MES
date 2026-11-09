import { describe, expect, it } from 'vitest';
import { TOPLU_EN_COK, hucreCoz, metinYaz, planKur, planSayilari, reddedilenSatir, sayfaTanimi, type ExcelSutunu, type ExcelTanimi, type SayfaSatirlari } from './kurallar.ts';

interface Kayit { id: number; kod: string; ad: string; aktif: boolean; merkez: string | null }
const MERKEZLER = [{ kod: 'IM1', ad: 'Talaşlı' }, { kod: 'IM2', ad: 'Kalite' }];
const sutunlar: ExcelSutunu[] = [
  { anahtar: 'kod', baslik: 'Kod', tur: 'kod', zorunlu: true },
  { anahtar: 'ad', baslik: 'Ad', tur: 'metin', zorunlu: true, enUzun: 10 },
  { anahtar: 'merkez', baslik: 'İş merkezi', tur: 'liste', liste: MERKEZLER, dosyadakiSayfa: 'Merkez' },
  { anahtar: 'aktif', baslik: 'Aktif', tur: 'evet-hayir' },
];
const kayitlar: Kayit[] = [{ id: 1, kod: 'A1', ad: 'Eski', aktif: true, merkez: 'IM1' }];
const tanim = (ek: Partial<Parameters<typeof sayfaTanimi<Kayit>>[0]> = {}): ExcelTanimi => ({
  ad: 'deneme', baslik: 'Deneme', kilavuz: [],
  sayfalar: [
    sayfaTanimi<{ kod: string }>({ ad: 'Merkez', kayitTuru: 'merkez', anahtarSutun: 'kod', kayitlar: [], anahtar: (k) => k.kod, sutunlar: [sutunlar[0]!], satir: (k) => ({ kod: k.kod }) }),
    sayfaTanimi<Kayit>({
      ad: 'Kayıt', kayitTuru: 'kayit', anahtarSutun: 'kod', kayitlar, anahtar: (k) => k.kod, sutunlar,
      satir: (k) => ({ kod: k.kod, ad: k.ad, merkez: k.merkez, aktif: k.aktif }), ...ek,
    }),
  ],
});
const BASLIK = { no: 1, hucreler: ['Kod *', 'Ad *', 'İş merkezi', 'Aktif'] };
const oku = (satirlar: (string | number | boolean | Date | null)[][], ek: SayfaSatirlari = {}): SayfaSatirlari =>
  ({ 'Kayıt': [BASLIK, ...satirlar.map((h, i) => ({ no: i + 2, hucreler: h }))], ...ek });

describe('hücre çözümü', () => {
  const s = (tur: ExcelSutunu['tur'], ek: Partial<ExcelSutunu> = {}): ExcelSutunu => ({ anahtar: 'x', baslik: 'X', tur, ...ek });
  it('boş hücre değer değildir (güncellemede değişmez)', () => {
    expect(hucreCoz(s('metin'), null)).toEqual({});
    expect(hucreCoz(s('sayi'), '  ')).toEqual({});
  });
  it('sayı ondalık virgül ve binlik noktayla okunur', () => {
    expect(hucreCoz(s('sayi'), '1.250,5')).toEqual({ deger: 1250.5 });
    expect(hucreCoz(s('sayi'), 3)).toEqual({ deger: 3 });
    expect(hucreCoz(s('sayi'), 'on').hata).toMatch(/sayı/);
  });
  it('tarih gg.aa.yyyy ya da Excel tarihi; takvimde olmayan gün hatadır', () => {
    expect(hucreCoz(s('tarih'), '05.03.2026')).toEqual({ deger: '2026-03-05' });
    expect(hucreCoz(s('tarih'), new Date(Date.UTC(2026, 10, 9)))).toEqual({ deger: '2026-11-09' });
    expect(hucreCoz(s('tarih'), '31.02.2026').hata).toMatch(/gg\.aa\.yyyy/);
  });
  it('evet/hayır', () => {
    expect(hucreCoz(s('evet-hayir'), 'Evet')).toEqual({ deger: true });
    expect(hucreCoz(s('evet-hayir'), 'hayır')).toEqual({ deger: false });
    expect(hucreCoz(s('evet-hayir'), 'belki').hata).toBeDefined();
  });
  it('liste etiketle, kodla ya da adla; dosyada açılan kod da tanınır', () => {
    const l = s('liste', { liste: MERKEZLER });
    expect(hucreCoz(l, 'IM2 — Kalite')).toEqual({ deger: 'IM2' });
    expect(hucreCoz(l, 'im1')).toEqual({ deger: 'IM1' });
    expect(hucreCoz(l, 'Kalite')).toEqual({ deger: 'IM2' });
    expect(hucreCoz(l, 'IM9').hata).toMatch(/listede yok/);
    expect(hucreCoz(l, 'im9', new Set(['IM9']))).toEqual({ deger: 'IM9' });
  });
  it('formül gibi başlayan metin dışa kesmeyle yazılır, okurken aynı metne döner', () => {
    const m = '=HYPERLINK("http://ornek","tik")';
    expect(metinYaz(m)).toBe(`'${m}`);
    expect(hucreCoz(s('metin'), metinYaz(m))).toEqual({ deger: m });
  });
});

describe('önizleme planı', () => {
  it('yeni, güncellenecek, değişmeyen ve hatalı satırlar; güncellemede yalnız dolu hücre fark sayılır', () => {
    const { plan, uyari } = planKur(tanim(), oku([
      ['B1', 'Yeni', 'IM2 — Kalite', null],
      ['a1', 'Eski', null, 'Hayır'],
      ['A1x', null, null, null],
    ]));
    expect(uyari).toBeNull();
    expect(plan.map((p) => [p.satir, p.islem])).toEqual([[2, 'ekle'], [3, 'guncelle'], [4, 'hata']]);
    expect(plan[1]?.farklar).toEqual([{ alan: 'aktif', baslik: 'Aktif', eski: 'Evet', yeni: 'Hayır' }]);
    expect(plan[1]?.degerler).toEqual({ kod: 'A1', ad: 'Eski', aktif: false });
    expect(plan[2]?.hatalar).toEqual(['Ad zorunlu.']);
    expect(planSayilari(plan)).toEqual({ ekle: 1, guncelle: 1, ayni: 0, hata: 1 });
  });
  it('değişiklik yoksa satır değişmeyendir', () => {
    expect(planKur(tanim(), oku([['A1', 'Eski', 'IM1', 'Evet']])).plan[0]?.islem).toBe('ayni');
  });
  it('aynı kod dosyada iki kez hatadır; uzun metin hatadır', () => {
    const { plan } = planKur(tanim(), oku([['C1', 'Bir', null, null], ['c1', 'Çok uzun bir ad', null, null]]));
    expect(plan[1]?.hatalar).toEqual(['Ad: en çok 10 karakter.', 'Aynı kod 2. satırda da var.']);
  });
  it('aynı dosyadaki öteki sayfada açılan kod listede kabul edilir', () => {
    const { plan } = planKur(tanim(), oku([['D1', 'Bağlı', 'YENI-IM', null]], { Merkez: [{ no: 1, hucreler: ['Kod *'] }, { no: 2, hucreler: ['yeni-im'] }] }));
    expect(plan.map((p) => [p.sayfa, p.islem])).toEqual([['Merkez', 'ekle'], ['Kayıt', 'ekle']]);
    expect(plan[1]?.degerler['merkez']).toBe('YENI-IM');
  });
  it('yalnız güncelleyen sayfada eşleşmeyen satır hatadır', () => {
    expect(planKur(tanim({ ekleme: false }), oku([['Z9', 'Yok', null, null]])).plan[0]?.hatalar[0]).toMatch(/yeni kayıt açılmaz/);
  });
  it('başlığı eksik sayfa, boş dosya ve satır sınırı uyarıdır', () => {
    expect(planKur(tanim(), { 'Kayıt': [{ no: 1, hucreler: ['Ad'] }, { no: 2, hucreler: ['x'] }] }).uyari).toMatch(/"Kod" başlığı yok/);
    expect(planKur(tanim(), {}).uyari).toMatch(/okunacak satır/);
    const cok = Array.from({ length: TOPLU_EN_COK + 1 }, (_, i) => [`K${String(i)}`, 'Ad', null, null]);
    expect(planKur(tanim(), oku(cok)).uyari).toMatch(/en çok 2000/);
  });
  it('tanımda olmayan sütun okunmaz', () => {
    const { plan } = planKur(tanim(), { 'Kayıt': [{ no: 1, hucreler: ['Kod', 'Ad', 'Rol'] }, { no: 2, hucreler: ['E1', 'Ad', 'yonetici'] }] });
    expect(plan[0]?.degerler).toEqual({ kod: 'E1', ad: 'Ad' });
  });
});

describe('sunucu reddi', () => {
  it('satır numarası ayrıntıdan okunur', () => {
    expect(reddedilenSatir({ satir: 3 })).toBe(3);
    expect(reddedilenSatir({ kayitId: 3 })).toBeNull();
    expect(reddedilenSatir(null)).toBeNull();
  });
});
