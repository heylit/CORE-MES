import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// goruntudenOku: hangi okuyucunun ne zaman çalıştığı. Görüntü kaynağı ve tuval sahtedir; kod çözme matris-okuyucu.test.ts'de gerçek motorla sınanır.
const matrisOku = vi.fn<(g: unknown) => Promise<string | null>>();
const jsQR = vi.fn<(...a: unknown[]) => { data: string } | null>();
vi.mock('./matris-okuyucu.ts', () => ({ matrisOku: (g: unknown) => matrisOku(g) }));
vi.mock('jsqr', () => ({ default: (...a: unknown[]) => jsQR(...a) }));

const kaynak = { width: 640, height: 480 } as unknown as ImageBitmap;
function tuval(): HTMLCanvasElement {
  const ctx = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })) };
  return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
}
function yerelOkuyucu(desteklenen: string[], bulunan: string | null) {
  const detect = vi.fn(() => Promise.resolve(bulunan === null ? [] : [{ rawValue: bulunan }]));
  class Sahte { static getSupportedFormats = () => Promise.resolve(desteklenen); detect = detect; }
  vi.stubGlobal('BarcodeDetector', Sahte);
  return detect;
}
async function oku() {
  vi.resetModules();
  const { goruntudenOku } = await import('./kamera.ts');
  return goruntudenOku(kaynak, tuval());
}

beforeEach(() => { matrisOku.mockReset(); jsQR.mockReset(); vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('goruntudenOku', () => {
  it('Windows: BarcodeDetector yoksa zxing okur (DataMatrix dahil)', async () => {
    matrisOku.mockResolvedValue('CM1/LOT:ORN-LT-2041/BT:261122');
    expect(await oku()).toBe('CM1/LOT:ORN-LT-2041/BT:261122');
    expect(jsQR).not.toHaveBeenCalled();
  });

  it('BarcodeDetector yalnız QR biliyorsa kullanılmaz; zxing okur', async () => {
    const detect = yerelOkuyucu(['qr_code', 'code_128'], null);
    matrisOku.mockResolvedValue('RAF:ORN-R12');
    expect(await oku()).toBe('RAF:ORN-R12');
    expect(detect).not.toHaveBeenCalled();
  });

  it('BarcodeDetector QR ve DataMatrix biliyorsa o okur, zxing çalışmaz', async () => {
    const detect = yerelOkuyucu(['qr_code', 'data_matrix', 'code_128'], 'UE:4512');
    expect(await oku()).toBe('UE:4512');
    expect(detect).toHaveBeenCalledTimes(1);
    expect(matrisOku).not.toHaveBeenCalled();
  });

  it('yerel okuyucu hata verirse zxing okur', async () => {
    const detect = yerelOkuyucu(['qr_code', 'data_matrix'], null);
    detect.mockRejectedValue(new Error('yok'));
    matrisOku.mockResolvedValue('LOC:ORN-A01');
    expect(await oku()).toBe('LOC:ORN-A01');
  });

  it('zxing yüklenemezse eski QR yine jsqr ile okunur ve motor 10 saniye bekler', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.resetModules();
    const { goruntudenOku } = await import('./kamera.ts');
    matrisOku.mockRejectedValue(new Error('wasm yüklenemedi'));
    jsQR.mockReturnValue({ data: 'LOT:ORN-LT-2041' });
    expect(await goruntudenOku(kaynak, tuval())).toBe('LOT:ORN-LT-2041');
    expect(matrisOku).toHaveBeenCalledTimes(1);
    expect(await goruntudenOku(kaynak, tuval())).toBe('LOT:ORN-LT-2041');
    expect(matrisOku).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_001);
    matrisOku.mockResolvedValue('RP:37');
    expect(await goruntudenOku(kaynak, tuval())).toBe('RP:37');
    expect(matrisOku).toHaveBeenCalledTimes(2);
  });

  it('kod yoksa null', async () => {
    matrisOku.mockResolvedValue(null);
    expect(await oku()).toBeNull();
  });
});
