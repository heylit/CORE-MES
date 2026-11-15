import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AyarlarCevabi, DosyalarCevabi, KaynakKlasoruCevabi, Klasor, KlasorlerCevabi, MevcutAcCevabi, MevcutCevabi } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici, KlasorBaglantisi } from '../../ortak/arayuz/index.ts';
import { OrtakDosyalar, type Gorunum } from './OrtakDosyalar.tsx';

// Kayda bağlı klasörler (kart 3288). ORN- adlar uydurmadır.
vi.mock('../belge-merkezi/disari.ts', () => ({ DosyaHatasi: class extends Error {}, dosyaYukle: vi.fn(async () => 'a'.repeat(64)) }));

const klasor = (k: Partial<Klasor> & { id: number; ad: string }): Klasor =>
  ({ ustId: null, ozelYetki: false, duzey: 'yonetir', dosyaSayisi: 0, surum: 1, kaynak: null, ...k });
const KOK = klasor({ id: 1, ad: 'Müşteriler', ozelYetki: true, kaynak: { tur: 'kok', id: null } });
const FIRMA = klasor({ id: 2, ustId: 1, ad: 'ORN-M001 ORN Hidrolik', kaynak: { tur: 'firma', id: 41 } });
const SIPARIS = klasor({ id: 3, ustId: 2, ad: 'SS-2026-0412 (ORN-PO-7781)', kaynak: { tur: 'siparis', id: 77 } });
const CIZIM = klasor({ id: 4, ustId: 3, ad: 'Çizim ve model' });
const DIGER = klasor({ id: 5, ustId: 1, ad: 'ORN-M002 ORN Makina', kaynak: { tur: 'firma', id: 42 } });
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Cagri { yol: string; yontem: string; govde: unknown }

function sunucuKur(ayar: Partial<AyarlarCevabi> = {}, mevcut?: MevcutCevabi) {
  const cagrilar: Cagri[] = [];
  let acmaSayisi = 0;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yol === '/ortak-dosyalar/klasorler') {
      return json(200, { klasorler: [KOK, FIRMA, SIPARIS, CIZIM, DIGER], yonetici: true, arsivSayisi: 0 } satisfies KlasorlerCevabi);
    }
    if (yol === '/ortak-dosyalar/klasorler/1/dosyalar') {
      return json(200, { klasor: KOK, altKlasorler: [FIRMA, DIGER], dosyalar: [], adOnerisi: null } satisfies DosyalarCevabi);
    }
    if (yol === '/ortak-dosyalar/klasorler/3/dosyalar') {
      return json(200, { klasor: SIPARIS, altKlasorler: [CIZIM], dosyalar: [], adOnerisi: { onek: 'SS-2026-0412', altKlasor: null } } satisfies DosyalarCevabi);
    }
    if (yol === '/ortak-dosyalar/klasorler/4/dosyalar') {
      return json(200, { klasor: CIZIM, altKlasorler: [], dosyalar: [], adOnerisi: { onek: 'SS-2026-0412', altKlasor: 'Çizim-ve-model' } } satisfies DosyalarCevabi);
    }
    if (yol === '/ortak-dosyalar/klasorler/4/yukle') return json(200, {});
    if (yol === '/oturum') return json(200, { kullanici: { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.ortak-dosyalar'] } } satisfies OturumCevabi);
    if (yol === '/ortak-dosyalar/kayit/siparis/77') return json(200, { klasorId: 3 } satisfies KaynakKlasoruCevabi);
    if (yol === '/ortak-dosyalar/kayit/proje/5') return json(200, { klasorId: null } satisfies KaynakKlasoruCevabi);
    if (yol === '/ortak-dosyalar/ayarlar' || yol === '/ortak-dosyalar/ayarlar/kok-ac' || yol === '/ortak-dosyalar/ayarlar/sablon') {
      return json(200, {
        kok: yol.endsWith('kok-ac') ? { id: 1, ad: 'Müşteriler' } : null, sablon: { siparis: ['Teklif'], proje: [] }, acilamayan: [], topluIsler: [], ...ayar,
      } satisfies AyarlarCevabi);
    }
    if (yol === '/ortak-dosyalar/ayarlar/mevcut') return json(200, mevcut ?? { bagli: false, kokVar: false, klasorsuz: { firma: 0, siparis: 0, proje: 0 } });
    if (yol === '/ortak-dosyalar/ayarlar/mevcut/ac') {
      acmaSayisi += 1;
      return json(200, (acmaSayisi === 1 ? { acilan: 100, acilamayan: 0, kalan: 20 } : { acilan: 20, acilamayan: 0, kalan: 0 }) satisfies MevcutAcCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: yol });
  }));
  return cagrilar;
}

