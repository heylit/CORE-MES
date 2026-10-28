import { describe, expect, it } from 'vitest';
import type { PlanCanliOzeti } from '#paylasilan/sozlesme/plan.ts';
import { planFarki, seritDurumu, sonCanliyaAlmaMetni } from './plan-seridi.ts';
import type { EkranYerlesimi } from './veri.ts';

const is = (anahtar: string, ek: Partial<PlanCanliOzeti['kuyruklar'][number]['isler'][number]> = {}) => ({ anahtar, dondurulmus: false, sabit: false, ...ek });
const PLANLANACAK = ['A|10', 'B|10', 'C|10', 'D|10', 'E|10', 'K|10'];
const canli = (kuyruklar: PlanCanliOzeti['kuyruklar'], ek: Partial<PlanCanliOzeti> = {}): PlanCanliOzeti =>
  ({ planSurumu: 3, sonCanliyaAlma: null, kuyruklar, planlanacak: PLANLANACAK, ...ek });
const yer = (makineId: number | null, saat: string) => [{ makineId, baslangic: `2026-10-26T${saat}:00.000Z` }];
const surum = (planSurumu: number, kisi: string | null = null) =>
  ({ planSurumu, sonCanliyaAlma: kisi === null ? null : { zaman: '2026-10-25T07:15:00.000Z', kisi } });

describe('plan şeridi: motor yerleşimi ile canlı plan farkı (eski sayım, 492/2 a)', () => {
  it('aynı makine ve sıra fark değildir; canlıda olmayan iş "yok", başka makine ve ters sıra "farklı" sayılır', () => {
    const c = canli([{ makineId: 1, isler: [is('A|10'), is('B|10')] }, { makineId: 2, isler: [is('C|10')] }]);
    expect(planFarki(c, { 'A|10': yer(1, '08:00'), 'B|10': yer(1, '09:00'), 'C|10': yer(2, '08:00') })).toMatchObject({ yok: 0, farkli: 0 });
    const y: EkranYerlesimi = { 'B|10': yer(1, '08:00'), 'A|10': yer(1, '09:00'), 'C|10': yer(1, '10:00'), 'D|10': yer(2, '08:00') };
    expect(planFarki(c, y)).toMatchObject({ yok: 1, farkli: 3 });
  });

  it('canlıda kilitli iş sayılmaz; canlıda dondurulmuş duran iş farklıdır; yerleşemeyen bölünmüş iş "yok" sayılmaz', () => {
    const c = canli([{ makineId: 1, isler: [is('A|10', { sabit: true }), is('B|10', { dondurulmus: true })] }],
      { yersizBolmeler: [{ anahtar: 'E|10', parcalar: [{ no: 1, adet: 2 }] }] });
    expect(planFarki(c, { 'A|10': yer(2, '08:00'), 'B|10': yer(1, '09:00'), 'E|10~1': yer(1, '10:00') })).toMatchObject({ yok: 0, farkli: 1 });
  });

  it('emirde karşılığı olmayan ve makine kuyruğuna girmeyen adım sayılmaz, uyarı listesine girer', () => {
    const c = canli([{ makineId: 1, isler: [is('A|10')] }]);
    expect(planFarki(c, { 'A|10': yer(1, '08:00'), 'Z|20': yer(1, '09:00'), 'K|10': yer(null, '08:00') }))
      .toEqual({ yok: 0, farkli: 0, emirdeYok: ['Z OP 20'], makinesiz: ['K OP 10'] });
  });

  it('bölünmüş iş parça anahtarıyla eşleşir; motorun parça adedi canlıdan farklıysa farklıdır, adedi yoksa (yazılamaz) sayılmaz', () => {
    const c = canli([{ makineId: 1, isler: [is('A|10', { parca: { no: 1, adet: 3 } })] }, { makineId: 2, isler: [is('A|10', { parca: { no: 2, adet: 2 } })] }]);
    const y = { 'A|10~1': yer(1, '08:00'), 'A|10~2': yer(2, '08:00') };
    expect(planFarki(c, y)).toMatchObject({ yok: 0, farkli: 0 });
    expect(planFarki(c, y, { 'A|10~1': 3, 'A|10~2': 2 })).toMatchObject({ yok: 0, farkli: 0 });
    expect(planFarki(c, y, { 'A|10~1': 4, 'A|10~2': 1 })).toMatchObject({ yok: 0, farkli: 2 });
    expect(planFarki(c, { ...y, 'A|10~3': yer(1, '09:00') }, { 'A|10~1': 3, 'A|10~2': 2, 'A|10~3': null })).toMatchObject({ yok: 0, farkli: 0 });
  });
});

