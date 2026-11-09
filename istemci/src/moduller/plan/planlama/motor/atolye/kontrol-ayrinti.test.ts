import { describe, expect, it } from 'vitest';
import { paCalismaKontrol, yerlesmemeNedeni, yerlesmeyenAyrintisi } from './kurallar.ts';

// B-2499-7: onay kontrolü yerleşmeyen işi yalnız sayıyla değil adı ve ekranda bilinen nedeniyle yazar. Veri uydurmadır.
const adim = (id: string, c: string[], pr: [string, string][] = []) => ({ id, ad: '', pr, c, aile: '', aparat: null, job: id.split('.')[0] ?? '' });
const cx = { byId: { 'S1.10': adim('S1.10', []), 'S1.20': adim('S1.20', ['T1'], [['S1.10', 'FS']]), 'S2.10': adim('S2.10', ['T1']) } };

describe('yerleşmeyen işin nedeni', () => {
  it('adaysız, öncülü yerleşmeyen ve kaynak yetmeyen ayrılır', () => {
    const fail = ['S1.10', 'S1.20', 'S2.10'];
    expect(fail.map((id) => yerlesmemeNedeni(cx, fail, id))).toEqual(['uygun tezgâh ya da fasoncu yok', 'önceki adım yerleşmedi', 'kaynak ya da ufuk yetmedi']);
    expect(yerlesmemeNedeni(cx, fail, 'S9.10')).toBe('adım derlenmedi');
  });

  it('kontrol maddesi sayıdan sonra adları ve nedenleri yazar; uzun liste kısalır', () => {
    const a = yerlesmeyenAyrintisi(cx, ['S1.10'], ['S3']);
    expect(paCalismaKontrol(true, 1, true, 0, 1, a)[1]).toEqual(['uyari', '1 iş, 1 sipariş yerleşmedi: S1.10 (uygun tezgâh ya da fasoncu yok), S3 (sipariş planda bitmedi)']);
    expect(yerlesmeyenAyrintisi(cx, [], ['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toMatch(/ve 2 tane daha$/);
  });
});

describe('motorun bildirdiği neden ve kişi tezgâhı (2516-2)', () => {
  it('failNeden varsa ekranın tahmini yerine o yazılır; öncülün kimliği söylenir', () => {
    const fail = ['S1.10', 'S2.10'];
    expect(yerlesmemeNedeni(cx, fail, 'S2.10', { 'S2.10': { kod: 'oncul', oncul: 'S1.10' } })).toBe('önceki adım S1.10 yerleşmedi');
    expect(yerlesmemeNedeni(cx, fail, 'S1.10', { 'S1.10': { kod: 'zaman' } })).toBe('kaynak ya da ufuk yetmedi');
  });

  it('kişi tezgâhındaki iş varken "Bütün işler yerleşti" denmez (B-2500-2)', () => {
    const K = paCalismaKontrol(true, 0, true, 0, 0, '', 2);
    expect(K.map((k) => k[1])).not.toContain('Bütün işler yerleşti');
    expect(K[1]).toEqual(['uyari', '2 iş kişi tezgâhında; canlı planın makine kuyruğuna yazılmaz']);
  });
});
