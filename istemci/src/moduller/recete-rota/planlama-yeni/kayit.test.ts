import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YazCevabi, YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { calismaOku } from './durum.ts';
import { BUYUK, CATISMA, CalismaYazici, IZ_SINIRI, OTURUM, PLAN_YETKI, RET, type YaziciAyari } from './kayit.ts';
import type { PlanlamaCalismasi } from './tipler.ts';
import { ONEK, PLANLAMA_ANAHTARI } from './veri.ts';

// Belgeler uydurmadır.
function calisma(ek: Record<string, unknown> = {}): PlanlamaCalismasi {
  const c = calismaOku({ surum: 2, D: { siparisler: [], tezgahlar: [], urunler: [] }, dataVer: 3, plan: { dataVer: 3 }, iz: [], ...ek });
  if (c === null) throw new Error('okunmadı');
  return c;
}

function kur(ayar: Partial<YaziciAyari> = {}, cevap: (g: YazGovdesi) => Promise<YazCevabi> = async (g) => ({ kayit: { anahtar: g.anahtar, bicim: 'json', deger: g.deger, surum: (g.beklenenSurum ?? 0) + 1 } })) {
  const yazmalar: YazGovdesi[] = [];
  const uyarilar: string[] = [];
  const y = new CalismaYazici({
    calisma: calisma(), surum: 7, kim: 'Deneme Planlamaci', sayfa: () => 'Planlama motoru', simdi: () => 1000,
    yaz: (g) => { yazmalar.push(g); return cevap(g); }, uyar: (i) => { uyarilar.push(i); }, ...ayar,
  });
  return { y, yazmalar, uyarilar };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('CalismaYazici', () => {
  it('değişiklik veri sürümünü artırır, planı bayatlatır, ize yazar; art arda değişiklikler beklemeden sonra tek yazmada gider', async () => {
    const { y, yazmalar } = kur();
    expect(y.degistir('Ağırlık değişti', (t) => { t.w.sure = 5; })).toBe(true);
    y.degistir('Ağırlık değişti', (t) => { t.w.sure = 6; }, { ayrinti: 'süre' });
    expect(y.calisma.dataVer).toBe(5);
    expect(y.calisma.plan?.dataVer).toBe(3);
    expect(y.calisma.iz[0]).toEqual({ t: 1000, kim: 'Deneme Planlamaci', rol: '', sayfa: 'Planlama motoru', ne: 'Ağırlık değişti', ayrinti: 'süre' });
    expect(yazmalar).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(yazmalar).toHaveLength(1);
    expect(yazmalar[0]).toMatchObject({ anahtar: PLANLAMA_ANAHTARI, bicim: 'json', beklenenSurum: 7 });
    expect((yazmalar[0]?.deger as PlanlamaCalismasi).w.sure).toBe(6);
    expect(y.surum).toBe(8);
  });

  it('başarılı değişiklik bildirilir; bildirimin Geri al düğmesi değişikliği geri alır', () => {
    const iletiler: string[] = [];
    let geri: (() => void) | undefined;
    const { y } = kur({ bildir: (i, g) => { iletiler.push(i); if (g) geri = g; } });
    y.degistir('Ağırlık değişti', (t) => { t.w.sure = 2; });
    y.degistir('Tercih', (t) => { t.pref.a = 1; }, { planKoru: true });
    expect(iletiler).toEqual(['Ağırlık değişti. Plan yeniden çözülünce güncellenir.', 'Tercih.']);
    geri?.();
    expect(iletiler.at(-1)).toBe('Son değişiklik geri alındı.');
    expect(y.calisma.pref.a).toBeUndefined();
  });

  it('yalnız planlama anahtarına yazar; Reçete ve Rota kaydına hiç yazmaz (222 a)', async () => {
    const { y, yazmalar } = kur();
    y.degistir('a', (t) => { t.pref.x = 1; });
    y.degistir('b', (t) => { t.pref.x = 2; });
    await y.hepsiniYaz();
    expect(yazmalar.map((g) => g.anahtar)).toEqual([PLANLAMA_ANAHTARI]);
    expect(yazmalar.some((g) => g.anahtar === ONEK)).toBe(false);
  });

  it('planKoru: güncel plan güncel kalır; false dönen işlev değişiklik yapmaz', async () => {
    const { y, yazmalar } = kur();
    y.degistir('Tercih', (t) => { t.pref.yakinlik = 20; }, { planKoru: true });
    expect(y.calisma.plan?.dataVer).toBe(y.calisma.dataVer);
    expect(y.degistir('Hiç', () => false)).toBe(false);
    expect(y.calisma.iz).toHaveLength(1);
    await y.hepsiniYaz();
    expect(yazmalar).toHaveLength(1);
  });

  it('geri al son değişikliği geri getirir, veri sürümü geri gitmez; yığın boşsa false', async () => {
    const { y } = kur();
    expect(y.geriAlinabilir()).toBe(false);
    y.degistir('Ağırlık', (t) => { t.w.sure = 1; });
    expect(y.geriAl()).toBe(true);
    expect(y.calisma.w.sure).toBe(10);
    expect(y.calisma.dataVer).toBe(5);
    expect(y.calisma.plan?.dataVer).toBe(5);
    expect(y.calisma.iz[0]?.ne).toBe('Geri alındı');
    expect(y.geriAl()).toBe(false);
  });

  it('dinleyici her değişiklikte uyarılır; abonelik kalkınca uyarılmaz', () => {
    const { y } = kur();
    const d = vi.fn();
    const kaldir = y.abone(d);
    y.degistir('a', (t) => { t.pref.a = 1; });
    kaldir();
    y.degistir('b', (t) => { t.pref.b = 1; });
    expect(d).toHaveBeenCalledTimes(1);
  });

  it('sürüm çatışmasında (409) yazma durur, başkasının üstüne yazılmaz, sonraki değişiklik reddedilir', async () => {
    const { y, yazmalar, uyarilar } = kur({}, async () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'eski' }); });
    y.degistir('a', (t) => { t.pref.a = 1; });
    await y.hepsiniYaz();
    expect(uyarilar).toEqual([CATISMA]);
    expect(y.durdu).toBe(true);
    expect(y.degistir('b', (t) => { t.pref.b = 1; })).toBe(false);
    await y.hepsiniYaz();
    expect(yazmalar).toHaveLength(1);
  });

  it('yetkisiz yazma (403) plan yetkisi, oturumsuz (401) oturum iletisi verir; başka hata yeniden denenir', async () => {
    let n = 0;
    const { y, yazmalar, uyarilar } = kur({}, async (g) => {
      n += 1;
      if (n === 1) throw new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'yok' });
      if (n === 2) throw new ApiHatasi(401, { kod: 'OTURUM_YOK', mesaj: 'yok' });
      if (n === 3) throw new Error('ağ');
      return { kayit: { anahtar: g.anahtar, bicim: 'json', deger: g.deger, surum: 9 } };
    });
    y.degistir('a', (t) => { t.pref.a = 1; });
    await y.hepsiniYaz();
    y.degistir('b', (t) => { t.pref.b = 1; });
    await y.hepsiniYaz();
    y.degistir('c', (t) => { t.pref.c = 1; });
    await y.hepsiniYaz();
    y.degistir('d', (t) => { t.pref.d = 1; });
    await y.hepsiniYaz();
    expect(uyarilar).toEqual([PLAN_YETKI, OTURUM, RET]);
    expect(yazmalar).toHaveLength(4);
    expect(y.surum).toBe(9);
  });

  it('sınırı aşan belge gönderilmez, bir kez uyarılır', async () => {
    const { y, yazmalar, uyarilar } = kur({ azamiBayt: 200 });
    y.degistir('a', (t) => { t.pref.uzun = 'x'.repeat(300); });
    await y.hepsiniYaz();
    y.degistir('b', (t) => { t.pref.b = 1; });
    await y.hepsiniYaz();
    expect(yazmalar).toHaveLength(0);
    expect(uyarilar).toEqual([BUYUK]);
  });

  it('yazma yoldayken gelen değişiklik ardından ayrıca yazılır; iz sınırı korunur', async () => {
    let coz: (() => void) | null = null;
    const { y, yazmalar } = kur({ calisma: calisma({ iz: Array.from({ length: IZ_SINIRI }, (_, i) => ({ t: i, kim: '', rol: '', sayfa: '', ne: 'eski', ayrinti: '' })) }) },
      (g) => new Promise((r) => { coz = () => { r({ kayit: { anahtar: g.anahtar, bicim: 'json', deger: g.deger, surum: (g.beklenenSurum ?? 0) + 1 } }); }; }));
    y.degistir('a', (t) => { t.pref.a = 1; });
    expect(y.calisma.iz).toHaveLength(IZ_SINIRI);
    await vi.advanceTimersByTimeAsync(2000);
    y.degistir('b', (t) => { t.pref.b = 1; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(yazmalar).toHaveLength(1);
    (coz as (() => void) | null)?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(yazmalar).toHaveLength(2);
    expect(yazmalar[1]?.beklenenSurum).toBe(8);
  });
});
