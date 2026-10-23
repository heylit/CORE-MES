import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import { kopruKur } from '../kopru.ts';
import { anaBelgeyiBul, RrBaglamKaynagi, RrHatasi, useEskiKayit, useRrKomutu, useRrVerisi, type RrBaglami } from './veri.ts';
import { yetkiHesapla } from './yetki.ts';
import { yetkiKur } from '../../../ortak/veri/yetki.ts';
import { json, ornekDurum, sunucuKur, YONETICI } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Komut = ReturnType<typeof useRrKomutu>;
interface Yoklama { veri?: ReturnType<typeof useRrVerisi>; komut?: Komut; eski?: ReturnType<typeof useEskiKayit> }

function Yoklayici({ y, eski = false }: { y: Yoklama; eski?: boolean }) {
  y.veri = useRrVerisi();
  y.komut = useRrKomutu();
  y.eski = useEskiKayit(eski);
  return null;
}

function kur(eski = false) {
  const y: Yoklama = {};
  const baglam: RrBaglami = { kopru: kopruKur([]), ilkOkuma: () => Promise.resolve() };
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <RrBaglamKaynagi.Provider value={baglam}><Yoklayici y={y} eski={eski} /></RrBaglamKaynagi.Provider>
    </QueryClientProvider>,
  );
  return y;
}

describe('veri katmanı', () => {
  it('komut köprünün tablosundaki uca gider; dönen durum önbelleğe yazılır', async () => {
    const yeni = ornekDurum();
    yeni.statuses = [{ id: 'kalite', code: 'KK', name: 'Kalitede', kind: 'kalite', color: '#336699', surum: 1 }];
    let ikinci = false;
    const istekler = sunucuKur(YONETICI, {
      durum: () => json(200, ikinci ? yeni : ornekDurum()),
      yazmalar: { 'POST /recete-rota/statu-tanimlari/kalite/kaydet': () => { ikinci = true; return json(200, { statuses: yeni.statuses }); } },
    });
    const y = kur();
    await waitFor(() => expect(y.veri?.data).toBeDefined());
    await act(async () => {
      await y.komut!.mutateAsync({ ad: 'statu-tanimi-kaydet', govde: { id: 'kalite', code: 'KK', name: 'Kalitede', kind: 'kalite', color: '#336699', beklenenSurum: null } });
    });
    const yazma = istekler.find((i) => i.yontem === 'POST');
    expect(yazma).toMatchObject({ yol: '/recete-rota/statu-tanimlari/kalite/kaydet', govde: { code: 'KK', beklenenSurum: null } });
    await waitFor(() => expect(y.veri?.data?.durum.statuses?.map((s) => s.id)).toEqual(['kalite']));
  });

  it('tabloda olmayan komut gönderilmez', async () => {
    const istekler = sunucuKur(YONETICI);
    const y = kur();
    await waitFor(() => expect(y.veri?.data).toBeDefined());
    await act(async () => {
      await expect(y.komut!.mutateAsync({ ad: 'kayit-yaz', govde: {} })).rejects.toBeInstanceOf(RrHatasi);
    });
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
  });

  it('sahibinin reddi sunucu iletisi, durum kodu ve alanla döner; eski sürümde veri yeniden okunur', async () => {
    const istekler = sunucuKur(YONETICI, {
      yazmalar: { 'POST /recete-rota/statu-tanimlari/kalite/sil': () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka biri tarafından değiştirildi.', ayrinti: { neden: ESKI_SURUM_NEDENI } }) },
    });
    const y = kur();
    await waitFor(() => expect(y.veri?.data).toBeDefined());
    const once = istekler.filter((i) => i.yol === '/recete-rota/durum').length;
    let hata: unknown = null;
    await act(async () => {
      await y.komut!.mutateAsync({ ad: 'statu-tanimi-sil', govde: { id: 'kalite', beklenenSurum: 3 } }).catch((h: unknown) => { hata = h; });
    });
    expect(hata).toBeInstanceOf(RrHatasi);
    expect((hata as RrHatasi).durum).toBe(409);
    expect((hata as RrHatasi).message).toBe('Kayıt başka biri tarafından değiştirildi.');
    expect((hata as RrHatasi).eskiSurum).toBe(true);
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/recete-rota/durum').length).toBeGreaterThan(once));
  });

  it('kayıt belgesindeki eski kalemler yalnız okunur: ana belge bulunur, yazma gitmez', async () => {
    const belge = { anahtar: 'recete-rota-motoru-v1', bicim: 'json' as const, deger: { items: [] }, surum: 7 };
    const istekler = sunucuKur(YONETICI, { kayitlar: [{ anahtar: 'recete-rota-motoru-v1:studio', bicim: 'json', deger: {}, surum: 1 }, belge] });
    const y = kur(true);
    await waitFor(() => expect(y.eski?.data).toEqual(belge));
    expect(istekler.some((i) => i.yol.startsWith('/recete-rota/kayitlar/'))).toBe(false);
    expect(anaBelgeyiBul({ kayitlar: [] })).toBeNull();
  });
});

describe('yetki', () => {
  it('her bayrak sahibinin işlemidir; işlemi olmayanda salt okunur', () => {
    const okuyan = yetkiHesapla(yetkiKur(['sayfa.recete-rota']));
    expect(okuyan.oku).toBe(true);
    expect(okuyan.herhangiYazma).toBe(false);
    const rotaci = yetkiHesapla(yetkiKur(['recete-rota.oku', 'rota.yaz']));
    expect(rotaci).toMatchObject({ oku: true, rotaYaz: true, rotaOnayla: false, yaz: false, emirYaz: false, herhangiYazma: true });
    expect(yetkiHesapla(yetkiKur(['stok.sayim'])).stokOku).toBe(true);
    expect(yetkiHesapla(yetkiKur([])).oku).toBe(false);
  });
});
