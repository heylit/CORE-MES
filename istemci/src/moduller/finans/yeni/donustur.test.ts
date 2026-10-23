import { describe, expect, it } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { prototipYukle } from '../prototip.ts';
import { durumKur, gecerliFaizler, hesapToplamiTl, verileriHazirla } from './donustur.ts';
import { finansMotoru } from './motor.ts';
import { ornekHamVeri } from './ornek-ham-veri.ts';

// Çeviri prototipin tam kip katmanıyla (verileriHazirla + durumKur) aynı motor durumunu kurmalı.
const html = await prototipYukle();
const motorBlogu = html.slice(html.indexOf('/*ENGINE-START*/'), html.indexOf('/*ENGINE-END*/'));
const ceviriBlogu = html.slice(html.indexOf('const KAT = {'), html.indexOf('let yukleniyor = null;'));
const BUGUN = '2026-10-15';

function eskiDurum(): unknown {
  const b = createContext({});
  runInContext(motorBlogu + '\n' + ceviriBlogu, b);
  runInContext(`setToday(${JSON.stringify(BUGUN)}); V = verileriHazirla(${JSON.stringify(ornekHamVeri())}); durumKur();`, b);
  return JSON.parse(runInContext('JSON.stringify({ state, toplam: hesapToplamiTl() })', b) as string);
}

describe('sunucu verisinin motor biçimine çevrilmesi', () => {
  it('prototipin tam kip çevirisiyle aynı durumu ve hesap toplamını verir', () => {
    const m = finansMotoru(BUGUN);
    const V = verileriHazirla(ornekHamVeri(), BUGUN);
    const s = durumKur(V, m);
    expect(JSON.parse(JSON.stringify({ state: s, toplam: hesapToplamiTl(V) }))).toEqual(eskiDurum());
  });

  it('bugünkü nakit hesap toplamına eşittir (FNS-29)', () => {
    const m = finansMotoru(BUGUN);
    const V = verileriHazirla(ornekHamVeri(), BUGUN);
    durumKur(V, m);
    // Kursuz para birimi (GBP) toplama girmez; EUR güncel elle girilen kurla (36,10) çevrilir.
    expect(m.cashToday()).toBeCloseTo(150000 + 2500.5 + 1000 * 36.1, 2);
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
});
