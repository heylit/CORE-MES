import { describe, expect, it } from 'vitest';
import { PNL_GIDER, sum } from '../motor.ts';
import { finansKur } from './test-yardim.tsx';
import {
  altiAyKomutlari, butceAylari, butceDurumu, butceKalemi, butceKomutu, butceTablosu, ilkButceAyi, kalanGunTonu, kopruCubuklari, nakitKoprusu, vergiOzeti,
} from './plan.ts';

const { motor } = finansKur();

describe('nakit köprüsü', () => {
  it('başlangıç ile grupların toplamı 13. hafta sonunu verir; sıfıra yakın grup atlanır', () => {
    const k = nakitKoprusu(motor);
    const f = motor.forecast(motor.emptyState().scen);
    expect(k.start).toBeCloseTo(f.open, 6);
    expect(k.end).toBeCloseTo(f.end, 6);
    expect(k.start + sum(k.parts, (p) => p.v)).toBeCloseTo(k.end, 0);
    expect(k.parts.every((p) => Math.abs(p.v) > 1)).toBe(true);
    // Kira düzenli ödemedir; verilen çek ayrı gruptadır.
    expect(k.parts.map((p) => p.g)).toEqual(expect.arrayContaining(['Maaş, kira ve düzenli ödemeler', 'Verilen çekler']));
  });

  it('köprü çubukları: bugün ve 13. hafta sıfırdan, gruplar birbirine eklenir', () => {
    const c = kopruCubuklari({ start: 100, end: 70, parts: [{ g: 'A', v: 50 }, { g: 'B', v: -80 }] });
    expect(c).toEqual([
      { etiket: 'Bugün', aralik: [0, 100], tur: 'bakiye' },
      { etiket: 'A', aralik: [100, 150], tur: 'giris' },
      { etiket: 'B', aralik: [150, 70], tur: 'cikis' },
      { etiket: '13. hafta', aralik: [0, 70], tur: 'bakiye' },
    ]);
  });
});

describe('bütçe', () => {
  it('durum eşikleri prototipteki gibi', () => {
    expect(butceDurumu(0, 50, 0.5)).toBe('yok');
    expect(butceDurumu(100, 111, 1)).toBe('asildi');
    expect(butceDurumu(100, 105, 1)).toBe('sinirda');
    expect(butceDurumu(100, 70, 0.5)).toBe('hizli');
    expect(butceDurumu(100, 60, 0.5)).toBe('plan');
  });

  it('aylar: bu ay ve önceki iki ay; ayın ilk haftasında geçen ay açılır', () => {
    expect(butceAylari('2026-10-15')).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(ilkButceAyi('2026-10-15')).toBe('2026-10');
    expect(ilkButceAyi('2026-10-07')).toBe('2026-09');
  });

  it('tablo: geçerli bütçe, ayın gideri, satış hedefi; geçmiş ay tamamlanmış sayılır', () => {
    const T = butceTablosu(motor, '2026-09');
    expect(T.buAy).toBe(false);
    expect(T.ayOrani).toBe(1);
    expect(T.satirlar.map((s) => s.kalem)).toEqual(PNL_GIDER);
    expect(T.satirlar.find((s) => s.kalem === 'Kira')).toMatchObject({ butce: 8000, gercek: 8000, kalan: 0, durum: 'plan' });
    expect(T.hedef).toBe(50000);
    expect(T.toplamButce).toBe(8000);
    const buAy = butceTablosu(motor, '2026-10');
    expect(buAy.buAy).toBe(true);
    expect(buAy.ayOrani).toBeCloseTo(15 / 31, 6);
  });

  it('kalem kodu: bütçesi tutulan gider kalemi ve satış hedefi; tutulmayan null', () => {
    expect(butceKalemi('Kira')).toBe('kira');
    expect(butceKalemi('Finansman (faiz)')).toBe('faiz');
    expect(butceKalemi('Ürün satışı')).toBeNull();
    expect(butceKalemi('yok')).toBeNull();
  });

  it('komut: bu ayın ilk gününden, eksi tutar sıfır', () => {
    expect(butceKomutu('kira', '2026-10-15', -5)).toMatchObject({
      uc: 'POST /finans/butce/belirle', tekrar: false, govde: { kategori: 'kira', baslangicAyi: '2026-10-01', aylikTutar: 0 },
    });
  });

  it('son 6 ay ortalaması: bine yuvarlanır, boş kalem gönderilmez', () => {
    const k = altiAyKomutlari(motor);
    // Örnek veride son altı tamamlanmış ayda gider yalnız Eylül kirası (8000) ve Ağustos hammaddesi (1000): ortalama 1333 ve 167.
    expect(k.map((x) => x.govde)).toEqual([
      { kategori: 'mal_alimi', baslangicAyi: '2026-10-01', aylikTutar: 0 },
      { kategori: 'kira', baslangicAyi: '2026-10-01', aylikTutar: 1000 },
    ]);
  });
});

describe('vergi', () => {
  it('son yedi ay; kaydı olmayan ay yoktur (ekranda sıfır yazar); 75 günlük takvim sıralı', () => {
    const v = vergiOzeti(motor);
    expect(v.aylar.length).toBeLessThanOrEqual(7);
    expect(v.buAy).toBeUndefined();
    expect(v.gecenAy?.ym).toBe('2026-09');
    expect(v.takvim.length).toBeGreaterThan(0);
    expect(v.takvim.map((e) => e.date)).toEqual([...v.takvim.map((e) => e.date)].sort());
    expect(v.takvim.every((e) => e.date >= '2026-10-15' && e.date <= '2026-12-29')).toBe(true);
  });

  it('kalan gün tonu', () => {
    expect([0, 5, 6, 15, 16].map(kalanGunTonu)).toEqual(['hata', 'hata', 'uyari', 'uyari', 'tamam']);
  });
});
