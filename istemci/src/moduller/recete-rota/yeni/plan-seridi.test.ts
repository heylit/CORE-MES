import { describe, expect, it } from 'vitest';
import type { PlanCanliOzeti } from '#paylasilan/sozlesme/plan.ts';
import { planFarki, seritDurumu, sonCanliyaAlmaMetni } from './plan-seridi.ts';
import type { EkranYerlesimi } from './veri.ts';

const is = (anahtar: string, ek: Partial<PlanCanliOzeti['kuyruklar'][number]['isler'][number]> = {}) => ({ anahtar, dondurulmus: false, sabit: false, ...ek });
const canli = (kuyruklar: PlanCanliOzeti['kuyruklar'], ek: Partial<PlanCanliOzeti> = {}): PlanCanliOzeti =>
  ({ planSurumu: 3, sonCanliyaAlma: null, kuyruklar, planlanacak: [], ...ek });
const yer = (makineId: number | null, saat: string) => [{ makineId, baslangic: `2026-10-26T${saat}:00.000Z` }];

describe('plan şeridi: motor yerleşimi ile canlı plan farkı', () => {
  it('aynı makine ve sıra fark değildir; canlıda olmayan iş "yok", başka makine ve ters sıra "farklı" sayılır', () => {
    const c = canli([{ makineId: 1, isler: [is('A|10'), is('B|10')] }, { makineId: 2, isler: [is('C|10')] }]);
    expect(planFarki(c, { 'A|10': yer(1, '08:00'), 'B|10': yer(1, '09:00'), 'C|10': yer(2, '08:00') })).toEqual({ yok: 0, farkli: 0 });
    const y: EkranYerlesimi = { 'B|10': yer(1, '08:00'), 'A|10': yer(1, '09:00'), 'C|10': yer(1, '10:00'), 'D|10': yer(2, '08:00') };
    expect(planFarki(c, y)).toEqual({ yok: 1, farkli: 3 });
  });

  it('canlıda kilitli ya da dondurulmuş iş, kişi kaynağındaki iş ve canlıda yerleşemeyen bölünmüş iş sayılmaz', () => {
    const c = canli([{ makineId: 1, isler: [is('A|10', { sabit: true }), is('B|10', { dondurulmus: true })] }],
      { yersizBolmeler: [{ anahtar: 'E|10', parcalar: [{ no: 1, adet: 2 }] }] });
    expect(planFarki(c, { 'A|10': yer(2, '08:00'), 'B|10': yer(2, '09:00'), 'K|10': yer(null, '08:00'), 'E|10~1': yer(1, '10:00') })).toEqual({ yok: 0, farkli: 0 });
  });

  it('bölünmüş iş parça anahtarıyla eşleşir', () => {
    const c = canli([{ makineId: 1, isler: [is('A|10', { parca: { no: 1, adet: 3 } })] }, { makineId: 2, isler: [is('A|10', { parca: { no: 2, adet: 2 } })] }]);
    expect(planFarki(c, { 'A|10~1': yer(1, '08:00'), 'A|10~2': yer(2, '08:00') })).toEqual({ yok: 0, farkli: 0 });
  });
});

describe('plan şeridi: durum', () => {
  const c = canli([{ makineId: 1, isler: [is('A|10')] }]);
  it('fark yoksa plan canlı; fark varsa canlıya alınmadı ve değişiklik sayısı', () => {
    expect(seritDurumu(c, { 'A|10': yer(1, '08:00') }, 3)).toMatchObject({ tur: 'canli', rozet: 'PLAN CANLI', degisiklik: 0 });
    expect(seritDurumu(c, { 'A|10': yer(1, '08:00'), 'B|10': yer(1, '09:00') }, null))
      .toMatchObject({ tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: 1, parca: '1 iş canlı planda yok' });
  });
  it('sürüm değiştiyse plan değişti; motor yerleşimi okunamazsa fark gösterilmez', () => {
    expect(seritDurumu(c, {}, 4)).toMatchObject({ tur: 'degisti', rozet: 'PLAN DEĞİŞTİ' });
    expect(seritDurumu(c, null, 3)).toMatchObject({ tur: 'bekliyor', degisiklik: 0 });
  });
  it('son canlıya alma metni', () => {
    expect(sonCanliyaAlmaMetni(c)).toBe('Plan henüz hiç canlıya alınmadı');
    expect(sonCanliyaAlmaMetni({ ...c, sonCanliyaAlma: { zaman: '2026-10-24T09:30:00.000Z', kisi: 'Deneme 1' } })).toMatch(/^Son canlıya alma: 24\.10\.2026 \d\d:30, Deneme 1$/);
  });
});
