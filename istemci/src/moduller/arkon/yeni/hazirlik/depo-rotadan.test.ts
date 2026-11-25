import { describe, expect, it } from 'vitest';
import { depoDoldurma, depoElleYama, depoKaynakSatiri, depoOnerisiOku, depoYenidenUygula, eksikDepoKalemleri, istasyonDenetimi } from './kurallar.ts';
import type { DepoKalemi } from './kurallar.ts';

// 3702: boş depo paketi rotadan dolar; kaynak alanı kullanıcının bilerek boşalttığı paketi korur. Kodlar uydurmadır (ORN-).
const K = (id: string, code: string, qty: number): DepoKalemi => ({ id, code, name: 'ORN ad', qty, unit: 'adet', loc: '' });
const ONERI = { kaynak: 'ara', mode: 'receive' as const, items: [K('rota-1', 'ORN-URUN-100', 40)], etiket: 'Rotadan: ara stok (kabul)' };
const paket = (ek: Record<string, unknown> = {}) => ({ id: 'tmi-ie-1', opType: 'depo' as const, status: 'draft' as const, st: {}, target: 40, tmi: { depoOnerisi: ONERI }, ...ek });

describe('depo paketi rotadan dolar', () => {
  it('boş ve kaynaksız depo paketi öneriyle dolar: mod, liste, hedef (kalem sayısı) ve kaynak; yayın denetimi geçer', () => {
    const p = paket();
    const d = depoDoldurma(p, 5)!;
    expect(d.st).toMatchObject({ mode: 'receive' });
    expect((d.st as { items: DepoKalemi[] }).items).toEqual(ONERI.items);
    expect(d.target).toBe(1);
    expect((d as { otoKaynak: unknown }).otoKaynak).toEqual({ depo: { kaynak: 'rota', etiket: ONERI.etiket, at: 5 } });
    const dolu = { ...p, ...d, no: 'N', rev: 'A', partNo: 'P', part: 'Q' } as unknown as Parameters<typeof istasyonDenetimi>[0];
    expect(istasyonDenetimi(dolu).every((x) => x.ok)).toBe(true);
    expect(depoKaynakSatiri({ ...p, ...d } as never)).toEqual({ metin: 'Rotadan: ara stok (kabul)', ton: 'rota' });
  });
  it('dolu liste, elle değişmiş kaynak, şablon kaynağı, eski pakette elle seçilmiş kabul modu ve depo olmayan paket değişmez', () => {
    expect(depoDoldurma(paket({ st: { items: [K('a', 'X', 1)] } }))).toBeNull();
    expect(depoDoldurma(paket({ otoKaynak: { depo: { kaynak: 'el' } } }))).toBeNull();
    expect(depoDoldurma(paket({ otoKaynak: { depo: { kaynak: 'sablon' } } }))).toBeNull();
    expect(depoDoldurma(paket({ otoKaynak: { depo: { kaynak: 'rota' } } }))).toBeNull();
    expect(depoDoldurma(paket({ st: { mode: 'receive', items: [] } }))).toBeNull();
    expect(depoDoldurma(paket({ opType: 'cnc' }))).toBeNull();
    // Risk R2: yayındaki boş paket açılışta dolmaz.
    expect(depoDoldurma(paket({ status: 'published' }))).toBeNull();
  });
  it('rota önerisi yoksa ya da boşsa doldurulmaz ve satır "çıkarılamadı" der; bozuk öneri okunmaz', () => {
    expect(depoDoldurma(paket({ tmi: {} }))).toBeNull();
    expect(depoDoldurma(paket({ tmi: { depoOnerisi: { ...ONERI, items: [] } } }))).toBeNull();
    expect(depoKaynakSatiri(paket({ tmi: {} }) as never)).toEqual({ metin: 'Rotadan çıkarılamadı, elle girin', ton: 'yok' });
    expect(depoOnerisiOku({ tmi: { depoOnerisi: { mode: 'x' } } })).toBeNull();
  });
  it('elle değişince kaynak "el" olur ve rota önerisi satırda kalır; yeniden uygula öneriyi geri yazar', () => {
    const doldu = { ...paket(), ...depoDoldurma(paket(), 1)! };
    const el = { ...doldu, ...depoElleYama(doldu, 2) };
    expect((el as unknown as { otoKaynak: { depo: unknown } }).otoKaynak.depo).toEqual({ kaynak: 'el', etiket: ONERI.etiket, at: 2 });
    expect(depoKaynakSatiri(el as never)).toEqual({ metin: 'Elle değiştirildi', alt: 'rota önerisi: ara stok (kabul)', ton: 'el' });
    expect(depoElleYama(el, 3)).toEqual({});
    const geri = { ...el, st: { mode: 'pick', items: [] }, ...depoYenidenUygula(el, 4)! };
    expect(depoKaynakSatiri(geri as never)?.ton).toBe('rota');
    expect((geri.st as { items: DepoKalemi[] }).items).toEqual(ONERI.items);
  });
  it('şablondan gelen dolu liste "Şablondan" der; kodu ya da miktarı boş kalemler işaretlenir', () => {
    expect(depoKaynakSatiri(paket({ st: { items: [K('a', 'X', 1)] }, otoKaynak: { depo: { kaynak: 'sablon', etiket: 'Şablondan' } } }) as never)).toEqual({ metin: 'Şablondan', ton: 'sablon' });
    expect(eksikDepoKalemleri([K('a', '', 1), K('b', 'Y', 0), K('c', 'Z', 2)])).toEqual(['a', 'b']);
  });
});
