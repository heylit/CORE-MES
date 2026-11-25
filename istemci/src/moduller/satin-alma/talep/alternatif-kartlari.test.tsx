import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { KabulZarfiCevabi, MalzemeSecenekleriCevabi, Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { AlternatifKartlari } from './AlternatifKartlari.tsx';
import { TalepAc } from './TalepAc.tsx';

// 3593: talep formunda kalemin alternatif kartları; tam ve üst varsayılan işaretli, şartlı işaretsiz; gövdede işaretli kartların kimliği.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const KARTLAR = { malzemeler: [{ no: 21, kod: 'ORN-HM-00021', ad: 'Deneme çubuk 6082', birim: 'adet', kategori: null, katalogId: null, hammadde: true }] } satisfies MalzemeSecenekleriCevabi;
const ZARF_CEVABI: KabulZarfiCevabi = {
  zarf: null,
  alternatifKartlari: [
    { id: 5, ad: 'ORN AK-1', tur: 'tam', ozet: '6082 ya da 6061 · T6 · Ø 50–55 (−0/+5)', uyanSayisi: 2 },
    { id: 6, ad: 'ORN AK-2', tur: 'sartli', ozet: 'T651', uyanSayisi: 0 },
  ],
};
const talep = (kalemler: Talebim['kalemler']): Talebim => ({
  id: '00000000-0000-4000-8000-000000000001', no: 'ST-2026-001', baslik: 'Deneme talep', durum: 'taslak', ihtiyacTarihi: null,
  olusturma: '2026-11-19T08:00:00Z', uretimEmriNo: null, kaynak: 'elle', kalemler,
});
function sunucuKur() {
  const cagrilar: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    cagrilar.push({ yol, govde: istek?.body ? JSON.parse(String(istek.body)) : null });
    if (yol.startsWith('/satin-alma-malzeme-secenekleri?')) return json(200, KARTLAR);
    if (yol === '/satin-alma-acik-emirler') return json(200, { emirler: [] });
    if (yol === '/satin-alma-kabul-zarfi/21') return json(200, ZARF_CEVABI);
    if (yol === '/satin-alma-talepleri/hizli-ac') return json(200, talep([]));
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}
const sar = (cocuk: ReactNode) => render(
  <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici>{cocuk}</BildirimSaglayici></QueryClientProvider></MemoryRouter>,
);
async function kartSec() {
  fireEvent.focus(screen.getByRole('combobox', { name: 'Malzeme' }));
  fireEvent.click(await screen.findByRole('option', { name: /ORN-HM-00021/ }));
}
async function gonder(cagrilar: { yol: string; govde: unknown }[]) {
  fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
  await screen.findByText(/açıldı; satın almaya düştü/);
  return (cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as { kalemler: Record<string, unknown>[] }).kalemler[0]!;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3593: talep kaleminde alternatif kartları', () => {
  it('ayrıntı açılmasa da tam kart işaretli gider, şartlı gitmez; satırda sayısı yazar', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    await kartSec();
    expect(await screen.findByText(/1\/\d+ alternatif kartı işaretli/)).toBeTruthy();
    expect((await gonder(cagrilar)).alternatifKartlari).toEqual([5]);
  });

  it('şartlı kart işaretlenir, tam kart kaldırılır; özet cümlesi ve tür görünür', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    await kartSec();
    fireEvent.click(await screen.findByRole('button', { name: /alternatif sınırını değiştir/ }));
    const grup = await screen.findByRole('group', { name: 'Kalem 1: kabul edilen alternatif kartları' });
    expect(within(grup).getByText('6082 ya da 6061 · T6 · Ø 50–55 (−0/+5)')).toBeTruthy();
    expect(within(grup).getByRole('link', { name: 'İkame ve alternatifler' }).getAttribute('href')).toBe('/malzemeler/alternatifler');
    const kutular = within(grup).getAllByRole('checkbox') as HTMLInputElement[];
    expect(kutular.map((k) => k.checked)).toEqual([true, false]);
    fireEvent.click(kutular[1]!);
    fireEvent.click(kutular[0]!);
    expect((await gonder(cagrilar)).alternatifKartlari).toEqual([6]);
  });

  it('Y10: kart sonradan değişti; işaret eski özetle durur, "Yeni sınırla güncelle" yenilemeyi ister, "Eski sınırla kalsın" uyarıyı kapatır', async () => {
    sunucuKur();
    const degistir = vi.fn();
    const yenile = vi.fn();
    sar(<AlternatifKartlari no={21} sira={1} secili={null} yeni={false} degistir={degistir} yenileDegistir={yenile}
      onceki={[{ setId: 5, ad: 'ORN AK-1', tur: 'tam', ozet: '6082 · Ø 40–45 (−0/+5)' }]} />);
    const uyari = await screen.findByRole('status');
    expect(uyari.textContent).toMatch(/şu an 6082 ya da 6061 · T6 · Ø 50–55 \(−0\/\+5\); bu talepte 6082 · Ø 40–45 \(−0\/\+5\) olarak işaretlenmişti/);
    fireEvent.click(within(uyari).getByRole('button', { name: 'Yeni sınırla güncelle' }));
    expect(yenile).toHaveBeenCalledWith([5]);
    expect(degistir).toHaveBeenCalledWith([5]);
    fireEvent.click(within(uyari).getByRole('button', { name: 'Eski sınırla kalsın' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
