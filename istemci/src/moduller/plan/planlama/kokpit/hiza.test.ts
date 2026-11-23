import { describe, expect, it } from 'vitest';
import { HIZA_CIK, HIZA_GORUNUR, HIZA_YAKALA, hizaCizgileri, hizaNoktalari, hizalaYakala } from './hiza.ts';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';

const is = (id: string, m: string, S: number, C: number, ek: Partial<KokpitIsi> = {}): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: `Adım ${id}`, m, S, C, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const emir = (id: string, adimlar: string[]): KokpitEmri => ({
  id, no: `ORN-${id}`, urun: 'Deneme', adet: 1, termin: 100, bitis: null, durum: 'iyi', gecikme: null, adimlar: adimlar.map((a) => ({ id: a, ad: a, adaylar: ['T1'] })),
});
const model = (emirler: KokpitEmri[], isler: KokpitIsi[], simdi = 0): KokpitModeli => ({
  simdi, bas: 0, son: 24 * 14, emirler, isler: Object.fromEntries(isler.map((x) => [x.id, x])), acik: {}, durus: {},
  tezgahlar: [{ id: 'T1', kod: 'T-01', ad: 'Torna', fason: false }, { id: 'T2', kod: 'T-02', ad: 'Freze', fason: false }],
});
// 1 saat 10 px.
const PX = 10;

describe('Gantt hiza yakalama (3602)', () => {
  const m = model(
    [emir('1', ['1.1', '1.2', '1.3']), emir('2', ['2.1'])],
    [is('1.1', 'T1', 8, 10), is('1.2', 'T2', 20, 24), is('1.3', 'T1', 40, 44), is('2.1', 'T1', 12, 14), is('9.1', 'T2', 60, 70), is('3.1', 'T1', 100, 102, { bitti: true })],
    5,
  );

  it('referanslar: hedef tezgâhın öteki adımları, emrin önceki bitişi ve sonraki başlangıcı, şimdi; biten ve başka satır yok', () => {
    const l = hizaNoktalari(m, '1.2', 'T1', true);
    const saatler = l.map((n) => `${n.tur}:${n.ad}:${String(n.saat)}`);
    expect(saatler).toContain('bas:Adım 1.1:8');
    expect(saatler).toContain('bit:Adım 2.1:14');
    expect(saatler).toContain('bit:Adım 1.1:10');
    expect(saatler).toContain('bas:Adım 1.3:40');
    expect(saatler).toContain('simdi:Şimdi:5');
    expect(saatler.some((s) => s.includes('9.1') || s.includes('3.1'))).toBe(false);
    expect(l.some((n) => n.ad === 'Adım 1.2')).toBe(false);
  });
  it('emir görünümünde yalnız aynı emrin adımları sayılır', () => {
    const l = hizaNoktalari(m, '1.2', '1', false);
    expect(l.filter((n) => n.tur !== 'simdi').map((n) => n.ad)).toEqual(['Adım 1.1', 'Adım 1.1', 'Adım 1.3', 'Adım 1.3']);
  });
  it('çoklu seçimin öteki işleri referans olmaz', () => {
    const l = hizaNoktalari(m, '1.2', 'T1', true, new Set(['1.1']));
    expect(l.some((n) => n.ad === 'Adım 1.1')).toBe(false);
  });

  const noktalar = [{ saat: 30, ad: 'A', tur: 'bit' as const }];
  it('8 px içinde yakalar; başlangıç kenarı referansa oturur', () => {
    const r = hizalaYakala(30.5, 4, noktalar, PX, null);
    expect(r.yakalanan).toEqual({ saat: 30, kenar: 'bas' });
    expect(r.S).toBe(30);
  });
  it('bitiş kenarı da yakalar: S süre kadar geriye oturur', () => {
    const r = hizalaYakala(26.3, 4, noktalar, PX, null);
    expect(r.yakalanan).toEqual({ saat: 30, kenar: 'bit' });
    expect(r.S).toBe(26);
  });
  it('8 px dışında dokunmaz', () => {
    const r = hizalaYakala(31, 4, [{ saat: 30, ad: 'A', tur: 'bit' }], PX, null);
    expect(r.yakalanan).toBeNull();
    expect(r.S).toBe(31);
  });
  it('yakalandıktan sonra 12 px içinde bırakmaz, dışında bırakır (histerezis)', () => {
    const y = { saat: 30, kenar: 'bas' as const };
    expect(hizalaYakala(31.1, 4, noktalar, PX, y).yakalanan).toEqual(y);
    expect(HIZA_CIK).toBeGreaterThan(HIZA_YAKALA);
    const r = hizalaYakala(31.3, 4, noktalar, PX, y);
    expect(r.yakalanan).toBeNull();
    expect(r.S).toBe(31.3);
  });
  it('eşik ekran pikselidir: ölçek büyüyünce aynı saat farkı yakalamaz', () => {
    expect(hizalaYakala(30.5, 4, noktalar, 40, null).yakalanan).toBeNull();
    expect(hizalaYakala(30.15, 4, noktalar, 40, null).yakalanan).not.toBeNull();
  });
  it('çizgiler: 24 px içindeki en yakın referans, kenar başına bir; hizalı yalnız tam üstündeyken', () => {
    const n = [{ saat: 30, ad: 'A', tur: 'bit' as const }, { saat: 34, ad: 'B', tur: 'bas' as const }, { saat: 90, ad: 'Uzak', tur: 'bas' as const }];
    const l = hizaCizgileri(30, 4, n, PX);
    expect(l).toEqual([{ kenar: 'bas', saat: 30, ad: 'A', hizali: true }, { kenar: 'bit', saat: 34, ad: 'B', hizali: true }]);
    const y = hizaCizgileri(31, 4, n, PX);
    expect(y.map((c) => c.hizali)).toEqual([false, false]);
    expect(hizaCizgileri(30 + HIZA_GORUNUR / PX + 0.5, 1, [{ saat: 30, ad: 'A', tur: 'bit' }], PX)).toEqual([]);
  });
});
