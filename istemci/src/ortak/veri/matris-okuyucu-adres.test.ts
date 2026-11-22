import { describe, expect, it, vi } from 'vitest';

// Kırmızı çizgi: dış adres yok. Paketin varsayılanı wasm'ı CDN'den (jsdelivr) ister; okuyucu adresi her zaman kendi kökeninden verir.
const hazirla = vi.fn();
vi.mock('zxing-wasm/reader', () => ({ prepareZXingModule: (...a: unknown[]) => hazirla(...a), readBarcodes: () => Promise.resolve([]) }));
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({ default: '/assets/zxing_reader-ORN12345.wasm' }));

describe('matris-okuyucu wasm adresi', () => {
  it('wasm dosyası uygulamanın kendi kökeninden istenir, CDN adresi kullanılmaz', async () => {
    const { matrisOku } = await import('./matris-okuyucu.ts');
    await matrisOku({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
    const { overrides } = hazirla.mock.calls[0]![0] as { overrides: { locateFile: (yol: string, onek: string) => string } };
    const cdn = 'https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.7/dist/reader/';
    expect(overrides.locateFile('zxing_reader.wasm', cdn)).toBe('/assets/zxing_reader-ORN12345.wasm');
    expect(overrides.locateFile('zxing_reader.wasm', cdn)).not.toContain('http');
  });
});
