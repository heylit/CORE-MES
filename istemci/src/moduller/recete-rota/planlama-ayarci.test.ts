import { describe, expect, it } from 'vitest';
import { planlamaMotoru } from './planlama-derle.ts';

// Motorun ayarcı sınırı. Veriler uydurmadır.

type Nesne = Record<string, unknown>;

// Soru 159 b: vardiyası olan ayarcı yoksa ayarcı sınırı uygulanmaz ve motor bunu uyarıyla söyler.
function girdi(personel: Nesne[], kapali: string[] = []): { st: Nesne & { ayarciYok?: boolean; D: { personel: Nesne[] } }; uyari: string[] } {
  const govde = `${planlamaMotoru()}
    return (S) => { const st = stKur(S); const cx = compile(st); return { st: JSON.parse(JSON.stringify(st)), uyari: evaluate({ ops: {}, fail: [], cx }, st, null, false).warn.map(w => w.t) }; };`;
  const kur = new Function(govde)() as (S: Nesne) => ReturnType<typeof girdi>;
  return kur({
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: '1', bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: ['1'] }, tatiller: [],
      urunler: [], malzemeler: [], tezgahlar: [], personel, siparisler: [], ayarlar: {} },
    down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: {}, kapali, olaylar: [],
  });
}

describe('ayarcı sınırı (Soru 159 b)', () => {
  it('vardiyası olan ayarcı yoksa sınır uygulanmaz ve uyarı verilir', () => {
    const r = girdi([{ id: 'A1', ad: 'Ornek ayarci', vardiya: '', gruplar: [], ayar: true }, { id: 'O1', ad: 'Ornek operator', vardiya: '1', gruplar: [], ayar: false }]);
    expect(r.st.ayarciYok).toBe(true);
    expect(r.st.D.personel.filter((p) => p['ayar']).length).toBeGreaterThan(1);
    expect(r.uyari).toContain('Ayarcı');
  });

  it('vardiyası olan ayarcı varsa sınır uygulanır, uyarı yok', () => {
    const r = girdi([{ id: 'A1', ad: 'Ornek ayarci', vardiya: '1', gruplar: [], ayar: true }]);
    expect(r.st.ayarciYok).toBeUndefined();
    expect(r.st.D.personel).toHaveLength(1);
    expect(r.uyari).not.toContain('Ayarcı');
  });

  it('kısıt elle kapalıysa uyarı verilmez (kapalı kısıt zaten bildirilir)', () => {
    const r = girdi([], ['ayarci']);
    expect(r.st.ayarciYok).toBeUndefined();
    expect(r.uyari).not.toContain('Ayarcı');
  });
});
