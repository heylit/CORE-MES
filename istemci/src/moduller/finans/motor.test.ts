import { describe, expect, it } from 'vitest';
import { createContext, runInContext, type Context } from 'node:vm';
import { prototipYukle } from './prototip.ts';

const html = await prototipYukle();

// Prototipin hesap motoru DOM'dan bağımsızdır (ENGINE-START / ENGINE-END): aynı kod burada ayrı bir bağlamda koşar ve
// ekrandaki sayılar ekrana gerek kalmadan sabitlenir. Firma ve kişi adları uydurmadır.
function motor(): Context {
  const bas = html.indexOf('/*ENGINE-START*/');
  const son = html.indexOf('/*ENGINE-END*/');
  const baglam = createContext({});
  runInContext(html.slice(bas, son), baglam);
  return baglam;
}
const kos = <T>(m: Context, kod: string): T => runInContext(kod, m) as T;

// Bugün 15.10.2026; açılış nakdi 100.000; açık bir satış, iki açık alış, bir alınan çek, bir düzenli ödeme ve ödenmiş geçmiş.
const ORNEK = `
  setToday('2026-10-15');
  state = emptyState();
  state.company.openingCash = 100000; state.company.openingDate = '2026-01-01'; state.company.threshold = 20000;
  state.scen.newBiz = false;
  state.tx.push(
    { id: 's1', type: 'gelir', cat: 'Satış', party: 'Deneme Musteri', date: '2026-10-01', due: '2026-10-29', amount: 50000, kdv: 20, status: 'acik' },
    { id: 'a1', type: 'gider', cat: 'Mal / hammadde', party: 'Deneme Tedarik', date: '2026-10-05', due: '2026-10-20', amount: 10000, kdv: 20, status: 'acik' },
    { id: 'a2', type: 'gider', cat: 'Mal / hammadde', party: 'Deneme Tedarik', date: '2026-09-01', due: '2026-10-01', amount: 2000, kdv: 20, status: 'acik' },
    { id: 's0', type: 'gelir', cat: 'Satış', party: 'Deneme Musteri', date: '2026-08-01', due: '2026-08-15', amount: 30000, kdv: 20, status: 'odendi', paidDate: '2026-08-15' },
  );
  state.cheques.push({ id: 'c1', dir: 'alinan', kind: 'Çek', party: 'Deneme Musteri', bank: 'B', no: '1', due: '2026-11-14', amount: 5000, status: 'portfoy' });
  state.recurring.push({ id: 'r1', name: 'Kira', cat: 'Kira', amount: 8000, day: 5 });
`;

const SIPARISLER = JSON.stringify([
  { id: 1, siparisNo: 'SA-1', firmaAdi: 'Deneme Tedarik', vade: '2026-10-10', paraBirimi: 'TRY', tutar: '1000', tutarTl: '1000.00' },
  { id: 2, siparisNo: 'SA-2', firmaAdi: 'Deneme Tedarik', vade: '2026-10-23', paraBirimi: 'USD', tutar: '100', tutarTl: '3500.00' },
  { id: 3, siparisNo: 'SA-3', firmaAdi: 'Deneme Tedarik', vade: '2026-12-01', paraBirimi: 'EUR', tutar: '50', tutarTl: null },
  { id: 4, siparisNo: 'SA-4', firmaAdi: 'Deneme Tedarik', vade: '2027-06-01', paraBirimi: 'TRY', tutar: '9000', tutarTl: '9000.00' },
]);

interface Hafta { i: number; open: number; inflow: number; outflow: number; close: number }
const haftalar = (m: Context): Hafta[] => kos<Hafta[]>(m, 'forecast().weeks.map(w => ({ i: w.i, open: w.open, inflow: w.inflow, outflow: w.outflow, close: w.close }))');