describe('plan şeridi: durum', () => {
  const c = canli([{ makineId: 1, isler: [is('A|10')] }]);
  it('fark yoksa plan canlı, eski metinle', () => {
    expect(seritDurumu(c, { 'A|10': yer(1, '08:00') }, surum(3)))
      .toMatchObject({ tur: 'canli', rozet: 'PLAN CANLI', degisiklik: 0, motorFarki: 0, metin: 'Terminal ve Arkon Hazırlık bu ekrandaki sırayı kullanıyor.' });
  });
  it('canlı plan varken motor farkı canlıya alınmadı demez: plan canlı, motor farkı ayrı sayı (500 a)', () => {
    expect(seritDurumu(c, { 'A|10': yer(1, '08:00'), 'B|10': yer(1, '09:00') }, null)).toMatchObject({
      tur: 'canli', rozet: 'PLAN CANLI', degisiklik: 0, motorFarki: 1, parca: '1 iş canlı planda yok',
      metin: 'Terminal ve Arkon Hazırlık canlı planın sırasını kullanıyor.',
    });
    const kilitli = canli([], { sonCanliyaAlma: { zaman: '2026-10-24T09:30:00.000Z', kisi: 'Deneme 1' } });
    expect(seritDurumu(kilitli, { 'A|10': yer(1, '08:00') }, null)).toMatchObject({ tur: 'canli', motorFarki: 1 });
  });
  it('hiç canlı plan yoksa canlıya alınmadı ve motor önerisinin iş sayısı', () => {
    const bos = canli([]);
    expect(seritDurumu(bos, { 'A|10': yer(1, '08:00') }, null))
      .toMatchObject({ tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: 1, motorFarki: 0, parca: '1 iş canlı planda yok' });
    expect(seritDurumu(bos, {}, null)).toMatchObject({ tur: 'canli', rozet: 'PLAN CANLI', degisiklik: 0 });
  });
  it('motorun rota ve bölme durumları uyarıdır, sayılmaz (493/2 a)', () => {
    const motor = { parcaAdetleri: {}, emirler: [
      { uretimEmriId: 1, emirNo: 'A', teslim: null, bitis: null, bollukGun: null, rotaEski: true, bolmeYazilamaz: [10] },
      { uretimEmriId: 2, emirNo: 'B', teslim: null, bitis: null, bollukGun: null, rotaEski: false, bolmeYazilamaz: [] },
    ] };
    const d = seritDurumu(c, { 'A|10': yer(1, '08:00') }, null, motor);
    expect(d).toMatchObject({ tur: 'canli', degisiklik: 0 });
    expect(d.uyarilar).toEqual([
      '1 emir eski rota revizyonundan açıldı; plan yürürlükteki rotanın süreleriyle kurulur.',
      '1 bölünmüş iş canlıya alınmaz (A OP 10): adımın adedi plandan okunamadı ya da bir parça bir tam adetten az kaldı; iş kartında parçaları birleştirip yeniden bölün.',
    ]);
  });
  it('uyarılar canlı durumda da yazılır', () => {
    expect(seritDurumu(c, { 'A|10': yer(1, '08:00'), 'K|10': yer(null, '08:00') }, null).uyarilar)
      .toEqual(['1 adım makinesi olmayan istasyonda, canlıya alınmaz (K OP 10): istasyona makine tanımlayın ya da rotada adımın makinesini seçin.']);
  });
  it('sürüm değiştiyse plan değişti, kimin ne zaman canlıya aldığıyla; motor yerleşimi okunamazsa fark gösterilmez', () => {
    const d = seritDurumu(c, {}, surum(4, 'Deneme 2'));
    expect(d).toMatchObject({ tur: 'degisti', rozet: 'PLAN DEĞİŞTİ' });
    expect(d.metin).toMatch(/^Plan başkası tarafından canlıya alındı \(Deneme 2, 25\.10\.2026 \d\d:15\)\. Ekranı yenileyin/);
    expect(seritDurumu(c, {}, surum(4)).metin).toMatch(/^Plan başkası tarafından canlıya alındı\. /);
    expect(seritDurumu(c, null, surum(3))).toMatchObject({ tur: 'canli', degisiklik: 0, uyarilar: ['Plan motorunun yerleşimi okunamadı; motor önerisiyle fark gösterilemiyor.'] });
    expect(seritDurumu(canli([]), null, surum(3))).toMatchObject({ tur: 'bekliyor', rozet: 'CANLIYA ALINMADI', degisiklik: 0 });
  });
  it('son canlıya alma metni', () => {
    expect(sonCanliyaAlmaMetni(c)).toBe('Plan henüz hiç canlıya alınmadı');
    expect(sonCanliyaAlmaMetni({ ...c, sonCanliyaAlma: { zaman: '2026-10-24T09:30:00.000Z', kisi: 'Deneme 1' } })).toMatch(/^Son canlıya alma: 24\.10\.2026 \d\d:30, Deneme 1$/);
  });
});