function ciz(gorunum: Gorunum = 'klasorler', adres = '/ortak-dosyalar', icerik = <OrtakDosyalar gorunum={gorunum} />) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter initialEntries={[adres]}>{icerik}</MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('kayda bağlı klasörler (kart 3288)', () => {
  it('sistem klasörü "Kayda bağlı" işaretiyle çizilir; sipariş klasöründe kayda bağlantı vardır', async () => {
    sunucuKur();
    ciz();
    expect((await screen.findAllByLabelText(/Kayda bağlı/)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /SS-2026-0412/ }));
    const bag = await screen.findByRole('link', { name: /Sipariş SS-2026-0412 aç/ });
    expect(bag.getAttribute('href')).toBe('/siparisler/77');
  });

  it('ağaç araması uyan klasörü, üstlerini ve altlarını bırakır; eşleşme yoksa söyler', async () => {
    sunucuKur();
    ciz();
    const agac = await screen.findByRole('tree', { name: 'Klasör ağacı' });
    await within(agac).findByRole('button', { name: /ORN-M002/ });
    fireEvent.change(screen.getByLabelText('Klasör ara'), { target: { value: '0412' } });
    const suzulmus = screen.getByRole('tree', { name: 'Klasör ağacı' });
    expect(within(suzulmus).queryByRole('button', { name: /ORN-M002/ })).toBeNull();
    expect(within(suzulmus).getByRole('button', { name: /SS-2026-0412/ })).toBeTruthy();
    expect(within(suzulmus).getByRole('button', { name: /ORN-M001/ })).toBeTruthy();
    expect(within(suzulmus).getByRole('button', { name: /Çizim ve model/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Klasör ara'), { target: { value: 'ORN-M001' } });
    const musteri = screen.getByRole('tree', { name: 'Klasör ağacı' });
    expect(within(musteri).getByRole('button', { name: /SS-2026-0412/ })).toBeTruthy();
    expect(within(musteri).getByRole('button', { name: /Çizim ve model/ })).toBeTruthy();
    expect(within(musteri).queryByRole('button', { name: /ORN-M002/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Klasör ara'), { target: { value: 'ORN-YOK' } });
    expect(screen.getByText('Eşleşen klasör yok')).toBeTruthy();
  });

  it('tek dosyada ad önerisi gelir; kişi değiştirebilir; yükleme verilen adla gider', async () => {
    const cagrilar = sunucuKur();
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: /Çizim ve model/ }));
    await screen.findByRole('button', { name: /Dosya yükle/ });
    const girdi = document.querySelector('input[type="file"][multiple]');
    expect(girdi).toBeTruthy();
    fireEvent.change(girdi as HTMLInputElement, { target: { files: [Object.assign(new File(['x'], 'ORN-valf.step'), { arrayBuffer: async () => new ArrayBuffer(1) })] } });
    const ad = await screen.findByRole('textbox', { name: /Dosya adı/ });
    expect((ad as HTMLInputElement).value).toBe('SS-2026-0412_Çizim-ve-model_r1.step');
    fireEvent.click(screen.getByRole('button', { name: 'Özgün adı kullan' }));
    expect((ad as HTMLInputElement).value).toBe('ORN-valf.step');
    fireEvent.click(screen.getByRole('button', { name: /^Yükle$/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/ortak-dosyalar/klasorler/4/yukle')).toBe(true));
    expect(cagrilar.find((c) => c.yol === '/ortak-dosyalar/klasorler/4/yukle')?.govde).toEqual({ ad: 'ORN-valf.step', ozet: 'a'.repeat(64) });
  });

  it('Ayarlar: kök yokken yönetici "Müşteriler" klasörünü açar', async () => {
    const cagrilar = sunucuKur();
    ciz('ayarlar');
    fireEvent.click(await screen.findByRole('button', { name: /"Müşteriler" klasörünü aç/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST' && c.yol === '/ortak-dosyalar/ayarlar/kok-ac')).toBe(true));
  });

  it('Ayarlar: şablona "Alt klasör ekle" ile eklenen ad hemen kaydedilir; kaldırma da kaydedilir', async () => {
    const cagrilar = sunucuKur({ kok: { id: 1, ad: 'Müşteriler' } });
    ciz('ayarlar');
    expect(screen.queryByRole('textbox', { name: /Alt klasör adı/ })).toBeNull();
    fireEvent.click((await screen.findAllByRole('button', { name: /Alt klasör ekle/ }))[0] as HTMLElement);
    fireEvent.change(screen.getByRole('textbox', { name: /Alt klasör adı/ }), { target: { value: 'Sevkiyat' } });
    fireEvent.click(screen.getByRole('button', { name: /^Ekle$/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/ortak-dosyalar/ayarlar/sablon')).toBe(true));
    expect(cagrilar.find((c) => c.yol === '/ortak-dosyalar/ayarlar/sablon')?.govde).toEqual({ siparis: ['Teklif', 'Sevkiyat'], proje: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Teklif kaldır' }));
    await waitFor(() => expect(cagrilar.filter((c) => c.yol === '/ortak-dosyalar/ayarlar/sablon')).toHaveLength(2));
    expect(cagrilar.filter((c) => c.yol === '/ortak-dosyalar/ayarlar/sablon')[1]?.govde).toEqual({ siparis: [], proje: [] });
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
  });

  it('Ayarlar: mevcut kayıtlar sayıyla onaylanır; ilk grup onaylanan sayıyı taşır, kalan bitene dek gruplar halinde açılır', async () => {
    const cagrilar = sunucuKur({ kok: { id: 1, ad: 'Müşteriler' } }, { bagli: true, kokVar: true, klasorsuz: { firma: 20, siparis: 90, proje: 10 } });
    ciz('ayarlar');
    fireEvent.click(await screen.findByRole('button', { name: /Klasörleri aç/ }));
    fireEvent.click(await screen.findByRole('button', { name: /120 klasörü aç/ }));
    await waitFor(() => expect(cagrilar.filter((c) => c.yol === '/ortak-dosyalar/ayarlar/mevcut/ac')).toHaveLength(2));
    const [ilk, ikinci] = cagrilar.filter((c) => c.yol === '/ortak-dosyalar/ayarlar/mevcut/ac');
    expect((ilk?.govde as { beklenen: unknown }).beklenen).toEqual({ firma: 20, siparis: 90, proje: 10 });
    expect((ikinci?.govde as { beklenen: unknown }).beklenen).toBeNull();
    expect((ilk?.govde as { topluIs: string }).topluIs).toBe((ikinci?.govde as { topluIs: string }).topluIs);
  });

  it('kayıt ekranındaki "Klasör" bağlantısı klasörü ?klasor= ile açar; klasörü olmayan kayıtta çizilmez (kart 3288-2)', async () => {
    sunucuKur();
    ciz('klasorler', '/siparisler/77', <><KlasorBaglantisi tur="siparis" id={77} /><KlasorBaglantisi tur="proje" id={5} /></>);
    const bag = await screen.findByRole('link', { name: /Klasör/ });
    expect(bag.getAttribute('href')).toBe('/ortak-dosyalar?klasor=3');
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Klasör/ })).toHaveLength(1));
    cleanup();
    ciz('klasorler', '/ortak-dosyalar?klasor=3');
    expect(await screen.findByRole('link', { name: /Sipariş SS-2026-0412 aç/ })).toBeTruthy();
  });
});
