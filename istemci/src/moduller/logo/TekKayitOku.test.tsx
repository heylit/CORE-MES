import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import type { Kullanici } from '../../ortak/veri/oturum.ts';
import { TekKayitOku } from './TekKayitOku.tsx';

// 3626: değerler uydurma deneme değerleridir (ORN-).
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown }
function sunucuKur(okuma: { sonuc: string; ileti: string }) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yontem, yol: adres.replace('/api', ''), govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yontem === 'GET') return json(200, okuma);
    return json(200, { sonuc: 'okundu', ileti: 'Aynaya yazıldı (1 kayıt).' });
  }));
  return cagrilar;
}
function cizdir(islemler: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  return render(<QueryClientProvider client={istemci}><BildirimSaglayici><TekKayitOku /></BildirimSaglayici></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Tek kayıt oku (3626)', () => {
  it('kod 3 karakterden kısaysa düğme kapalı; önce Logo\'dan okunur, okunduysa aynaya yazılır', async () => {
    const cagrilar = sunucuKur({ sonuc: 'okundu', ileti: 'Logo\'da bulundu: ORN-MLZ-1. Aynaya yazılabilir.' });
    cizdir(['sayfa.logo', 'ayarlar.yaz']);
    const dugme = screen.getByRole('button', { name: "Logo'dan oku" }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Stok kodu'), { target: { value: 'AB' } });
    expect(dugme.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Stok kodu'), { target: { value: 'ORN-MLZ-1' } });
    expect(dugme.disabled).toBe(false);
    fireEvent.click(dugme);
    expect(await screen.findAllByText('Aynaya yazıldı (1 kayıt).')).toBeTruthy();
    expect(cagrilar.map((c) => [c.yontem, c.yol, c.govde])).toEqual([
      ['GET', '/logo/yonetim/akislar/malzeme-karti/kayit?kod=ORN-MLZ-1', undefined],
      ['POST', '/logo/yonetim/akislar/malzeme-karti/kayit-yaz', { kod: 'ORN-MLZ-1' }],
    ]);
  });

  it('Logo\'da yoksa ya da okunamazsa yazma çağrısı yapılmaz ve neden gösterilir; fatura akışında alan adı değişir', async () => {
    const cagrilar = sunucuKur({ sonuc: 'logoda-yok', ileti: "Logo'da SP-ORN-9 numaralı sipariş bulunamadı; aynadaki kopya silinmedi." });
    cizdir(['ayarlar.yaz']);
    fireEvent.change(screen.getByLabelText('Akış'), { target: { value: 'fatura' } });
    fireEvent.change(screen.getByLabelText('Sipariş numarası'), { target: { value: 'SP-ORN-9' } });
    fireEvent.click(screen.getByRole('button', { name: "Logo'dan oku" }));
    await waitFor(() => expect(cagrilar.length).toBe(1));
    expect((await screen.findAllByText(/aynadaki kopya silinmedi/)).length).toBeGreaterThan(0);
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
  });

  it('yazma yetkisi olmayan bu bölümü görmez', () => {
    sunucuKur({ sonuc: 'okundu', ileti: '' });
    cizdir(['sayfa.logo']);
    expect(screen.queryByRole('button', { name: "Logo'dan oku" })).toBeNull();
  });
});
