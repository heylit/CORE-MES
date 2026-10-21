import { describe, expect, it } from 'vitest';
import { IKINCI_MENU_TANIMLARI } from '../../ortak/rota/ikinci-menu.ts';
import { ORTAK_STIL_YERI, PARCA_SIRASI, SIMGE_YERI, planlamaSayfasi, sayfaGuncelMi } from './planlama-derle.ts';
import { ONERILEN_IKINCI_MENU, PLANLAMA_ANAHTARLARI, PLANLAMA_ISLEMI, planlamaYoluMu } from './planlama-menusu.ts';
import { planlamaSayfasiKur } from './planlama-sayfasi.ts';
import { rotalar } from './rotalar.tsx';

describe('planlama çerçevesinin sayfası', () => {
  const sayfa = planlamaSayfasi();

  it('depodaki sayfa kaynaklardan yeniden kurulanla aynıdır (kaynak değişince: node istemci/src/moduller/recete-rota/planlama-derle.ts)', () => {
    expect(sayfaGuncelMi()).toBe(true);
  });

  it('her parça bir kez ve sırasıyla girer; TMI parçası açılıştan (05-olaylar) öncedir', () => {
    const adlar = PARCA_SIRASI.filter((p): p is string => p !== null);
    expect(new Set(adlar).size).toBe(adlar.length);
    expect(adlar.indexOf('zz31-tmi')).toBeLessThan(adlar.indexOf('05-olaylar'));
    expect(adlar.indexOf('zz31-tmi')).toBeGreaterThan(adlar.indexOf('zz28-rr-canli'));
  });

  it('örnek veri, HiGHS ve iç içe Reçete ve Rota yoktur; dışarıdan hiçbir şey yüklenmez', () => {
    expect(sayfa).toContain('const VERI = {};');
    expect(sayfa).toContain("const RR_HTML = '';");
    expect(sayfa).not.toContain('id="highs-js"');
    expect(sayfa).not.toContain('id="highs-wasm"');
    expect(sayfa).not.toMatch(/<script[^>]+src=/i);
    expect(sayfa).not.toMatch(/<link\b/i);
    expect(sayfa).not.toMatch(/@import/);
    expect(sayfa).not.toMatch(/sourceMappingURL/);
  });

  it('dışarıdan kütüphane gömülmez; tur, konumlama ve sürükleme kendi araçlarımızdır (362 a)', () => {
    expect(sayfa).not.toMatch(/driver\.js|floating-ui|interact\.js|SortableJS|@license/i);
    for (const ad of ['function pmKonumla(', 'function pmSurukle(', 'function pmSirala(', 'function pmTur(']) expect(sayfa).toContain(ad);
  });

  it('ortak stil ve simgeler kabukta konur: yer tutucular birer kez vardır, kurulunca kalmaz', () => {
    expect(sayfa.split(ORTAK_STIL_YERI)).toHaveLength(2);
    expect(sayfa.split(SIMGE_YERI)).toHaveLength(2);
    const kurulu = planlamaSayfasiKur(sayfa);
    expect(kurulu).not.toContain(ORTAK_STIL_YERI);
    expect(kurulu).not.toContain(SIMGE_YERI);
    expect(kurulu).toContain('const IC = {');
    expect(kurulu).toContain('const DOLGU = new Set([');
    expect(() => planlamaSayfasiKur('<html></html>')).toThrow();
  });

  it('TMI içinde durum Reçete ve Rota önekli anahtardadır; denemede eski anahtar', () => {
    expect(sayfa).toContain("const ANAHTAR = typeof window.tmi === 'object' && window.tmi !== null ? 'recete-rota-motoru-v1:planlama' : 'tmi-planlama-modulu-v3';");
  });
});

describe('planlama menüsü', () => {
  it('planlama yolları planlama çerçevesine, öteki yollar Reçete ve Rota çerçevesine gider', () => {
    expect(planlamaYoluMu('/recete-rota/plan')).toBe(true);
    expect(planlamaYoluMu('/recete-rota/terminler')).toBe(true);
    expect(planlamaYoluMu('/recete-rota/studio/x')).toBe(true);
    expect(planlamaYoluMu('/recete-rota')).toBe(false);
    expect(planlamaYoluMu('/recete-rota/schema')).toBe(false);
    expect(planlamaYoluMu('/recete-rota/planx')).toBe(false);
  });

  it('önerilen ve bugünkü ikinci menünün her maddesinin rotası vardır', () => {
    const yollar = new Set(rotalar.map((r) => r.yol));
    const bugunku = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/recete-rota');
    expect(bugunku).toBeDefined();
    for (const menu of [ONERILEN_IKINCI_MENU, ...(bugunku ? [bugunku] : [])]) {
      for (const g of menu.gruplar) for (const m of g.maddeler) expect(yollar.has(m.yol), m.yol).toBe(true);
    }
    for (const a of PLANLAMA_ANAHTARLARI) expect(yollar.has(`/recete-rota/${a}`)).toBe(true);
  });

  it('önerilen menü çekirdekteki menüyle aynıdır; planlama maddeleri yalnız planlama işlemini ister (353 a)', () => {
    expect(IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/recete-rota')).toEqual(ONERILEN_IKINCI_MENU);
    const maddeler: ReadonlyArray<{ anahtar: string; islem: string }> = ONERILEN_IKINCI_MENU.gruplar.flatMap((g) => [...g.maddeler]);
    const planlama = maddeler.filter((m) => m.islem === PLANLAMA_ISLEMI);
    expect(planlama.map((m) => m.anahtar)).toEqual(PLANLAMA_ANAHTARLARI.filter((a) => a !== 'kanban'));
  });
});
