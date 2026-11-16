import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { LogoGecisCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import type { LogoMalzemeAramaCevabi, LogoMalzemeAramaDurumuCevabi } from '#paylasilan/sozlesme/logo.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { useKatalogLogoAramasi } from './LogoAramasi.tsx';
import { LOGO_GECIS_ANAHTARI } from '../../LogoMalzemeGecisi.tsx';
import { LOGO_GELEN_ANAHTARI } from '../../LogodanGelenler.tsx';
import { MALZEMELER_YENI } from '../veri.ts';

// 3319 a: katalogda "Logo'da da ara". Logo'ya istek yalnız düğmeyle; sonuç listenin üstünde şeritte, satır Logo geçişindeki satırdır.
type Satir = LogoGecisCevabi['kartlar'][number];
const ortak: Omit<Satir, 'logoKayitNo' | 'kod' | 'ad' | 'durum' | 'tmi' | 'aktif'> = {
  birimSeti: 'ADET', kartTuru: '13', stok: null, sonHareket: null, kullanimNedenleri: null, farklar: [], kararNedeni: null,
  topluBaglanir: false, topluAlinir: false, koduUyar: true,
};
const tmi = (kimlik: string, stokKodu: string) => ({ kimlik, stokKodu, ad: 'CORE', birim: 'adet', onayDurumu: 'aktif' as const, surum: 3, logoKayitli: false });
const SATIRLAR: Satir[] = [
  { ...ortak, logoKayitNo: 40, kod: 'ORN-LG-1040', ad: 'Deneme mil 40', durum: 'yeni', aktif: true, tmi: null },
  { ...ortak, logoKayitNo: 41, kod: 'ORN-LG-1041', ad: 'Deneme mil 41', durum: 'bagli', aktif: true, tmi: { ...tmi('k41', 'HM-ORN-00412'), logoKayitli: true } },
  { ...ortak, logoKayitNo: 42, kod: 'ORN-LG-2210', ad: 'Deneme flans', durum: 'yeni', aktif: false, tmi: null },
  { ...ortak, logoKayitNo: 43, kod: 'HM-ORN-00043', ad: 'Deneme ayni kod', durum: 'bagsiz', aktif: true, tmi: tmi('k43', 'HM-ORN-00043') },
];
const LISTE = (kartlar: Satir[]): LogoGecisCevabi => ({
  baglanti: true, okuma: { acik: false, suruyor: false, okunan: 4, sonTamam: null },
  sayilar: { toplam: 4, stoklu: 0, yeni: 2, bagsiz: 1, bagli: 1, kullanimDisi: 1, kullanilan: null, kararBekleyen: 0 },
  suzgec: 'tumu', kullanim: false, canliArama: true, uyan: kartlar.length, kartlar, sayfa: 0, sonrakiSayfa: null,
});
const YAZAN: Kullanici = { id: 1, ad: 'Deneme Yazan', islemler: ['sayfa.malzemeler', 'malzemeler.yaz'] };

const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });

interface Kurulum {
  durum?: LogoMalzemeAramaDurumuCevabi;
  arama?: LogoMalzemeAramaCevabi | (() => Promise<Response>);
}
function sunucuKur(k: Kurulum = {}) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : null });
    if (yol === '/oturum') return json(200, { kullanici: YAZAN } satisfies OturumCevabi);
    if (yol === '/logo-gecisi/malzeme-arama-durumu') return json(200, k.durum ?? { acik: true, neden: null });
    if (yol.startsWith('/logo-gecisi/malzeme-ara?')) {
      if (typeof k.arama === 'function') return k.arama();
      return json(200, k.arama ?? { durum: 'tamam', ileti: null, kartlar: SATIRLAR.map((s) => ({ logoKayitNo: s.logoKayitNo, kod: s.kod, ad: s.ad })) });
    }
    if (yol === '/logo-gecisi/malzeme-ekle') return json(200, { eklenen: 4 });
    if (yol.startsWith('/malzeme-logo-gecisi?')) return json(200, LISTE(SATIRLAR));
    if (yol === '/malzeme-logo-durumu') {
      return json(200, { kartlar: [], karsiliklar: [{ cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: '13' }], kartTuruSecenekleri: [{ kod: '13', ad: 'Tüketim malı' }], karsilikYazabilir: false });
    }
    if (yol === '/malzeme-birimleri') return json(200, { birimler: [{ kod: 'adet', aktif: true }] });
    if (yontem === 'POST' && yol.endsWith('/bagla')) return json(200, { id: 'k43', surum: 4 });
    if (yontem === 'POST' && yol.endsWith('/al')) return json(200, { id: 'k40', stok_kodu: 'HM-ORN-00040' });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
  }));
  return istekler;
}

