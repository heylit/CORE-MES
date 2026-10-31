import { describe, expect, it } from 'vitest';
import { finansMotoru, type FinansMotoru, type SiparisKalemi } from './motor.ts';
import { bilancoDoldur, ornekDurum, ORNEK_BUGUN, zenginlestir } from './ornek-veri.ts';

// Prototip motorunun sabitlenen sayıları (FNM-01..08); prototiple eşitlik ayrıca esitlik.test.ts'tedir.
function ornekMotor(ek?: (m: FinansMotoru) => void): FinansMotoru {
  const m = finansMotoru(ORNEK_BUGUN);
  m.durum = ornekDurum(m);
  ek?.(m);
  return m;
}

const SIPARISLER: SiparisKalemi[] = [
  { id: 1, siparisNo: 'SA-1', firmaAdi: 'Deneme Tedarik', vade: '2026-10-10', paraBirimi: 'TRY', tutar: '1000', tutarTl: '1000.00' },
  { id: 2, siparisNo: 'SA-2', firmaAdi: 'Deneme Tedarik', vade: '2026-10-23', paraBirimi: 'USD', tutar: '100', tutarTl: '3500.00' },
  { id: 3, siparisNo: 'SA-3', firmaAdi: 'Deneme Tedarik', vade: '2026-12-01', paraBirimi: 'EUR', tutar: '50', tutarTl: null },
  { id: 4, siparisNo: 'SA-4', firmaAdi: 'Deneme Tedarik', vade: '2027-06-01', paraBirimi: 'TRY', tutar: '9000', tutarTl: '9000.00' },
];

describe('yeni finans motoru: bugünkü nakit planı (sabit)', () => {
  it('FNM-01: 13 haftalık plan açık kalemler, çek ve düzenli ödemeyle bugünkü sayıları verir', () => {
    const m = ornekMotor();
    const h = m.forecast().weeks;
    expect(m.cashToday()).toBe(136000);
    expect(h.slice(0, 6).map((w) => [w.inflow, w.outflow])).toEqual([[0, 14400], [0, 0], [60000, 0], [0, 8000], [4850, 0], [0, 0]]);
    expect(h.map((w) => w.close)).toEqual([121600, 121600, 181600, 173600, 178450, 178450, 175450, 167450, 167450, 167450, 164450, 156450, 156450]);
    expect(m.forecast().end).toBe(156450);
  });

  it('FNM-02: sağlık skoru ve alt skorlar bugünkü hesapla aynı kalır', () => {
    const a = ornekMotor().runAnalysis();
    expect(a.score).toBe(94);
    expect(a.subs).toEqual({ likidite: null, nakit: 100, karlilik: 100, verimlilik: expect.closeTo(76.566, 3) as unknown as number, borcluluk: null });
  });

  it('FNM-03: siparişler forecast ve skoru değiştirmez; ayrı plan haftaya düşer, kursuz kalem sayılır, 13 hafta dışı girmez', () => {
    const m = ornekMotor();
    const once = m.forecast().weeks.map((w) => w.close);
    const sp = m.siparisPlani(SIPARISLER);
    expect(m.forecast().weeks.map((w) => w.close)).toEqual(once);
    expect(m.runAnalysis().score).toBe(94);
    expect(sp.weeks.slice(0, 2).map((w) => w.tutar)).toEqual([0, 3500]);
    expect([sp.toplam, sp.kursuz, sp.gecikmis]).toEqual([3500, 1, 1]);
    const dahil = m.siparisDahilKapanis(m.forecast(), sp);
    expect(dahil.map((x, i) => once[i]! - x)).toEqual([0, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500]);
  });

  it('FNM-04: bu hafta penceresi 7 gün içini alır, vadesi geçeni almaz; kursuz kalem adede girer, tutara girmez', () => {
    const m = ornekMotor();
    const liste: SiparisKalemi[] = [
      { vade: '2026-10-10', tutarTl: '1000.00' }, { vade: '2026-10-22', tutarTl: '200.00' }, { vade: '2026-10-22', tutarTl: null }, { vade: '2026-10-23', tutarTl: '5.00' },
    ];
    expect(m.siparisBuHafta(liste)).toEqual({ adet: 2, tutar: 200 });
    expect(m.siparisBuHafta([])).toEqual({ adet: 0, tutar: 0 });
  });

  it('FNM-08: tahmine sunucunun avans düşülmüş tutarı girer; avansla kapanan kalem haftaya ve bu haftaya girmez', () => {
    const m = ornekMotor();
    const liste: SiparisKalemi[] = [
      { id: 1, siparisNo: 'SA-5', firmaAdi: 'Deneme Tedarik', vade: '2026-10-18', tutarTl: '800.00', tahminTl: '300.00' },
      { id: 2, siparisNo: 'SA-6', firmaAdi: 'Deneme Tedarik', vade: '2026-10-19', tutarTl: '400.00', tahminTl: '0.00' },
      { id: 3, siparisNo: 'SA-7', firmaAdi: 'Deneme Tedarik', vade: '2026-10-30', tutarTl: '700.00', tahminTl: null },
    ];
    const sp = m.siparisPlani(liste);
    expect([sp.weeks[0]!.tutar, sp.weeks[0]!.items.length, sp.toplam, sp.kursuz, sp.gecikmis]).toEqual([300, 1, 300, 1, 0]);
    expect(m.siparisBuHafta(liste)).toEqual({ adet: 1, tutar: 300 });
  });
});

