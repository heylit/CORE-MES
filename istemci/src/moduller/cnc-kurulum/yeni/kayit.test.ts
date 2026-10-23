import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { BUYUK_ILETISI, CATISMA_ILETISI, KayitYazici, YETKI_ILETISI, type KayitAyari } from './kayit.ts';

const ONEK = 'cnc-kurulum-motoru';
const ANAHTAR = `${ONEK}.v1`;
const EMIR = `${ONEK}.emir`;

function kur(ayar: Partial<KayitAyari> = {}, ilk: Record<string, { deger: string; surum: number }> = {}) {
  const istekler: { tip: string; veri: Record<string, unknown> }[] = [];
  const uyarilar: string[] = [];
  let surum = 1;
  const isle = vi.fn(async (tip: string, veri: unknown) => {
    istekler.push({ tip, veri: veri as Record<string, unknown> });
    surum += 1;
    return { kayit: { surum } };
  });
  const y = new KayitYazici({ isle, yazabilir: true, onek: ONEK, emirAnahtari: EMIR, uyar: (i) => { uyarilar.push(i); }, ...ayar }, ilk);
  return { y, istekler, uyarilar, isle };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('KayitYazici', () => {
  it('kullanıcı dokunmadan yazmaz; ilk eylemden sonra bekleyip tek yazmada birleştirir', async () => {
    const { y, istekler } = kur({}, { [ANAHTAR]: { deger: '{"a":0}', surum: 3 } });
    y.degistir(ANAHTAR, '{"a":1}');
    await vi.advanceTimersByTimeAsync(5000);
    expect(istekler).toHaveLength(0);
    y.eylem();
    y.degistir(ANAHTAR, '{"a":2}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(istekler).toEqual([{ tip: 'kayit-yaz', veri: { anahtar: ANAHTAR, bicim: 'json', deger: { a: 2 }, beklenenSurum: 3 } }]);
    expect(y.surum(ANAHTAR)).toBe(2);
  });

  it('metni yazma anında üretir; JSON olmayan metin düz metin gider; silme sürümle gider', async () => {
    const { y, istekler } = kur({}, { [`${ONEK}.not`]: { deger: 'x', surum: 4 } });
    y.eylem();
    const uret = vi.fn(() => 'duz metin');
    y.degistir(`${ONEK}.ek`, uret);
    expect(uret).not.toHaveBeenCalled();
    y.degistir(`${ONEK}.not`, null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(uret).toHaveBeenCalledTimes(1);
    expect(istekler).toContainEqual({ tip: 'kayit-yaz', veri: { anahtar: `${ONEK}.ek`, bicim: 'metin', deger: 'duz metin', beklenenSurum: null } });
    expect(istekler).toContainEqual({ tip: 'kayit-sil', veri: { anahtar: `${ONEK}.not`, beklenenSurum: 4 } });
  });

  it('emir anahtarlarını, önek dışını ve yazma yetkisi yokken hiçbirini yazmaz', async () => {
    const { y, istekler } = kur();
    y.eylem();
    y.degistir(EMIR, '1');
    y.degistir(`${EMIR}.7`, '{}');
    y.degistir('baska', '{}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(istekler).toHaveLength(0);
    const salt = kur({ yazabilir: false });
    salt.y.eylem();
    salt.y.degistir(ANAHTAR, '{}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(salt.istekler).toHaveLength(0);
    expect(salt.y.deger(ANAHTAR)).toBe('{}');
  });

  it('409 ve 403 yazmayı durdurur ve bir kez uyarır', async () => {
    for (const [durum, ileti] of [[409, CATISMA_ILETISI], [403, YETKI_ILETISI]] as const) {
      const isle = vi.fn(async () => { throw new ApiHatasi(durum, { kod: durum === 409 ? 'CAKISMA' : 'YETKI_YOK', mesaj: 'x' }); });
      const { y, uyarilar } = kur({ isle });
      y.eylem();
      y.degistir(ANAHTAR, '{"a":1}');
      await vi.advanceTimersByTimeAsync(1000);
      y.degistir(ANAHTAR, '{"a":2}');
      await vi.advanceTimersByTimeAsync(1000);
      expect(isle).toHaveBeenCalledTimes(1);
      expect(uyarilar).toEqual([ileti]);
      expect(y.durduMu).toBe(true);
    }
  });

  it('sınırı aşan kaydı göndermez, bir kez uyarır', async () => {
    const { y, istekler, uyarilar } = kur({ azamiBayt: 50 });
    y.eylem();
    y.degistir(ANAHTAR, JSON.stringify({ uzun: 'x'.repeat(100) }));
    await vi.advanceTimersByTimeAsync(1000);
    y.degistir(ANAHTAR, JSON.stringify({ uzun: 'y'.repeat(100) }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(istekler).toHaveLength(0);
    expect(uyarilar).toEqual([BUYUK_ILETISI]);
  });

  it('bağlantı hatasında yeniden dener; bosalt bekleyen her yazmayı bitirir', async () => {
    let kez = 0;
    const isle = vi.fn(async () => { kez += 1; if (kez === 1) throw new TypeError('ag'); return { kayit: { surum: 9 } }; });
    const { y } = kur({ isle });
    y.degistir(ANAHTAR, '{"a":1}');
    const bitti = y.bosalt();
    await vi.advanceTimersByTimeAsync(6000);
    await bitti;
    expect(isle).toHaveBeenCalledTimes(2);
    expect(y.surum(ANAHTAR)).toBe(9);
  });

  it('durdur sonrası yazmaz', async () => {
    const { y, istekler } = kur();
    y.eylem();
    y.durdur();
    y.degistir(ANAHTAR, '{}');
    y.hepsiniYaz();
    await vi.advanceTimersByTimeAsync(1000);
    expect(istekler).toHaveLength(0);
  });
});
