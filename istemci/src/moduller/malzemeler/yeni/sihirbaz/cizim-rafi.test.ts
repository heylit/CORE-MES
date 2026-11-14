import { describe, expect, test } from 'vitest';
import { cizimEkle, cizimTuru, ortadanKisalt } from './cizim-rafi.ts';

describe('3242 d çizim rafı kuralları', () => {
  test('PDF teknik resim, STEP ve STP 3B model; öteki biçim alınmaz', () => {
    expect(['a.pdf', 'b.PDF', 'c.step', 'd.STP', 'e.dxf', 'f.iges', 'g'].map(cizimTuru)).toEqual(['teknik-resim', 'teknik-resim', '3b-model', '3b-model', null, null, null]);
  });

  test('aynı ad ve boyuttaki dosya iki kez eklenmez; desteklenmeyen adıyla döner', () => {
    const a = new File(['x'], 'ORN-1.pdf');
    const ilk = cizimEkle([], [a, new File(['y'], 'kroki.dxf')]);
    expect(ilk.liste.map((c) => [c.dosya.name, c.tur, c.durum])).toEqual([['ORN-1.pdf', 'teknik-resim', 'bekler']]);
    expect(ilk.reddedilen).toEqual(['kroki.dxf']);
    expect(cizimEkle(ilk.liste, [new File(['x'], 'ORN-1.pdf')]).liste).toHaveLength(1);
    expect(cizimEkle(ilk.liste, [new File(['xx'], 'ORN-1.pdf')]).liste).toHaveLength(2);
  });

  test('uzun ad uzantısı görünecek biçimde ortadan kısalır; kısa ad olduğu gibi kalır', () => {
    expect(ortadanKisalt('ORN-1.pdf')).toBe('ORN-1.pdf');
    const k = ortadanKisalt('ORN-2045-01-MOTOR-BAGLANTI_Rev-B.step');
    expect(k.endsWith('_Rev-B.step')).toBe(true);
    expect(k.length).toBeLessThanOrEqual(28);
    expect(k).toContain('…');
  });
});
