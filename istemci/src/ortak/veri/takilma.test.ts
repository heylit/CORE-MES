import { describe, expect, it, vi } from 'vitest';
import { ART_ARDA_PENCERE, ISINMA_MS, kareHizi, takilmaIzle } from './takilma.ts';

function sahte(gizli = () => false) {
  let geri: ((an: number) => void) | null = null;
  let an = 0;
  const z = {
    kare: (g: (an: number) => void) => { geri = g; return 1; },
    iptal: vi.fn(),
    simdi: () => 0,
    gizli,
  };
  // Verilen aralıkla n kare oynatır.
  const oynat = (n: number, aralik: number) => { for (let i = 0; i < n && geri; i += 1) { an += aralik; const g = geri; geri = null; g(an); } };
  return { z, oynat };
}

describe('takılma koruması (kart 2092, karar 2081-29)', () => {
  it('kare hızı', () => {
    expect(kareHizi(60, 1000)).toBe(60);
    expect(kareHizi(0, 0)).toBe(0);
  });

  it('akıcı akışta tetiklemez; ısınmadan sonra art arda düşük pencerede bir kez tetikler ve durur', () => {
    const tetik = vi.fn();
    const { z, oynat } = sahte();
    takilmaIzle(tetik, z);
    oynat(Math.ceil(ISINMA_MS / 16), 16);
    oynat(60 * 5, 16);
    expect(tetik).not.toHaveBeenCalled();
    oynat(20 * (ART_ARDA_PENCERE + 1), 50);
    expect(tetik).toHaveBeenCalledTimes(1);
    oynat(100, 50);
    expect(tetik).toHaveBeenCalledTimes(1);
  });

  it('ısınma süresindeki takılma ve tek kötü pencere sayılmaz; sekme gizliyken ölçmez; durdurulunca kare istemez', () => {
    const tetik = vi.fn();
    let gizli = false;
    const { z, oynat } = sahte(() => gizli);
    const dur = takilmaIzle(tetik, z);
    oynat(ISINMA_MS / 50, 50);
    oynat(20, 50);
    oynat(60, 16);
    expect(tetik).not.toHaveBeenCalled();
    gizli = true;
    oynat(20 * (ART_ARDA_PENCERE + 1), 50);
    expect(tetik).not.toHaveBeenCalled();
    dur();
    expect(z.iptal).toHaveBeenCalled();
  });
});

describe('oturumluk sade kip', () => {
  it('cihazın kayıtlı tercihini değiştirmeden bu oturumda açar', async () => {
    const { PERFORMANS_ANAHTARI, performansOku, performansOturumdaAc } = await import('./gorunum.ts');
    localStorage.setItem(PERFORMANS_ANAHTARI, 'kapali');
    expect(performansOku()).toBe(false);
    performansOturumdaAc();
    expect(performansOku()).toBe(true);
    expect(localStorage.getItem(PERFORMANS_ANAHTARI)).toBe('kapali');
    localStorage.removeItem(PERFORMANS_ANAHTARI);
  });
});
