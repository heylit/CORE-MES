import { describe, expect, it } from 'vitest';
import { GeriAlYigini, VARSAYILAN_AGIRLIK, VARSAYILAN_PARAMETRE, calismaOku, canliSenaryo, planGuncel } from './durum.ts';

// Belgeler uydurmadır.
const belge = (ek: Record<string, unknown> = {}) => ({
  surum: 2, setId: 'deneme', D: { siparisler: [{ id: 'S1', urun: 'U1', adet: 4, termin: null }], tezgahlar: [{ id: 'M1' }], urunler: [], ozelAlan: 7 },
  dataVer: 5, plan: { dataVer: 5, cubuklar: [] }, senaryolar: [{ id: 'sen1', ad: 'A' }], canli: 'sen1', iz: [], bilinmeyen: { a: 1 }, ...ek,
});

describe('calismaOku', () => {
  it('sürüm 2 belgeyi okur; bilinmeyen alanlar korunur, eksik alanlar sayfanın yeni çalışma değerini alır', () => {
    const c = calismaOku(belge());
    expect(c).not.toBeNull();
    expect(c?.D.siparisler.map((s) => s.id)).toEqual(['S1']);
    expect(c?.D.ozelAlan).toBe(7);
    expect(c?.bilinmeyen).toEqual({ a: 1 });
    expect(c?.w).toEqual(VARSAYILAN_AGIRLIK);
    expect(c?.param).toEqual(VARSAYILAN_PARAMETRE);
    expect(c?.kapali).toEqual([]);
  });

  it('sürüm 2 olmayan ya da verisiz belge okunmaz (null)', () => {
    expect(calismaOku(belge({ surum: 1 }))).toBeNull();
    expect(calismaOku(belge({ D: null }))).toBeNull();
    expect(calismaOku('metin')).toBeNull();
    expect(calismaOku(null)).toBeNull();
  });

  it('kimliksiz satır ve bozuk iz satırı düşer; sayı olmayan sürüm yerine sayfanın başlangıç değeri gelir', () => {
    const c = calismaOku(belge({ D: { siparisler: [{ urun: 'U1' }, { id: 'S2', urun: 'U2', adet: 1, termin: null }], tezgahlar: 'x' }, iz: [{ t: 1, ne: 'a' }, { ne: 'b' }], dataVer: 'x' }));
    expect(c?.D.siparisler.map((s) => s.id)).toEqual(['S2']);
    expect(c?.D.tezgahlar).toEqual([]);
    expect(c?.iz).toHaveLength(1);
    expect(c?.dataVer).toBe(1);
  });

  it('ağırlıkta yalnız belgede olan değer değişir', () => {
    expect(calismaOku(belge({ w: { sure: 3 } }))?.w).toEqual({ ...VARSAYILAN_AGIRLIK, sure: 3 });
  });
});

describe('plan ve senaryo', () => {
  it('plan çözüldüğü veri sürümündeyse günceldir; veri değişince bayattır; plan yoksa güncel değildir', () => {
    const c = calismaOku(belge());
    if (c === null) throw new Error('okunmadı');
    expect(planGuncel(c)).toBe(true);
    expect(planGuncel({ ...c, dataVer: 6 })).toBe(false);
    expect(planGuncel({ ...c, plan: null })).toBe(false);
  });

  it('canlı senaryo kimlikle bulunur; yoksa null', () => {
    const c = calismaOku(belge());
    if (c === null) throw new Error('okunmadı');
    expect(canliSenaryo(c)?.id).toBe('sen1');
    expect(canliSenaryo({ ...c, canli: 'yok' })).toBeNull();
    expect(canliSenaryo({ ...c, canli: null })).toBeNull();
  });
});

describe('GeriAlYigini', () => {
  it('sınırı aşınca en eski düşer; son konan önce alınır; boşta null', () => {
    const y = new GeriAlYigini<number>(2);
    y.koy(1); y.koy(2); y.koy(3);
    expect(y.boy).toBe(2);
    expect(y.al()).toBe(3);
    expect(y.al()).toBe(2);
    expect(y.al()).toBeNull();
  });
});
