import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { HaritaCevabi, TekRotaCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { saatMetni } from './bicim.ts';
import { TekRota, duraklariCoz, duraklariYaz } from './TekRota.tsx';
import { ARACLAR, GUN_PLANI, NOKTALAR, TEK_ROTA } from './test-verisi.ts';

const KULLANICI: Kullanici = { id: 4, ad: 'Deneme Okuyucu', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const id = (ad: string) => NOKTALAR.noktalar.find((n) => n.ad === ad)!.id;
const A = id('Örnek Müşteri A'), B = id('Örnek Fason B'), C = id('Örnek Tedarikçi C');
const ROTA_ADRESI = `/sevkiyat/tek-rota?tarih=${GUN_PLANI.tarih}&cikis=08:30&arac=kamyonet&amac=sure&fabrikayaDon=1&siraKorunur=0&duraklar=${A}b1,${B}a1,${C}`;

function sunucuKur(tekRota: TekRotaCevabi = TEK_ROTA) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', ''); yollar.push(yol);
    if (yol === '/oturum') return json(200, { kullanici: KULLANICI } satisfies OturumCevabi);
    if (yol === '/sevkiyat/harita') return json(200, { harita: null } satisfies HaritaCevabi);
    if (yol === '/sevkiyat/noktalar') return json(200, NOKTALAR);
    if (yol === '/sevkiyat/araclar') return json(200, ARACLAR);
    if (yol.startsWith(`/sevkiyat/planlar/`)) return json(200, GUN_PLANI);
    if (yol.startsWith('/sevkiyat/tek-rota?')) return json(200, tekRota);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yollar;
}
function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}><TekRota /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TekRota', () => {
  it('adres satırındaki seçimlerle hesap istenir; sunucunun sırası, saatleri ve sürücü bağlantısı gösterilir', async () => {
    const yollar = sunucuKur();
    ac(ROTA_ADRESI);
    const cizelge = await screen.findByRole('region', { name: 'Sonuç' });
    await within(cizelge).findByText('Toplam');
    expect(yollar.filter((y) => y.startsWith('/sevkiyat/tek-rota?'))).toEqual([ROTA_ADRESI.replace(/,/g, '%2C').replace(/:/g, '%3A')]);
    const satirlar = within(cizelge).getAllByRole('listitem');
    // çıkış + duraklar + dönüş
    expect(satirlar).toHaveLength(TEK_ROTA.plan.duraklar.length + 2);
    expect(satirlar[1]!.textContent).toContain(`${saatMetni(TEK_ROTA.plan.duraklar[0]!.varis)}${TEK_ROTA.plan.duraklar[0]!.ad}`);
    expect(screen.queryByRole('link', { name: /Haritalar'da aç|Yandex'te aç/ })).toBeNull();
    const yaz = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: yaz }, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Yandex bağlantısını kopyala' }));
    expect(yaz).toHaveBeenCalledWith(TEK_ROTA.plan.yandex);
    await screen.findByRole('button', { name: 'Kopyalandı' });
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('180, 200 a: maliyet gelmezse Maliyet göstergesi ve öncelik farkındaki tutar çıkmaz; 0 TL yazılmaz', async () => {
    const plan = { ...TEK_ROTA.plan, maliyet: null, oranlar: null, karsilastirma: TEK_ROTA.plan.karsilastirma.map((k) => ({ ...k, maliyet: null })) };
    sunucuKur({ plan, neden: null });
    ac(ROTA_ADRESI);
    const cizelge = await screen.findByRole('region', { name: 'Sonuç' });
    await within(cizelge).findByText('Toplam');
    expect(within(cizelge).queryByText('Maliyet')).toBeNull();
    expect(document.body.textContent).not.toMatch(/₺|TL/);
  });

  it('Durak ekle seçiminden nokta seçmek durağı adres satırına ekler ve yeni hesap ister', async () => {
    const yollar = sunucuKur();
    ac(`/sevkiyat/tek-rota?tarih=${GUN_PLANI.tarih}&duraklar=${A}`);
    await within(await screen.findByRole('region', { name: 'Sonuç' })).findByText('Toplam');
    fireEvent.change(screen.getByRole('combobox', { name: 'Durak ekle' }), { target: { value: String(B) } });
    await waitFor(() => expect(yollar.some((y) => y.includes(`duraklar=${A}%2C${B}`))).toBe(true));
  });

  it('seçilen araç ve açıldığı sefer özet şeridinde yazar; araç seçmek türü değiştirir, belirli araç yoksa tür seçilir', async () => {
    const yollar = sunucuKur();
    const kamyon = ARACLAR.araclar.find((a) => a.tur === 'kamyon')!;
    ac(`/sevkiyat/tek-rota?tarih=${GUN_PLANI.tarih}&arac=kamyon&aracId=${kamyon.id}&kaynak=${encodeURIComponent(`${kamyon.ad} · 1. sefer`)}&duraklar=${A}`);
    const ozet = await screen.findByRole('group', { name: 'Araç' });
    await waitFor(() => expect(within(ozet).getByRole('button', { name: new RegExp(kamyon.ad) }).getAttribute('aria-pressed')).toBe('true'));
    const secimler = screen.getByLabelText('Seçimler');
    expect(secimler.textContent).toContain(kamyon.ad);
    expect(secimler.textContent).toContain(`Günün planı: ${kamyon.ad} · 1. sefer`);
    const kamyonet = ARACLAR.araclar.find((a) => a.tur === 'kamyonet')!;
    fireEvent.click(within(ozet).getByRole('button', { name: new RegExp(kamyonet.ad) }));
    await waitFor(() => expect(yollar.some((y) => y.startsWith('/sevkiyat/tek-rota?') && y.includes('arac=kamyonet'))).toBe(true));
    expect(screen.getByLabelText('Seçimler').textContent).toContain(kamyonet.ad);
  });

  it('durak biçimi: süre ve al-bırak çifti okunur ve aynı biçimde yazılır', () => {
    const metin = `${A}s20b1,${B}a1,${C}`;
    expect(duraklariCoz(metin)).toEqual([
      { noktaId: A, durakSuresiDakika: 20, rol: 'birak', cift: 1 }, { noktaId: B, durakSuresiDakika: null, rol: 'al', cift: 1 }, { noktaId: C, durakSuresiDakika: null, rol: null, cift: null },
    ]);
    expect(duraklariYaz(duraklariCoz(metin))).toBe(metin);
  });
});
