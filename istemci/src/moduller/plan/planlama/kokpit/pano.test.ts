import { describe, expect, it } from 'vitest';
import { ornekCalisma } from '../motor/ornek.ts';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import { adimSayimlari, ilerlemeOzeti, komsuOzeti, tahminCumlesi, tasimaTahmini } from './pano.ts';

// 3663: adım panosunun saf kuralları. Örnek veri uydurmadır.
const is = (id: string, m: string, S: number, C: number, ek: Partial<KokpitIsi> = {}): KokpitIsi => ({ id, job: id.split('.')[0] ?? id, ad: id, m, S, C, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const emir = (ek: Partial<KokpitEmri>): KokpitEmri => ({ id: 'E', no: 'ORN-E', urun: 'Deneme', adet: 500, termin: null, bitis: null, durum: 'iyi', gecikme: null, adimlar: [], ...ek });
const model = (isler: KokpitIsi[], emirler: KokpitEmri[], simdi = 0): KokpitModeli => ({
  simdi, tezgahlar: [{ id: 'T1', kod: 'T1', ad: '', fason: false }, { id: 'T2', kod: 'T2', ad: '', fason: false }, { id: 'T3', kod: 'T3', ad: '', fason: false }],
  isler: Object.fromEntries(isler.map((x) => [x.id, x])), emirler, bas: 0, son: 336, acik: {}, durus: {},
});
const saat = (t: number): string => `${String(Math.floor(t)).padStart(2, '0')}:00`;

describe('ilerleme özeti', () => {
  it('süren adımda sayım ve plana göre yön yazılır; sayım yoksa yalnız plana göre, sıfır uydurulmaz', () => {
    const x = is('E.10', 'T1', 0, 10, { basladi: true });
    // 4 saat geçti: plana göre %40; sayım 312/500 = %62 (önde).
    expect(ilerlemeOzeti(x, 500, { say: 312, bitti: false }, 4)).toMatchObject({ yazi: '312 / 500 adet · %62', plan: 'plana göre %40 · 22 puan önde' });
    expect(ilerlemeOzeti(x, 500, { say: 100, bitti: false }, 4).plan).toBe('plana göre %40 · 20 puan geride');
    const yok = ilerlemeOzeti(x, 500, undefined, 4);
    expect(yok).toMatchObject({ oran: null, yazi: 'Sürüyor · sayım bilgisi yok', plan: 'plana göre %40' });
  });
  it('başlamamış adım "Başlamadı", biten adım "Bitti"', () => {
    expect(ilerlemeOzeti(is('E.20', 'T1', 0, 10), 500, undefined, 4)).toMatchObject({ oran: null, yazi: 'Başlamadı', plan: null });
    expect(ilerlemeOzeti(is('E.20', 'T1', 0, 10, { bitti: true }), 500, { say: 498, bitti: true }, 20)).toMatchObject({ oran: 1, yazi: 'Bitti · 498 / 500 adet' });
  });
});

describe('adım sayımları', () => {
  it('kök emirde süren adımın sayacı ve biten adımın değeri adım kimliğine eşlenir; düğümlü emir okunmaz', () => {
    const c = ornekCalisma();
    const s = c.D.siparisler[0]!, rota = c.D.urunler.find((u) => u.id === s.urun)!.rota!;
    const y = adimSayimlari(c, { opProg: { [`${s.id}|root|2`]: 312 }, opSaglam: { [`${s.id}|root|1`]: 500 } });
    expect(y[`${s.id}.${rota[0]!.k}`]).toEqual({ say: 500, bitti: true });
    expect(y[`${s.id}.${rota[1]!.k}`]).toEqual({ say: 312, bitti: false });
    const d = ornekCalisma(); d.D.siparisler = d.D.siparisler.map((x, i) => (i === 0 ? { ...x, dugum: {} } : x));
    expect(adimSayimlari(d, { opProg: { [`${d.D.siparisler[0]!.id}|root|2`]: 5 } })).toEqual({});
    expect(adimSayimlari(c, null)).toEqual({});
  });
});

describe('komşu adımlar ve taşıma tahmini', () => {
  const adimlar = [{ id: 'E.10', ad: 'Tornalama', adaylar: ['T1'] }, { id: 'E.20', ad: 'Freze', adaylar: ['T1', 'T2'] }, { id: 'E.30', ad: 'Taşlama', adaylar: ['T3'], onculler: [['E.20', 'b'] as const] }];
  const e = emir({ adimlar: [{ ...adimlar[0]!, }, { ...adimlar[1]!, onculler: [['E.10', 'b'] as const] }, adimlar[2]!], termin: 26, bitis: 25 });
  const m = model([is('E.10', 'T1', 6, 12), is('E.20', 'T1', 13, 19), is('E.30', 'T3', 20, 25), is('D.20', 'T2', 17, 24)], [e], 10);
  it('önceki, sonraki adım ve termin payı', () => {
    expect(komsuOzeti(m, e, 'E.20')).toEqual({ once: { ad: 'Tornalama', bitis: 12 }, sonra: { ad: 'Taşlama', baslangic: 20 }, pay: 1 });
    expect(komsuOzeti(m, e, 'E.10')).toMatchObject({ once: null });
  });
  it('hedef tezgâhta çakışan iş itilir, sonraki adım kayar ve termin kaçar; cümle bunları yazar', () => {
    const t = tasimaTahmini(m, e, m.isler['E.20']!, 'T2', 16, saat);
    expect([t.yeniS, t.yeniC, t.itilen, t.enBuyukKayma, t.ardilKayma, t.bitis, t.terminPayi, t.ihlal]).toEqual([16, 22, 1, 5, 2, 27, -1, null]);
    expect(tahminCumlesi(t)).toBe('aynı tezgâhta 1 iş arkaya itilir · sonraki adım 2 sa kayar · emir termini 1 sa kaçırır');
  });
  it('öncül bitmeden başlayan yer ihlaldir, neden yazılır; çakışma yoksa cümle yalnız termin payıdır', () => {
    const t = tasimaTahmini(m, e, m.isler['E.20']!, 'T2', 10, saat);
    expect(t.ihlal).toBe("Önceki adım (Tornalama) 12:00'de bitiyor; bu adım ondan önce başlayamaz.");
    const iyi = tasimaTahmini(m, e, m.isler['E.20']!, 'T1', 14, saat);
    expect([iyi.itilen, iyi.ihlal]).toEqual([0, null]);
  });
  it('başlamış iş itilmez', () => {
    const m2 = model([is('E.10', 'T1', 6, 12), is('E.20', 'T1', 13, 19), is('D.20', 'T2', 17, 24, { basladi: true })], [e], 18);
    expect(tasimaTahmini(m2, e, m2.isler['E.20']!, 'T2', 16, saat).itilen).toBe(0);
  });
});
