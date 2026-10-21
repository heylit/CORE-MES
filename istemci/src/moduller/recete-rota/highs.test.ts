import { afterEach, describe, expect, it, vi } from 'vitest';
import { highsYukle, klasikBetik } from './highs.ts';

afterEach(() => { vi.unstubAllGlobals(); });

describe('HiGHS kaynağı (361 b)', () => {
  it('ES modülü klasik betiğe çevrilir; beklenmeyen biçim reddedilir (paket sürümü değişirse gürültüyle bozulur)', () => {
    expect(klasikBetik('async function Module(){return new URL("a",import.meta.url)}export default Module;\n'))
      .toBe('async function Module(){return new URL("a",self.location.href)}');
    for (const kotu of ['async function Module(){}', 'export default Module;async function Module(){}export default Module;', 'import x from "y";\nasync function Module(){}export default Module;', 'const u=import.meta.dirname;export default Module;']) {
      expect(() => klasikBetik(kotu)).toThrow('HiGHS betiği beklenen biçimde değil.');
    }
  });

  it('paketin betiği klasik biçimde ve wasm adresi okunur, ikili bir kez indirilir; başarısız indirme önbellekte kalmaz', async () => {
    const adresler: string[] = [];
    let durum = 500;
    vi.stubGlobal('fetch', (adres: string) => {
      adresler.push(adres);
      return Promise.resolve(new Response(new Uint8Array([0, 97, 115, 109]), { status: durum }));
    });
    await expect(highsYukle()).rejects.toThrow('HiGHS yüklenemedi.');
    durum = 200;
    const k = await highsYukle();
    expect(k.betik).toContain('async function Module(');
    expect(k.betik).toContain('createModel');
    expect(k.betik).not.toMatch(/export default|import\.meta/);
    expect(k.wasm.byteLength).toBe(4);
    expect(await highsYukle()).toBe(k);
    expect(adresler).toHaveLength(2);
    expect(adresler[1]).toMatch(/highs\.wasm/);
  });
});
