import { afterEach, describe, expect, it, vi } from 'vitest';
import { kopruKur } from './kopru.ts';

// 195 a: köprü, yetkisi bilinen okumayı işlemi olmayan kişiye sormaz; ekran o dilimi boş (null) çizer, 403 bırakılmaz.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(): string[] {
  const istenen: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    istenen.push(yol);
    if (yol === '/recete-rota/statuler') return json(200, { statuler: [] });
    if (yol.startsWith('/stok/malzemeler/')) return json(200, { statuKirilimi: [], bakiyeler: [] });
    return json(200, {});
  }));
  return istenen;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('Reçete ve Rota köprüsü yetkisiz okuma sormaz (195 a)', () => {
  it('stok-oku: sayfa.stok ya da stok işlemi yoksa bakiye uçları sorulmaz, malzemeler null; varsa sorulur', async () => {
    let istenen = sunucuKur();
    const yetkisiz = await kopruKur([], { islemler: ['sayfa.recete-rota', 'stok.istek'] })('stok-oku', { malzemeIdler: [12, 13] });
    expect(yetkisiz).toEqual({ statuler: [], malzemeler: null });
    expect(istenen.some((y) => y.startsWith('/stok/'))).toBe(false);

    for (const islem of ['sayfa.stok', 'stok.giris']) {
      vi.unstubAllGlobals();
      istenen = sunucuKur();
      const yetkili = await kopruKur([], { islemler: ['sayfa.recete-rota', islem] })('stok-oku', { malzemeIdler: [12] });
      expect(yetkili, islem).toEqual({ statuler: [], malzemeler: { 12: { kirilim: [], bakiyeler: [] } } });
      expect(istenen).toContain('/stok/malzemeler/12');
    }
  });

  it('kaynak-oku: kisiler.oku yoksa /kisiler, istasyon sayfası ya da yazması yoksa /istasyon-plan-ayarlari sorulmaz; işlemi olana sorulur', async () => {
    const okut = async (islemler: readonly string[] | undefined): Promise<string[]> => {
      vi.unstubAllGlobals();
      const istenen = sunucuKur();
      await kopruKur([], islemler === undefined ? {} : { islemler })('kaynak-oku', {}).catch(() => null);
      return istenen;
    };
    const kalite = await okut(['sayfa.recete-rota', 'sayfa.atolye']);
    expect(kalite).not.toContain('/kisiler');
    expect(kalite).not.toContain('/istasyon-plan-ayarlari');
    expect(kalite).toEqual(expect.arrayContaining(['/is-merkezleri', '/istasyonlar', '/makineler', '/vardiya-takvimi', '/makine-durumlari']));

    const planlama = await okut(['sayfa.recete-rota', 'sayfa.istasyonlar', 'kisiler.oku']);
    expect(planlama).toEqual(expect.arrayContaining(['/kisiler', '/istasyon-plan-ayarlari']));
    // İşlem listesi verilmeyen köprü (eski çağıranlar) hepsini sorar.
    expect(await okut(undefined)).toEqual(expect.arrayContaining(['/kisiler', '/istasyon-plan-ayarlari']));
  });
});