describe('yeni finans motoru: "yetersiz veri" etiketi (puan hesabı değişmez)', () => {
  const analiz = (m: FinansMotoru) => {
    const a = m.runAnalysis(true);
    return { score: a.score, yetersiz: a.yetersiz, yetersizNeden: a.yetersizNeden, eksik: Object.values(a.subs).filter((v) => v === null).length };
  };

  it('FNM-05: az kayıt ve boş bilançoda puan aynı kalır, yanında yetersiz veri yazılır', () => {
    const a = analiz(ornekMotor());
    expect(a.score).toBe(94);
    expect(a.yetersiz).toBe(true);
    expect(a.yetersizNeden).toBe('4 kayıt var (en az 20 gerekir); 2 alt skor hesaplanamadı (bilanço eksik olabilir)');
  });

  it('FNM-06: 20 ve üstü kayıt ve dolu bilançoda etiket yok; bilanço boşsa kayıt çok olsa da etiket var', () => {
    const dolu = analiz(ornekMotor((m) => { zenginlestir(m.durum); bilancoDoldur(m.durum); m.degisti(); }));
    expect([dolu.eksik, dolu.yetersiz, dolu.yetersizNeden]).toEqual([0, false, '']);
    expect(dolu.score).not.toBeNull();
    const bos = analiz(ornekMotor((m) => { zenginlestir(m.durum); m.degisti(); }));
    expect([bos.yetersiz, bos.yetersizNeden]).toEqual([true, '2 alt skor hesaplanamadı (bilanço eksik olabilir)']);
  });

  it('FNM-07: puan yoksa etiket de yok', () => {
    const m = finansMotoru(ORNEK_BUGUN);
    m.durum = m.emptyState();
    const a = analiz(m);
    expect([a.score, a.yetersiz]).toEqual([null, false]);
  });
});

describe('yeni finans motoru: örnekler arası yalıtım', () => {
  it('iki motor örneği birbirinin durumunu ve bugününü bozmaz', () => {
    const a = ornekMotor();
    const b = finansMotoru('2026-01-01');
    b.durum = b.emptyState();
    expect(a.cashToday()).toBe(136000);
    expect([a.bugun, b.bugun]).toEqual([ORNEK_BUGUN, '2026-01-01']);
  });

  it('asOf durumu ve bugünü geri yükler, hata olsa da', () => {
    const m = ornekMotor();
    expect(() => m.asOf('2026-05-01', () => { throw new Error('x'); })).toThrow('x');
    expect([m.bugun, m.cashToday()]).toEqual([ORNEK_BUGUN, 136000]);
  });
});
