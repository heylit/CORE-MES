import { afterEach, describe, expect, it } from 'vitest';
import { akorNo, AKORLAR, anaKazanc, bekleme, cihazPartisi, DIZI, IZGARA_MS, notalar, PARTI_SAYISI, eskiCihazTercihiniSil, PENCERE_MS, sesCal, TASARIM_DUZEYI } from './ses.ts';

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

describe('acilis sesi: cihaz', () => {
  afterEach(() => { window.localStorage.clear(); });
  it('giris dugmesinden kalan eski cihaz secimi silinir; partiye dokunulmaz (2230c)', () => {
    window.localStorage.setItem('core.giris.ses', 'kapali');
    window.localStorage.setItem('core.giris.ses-parti', '2');
    eskiCihazTercihiniSil();
    expect(window.localStorage.getItem('core.giris.ses')).toBeNull();
    expect(window.localStorage.getItem('core.giris.ses-parti')).toBe('2');
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

describe('acilis sesi: kurum ses duzeyi (2230b)', () => {
  it('varsayilan duzey bugunku yukseklik; 0 sessiz; duzey arttikca kazanc dogrusal artar; aralik disi kirpilir', () => {
    expect(anaKazanc(TASARIM_DUZEYI)).toBeCloseTo(0.47);
    expect(anaKazanc(0)).toBe(0);
    expect(anaKazanc(35)).toBeCloseTo(0.235);
    expect(anaKazanc(140)).toBe(anaKazanc(100));
    expect(anaKazanc(-5)).toBe(0);
  });
});
