import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiHatasi } from '../../ortak/veri/api.ts';

// WASM dosyası 10 MB'dir; yükleme sayısı sayılsın diye sahte dosya konur.
const yuklemeler = vi.hoisted(() => ({ sayi: 0, hata: false }));
vi.mock('./step-dosyasi.ts', () => ({
  stepDosyasiOku: async () => {
    yuklemeler.sayi += 1;
    if (yuklemeler.hata) throw new Error('ag');
    return 'AGFzbQ-sahte';
  },
}));

afterEach(() => { vi.resetModules(); yuklemeler.sayi = 0; yuklemeler.hata = false; });

describe('STEP okuyucusu isteğe bağlı yüklenir', () => {
  it('SO-02: ilk STEP isteğinde bir kez yüklenir; ikinci ve eşzamanlı istek yeniden yüklemez', async () => {
    const { kopruKur } = await import('./kopru.ts');
    const isle = kopruKur();
    const [a, b] = await Promise.all([isle('step-okuyucu', {}), isle('step-okuyucu', {})]);
    const c = await isle('step-okuyucu', {});
    expect([a, b, c]).toEqual(['AGFzbQ-sahte', 'AGFzbQ-sahte', 'AGFzbQ-sahte']);
    expect(yuklemeler.sayi).toBe(1);
  });

  it('SO-03: yükleme hatası köprüde anlaşılır iletiye çevrilir (ağ hatası metni sızmaz)', async () => {
    yuklemeler.hata = true;
    const { kopruKur, kopruHatasi } = await import('./kopru.ts');
    const hata = await kopruKur()('step-okuyucu', {}).catch((e: unknown) => e);
    expect(hata).toBeInstanceOf(Error);
    expect(hata).not.toBeInstanceOf(ApiHatasi);
    expect(kopruHatasi(hata)).toEqual({ hata: 'STEP okuyucu yüklenemedi.', durum: 503 });
  });

  it('SO-04: başarısız yükleme saklanmaz, sonraki istek yeniden dener; başarılı olan saklanır', async () => {
    const { stepOkuyucuKur } = await import('./prototip.ts');
    const yukle = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('ag')).mockResolvedValue('wasm');
    const al = stepOkuyucuKur(yukle);
    await expect(al()).rejects.toThrow('ag');
    expect(await al()).toBe('wasm');
    expect(await al()).toBe('wasm');
    expect(yukle).toHaveBeenCalledTimes(2);
  });
});
