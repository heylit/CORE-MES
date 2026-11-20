import { describe, expect, test } from 'vitest';
import { CIZIM_GRUPLARI, cizimEkle, cizimTuru, dosyaHedefi, hedefMetni, ortadanKisalt, tasimaIletisi } from './cizim-rafi.ts';
import type { Taslak } from './durum.ts';

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

  test('3305 a: raf iki grup, sıra 3B model sonra teknik resim; her grup kendi biçimini kabul eder', () => {
    expect(CIZIM_GRUPLARI.map((g) => [g.tur, g.ad, g.kabul])).toEqual([['3b-model', '3B model', '.step,.stp'], ['teknik-resim', 'Teknik resim', '.pdf']]);
  });

  test('3305 a: başka grubun alanına bırakılan dosya kendi türüyle girer, taşınan sayılır ve bir sonraki eklemede vurgu kalkar', () => {
    const ilk = cizimEkle([], [new File(['x'], 'ORN-1.pdf'), new File(['y'], 'ORN-1.step')], '3b-model');
    expect(ilk.liste.map((c) => [c.dosya.name, c.tur, c.tasindi])).toEqual([['ORN-1.pdf', 'teknik-resim', true], ['ORN-1.step', '3b-model', false]]);
    expect(ilk.tasinan).toEqual(['ORN-1.pdf']);
    expect(tasimaIletisi(ilk.tasinan, ilk.liste)).toBe('ORN-1.pdf teknik resim olarak alındı.');
    const ikinci = cizimEkle(ilk.liste, [new File(['z'], 'ORN-2.pdf')], 'teknik-resim');
    expect(ikinci.tasinan).toEqual([]);
    expect(ikinci.liste.every((c) => !c.tasindi)).toBe(true);
    expect(tasimaIletisi(ikinci.tasinan, ikinci.liste)).toBeNull();
    const cok = cizimEkle([], [new File(['a'], 'A.step'), new File(['b'], 'B.stp')], 'teknik-resim');
    expect(tasimaIletisi(cok.tasinan, cok.liste)).toBe('2 dosya kendi grubuna alındı.');
    expect(tasimaIletisi(['A.step'], cok.liste)).toBe('A.step 3B model olarak alındı.');
  });

  test('3479: dosyanın hedefi elle düzenlenmediyse kartınki, düzenlendiyse onunki; boş alan yok sayılır', () => {
    const d = { g: { resim: ' ORN-2045-01 ', rev: 'B' } } as unknown as Taslak;
    const [c] = cizimEkle([], [new File(['x'], 'ORN-1.pdf')]).liste;
    expect(c!.elle).toBeNull();
    expect(dosyaHedefi(d, c!)).toEqual({ resimNo: 'ORN-2045-01', rev: 'B' });
    expect(dosyaHedefi(d, { elle: { resimNo: 'ORN-9', rev: ' ' } })).toEqual({ resimNo: 'ORN-9', rev: null });
    expect(hedefMetni({ resimNo: null, rev: null })).toBe('resim no yok · Rev —');
  });
});
