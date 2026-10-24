import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { ORNEK_AYAR } from './ornek-veri.ts';
import { YONETICI, json, sunucuKur, yeniIstemci } from './test-ortak.tsx';
import { kayitTamamla, type KartKaydi } from './tipler.ts';
import {
  firmaAra, kayitHatasi, kartlariOku, ortamKur, stokluKayit, useAyarKaydet, useKartKaydet, useKartlar, useKgFiyatlari, yolParcasi,
} from './veri.ts';

afterEach(() => { vi.unstubAllGlobals(); });

function sarmal() {
  const istemci = yeniIstemci();
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={istemci}>{children}</QueryClientProvider>;
}

describe('veri katmanı', () => {
  test('ortam: dört göz Sistem Ayarları\'ndan, genel ayar varsayılanla birleşir', () => {
    const o = ortamKur({ ...ORNEK_AYAR, dortGoz: true, genel: { dortGoz: false, acUzunluk: 40 } });
    expect(o.genel.dortGoz).toBe(true);
    expect(o.genel.acUzunluk).toBe(40);
    expect(o.genel.kodYapisi).toBe('standart');
    expect(o.malzemeAyari.favoriler).toEqual(['metal|islah|C45']);
    expect(o.malzemeAyari.aileler).toEqual([]);
  });

  test('kartlar: iptal kart listeye girmez, stoktan sipariş noktası ve depo yeri gelir', async () => {
    sunucuKur(YONETICI, {
      'GET /stok/malzeme-kart-bilgileri': () => json(200, {
        satirlar: [{ kartKimligi: 'mornek1', kritikSeviye: '12.500', varsayilanKonum: 'A-01' }], toplam: 1, sayfa: 1, sayfaBoyu: 500,
      }),
    });
    const kartlar = await kartlariOku(YONETICI.id);
    expect(kartlar.map((k) => k.kimlik)).toEqual(['mornek1', 'mornek2']);
    expect(kartlar[0]?.kayit.g).toEqual({ siparisNoktasi: '12.5', depoYeri: 'A-01' });
  });

  test('kartlar: stok okunamazsa katalog yine açılır', async () => {
    sunucuKur(YONETICI, { 'GET /stok/malzeme-kart-bilgileri': () => json(403, { kod: 'YETKI', mesaj: 'Yetki yok.' }) });
    expect((await kartlariOku(YONETICI.id)).length).toBe(2);
  });

  test('stokluKayit: stokta değer yoksa eski depo yeri kalır, sipariş noktası düşer', () => {
    const kayit = { g: { depoYeri: 'Eski', siparisNoktasi: '3' } } as unknown as KartKaydi;
    expect(stokluKayit(kayit, undefined).g).toEqual({ depoYeri: 'Eski' });
  });

  test('kaydet: kartın okunan sürümüyle ve süzülmüş özetle gider', async () => {
    const istekler = sunucuKur(YONETICI, { 'POST /malzeme-katalogu-kartlari/mornek1/kaydet': () => json(200, { id: 'mornek1', stok_kodu: 'HM-1', surum: 5 }) });
    const sarici = sarmal();
    const { result } = renderHook(() => ({ kartlar: useKartlar(), kaydet: useKartKaydet() }), { wrapper: sarici });
    await waitFor(() => expect(result.current.kartlar.data?.length).toBe(2));
    const kayit = result.current.kartlar.data?.[0]?.kayit as KartKaydi;
    const c = await result.current.kaydet.mutateAsync({
      kayit, ozet: { stok_kodu: 'HM-1', tur: 'hammadde', onay_durumu: 'aktif', benzersiz_anahtar: null, mukerrer_gerekcesi: null, birim_agirlik_kg: 0 },
    });
    expect(c).toEqual({ id: 'mornek1', stok_kodu: 'HM-1' });
    const g = istekler.find((i) => i.yontem === 'POST')?.govde as { surum: number; ozet: Record<string, unknown> };
    expect(g.surum).toBe(4);
    expect(g.ozet['birim_agirlik_kg']).toBeNull();
  });

  test('ayar: aynı anahtarın art arda iki kaydı sırayla ve bir öncekinin sürümüyle gider', async () => {
    let surum = 2;
    const istekler = sunucuKur(YONETICI, { 'POST /malzeme-katalogu-ayarlari/genel/kaydet': () => json(200, { id: 'genel', surum: ++surum }) });
    const { result } = renderHook(() => useAyarKaydet(), { wrapper: sarmal() });
    await Promise.all([
      result.current.mutateAsync({ anahtar: 'genel', deger: { acUzunluk: 30 } }),
      result.current.mutateAsync({ anahtar: 'genel', deger: { acUzunluk: 31 } }),
    ]);
    const gidenler = istekler.filter((i) => i.yontem === 'POST').map((i) => (i.govde as { surum: number | null }).surum);
    expect(gidenler).toEqual([null, 3]);
  });

  test('kg fiyatı: yetkisi olmayan rolde hiç sorulmaz', async () => {
    const istekler = sunucuKur(YONETICI);
    const { result } = renderHook(() => { const k = useKartlar(); return { k, f: useKgFiyatlari(k.data, false) }; }, { wrapper: sarmal() });
    await waitFor(() => expect(result.current.k.data?.length).toBe(2));
    expect(result.current.f).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/satin-alma-kg-fiyatlari'))).toBe(false);
  });

  test('firma araması iki harften kısa metinde uca gitmez', async () => {
    const istekler = sunucuKur(YONETICI);
    expect(await firmaAra(' a ')).toEqual([]);
    expect(istekler.length).toBe(0);
  });

  test('kimlik yolun tek parçasıdır', () => {
    expect(() => yolParcasi('..')).toThrow();
    expect(yolParcasi('a/b')).toBe('a%2Fb');
  });

  test('kayıt hatası: 409 çakışma, 400 alan eşlemesi, sunucu iletisi', () => {
    expect(kayitHatasi(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Kart değişmiş.' }))).toEqual({ kod: 'cakisma', ileti: 'Kart değişmiş.' });
    expect(kayitHatasi(new ApiHatasi(400, { kod: 'GECERSIZ', mesaj: 'Kategori yok.', alan: 'kayit.g.kat' })).kod).toBe('kategori-yok');
    expect(kayitHatasi(new ApiHatasi(400, { kod: 'GECERSIZ', mesaj: 'Kısa.', alan: 'ozet.mukerrer_gerekcesi' })).kod).toBe('gerekce-kisa');
    expect(kayitHatasi(new Error('x'))).toEqual({ kod: null, ileti: 'Kayıt yapılamadı, birazdan tekrar dene.' });
  });

  test('kayitTamamla: eksik alan taslağın boş değeriyle dolar, olan alan ve bilinmeyen alan kalır', () => {
    const k = kayitTamamla({ tur: 'hammadde', fam: 'metal', com: { kod: 'HM-1', ad: '' } as never, ozel: 5 });
    expect(k.opts).toEqual({});
    expect(k.dims).toEqual({});
    expect(k.com.sertifika).toEqual([]);
    expect(k.com.kod).toBe('HM-1');
    expect(k.fam).toBe('metal');
    expect(k['ozel']).toBe(5);
    expect(k.kodManual).toBe(true);
    expect(k.adManual).toBe(false);
  });
});
