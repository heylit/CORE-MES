import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '../../../ortak/veri/api.ts';
import { SaatlikMaliyet, tutarGirdisi } from './SaatlikMaliyet.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
// İstasyon ve tutarlar uydurmadır.
const maliyet = (birimMaliyet: string, surum = 2) => ({ anahtar: 0, birimMaliyet, paraBirimi: 'TRY', guncelleme: '2026-11-01T08:00:00.000Z', guncelleyenId: 1, surum });
const ISTASYONLAR = [
  { anahtar: 1, kod: 'T-01', ad: 'Deneme torna', aktif: true, maliyet: { ...maliyet('850.5000'), anahtar: 1 } },
  { anahtar: 2, kod: 'F-01', ad: 'Deneme freze', aktif: true, maliyet: null },
  { anahtar: 3, kod: 'E-01', ad: 'Deneme eski', aktif: false, maliyet: { ...maliyet('400.0000', 1), anahtar: 3 } },
];

function sunucuKur(islemler: string[]) {
  const istekler: { yontem: string; yol: string; govde: unknown; kimlik: string | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const basliklar = new Headers(secenek?.headers);
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined, kimlik: basliklar.get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme', islemler } });
    if (yol === '/finans/saatlik-maliyetler/istasyon') return json(200, { satirlar: ISTASYONLAR });
    if (yol.endsWith('/yaz')) return json(200, { maliyet: maliyet('900.0000') });
    if (yol.endsWith('/kaldir')) return json(200, { kaldirilan: { tur: 'istasyon', anahtar: 1 } });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><SaatlikMaliyet /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Saatlik maliyetler (2593, 2589 b)', () => {
  it('tutarGirdisi: virgül ondalık, 0 geçerli; boş, eksi, beş ondalık ve çok büyük reddedilir', () => {
    expect(tutarGirdisi('850,5')).toEqual({ tamam: true, deger: 850.5 });
    expect(tutarGirdisi('0')).toEqual({ tamam: true, deger: 0 });
    for (const h of ['', '-5', '1,23456', '2000000000', 'abc']) expect(tutarGirdisi(h).tamam).toBe(false);
  });

  it('finans.maliyet-oku listeyi görür: girilmemiş maliyet "Girilmedi", pasif rozetli; düzenleme ve kaldırma düğmesi yok', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku']);
    ac();
    const tablo = await screen.findByRole('table', { name: 'İstasyon saatlik maliyetleri' });
    expect(within(tablo).getByText('850,50 ₺')).toBeTruthy();
    expect(within(tablo).getByText('Girilmedi')).toBeTruthy();
    expect(within(tablo).getByText('Pasif')).toBeTruthy();
    expect(within(tablo).queryByText('0,00 ₺')).toBeNull();
    expect(screen.queryByRole('button', { name: /maliyetini kaldır/ })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(istekler.some((i) => i.yol.includes('/kisi'))).toBe(false);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('finans.maliyet-yaz tutarı sürümle yazar; girilmemiş satır sürümsüz ilk giriş olur', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku', 'finans.maliyet-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme torna maliyetini düzenle' }));
    fireEvent.change(screen.getByLabelText(/Saatlik maliyet \(₺\)/), { target: { value: '900' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Deneme torna saatlik maliyeti' }));
    await vi.waitFor(() => expect(istekler.some((i) => i.yol === '/finans/maliyetler/istasyon/yaz')).toBe(true));
    expect(istekler.find((i) => i.yol === '/finans/maliyetler/istasyon/yaz')?.govde).toEqual({ anahtar: 1, birimMaliyet: 900, paraBirimi: 'TRY', surum: 2 });
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme freze maliyetini gir' }));
    fireEvent.change(screen.getByLabelText(/Saatlik maliyet \(₺\)/), { target: { value: '0' } });
    expect(screen.getByText(/0 "bedava" demektir/)).toBeTruthy();
    fireEvent.submit(screen.getByRole('form', { name: 'Deneme freze saatlik maliyeti' }));
    await vi.waitFor(() => expect(istekler.filter((i) => i.yol === '/finans/maliyetler/istasyon/yaz').length).toBe(2));
    expect(istekler.filter((i) => i.yol === '/finans/maliyetler/istasyon/yaz')[1]?.govde).toEqual({ anahtar: 2, birimMaliyet: 0, paraBirimi: 'TRY', surum: null });
  });

  it('boş tutar gönderilmez, kaldırmaya yönlendirir', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku', 'finans.maliyet-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme torna maliyetini düzenle' }));
    fireEvent.change(screen.getByLabelText(/Saatlik maliyet \(₺\)/), { target: { value: ' ' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Deneme torna saatlik maliyeti' }));
    expect((await screen.findAllByText(/maliyeti bilinmiyorsa "Kaldır"/)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Saatlik maliyet \(₺\)/).getAttribute('aria-invalid')).toBe('true');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('kaldırma onayla gider: sürüm gövdede, istek kimliği başlıkta', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku', 'finans.maliyet-yaz']);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme torna maliyetini kaldır' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/850,50 ₺ \/ saat kaldırılacak/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaldır' }));
    await vi.waitFor(() => expect(istekler.some((i) => i.yol === '/finans/maliyetler/istasyon/1/kaldir')).toBe(true));
    const k = istekler.find((i) => i.yol === '/finans/maliyetler/istasyon/1/kaldir');
    expect(k?.govde).toEqual({ surum: 2 });
    expect(k?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('finans.maliyet-oku yoksa liste istenmez, yetki iletisi görünür', async () => {
    const istekler = sunucuKur(['finans.oku', 'finans.maliyet-yaz']);
    ac();
    await screen.findByText('Saatlik maliyetleri görme yetkiniz yok.');
    expect(istekler.some((i) => i.yol.startsWith('/finans/saatlik-maliyetler'))).toBe(false);
  });
});
