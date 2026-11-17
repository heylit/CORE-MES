import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../../ortak/veri/api.ts';
import { planaAlOnizle } from './plana-al.ts';

// Sunucu uydurmadır: kayıt 7. sürümde; eski sürümle gelen soru "Plan bu sırada değişti" diye reddedilir (sunucunun planaAlOnizlemesi gibi).
afterEach(() => { vi.restoreAllMocks(); });

function sunucu(guncel: number) {
  return vi.spyOn(api, 'get').mockImplementation((yol: string) => {
    const v = Number(new URL(yol, 'http://x').searchParams.get('calismaSurumu'));
    if (v !== guncel) return Promise.resolve({ calismaSurumu: guncel, gecerli: false, ileti: 'Plan bu sırada değişti; sayfayı yenileyin.', isler: [], bitis: null } as never);
    return Promise.resolve({ calismaSurumu: guncel, gecerli: true, ileti: null, isler: [{ isId: 'ORN-1.10', tezgah: 'T1', S: 10, C: 12 }], bitis: 12 } as never);
  });
}
const surumler = (get: ReturnType<typeof sunucu>) => get.mock.calls.map((c) => Number(new URL(String(c[0]), 'http://x').searchParams.get('calismaSurumu')));

describe('planaAlOnizle', () => {
  it('sayfanın sürümü eskiyse güncel sürümle bir kez yeniden sorar; sonraki sorular doğrudan güncel sürümle gider (açılışta kaynak değişikliği yazılınca)', async () => {
    const get = sunucu(7);
    const g = { emirId: 'ORN-1', tezgah: 'T1', baslangic: 10 };
    expect(await planaAlOnizle(g, 5)).toMatchObject({ gecerli: true, bitis: 12 });
    expect(surumler(get)).toEqual([5, 7]);
    expect(await planaAlOnizle({ ...g, tezgah: 'T2' }, 5)).toMatchObject({ gecerli: true });
    expect(surumler(get)).toEqual([5, 7, 7]);
  });

  it('sürüm güncelken tek soru gider; başka nedenle geçersiz cevap yeniden sorulmaz; okunamazsa null', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ calismaSurumu: 9, gecerli: false, ileti: 'Tezgâh bu adımı yapamaz.', isler: [], bitis: null } as never);
    expect(await planaAlOnizle({ emirId: 'ORN-2', tezgah: 'T9', baslangic: 0 }, 9)).toMatchObject({ gecerli: false, ileti: 'Tezgâh bu adımı yapamaz.' });
    expect(get).toHaveBeenCalledTimes(1);
    get.mockRejectedValueOnce(new Error('kapalı'));
    expect(await planaAlOnizle({ emirId: 'ORN-2', tezgah: 'T9', baslangic: 0 }, 9)).toBeNull();
  });
});
