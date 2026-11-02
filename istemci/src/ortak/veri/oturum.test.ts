import { describe, expect, it, vi } from 'vitest';
import { ApiHatasi } from './api.ts';
import { GIRIS_YENIDEN_DENEME, girisCakismasiMi, girisiYenidenDene } from './oturum.ts';

const cakisma = () => new ApiHatasi(429, { kod: 'COK_ISTEK', mesaj: 'Aynı anda başka bir giriş denemesi sürüyor. Birazdan yeniden deneyin.' });
const hatali = () => new ApiHatasi(401, { kod: 'OTURUM_YOK', mesaj: 'Kullanıcı adı ya da parola hatalı.' });

function sirali(cevaplar: readonly (() => unknown)[]) {
  let i = 0;
  return vi.fn(async () => {
    const cevap = cevaplar[Math.min(i, cevaplar.length - 1)];
    i += 1;
    const deger = cevap?.();
    if (deger instanceof Error) throw deger;
    return deger;
  });
}

describe('giris cakismasi yeniden denemesi (1877 a)', () => {
  it('ayni anda suren deneme cevabindan sonra bekleyip yeniden dener ve sonucu verir', async () => {
    const istek = sirali([cakisma, cakisma, () => 'oturum']);
    const bekle = vi.fn(async () => undefined);
    await expect(girisiYenidenDene(istek, bekle)).resolves.toBe('oturum');
    expect(istek).toHaveBeenCalledTimes(3);
    expect(bekle).toHaveBeenCalledTimes(2);
  });

  it('sinirdan sonra son cakisma hatasini kullaniciya birakir', async () => {
    const istek = sirali([cakisma]);
    const bekle = vi.fn(async () => undefined);
    await expect(girisiYenidenDene(istek, bekle)).rejects.toSatisfy(girisCakismasiMi);
    expect(istek).toHaveBeenCalledTimes(GIRIS_YENIDEN_DENEME + 1);
    expect(bekle).toHaveBeenCalledTimes(GIRIS_YENIDEN_DENEME);
  });

  it('hatali parola, baska 429 ve ag hatasi yeniden denenmez', async () => {
    const baska429 = () => new ApiHatasi(429, { kod: 'MESGUL', mesaj: 'm' });
    for (const cevap of [hatali, baska429, () => new TypeError('Failed to fetch')]) {
      const istek = sirali([cevap, () => 'oturum']);
      const bekle = vi.fn(async () => undefined);
      await expect(girisiYenidenDene(istek, bekle)).rejects.toBeInstanceOf(Error);
      expect(istek).toHaveBeenCalledTimes(1);
      expect(bekle).not.toHaveBeenCalled();
    }
  });

  it('varsayilan bekleme 1-2 sn arasindadir', async () => {
    vi.useFakeTimers();
    try {
      const istek = sirali([cakisma, () => 'oturum']);
      const sonuc = girisiYenidenDene(istek);
      await vi.advanceTimersByTimeAsync(999);
      expect(istek).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1001);
      await expect(sonuc).resolves.toBe('oturum');
      expect(istek).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
