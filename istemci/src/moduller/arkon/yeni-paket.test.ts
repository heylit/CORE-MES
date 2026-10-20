import { describe, expect, it } from 'vitest';
import { SABLON_ALANLARI, sablonUygula, tmiPaketiMi } from '../../../../arkon/web/src/data/yeni-paket.ts';

// A5 (kart #541): paket dosyası yeni paket açmaz, seçili TMI paketine şablon olarak uygulanır.
describe('Arkon yeni paket ve paket dosyası', () => {
  it('yalnız kanonik TMI emri ve iş emri paketi TMI paketidir', () => {
    for (const id of ['tmi-ue-12', 'tmi-ie-7']) expect(tmiPaketiMi({ id }), id).toBe(true);
    for (const id of ['p-1', 'tmi-ue-0012', 'tmi-pd-3', 'tmi-ue-', 'seed-fln120', 7]) expect(tmiPaketiMi({ id }), String(id)).toBe(false);
    expect(tmiPaketiMi(null)).toBe(false);
  });

  it('şablon yalnız şablon alanlarını yazar; TMI alanları ve kimlik değişmez', () => {
    const paket = { id: 'tmi-ue-12', no: 'UE-000012', partNo: 'P', target: 5, machine: 'AI1', steps: [], note: '' };
    const dosya = { id: 'p-eski', no: 'IE-1', partNo: 'X', target: 999, machine: 'BAŞKA', steps: [{ id: 's1' }], note: 'n', plan: [{ id: 1 }], status: 'published' };
    const sonuc = sablonUygula(paket, dosya, 1000);
    expect(sonuc).toEqual({ ...paket, steps: [{ id: 's1' }], note: 'n', plan: [{ id: 1 }], dirty: true, updatedAt: 1000 });
    expect(paket.steps).toEqual([]);
    expect(SABLON_ALANLARI).not.toContain('status');
  });
});
