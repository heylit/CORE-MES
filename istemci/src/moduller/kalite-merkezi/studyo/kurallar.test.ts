import { describe, expect, it } from 'vitest';
import type { KmBalon, KmOlcum } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { cizimBalonu, cizimOlcumleri, numuneKuraliMetni, planGirdileri, sonOlcumler, uretimEmriKimligi, yeniOlcumler } from './kurallar.ts';

// Uydurma deneme verisi.
const balon = (o: Partial<KmBalon> = {}): KmBalon => ({
  id: 1, no: 1, nominal: 'Ø10', tolerans: '±0,1', alt: '9.9', ust: '10.1', alet: 'Kumpas', siklik: null, kritik: false, yontem: 'elle',
  olcuAletiGerekir: true, tur: 'Çap', sayfa: 1, x: 10, y: 10, yaziKutusu: null, surum: 1, ...o,
});
const olcum = (o: Partial<KmOlcum> = {}): KmOlcum => ({
  id: 1, balonId: 1, numuneId: null, deger: '10.02', nitel: null, uygun: true, kaynak: 'kalite', parcaSayisi: null, kisi: 'Deneme',
  zaman: '2026-10-26T08:00:00.000Z', ...o,
});

describe('stüdyo kuralları', () => {
  it('ortak parçaya çeviri: numara kimlik olur; sınırlı balon sayı, sınırsız balon mastar', () => {
    expect(cizimBalonu(balon({ id: 7, no: 3, yontem: 'cmm', siklik: 'Her 10', kritik: true }))).toEqual({
      id: 3, x: 10, y: 10, nom: 'Ø10', min: 9.9, max: 10.1, gauge: false, crit: true, tol: '±0,1', tool: 'Kumpas', m: 'cmm', freq: 'Her 10', l: 'Çap',
    });
    const mastar = cizimBalonu(balon({ alt: null, ust: null, tolerans: null, alet: null, yontem: null, tur: null, x: null, y: null, yaziKutusu: [1, 2, 3, 4, 0] }));
    expect(mastar).toEqual({ id: 1, x: 0, y: 0, nom: 'Ø10', min: 0, max: 0, gauge: true, crit: false, ar: [1, 2, 3, 4, 0] });
  });

  it('son ölçümler balon numarasıyla; mastar sonucu Geçer/Geçmez', () => {
    const b = [balon({ id: 7, no: 3 }), balon({ id: 8, no: 4, alt: null, ust: null }), balon({ id: 9, no: 5 })];
    const kayit = cizimOlcumleri(b, new Map([[7, olcum({ balonId: 7 })], [8, olcum({ balonId: 8, deger: null, nitel: 'gecmez', uygun: false })]]));
    expect(kayit).toEqual({
      3: { v: 10.02, ok: true, at: Date.parse('2026-10-26T08:00:00.000Z') },
      4: { v: 'Geçmez', ok: false, at: Date.parse('2026-10-26T08:00:00.000Z') },
    });
  });

  it('yazılacak ölçüm: yalnız değişen balon; sayı değer, mastar nitel', () => {
    const b = [balon({ id: 7, no: 3 }), balon({ id: 8, no: 4, alt: null, ust: null })];
    const onceki = { 3: { v: 10, ok: true, at: 1 } };
    expect(yeniOlcumler(b, onceki, { ...onceki, 4: { v: 'Geçer', ok: true, at: 2 } })).toEqual([{ balonId: 8, nitel: 'gecer' }]);
    expect(yeniOlcumler(b, onceki, { 3: { v: 10.05, ok: true, at: 2 } })).toEqual([{ balonId: 7, deger: '10.05' }]);
    expect(yeniOlcumler(b, onceki, onceki)).toEqual([]);
  });

  it('plan geri çevirisi: eski numara kimliğini taşır, yeni nokta kimliksiz; mastar sınırsız, sınır altı ondalık metin', () => {
    const eski = [balon({ id: 7, no: 3, olcuAletiGerekir: true, sayfa: 2 })];
    const geri = planGirdileri(eski, [
      { ...cizimBalonu(eski[0]!), x: 40, min: 9.95, max: 10.0500001 },
      { id: 4, x: 1, y: 2, nom: 'M6', min: 0, max: 0, gauge: true, m: 'man' },
    ]);
    expect(geri).toEqual([
      { id: 7, no: 3, nominal: 'Ø10', tolerans: '±0,1', alt: '9.95', ust: '10.05', alet: 'Kumpas', siklik: null, kritik: false, yontem: 'elle',
        olcuAletiGerekir: true, tur: 'Çap', sayfa: 2, x: 40, y: 10, yaziKutusu: null, yer: null, yerKipi: null },
      { no: 4, nominal: 'M6', tolerans: null, alt: null, ust: null, alet: null, siklik: null, kritik: false, yontem: 'elle',
        olcuAletiGerekir: false, tur: null, sayfa: null, x: 1, y: 2, yaziKutusu: null, yer: null, yerKipi: null },
    ]);
  });

  it('balon yeri (913 a): sabit yer ve tek balon yerleşimi çizime geçer, plan geri çevirisi taşır; yoksa boş gider', () => {
    const sabit = cizimBalonu(balon({ yer: [40, 50], yerKipi: null }));
    expect([sabit.yer, sabit.yerKipi]).toEqual([[40, 50], undefined]);
    expect(cizimBalonu(balon({ yer: null, yerKipi: 'serit' })).yerKipi).toBe('serit');
    expect('yer' in cizimBalonu(balon())).toBe(false);
    const [a, b] = planGirdileri([balon()], [{ ...cizimBalonu(balon()), yer: [1, 2] }, { ...cizimBalonu(balon({ no: 2 })), id: 2 }]);
    expect([a?.yer, a?.yerKipi, b?.yer, b?.yerKipi]).toEqual([[1, 2], null, null, null]);
  });

  it('balon başına son ölçüm: düzeltme yeni kayıttır, aynı anda büyük kimlik sonradır', () => {
    const son = sonOlcumler([
      olcum({ id: 1, deger: '10.2', uygun: false }),
      olcum({ id: 3, zaman: '2026-10-26T09:00:00.000Z', deger: '10.05' }),
      olcum({ id: 2, zaman: '2026-10-26T09:00:00.000Z', deger: '10.00' }),
      olcum({ id: 4, balonId: 2, deger: '5' }),
    ]);
    expect(son.get(1)?.id).toBe(3);
    expect(son.get(2)?.id).toBe(4);
  });

  it('iş emri satırından üretim emri kimliği; sipariş satırı değildir', () => {
    expect(uretimEmriKimligi('ue-12')).toBe(12);
    expect(uretimEmriKimligi('sa-12')).toBeNull();
    expect(uretimEmriKimligi('ue-0')).toBeNull();
  });

  it('numune kuralı okunur metin', () => {
    expect(numuneKuraliMetni({ kimlik: 'a', ne: 'her', n: 20, kim: ['operator'], balonlar: 'kritik', kapi: true }))
      .toBe('Her 20 parça · Operatör · kritik balonlar · kalite kararı bekler');
    expect(numuneKuraliMetni({ kimlik: 'b', ne: 'ilk', kim: ['kalite', 'operator'], balonlar: [1, 3] })).toBe('İlk parça · Kalite + Operatör · balon 1, 3');
  });
});