describe('finans motoru: bugünkü nakit planı (sabit)', () => {
  it('FNM-01: 13 haftalık plan açık kalemler, çek ve düzenli ödemeyle bugünkü sayıları verir', () => {
    const m = motor();
    kos(m, ORNEK);
    const h = haftalar(m);
    expect(kos(m, 'cashToday()')).toBe(136000);
    expect(h.slice(0, 6).map((w) => [w.inflow, w.outflow])).toEqual([[0, 14400], [0, 0], [60000, 0], [0, 8000], [4850, 0], [0, 0]]);
    expect(h.map((w) => w.close)).toEqual([121600, 121600, 181600, 173600, 178450, 178450, 175450, 167450, 167450, 167450, 164450, 156450, 156450]);
    expect(kos(m, 'forecast().end')).toBe(156450);
  });

  it('FNM-02: sağlık skoru ve alt skorlar bugünkü hesapla aynı kalır', () => {
    const m = motor();
    kos(m, ORNEK);
    const a = kos<{ score: number | null; subs: Record<string, number | null> }>(m, 'const A = runAnalysis(); ({ score: A.score, subs: A.subs })');
    expect(a.score).toBe(94);
    expect(a.subs).toEqual({ likidite: null, nakit: 100, karlilik: 100, verimlilik: expect.closeTo(76.566, 3) as unknown as number, borcluluk: null });
  });

  it('FNM-03: siparişler forecast ve skoru değiştirmez; ayrı plan haftaya düşer, kursuz kalem sayılır, 13 hafta dışı girmez', () => {
    const m = motor();
    kos(m, ORNEK);
    const once = kos<number[]>(m, 'forecast().weeks.map(w => w.close)');
    const sp = kos<{ weeks: { tutar: number }[]; toplam: number; kursuz: number }>(m, `siparisPlani(${SIPARISLER})`);
    expect(kos<number[]>(m, 'forecast().weeks.map(w => w.close)')).toEqual(once);
    expect(kos(m, 'runAnalysis().score')).toBe(94);
    // B15: vadesi geçen (10.10) tahmine girmez, sayılır; 23.10 ikinci haftaya; EUR kuru yok; 2027 vadesi 13 hafta dışında.
    expect(sp.weeks.slice(0, 2).map((w) => w.tutar)).toEqual([0, 3500]);
    expect([sp.toplam, sp.kursuz, (sp as unknown as { gecikmis: number }).gecikmis]).toEqual([3500, 1, 1]);
    const dahil = kos<number[]>(m, `siparisDahilKapanis(forecast(), siparisPlani(${SIPARISLER}))`);
    expect(dahil.map((x, i) => once[i]! - x)).toEqual([0, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500]);
  });

  it('FNM-04: bu hafta penceresi 7 gün içini alır, vadesi geçeni almaz (B15); kursuz kalem adede girer, tutara girmez', () => {
    const m = motor();
    kos(m, ORNEK);
    const liste = JSON.stringify([
      { vade: '2026-10-10', tutarTl: '1000.00' }, { vade: '2026-10-22', tutarTl: '200.00' }, { vade: '2026-10-22', tutarTl: null }, { vade: '2026-10-23', tutarTl: '5.00' },
    ]);
    expect(kos(m, `siparisBuHafta(${liste})`)).toEqual({ adet: 2, tutar: 200 });
    expect(kos(m, 'siparisBuHafta([])')).toEqual({ adet: 0, tutar: 0 });
  });
});

