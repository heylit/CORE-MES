import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { FirmaAramaCevabi, HaritaCevabi, NoktaGovdesi, NoktalarCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Noktalar } from './Noktalar.tsx';
import { NOKTALAR } from './test-verisi.ts';

const TANIMCI: Kullanici = { id: 5, ad: 'Deneme Tanımcı', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'sevkiyat.tanim-yaz'] };
const OKUYUCU: Kullanici = { id: 4, ad: 'Deneme Okuyucu', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku'] };
const FIRMALAR = { firmalar: [
  { id: 11, ad: 'Örnek Tedarikçi Firma', kod: 'T-1', tur: 'ikisi', fason: true, adres: 'Örnek Cad. 5', ilce: 'Deneme İlçesi', il: 'Deneme İli', noktaId: null },
  { id: 12, ad: 'Örnek Müşteri A', kod: null, tur: 'musteri', fason: false, adres: null, ilce: null, il: null, noktaId: 2 },
] } satisfies FirmaAramaCevabi;
let okunan: string[] = [];
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici, yazma: () => Response = () => json(200, { nokta: NOKTALAR.noktalar[1] }), noktalar: NoktalarCevabi = NOKTALAR) {
  const yazilan: { yol: string; govde: unknown }[] = [];
  okunan = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', ''); okunan.push(yol);
    if (ayar?.method === 'POST') { yazilan.push({ yol, govde: ayar.body ? JSON.parse(String(ayar.body)) : undefined }); return yazma(); }
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/sevkiyat/harita') return json(200, { harita: null } satisfies HaritaCevabi);
    if (yol === '/sevkiyat/noktalar') return json(200, noktalar);
    if (yol.startsWith('/sevkiyat/firmalar')) return json(200, FIRMALAR);
    if (yol.startsWith('/sevkiyat/arama')) return json(200, { sonuclar: [], dizinVar: true, kisaBaglanti: false });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilan;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/sevkiyat/noktalar']}><Noktalar /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
// Zorunlu alanın etiketinde ' *' işareti de yazılır; etiket başından eşlenir.
const doldur = (etiket: string, deger: string) => fireEvent.change(screen.getByLabelText(new RegExp(`^${etiket}`)), { target: { value: deger } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Noktalar', () => {
  it('yeni nokta sayısal alanlarla ve boş adres null olarak gönderilir', async () => {
    const yazilan = sunucuKur(TANIMCI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni nokta' }));
    doldur('Ad', 'Örnek Kargo D');
    fireEvent.change(screen.getByLabelText('Tür'), { target: { value: 'kargo' } });
    doldur('Enlem', '39,95');
    doldur('Boylam', '32.81');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilan).toHaveLength(1));
    expect(yazilan[0]).toEqual({ yol: '/sevkiyat/noktalar/ekle', govde: { ad: 'Örnek Kargo D', tur: 'kargo', enlem: 39.95, boylam: 32.81, adres: null, durakSuresiDakika: 20, firmaId: null } satisfies NoktaGovdesi });
  });

  it('firmadan alınan nokta firmanın adını, türünü ve adresini alır, konum firmanın ilçe ve iliyle aranır; noktası olan firma seçilemez', async () => {
    const yazilan = sunucuKur(TANIMCI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni nokta' }));
    fireEvent.focus(screen.getByLabelText('Firmadan al'));
    const firmalar = await screen.findByRole('list', { name: 'Firmalar' });
    expect((within(firmalar).getByRole('button', { name: /Örnek Müşteri A/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(firmalar).getByRole('button', { name: /Örnek Tedarikçi Firma/ }));
    expect((screen.getByLabelText(/^Ad/) as HTMLInputElement).value).toBe('Örnek Tedarikçi Firma');
    expect((screen.getByLabelText(/^Ad/) as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText('Tür') as HTMLSelectElement).value).toBe('fason');
    expect((screen.getByLabelText('Konum ara') as HTMLInputElement).value).toBe('Deneme İlçesi Deneme İli');
    expect((screen.getByLabelText('Açık adres / tarif') as HTMLInputElement).value).toBe('Örnek Cad. 5, Deneme İlçesi, Deneme İli');
    await waitFor(() => expect(okunan).toContain(`/sevkiyat/arama?metin=${encodeURIComponent('Deneme İlçesi Deneme İli')}`));
    doldur('Enlem', '39.95'); doldur('Boylam', '32.81');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilan).toHaveLength(1));
    expect(yazilan[0]?.govde).toMatchObject({ ad: 'Örnek Tedarikçi Firma', tur: 'fason', firmaId: 11, adres: 'Örnek Cad. 5, Deneme İlçesi, Deneme İli' });
  });

  it('firmalı olmayan türe geçince firma bağı düşer', async () => {
    const yazilan = sunucuKur(TANIMCI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni nokta' }));
    fireEvent.focus(screen.getByLabelText('Firmadan al'));
    fireEvent.click(within(await screen.findByRole('list', { name: 'Firmalar' })).getByRole('button', { name: /Örnek Tedarikçi Firma/ }));
    fireEvent.change(screen.getByLabelText('Tür'), { target: { value: 'kargo' } });
    expect(screen.queryByText('Firma bağını kaldır')).toBeNull();
    doldur('Enlem', '39.95'); doldur('Boylam', '32.81');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilan).toHaveLength(1));
    expect(yazilan[0]?.govde).toMatchObject({ tur: 'kargo', firmaId: null });
  });

  it('fabrika konumu ayardan geliyorsa bunu söyler', async () => {
    sunucuKur(OKUYUCU, undefined, { ...NOKTALAR, fabrikaAyardan: true });
    ac();
    expect(await screen.findByText(/Fabrikanın konumu Sistem Ayarları/)).toBeTruthy();
    cleanup();
    sunucuKur(OKUYUCU);
    ac();
    await screen.findByText(NOKTALAR.noktalar[1]!.ad);
    expect(screen.queryByText(/Fabrikanın konumu Sistem Ayarları/)).toBeNull();
  });

  it('fabrikada konum girilmez: konum alanları yerine Sistem Ayarları notu durur (930 a)', async () => {
    sunucuKur(TANIMCI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni nokta' }));
    const form = screen.getByRole('form', { name: 'Yeni nokta' });
    expect(within(form).getByLabelText(/^Enlem/)).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Tür'), { target: { value: 'fabrika' } });
    expect(within(form).queryByLabelText(/^Enlem/)).toBeNull();
    expect(within(form).queryByRole('button', { name: 'Haritadan seç' })).toBeNull();
    expect(within(form).getByText(/Fabrikanın konumu Sistem Ayarları/)).toBeTruthy();
  });

  it('sunucu ikinci fabrikayı reddederse iletisi yazılır, form açık kalır', async () => {
    const RET = { kod: 'CAKISMA', mesaj: 'Aktif bir fabrika noktası zaten var; önce onu pasifleştirin.' } satisfies HataGovdesi;
    sunucuKur(TANIMCI, () => json(409, RET));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni nokta' }));
    doldur('Ad', 'İkinci Fabrika');
    fireEvent.change(screen.getByLabelText('Tür'), { target: { value: 'fabrika' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toBe(RET.mesaj);
    expect(screen.getByRole('form', { name: 'Yeni nokta' })).toBeTruthy();
  });

  it('tanım yetkisi yoksa yeni nokta ve düzenleme düğmesi yoktur', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await screen.findByText(NOKTALAR.noktalar[1]!.ad);
    // Yokluk sınanmadan önce oturum (yetkiler) gelmiş olmalı.
    await waitFor(() => expect(okunan).toContain('/oturum'));
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByRole('button', { name: 'Yeni nokta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
  });
});
