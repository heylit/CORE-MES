import { describe, expect, it, vi } from 'vitest';

interface Gorev { promise: Promise<unknown>; onPassword?: unknown; destroy(): void }

// CVE-2024-4367 (pdfjs-dist <= 4.1.392) için kaynağın önerdiği önlem `isEvalSupported: false` (GHSA-wgrm-67xf-hhpq). Arkon 6.3.289 kullanır,
// orada eval yolu yoktur; seçenek ikinci katman olarak korunur. Betik çalıştıran özellik (enableScripting, CVE-2026-16633) açılmaz.
vi.mock('../../../../arkon/web/src/app/temel.ts', () => ({ perf: () => {} }));
const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn((_secenek: unknown): Gorev => ({ promise: Promise.resolve({ numPages: 1 }), destroy: () => {} })) }));
vi.mock('../../../../arkon/web/src/app/yukleyici.ts', () => ({
  FILES: { pdfjs: { path: 'vendor/pdfjs/pdf.min.js' } },
  LS: { get: () => null, set: () => {} },
  loadModule: async (id: string) => (id === 'pdfjs' ? { getDocument } : {}),
}));
vi.mock('../../../../arkon/web/src/app/ortak-ayarlar.ts', () => ({ cssv: () => '', rgbOf: () => [0, 0, 0] }));

// Yol değişkenle verilir: istemci tip denetimi Arkon'un gevşek kipte derlenen ekran kodunu (arkon/web, strict kapalı) izlemesin.
const PDF_YOLU = '../../../../arkon/web/src/app/pdf.ts';
const { pdfOpen } = (await import(/* @vite-ignore */ PDF_YOLU)) as { pdfOpen(bayt: Uint8Array, sifreSor: null): Promise<unknown> };

describe('Arkon PDF okuyucu betik çalıştırmaz (CVE-2024-4367 önlemi)', () => {
  it('PDF isEvalSupported: false ile açılır; veri kopyalanarak verilir', async () => {
    const bayt = new Uint8Array([37, 80, 68, 70]);
    await pdfOpen(bayt, null);
    expect(getDocument).toHaveBeenCalledTimes(1);
    const secenek = getDocument.mock.calls[0]?.[0] as { isEvalSupported?: unknown; enableScripting?: unknown; data?: Uint8Array };
    expect(secenek.isEvalSupported).toBe(false);
    expect(secenek.enableScripting).toBeUndefined();
    expect(secenek.data).toEqual(bayt);
  });
});
