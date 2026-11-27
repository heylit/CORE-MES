import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { gorunenKilitKaydi, isAdi, kilitKaydi, KilitKaydiSatiri } from './KilitKaydi.tsx';
import type { KokpitIsi, KokpitModeli } from './kurallar.ts';

// 3793-2 (madde 7, a): bırakılan adım yerinde kalan işin arkasına alındıysa Kokpit bunu söyler. Veriler uydurmadır.
afterEach(() => { cleanup(); });
const is = (id: string, job: string, m: string, S: number, C: number, ek: Partial<KokpitIsi> = {}): KokpitIsi =>
  ({ id, job, ad: 'Torna', m, S, C, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const model = (isler: KokpitIsi[]): Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar'> => ({
  isler: Object.fromEntries(isler.map((i) => [i.id, i])),
  emirler: [{ id: 'J7', no: 'ORN-E-7' }, { id: 'J9', no: 'ORN-E-9' }] as unknown as KokpitModeli['emirler'],
  tezgahlar: [{ id: 'M2', kod: 'CNC-002', ad: 'Deneme tezgah', fason: false }],
});

describe('Kokpit: kilit yerinde kalan işin arkasına alındı (3793-2)', () => {
  it('istenen saatte sahada süren işle üst üste gelen adım onun bitişine kaydıysa çakışan işi, nedeni ve yeni saati verir', () => {
    const m = model([is('J7.20', 'J7', 'M2', 10, 40, { basladi: true }), is('J9.50', 'J9', 'M2', 40, 44, { kilitli: true })]);
    expect(kilitKaydi(m, 'J9.50', 20)).toEqual({ isId: 'J9.50', engel: 'J7.20', S: 40, neden: 'sahada süren' });
    expect(isAdi(m, 'J7.20')).toBe('ORN-E-7 OP 20');
  });
  it('kilitli işin arkasına alındıysa nedeni kilitli; bitmiş başlamış iş sahada süren sayılmaz', () => {
    expect(kilitKaydi(model([is('J7.20', 'J7', 'M2', 10, 40, { kilitli: true }), is('J9.50', 'J9', 'M2', 40, 44)]), 'J9.50', 20)?.neden).toBe('kilitli');
    expect(kilitKaydi(model([is('J7.20', 'J7', 'M2', 10, 40, { basladi: true, bitti: true }), is('J9.50', 'J9', 'M2', 40, 44)]), 'J9.50', 20)?.neden).toBe('yerinde kalan');
  });
  it('istenen saatte kaldıysa, başka tezgâhtaki iş ya da yerinde kalmayan iş yüzünden kaydıysa bilgi yok', () => {
    expect(kilitKaydi(model([is('J7.20', 'J7', 'M2', 10, 40, { basladi: true }), is('J9.50', 'J9', 'M2', 20, 24)]), 'J9.50', 20)).toBeNull();
    expect(kilitKaydi(model([is('J7.20', 'J7', 'M1', 10, 40, { basladi: true }), is('J9.50', 'J9', 'M2', 40, 44)]), 'J9.50', 20)).toBeNull();
    expect(kilitKaydi(model([is('J7.20', 'J7', 'M2', 10, 40), is('J9.50', 'J9', 'M2', 40, 44)]), 'J9.50', 20)).toBeNull();
    expect(kilitKaydi(model([is('J9.50', 'J9', 'M2', 40, 44)]), 'yok', 20)).toBeNull();
  });
  it('3804 K2: yeni saatten sonra biten iş engel sayılmaz (adım onun bitişine kaymış olamaz)', () => {
    expect(kilitKaydi(model([is('J7.30', 'J7', 'M2', 15, 50, { basladi: true }), is('J9.50', 'J9', 'M2', 40, 44)]), 'J9.50', 20)).toBeNull();
    const m = model([is('J7.20', 'J7', 'M2', 10, 40, { basladi: true }), is('J7.30', 'J7', 'M2', 15, 50, { kilitli: true }), is('J9.50', 'J9', 'M2', 40, 44)]);
    expect(kilitKaydi(m, 'J9.50', 20)?.engel).toBe('J7.20');
  });
  it('3804 K5: birden çok engelde en geç biten engel sayılır (adım onun bitişine oturdu)', () => {
    const m = model([is('J7.20', 'J7', 'M2', 10, 30, { basladi: true }), is('J7.30', 'J7', 'M2', 22, 40, { kilitli: true }), is('J9.50', 'J9', 'M2', 40, 44)]);
    expect(kilitKaydi(m, 'J9.50', 20)).toEqual({ isId: 'J9.50', engel: 'J7.30', S: 40, neden: 'kilitli' });
    const ters = model([is('J7.30', 'J7', 'M2', 22, 40, { kilitli: true }), is('J7.20', 'J7', 'M2', 10, 30, { basladi: true }), is('J9.50', 'J9', 'M2', 40, 44)]);
    expect(kilitKaydi(ters, 'J9.50', 20)?.engel).toBe('J7.30');
  });
  it('3804 K6: satır yalnız taşıma son değişiklikken ve Kokpit meşgul değilken görünür', () => {
    const m = model([is('J7.20', 'J7', 'M2', 10, 40, { basladi: true }), is('J9.50', 'J9', 'M2', 40, 44, { kilitli: true })]);
    const son = { isId: 'J9.50', istenen: 20, onceki: 3 };
    expect(gorunenKilitKaydi(m, son, 4, false)?.engel).toBe('J7.20');
    expect(gorunenKilitKaydi(m, son, 5, false)).toBeNull();
    expect(gorunenKilitKaydi(m, son, 3, false)).toBeNull();
    expect(gorunenKilitKaydi(m, son, 4, true)).toBeNull();
    expect(gorunenKilitKaydi(m, null, 4, false)).toBeNull();
  });
  it('satır çakışan işi, tezgâhı ve yeni saati yazar; Tamam, Kilidi kaldır ve Geri al kendi işini yapar; yetki yoksa Kilidi kaldır yok', () => {
    const m = model([is('J7.20', 'J7', 'M2', 10, 40, { basladi: true }), is('J9.50', 'J9', 'M2', 40, 44, { kilitli: true })]);
    const k = kilitKaydi(m, 'J9.50', 20)!;
    const [tamam, kaldir, geri] = [vi.fn(), vi.fn(), vi.fn()];
    render(<KilitKaydiSatiri k={k} m={m} zaman={(t) => `S${String(t)}`} tamam={tamam} kilidiKaldir={kaldir} geriAl={geri} />);
    expect(screen.getByRole('status').textContent).toContain('ORN-E-9 OP 50 bırakılan saatte CNC-002 üzerinde sahada süren ORN-E-7 OP 20 ile üst üste geliyordu; onun bitişine, S40 saatine alındı ve orada kilitli.');
    fireEvent.click(screen.getByRole('button', { name: 'Tamam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kilidi kaldır' }));
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    expect([tamam, kaldir, geri].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    cleanup();
    render(<KilitKaydiSatiri k={k} m={m} zaman={String} tamam={tamam} kilidiKaldir={null} geriAl={null} />);
    expect(screen.queryByRole('button', { name: 'Kilidi kaldır' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Geri al' })).toBeNull();
  });
});
