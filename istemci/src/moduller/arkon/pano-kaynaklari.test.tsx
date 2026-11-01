import { describe, expect, it } from 'vitest';
import type { OperatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { anaSayfaKaynaklari, operatorOlculeri, ozetKalemi } from './pano-kaynaklari.tsx';

describe('arkon pano kaynaklari (kart 1585)', () => {
  const ozet = { hazirlikBekleyen: 3, kaliteBekleyen: 0, bakimAcik: null };
  const k = { baslik: (n: number) => `${n} is`, ayrinti: null, aciliyet: 'bugun' as const, yol: '/arkon/hazirlik', eylem: 'Hazırla' };

  it('sayi varsa tek kalem verir; sifir ya da yetkisiz (null) kalem vermez', () => {
    expect(ozetKalemi(ozet, 'hazirlikBekleyen', k)).toEqual([expect.objectContaining({ baslik: '3 is', yol: '/arkon/hazirlik', aciliyet: 'bugun' })]);
    expect(ozetKalemi(ozet, 'kaliteBekleyen', k)).toEqual([]);
    expect(ozetKalemi(ozet, 'bakimAcik', k)).toEqual([]);
  });

  it('operatorun gunu: plan basari hesabindan; bilinmeyen deger null kalir, sifir uydurulmaz', () => {
    const o = { saglam: 46, hurda: null, calismaSn: 5400, basari: { beklenen: 60 }, izinler: null } as unknown as OperatorOzetiCevabi;
    const [uretim, hurda, calisma, izin] = operatorOlculeri(o);
    expect(uretim).toMatchObject({ deger: 46, plan: 60 });
    expect(hurda?.deger).toBeNull();
    expect(calisma?.deger).toBe(1.5);
    expect(izin?.deger).toBeNull();
  });

  it('operatorun gunu kisiseldir: yonetici tam gorunumde gormez', () => {
    expect(anaSayfaKaynaklari.find((k) => k.anahtar === 'arkon-gunum-olcu')?.kisisel).toBe(true);
  });
});
