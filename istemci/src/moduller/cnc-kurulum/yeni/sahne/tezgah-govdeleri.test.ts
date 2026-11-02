import { describe, expect, it } from 'vitest';
import { GOVDE_ALANI, KATALOG } from '../veri/tezgah-katalogu.ts';
import { BIRIM, katalogOrani } from './tezgah-govdeleri.ts';

describe('katalog oranı (1893 a)', () => {
  it('gövde tipi ve bilinmeyen anahtar birim orandır', () => {
    expect(katalogOrani('m_vmc')).toEqual(BIRIM);
    expect(katalogOrani('m_yok')).toEqual(BIRIM);
  });

  it('her model için oran 0,75-1,5 aralığında ve sonludur', () => {
    for (const m of KATALOG) {
      const o = katalogOrani(m.anahtar);
      for (const v of [o.x, o.y, o.z]) {
        expect(Number.isFinite(v), m.anahtar).toBe(true);
        expect(v, m.anahtar).toBeGreaterThanOrEqual(0.75);
        expect(v, m.anahtar).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('frezede X kursu ene, Z kursu yüksekliğe, Y kursu derinliğe gider; büyük model uzar', () => {
    const buyuk = KATALOG.find((m) => m.govde === 'm_gk' && m.alan.x > GOVDE_ALANI.m_gk.x);
    expect(buyuk).toBeDefined();
    if (!buyuk) return;
    const o = katalogOrani(buyuk.anahtar);
    expect(o.x).toBeGreaterThan(1);
    expect(o.x).toBeCloseTo(Math.min(1.5, Math.sqrt(buyuk.alan.x / GOVDE_ALANI.m_gk.x)), 6);
    expect(o.y).toBeCloseTo(Math.min(1.5, Math.max(0.75, Math.sqrt(buyuk.alan.z / GOVDE_ALANI.m_gk.z))), 6);
    expect(o.z).toBeCloseTo(Math.min(1.5, Math.max(0.75, Math.sqrt(buyuk.alan.y / GOVDE_ALANI.m_gk.y))), 6);
  });

  it('tornada boy ene, çap yükseklik ve derinliğe gider; Y kursu orana girmez', () => {
    const t = KATALOG.find((m) => m.govde === 'm_lathe' && m.alan.y > 0);
    expect(t).toBeDefined();
    if (!t) return;
    const o = katalogOrani(t.anahtar);
    expect(o.y).toBe(o.z);
    expect(o.x).toBeCloseTo(Math.min(1.5, Math.max(0.75, Math.sqrt(t.alan.z / GOVDE_ALANI.m_lathe.z))), 6);
  });
});