const acilan: string[] = [];
function Deneme({ yazabilir = true, ilk = 'mil' }: { yazabilir?: boolean; ilk?: string }) {
  const [metin, metinYaz] = useState(ilk);
  const l = useKatalogLogoAramasi({ metin, yazabilir, kartAc: (k) => acilan.push(k) });
  return (
    <div>
      <input aria-label="Katalogda ara" value={metin} onChange={(o) => metinYaz(o.target.value)} />
      {l.dugme}
      {l.serit}
    </div>
  );
}
function ac(ekran = <Deneme />) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider></MemoryRouter>);
  return istemci;
}
// Alma ve bağlamadan sonra katalog, Logo geçişi ve Logo'dan gelenler yeniden okunur.
const yenilenenler = (yoklama: { mock: { calls: readonly (readonly unknown[])[] } }) => yoklama.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
const YENILENMELI = [LOGO_GECIS_ANAHTARI, LOGO_GELEN_ANAHTARI, MALZEMELER_YENI].map((k) => JSON.stringify(k));
const dugme = () => screen.getByRole('button', { name: "Logo'da da ara" });
const satir = (kod: string) => screen.getByText(kod).closest('li')!;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); acilan.length = 0; });

describe('Katalogda Logo araması (3319 a)', () => {
  it('malzeme kartı açamayana düğme yok ve hiçbir istek gitmez', async () => {
    const istekler = sunucuKur();
    ac(<Deneme yazabilir={false} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: "Logo'da da ara" })).toBeNull();
    expect(istekler).toEqual([]);
  });

  it('yazarken Logo\'ya gidilmez; 3 karakterden azsa ve ayar kapalıysa düğme pasif, nedeni yanında', async () => {
    const istekler = sunucuKur({ durum: { acik: false, neden: 'Logo bağlantısı kapalı (Sistem Ayarları).' } });
    ac(<Deneme ilk="mi" />);
    await screen.findByText('Logo bağlantısı kapalı (Sistem Ayarları).');
    expect((dugme() as HTMLButtonElement).disabled).toBe(true);
    cleanup(); vi.unstubAllGlobals();
    sunucuKur();
    ac(<Deneme ilk="mi" />);
    await screen.findByText('En az 3 karakter yazın.');
    expect((dugme() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Katalogda ara'), { target: { value: 'mil' } });
    await waitFor(() => expect((dugme() as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText('En çok 20 sonuç gösterilir.')).toBeTruthy();
    expect(istekler.filter((i) => i.yol.startsWith('/logo-gecisi/malzeme-ara?'))).toEqual([]);
  });

  it('düğmeyle arar, bulunanları kopyaya ekler ve şeritte tür, CORE karşılığı ve satır eylemleriyle gösterir', async () => {
    const istekler = sunucuKur();
    const yoklama = vi.spyOn(ac(), 'invalidateQueries');
    await waitFor(() => expect((dugme() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dugme());
    const serit = await screen.findByRole('region', { name: "Logo'da bulunanlar" });
    await within(serit).findByText('ORN-LG-1040');
    expect(istekler.filter((i) => i.yol.startsWith('/logo-gecisi/malzeme-ara?')).map((i) => i.yol)).toEqual(['/logo-gecisi/malzeme-ara?q=mil']);
    expect(istekler.find((i) => i.yol === '/logo-gecisi/malzeme-ekle')?.govde).toEqual({ kartlar: [40, 41, 42, 43] });
    expect(istekler.some((i) => i.yol === '/malzeme-logo-gecisi?kayitlar=40%2C41%2C42%2C43&sayfa=0')).toBe(true);
    await waitFor(() => expect(within(satir('ORN-LG-1040')).getByText('Tüketim malı (CORE: Sarf)')).toBeTruthy());
    expect(within(satir('ORN-LG-1040')).getByRole('button', { name: "ORN-LG-1040 CORE'a al" })).toBeTruthy();
    expect(within(satir('ORN-LG-1040')).queryByRole('button', { name: /var olan karta bağla/ })).toBeNull();
    expect(within(satir('ORN-LG-1041')).getByText("CORE'da: HM-ORN-00412")).toBeTruthy();
    fireEvent.click(within(satir('ORN-LG-1041')).getByRole('button', { name: 'Kartı aç' }));
    expect(acilan).toEqual(['k41']);
    expect(within(satir('ORN-LG-2210')).getByText("Logo'da pasif")).toBeTruthy();
    expect(within(satir('ORN-LG-2210')).queryByRole('button')).toBeNull();
    // Aynı kodlu CORE kartı varsa bağlama; Logo'ya yazılmaz, yalnız CORE'da bağ kurulur.
    fireEvent.click(within(satir('HM-ORN-00043')).getByRole('button', { name: 'HM-ORN-00043 var olan karta bağla' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-kartlari/43/bagla')?.govde).toEqual({ surum: 3 }));
    await waitFor(() => expect(yenilenenler(yoklama)).toEqual(expect.arrayContaining(YENILENMELI)));
    yoklama.mockClear();
    // "CORE'a al" Logo geçişindeki alma penceresini açar.
    fireEvent.click(within(satir('ORN-LG-1040')).getByRole('button', { name: "ORN-LG-1040 CORE'a al" }));
    expect(await screen.findByText("Logo'dan al: ORN-LG-1040")).toBeTruthy();
    await screen.findByRole('option', { name: /adet/ });
    fireEvent.change(screen.getByLabelText(/^Birim/), { target: { value: 'adet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/malzeme-logo-kartlari/40/al')).toBe(true));
    await waitFor(() => expect(yenilenenler(yoklama)).toEqual(expect.arrayContaining(YENILENMELI)));
    // Gizle sonucu silmez; yeniden açılır ve Logo'ya ikinci istek gitmez.
    fireEvent.click(within(serit).getByRole('button', { name: 'Gizle' }));
    fireEvent.click(await screen.findByRole('button', { name: "Logo'da bulunanları göster (4)" }));
    expect(await screen.findByRole('region', { name: "Logo'da bulunanlar" })).toBeTruthy();
    expect(istekler.filter((i) => i.yol.startsWith('/logo-gecisi/malzeme-ara?'))).toHaveLength(1);
  });

  it('bekliyorken geçen süre yazar, düğme meşgul ve ikinci arama gitmez; ekran okuyucuya yalnız başta ve sonda söylenir', async () => {
    let coz: (r: Response) => void = () => {};
    const istekler = sunucuKur({ arama: () => new Promise<Response>((c) => { coz = c; }) });
    ac();
    await waitFor(() => expect((dugme() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dugme());
    const serit = await screen.findByRole('region', { name: "Logo'da bulunanlar" });
    expect(serit.getAttribute('aria-busy')).toBe('true');
    expect(within(serit).getByText("Logo'da aranıyor…")).toBeTruthy();
    expect(dugme().getAttribute('aria-busy')).toBe('true');
    fireEvent.click(dugme());
    expect(istekler.filter((i) => i.yol.startsWith('/logo-gecisi/malzeme-ara?'))).toHaveLength(1);
    await waitFor(() => expect(within(serit).getByText('0:01')).toBeTruthy(), { timeout: 2500 });
    expect(within(serit).getByText('0:01').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText("Logo'da aranıyor.").getAttribute('aria-live')).toBe('polite');
    await act(async () => { coz(json(200, { durum: 'tamam', ileti: null, kartlar: [] })); await Promise.resolve(); });
    expect(await screen.findByText('Logo\'da da bulunamadı')).toBeTruthy();
    expect(screen.getByText('"mil" Logo\'da da yok. Kod ya da adın bir parçasıyla deneyin.')).toBeTruthy();
  });

  it('hata: sunucunun nedeni yazar ve "Tekrar dene" aynı metinle yeniden arar', async () => {
    const istekler = sunucuKur({ arama: { durum: 'hata', ileti: "Logo yardımcısına ulaşılamadı (ECONNREFUSED).", kartlar: [] } });
    ac();
    await waitFor(() => expect((dugme() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dugme());
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Logo yardımcısına ulaşılamadı.');
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/logo-gecisi/malzeme-ara?q=mil')).toHaveLength(2));
  });

  it('20 kart dönerse "İlk 20 kart" ve daraltma notu çıkar', async () => {
    const yirmi = Array.from({ length: 20 }, (_, i) => ({ logoKayitNo: 100 + i, kod: `ORN-Y-${i}`, ad: null }));
    sunucuKur({ arama: { durum: 'tamam', ileti: null, kartlar: yirmi } });
    ac();
    await waitFor(() => expect((dugme() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dugme());
    expect(await screen.findByText(/İlk 20 kart/)).toBeTruthy();
    expect(screen.getByText('Daha çok sonuç olabilir; aramayı daraltın.')).toBeTruthy();
  });
});
