import { describe, expect, it } from 'vitest';
import { genelGiderOrani, maliyetBaglami, maliyetSistemi, siparisMaliyeti } from './kurallar.ts';
import { ornekCalisma } from './test-verisi.ts';

// 2723: istemci de sunucudaki plan motoru gibi (2718) genel gideri yalnız Finans oranından alır; kayıttaki eski kalem kipi okunmaz, silinmez.
describe('genel gider tek kaynak: Finans oranı (2608, 2668 a)', () => {
  const ms = { kalemler: [{ id: 'K1', ad: 'Kira', tur: 'kira', aylik: 900000, anahtar: 'esit', kapsam: '' }], tez: { T1: { bedel: 1200000, omur: 10 }, T2: { bedel: 600000, omur: 10 } } };

  it('açık ayda kalem kipi kaydı ve tezgâh oranı varken sipariş maliyeti kayıtsız çalışmayla ve kip "tek" ile aynı', () => {
    const kalem = ornekCalisma({ D: { planTL: { genelGider: 100 }, maliyetSis: { ...ms, kip: 'kalem' } } });
    const tek = ornekCalisma({ D: { planTL: { genelGider: 100 }, maliyetSis: { ...ms, kip: 'tek' } } });
    const yok = ornekCalisma({ D: { planTL: { genelGider: 100 } } });
    const bk = maliyetBaglami(kalem), bt = maliyetBaglami(tek), by = maliyetBaglami(yok);
    const s = kalem.D.siparisler[0];
    if (!bk || !bt || !by || !s) throw new Error('bağlam yok');
    expect(bk.G.tez.some((z) => z.oran !== null && Math.abs(z.oran - 100) > 1)).toBe(true);
    expect(genelGiderOrani(kalem.D)).toBe(100);
    const mk = siparisMaliyeti(bk, s);
    expect(mk?.gg ?? 0).toBeGreaterThan(0);
    expect(mk).toEqual(siparisMaliyeti(bt, s));
    expect(mk).toEqual(siparisMaliyeti(by, s));
  });

  it('kayıttaki kip alanı okunmaz, kayıtta kalır', () => {
    const c = ornekCalisma({ D: { maliyetSis: { ...ms, kip: 'kalem' } } });
    expect('kip' in maliyetSistemi(c.D)).toBe(false);
    expect((c.D.maliyetSis as { kip?: unknown }).kip).toBe('kalem');
  });
});