describe('finans motoru: siparişten beklenen ödemede çift sayım koruması (borç B15)', () => {
  it('FNM-08: tahmine sunucunun avans düşülmüş tutarı girer; avansla kapanan kalem haftaya ve bu haftaya girmez', () => {
    const m = motor();
    kos(m, ORNEK);
    const liste = JSON.stringify([
      { id: 1, siparisNo: 'SA-5', firmaAdi: 'Deneme Tedarik', vade: '2026-10-18', tutarTl: '800.00', tahminTl: '300.00' },
      { id: 2, siparisNo: 'SA-6', firmaAdi: 'Deneme Tedarik', vade: '2026-10-19', tutarTl: '400.00', tahminTl: '0.00' },
      { id: 3, siparisNo: 'SA-7', firmaAdi: 'Deneme Tedarik', vade: '2026-10-30', tutarTl: '700.00', tahminTl: null },
    ]);
    const sp = kos<{ weeks: { tutar: number; items: unknown[] }[]; toplam: number; kursuz: number; gecikmis: number }>(m, `siparisPlani(${liste})`);
    expect([sp.weeks[0]!.tutar, sp.weeks[0]!.items.length, sp.toplam, sp.kursuz, sp.gecikmis]).toEqual([300, 1, 300, 1, 0]);
    expect(kos(m, `siparisBuHafta(${liste})`)).toEqual({ adet: 1, tutar: 300 });
  });
});

// Son 12 ayda her ay bir satış ve bir alış (24 ödenmiş kayıt); bilanço doluysa bütün alt skorlar hesaplanır.
const ZENGIN = `
  for (let i = 1; i <= 12; i++) {
    const ay = addDays('2026-10-15', -30 * i);
    state.tx.push({ id: 'zs' + i, type: 'gelir', cat: 'Satış', party: 'Deneme Musteri', date: ay, due: addDays(ay, 30), amount: 40000, kdv: 20, status: 'odendi', paidDate: addDays(ay, 30) });
    state.tx.push({ id: 'za' + i, type: 'gider', cat: 'Mal / hammadde', party: 'Deneme Tedarik', date: ay, due: addDays(ay, 20), amount: 25000, kdv: 20, status: 'odendi', paidDate: addDays(ay, 20) });
  }
`;
const BILANCO = `state.balance = { ...state.balance, donen: 400000, stok: 100000, kvb: 200000, toplamBorc: 250000, ozkaynak: 500000 };`;

describe('finans motoru: "yetersiz veri" etiketi (puan hesabı değişmez)', () => {
  interface Analiz { score: number | null; yetersiz: boolean; yetersizNeden: string; eksik: number }
  const analiz = (m: Context): Analiz => kos<Analiz>(m, `(() => { const A = runAnalysis(true);
    return { score: A.score, yetersiz: A.yetersiz, yetersizNeden: A.yetersizNeden, eksik: Object.values(A.subs).filter(v => v === null).length }; })()`);

  it('FNM-05: az kayıt ve boş bilançoda puan aynı kalır, yanında yetersiz veri yazılır', () => {
    const m = motor();
    kos(m, ORNEK);
    const a = analiz(m);
    expect(a.score).toBe(94);
    expect(a.yetersiz).toBe(true);
    expect(a.yetersizNeden).toBe('4 kayıt var (en az 20 gerekir); 2 alt skor hesaplanamadı (bilanço eksik olabilir)');
  });

  it('FNM-06: 20 ve üstü kayıt ve dolu bilançoda etiket yok; bilanço boşsa kayıt çok olsa da etiket var', () => {
    const m = motor();
    kos(m, ORNEK + ZENGIN + BILANCO);
    const dolu = analiz(m);
    expect([dolu.eksik, dolu.yetersiz, dolu.yetersizNeden]).toEqual([0, false, '']);
    expect(dolu.score).not.toBeNull();
    const b = motor();
    kos(b, ORNEK + ZENGIN);
    const bos = analiz(b);
    expect([bos.yetersiz, bos.yetersizNeden]).toEqual([true, '2 alt skor hesaplanamadı (bilanço eksik olabilir)']);
  });

  it('FNM-07: puan yoksa etiket de yok', () => {
    const m = motor();
    kos(m, "setToday('2026-10-15'); state = emptyState();");
    const a = analiz(m);
    expect([a.score, a.yetersiz]).toEqual([null, false]);
  });
});
