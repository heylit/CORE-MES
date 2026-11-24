import { describe, expect, it } from 'vitest';
import { durumKur, gecerliFaizler, verileriHazirla } from './donustur.ts';
import { finansMotoru, kdvByMonth } from './motor.ts';
import { ornekHamVeri } from './ornek-ham-veri.ts';

const BUGUN = '2026-10-15';

describe('sunucu verisinin motor biçimine çevrilmesi', () => {
  it('bugünkü nakit hesap toplamına eşittir (FNS-29)', () => {
    const m = finansMotoru(BUGUN);
    const V = verileriHazirla(ornekHamVeri(), BUGUN);
    durumKur(V, m);
    // Kursuz para birimi (GBP) toplama girmez; EUR güncel elle girilen kurla (36,10) çevrilir.
    expect(m.cashToday()).toBeCloseTo(150000 + 2500.5 + 1000 * 36.1, 2);
  });

  it('belge parçalarının net ve KDV toplamı belgeninkine kuruşu kuruşuna eşittir (tek KDV kuralı)', () => {
    const m = finansMotoru(BUGUN);
    const V = verileriHazirla(ornekHamVeri(), BUGUN);
    const durum = durumKur(V, m);
    const toplam = new Map<number, { net: number; kdv: number }>();
    for (const t of durum.tx) {
      const id = (t as { _belgeId?: number })._belgeId;
      if (id === undefined || t.np) continue;
      const o = toplam.get(id) ?? { net: 0, kdv: 0 };
      o.net += Math.round(t.amount * 100);
      o.kdv += Math.round((t.kdvTl ?? 0) * 100);
      toplam.set(id, o);
    }
    expect(toplam.size).toBeGreaterThan(0);
    for (const b of V.belgeler) {
      const o = toplam.get(b.id);
      if (!o || b.durum === 'iptal') continue;
      const net = Math.round(Number(b.tutar) * Number(b.kur) * 100), brut = Math.round(Number(b.toplamTl) * 100);
      expect(o.net).toBe(net);
      expect(o.kdv).toBe(brut - net);
    }
  });

  it('güncel kur ileri tarihli girişi almaz; kaydın kendi kuru yalnız elle kur yoksa kullanılır', () => {
    const V = verileriHazirla(ornekHamVeri(), BUGUN);
    expect(V.kurlar['EUR']).toEqual({ tarih: '2026-10-01', kur: 36.1 });
    expect(V.kurlar['USD']).toEqual({ tarih: null, kur: 33 });
  });

  it('aynı güne iki faiz girişinde sonra girilen geçerlidir; ileri tarihli oran bugün geçerli değildir', () => {
    expect(gecerliFaizler(ornekHamVeri().faizler, BUGUN)['TRY']?.id).toBe(2);
  });

  it('aynı adlı iki firma kod ya da kimlikle ayrılır', () => {
    const V = verileriHazirla(ornekHamVeri(), BUGUN);
    expect([V.etiket.get(1), V.etiket.get(3), V.etiket.get(2)]).toEqual(['Deneme Musteri · M1', 'Deneme Musteri · #3', 'Deneme Tedarik']);
  });

  it('iptal belge ve iptal çek motora girmez; dağıtılmamış nakit ödeme avans olarak kâr/zarar dışında kalır', () => {
    const m = finansMotoru(BUGUN);
    const s = durumKur(verileriHazirla(ornekHamVeri(), BUGUN), m);
    expect(s.tx.some((t) => t._belgeId === 6)).toBe(false);
    expect(s.cheques.some((c) => c._cekId === 4)).toBe(false);
    expect(s.tx.find((t) => t.id === 'o4')).toMatchObject({ np: true, amount: 300, status: 'odendi' });
    expect(s.tx.some((t) => t.id === 'o3')).toBe(false);
  });

  it('aylık KDV özeti tevkifatlı alışta toplam KDV\'yi gösterir, tevkif edileni ayrı verir', () => {
    const m = finansMotoru(BUGUN);
    const V = verileriHazirla(ornekHamVeri(), BUGUN);
    const hamBelge = V.belgeler.find((b) => b.yon === 'gider' && b.durum !== 'iptal' && b.tur !== 'acilis' && Number(b.kdvTutari) > 0);
    expect(hamBelge).toBeTruthy();
    if (!hamBelge) return;
    // Kurgu: aynı belge %50 tevkifatlı olsun; sunucu satırında tevkifat KDV'nin yarısı, toplam ona göre düşük.
    const tev = (Number(hamBelge.kdvTutari) / 2).toFixed(2);
    hamBelge.tevkifatTutari = tev;
    hamBelge.toplam = (Number(hamBelge.tutar) + Number(hamBelge.kdvTutari) - Number(tev)).toFixed(2);
    hamBelge.toplamTl = (Number(hamBelge.toplam) * Number(hamBelge.kur)).toFixed(2);
    const durum = durumKur(V, m);
    const parcalar = durum.tx.filter((t) => (t as { _belgeId?: number })._belgeId === hamBelge.id);
    const tevToplam = Math.round(parcalar.reduce((a, t) => a + (t.tevkifatTl ?? 0), 0) * 100);
    expect(tevToplam).toBe(Math.round(Number(tev) * Number(hamBelge.kur) * 100));
    const ay = kdvByMonth(durum.tx).find((x) => x.ym === hamBelge.belgeTarihi.slice(0, 7));
    expect(ay).toBeTruthy();
    expect(Math.round((ay?.tev ?? 0) * 100)).toBeGreaterThanOrEqual(tevToplam);
    // Toplam KDV (indirilecek + tevkif edilen) belgenin tam KDV'sine eşit kısmı içerir; etkin KDV tevkifat düşülmüş kalır.
    const etkin = parcalar.reduce((a, t) => a + Math.round((t.kdvTl ?? 0) * 100), 0);
    expect(etkin + tevToplam).toBe(Math.round(Number(hamBelge.kdvTutari) * Number(hamBelge.kur) * 100));
  });

  it('ödenecek ve devreden beyandaki gibidir (toplam indirilecek, tevkifat ayrı); nakit tahmini toplam çıkışı verir', () => {
    // Hesaplanan 1000, alış KDV'si 180 (tevkifat 126, etkin 54): beyanda ödenecek 820, tevkifat ayrıca 126; nakit çıkışı 946.
    const tx = [
      { type: 'gelir', date: '2026-09-10', kdvTl: 1000 },
      { type: 'gider', date: '2026-09-12', kdvTl: 54, tevkifatTl: 126 },
      { type: 'gider', date: '2026-10-05', kdvTl: 30, tevkifatTl: 70 },
    ] as unknown as Parameters<typeof kdvByMonth>[0];
    const [eylul, ekim] = kdvByMonth(tx);
    expect(eylul).toMatchObject({ h: 1000, i: 54, tev: 126, payable: 820, carryOut: 0, nakit: 946 });
    // Ekim: hesaplanan 0, toplam indirilecek 100 (30 + 70) devreden; tevkifat devredenle mahsup edilmez, nakit çıkışı 70.
    expect(ekim).toMatchObject({ h: 0, payable: 0, carryOut: 100, nakit: 70 });
  });
});
