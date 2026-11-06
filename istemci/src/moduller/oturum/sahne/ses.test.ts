import { afterEach, describe, expect, it } from 'vitest';
import { akorNo, AKORLAR, bekleme, cihazPartisi, DIZI, IZGARA_MS, notalar, PARTI_SAYISI, PENCERE_MS, sesAcikMi, sesCal, sesTercihiYaz } from './ses.ts';

describe('acilis sesi: kalabalikta uyum (2170)', () => {
  it('butun akorlar ve butun partilerin butun notalari Re majör pentatonikte: ust uste binen terminaller catismaz', () => {
    for (let a = 0; a < AKORLAR.length; a++) for (let p = 0; p < PARTI_SAYISI; p++) {
      for (const n of notalar(a, p)) expect(DIZI).toContain(((n.m % 12) + 12) % 12);
    }
  });
  it('baslangic yarim saniyelik saat izgarasina oturur', () => {
    expect(bekleme(10_000)).toBe(0);
    expect(bekleme(10_001)).toBe(IZGARA_MS - 1);
    expect(bekleme(10_499)).toBe(1);
  });
  it('akor ortak saatten gelir: ayni 20 saniyede ayni akor, sonra sirayla bir sonraki, dort akorda basa doner', () => {
    expect(akorNo(0)).toBe(akorNo(PENCERE_MS - 1));
    expect(akorNo(PENCERE_MS)).toBe(1);
    expect(akorNo(PENCERE_MS * AKORLAR.length)).toBe(0);
  });
  it('sahneyle ayni zamanlar: giris notalari izgarada, patlama 3,0, harfler 3,67 ve 3,79, tarama 5,0', () => {
    const t = notalar(0, 0).map((n) => n.t);
    expect(t.slice(0, 4)).toEqual([0.5, 1, 1.5, 2]);
    expect(t).toContain(3);
    expect(t).toContain(3.67);
    expect(t).toContain(3.79);
    expect(Math.min(...t.filter((x) => x >= 5))).toBe(5);
  });
});

describe('acilis sesi: cihaz tercihi', () => {
  afterEach(() => { window.localStorage.clear(); });
  it('varsayilan kapali; tercih yalniz bu cihazda saklanir', () => {
    expect(sesAcikMi()).toBe(false);
    sesTercihiYaz(true);
    expect(sesAcikMi()).toBe(true);
    sesTercihiYaz(false);
    expect(sesAcikMi()).toBe(false);
  });
  it('cihazin partisi bir kez secilir ve degismez', () => {
    const p = cihazPartisi();
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(PARTI_SAYISI);
    expect(cihazPartisi()).toBe(p);
  });
  it('Web Audio olmayan ortamda ses calmaz, hata atmaz', async () => {
    expect(await sesCal()).toBe(false);
  });
});
