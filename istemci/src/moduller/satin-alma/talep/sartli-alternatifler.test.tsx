import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Talebim, TaleplerimCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { Taleplerim } from './Taleplerim.tsx';

// 3437-3b-1: talepte şartlı muadil işaretlenmediyse talep eden şartlı alternatifi Taleplerim'de onaylar ya da reddeder.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const TALEP = '00000000-0000-4000-8000-000000000001';
const KALEM = '00000000-0000-4000-8000-000000000002';
const TEKLIF = '00000000-0000-4000-8000-000000000003';
const ALT = { kalite: '6262', durum: null, yuzey: null, olcu: { d: 52 } };
type Sartli = NonNullable<Talebim['kalemler'][number]['sartliAlternatifler']>[number];
const talep = (s: Partial<Sartli> = {}): Talebim => ({
  id: TALEP, no: 'ST-2026-001', baslik: 'Deneme talep', durum: 'degerlendirme', ihtiyacTarihi: null, olusturma: '2026-11-19T08:00:00Z',
  uretimEmriNo: null, kaynak: 'elle',
  kalemler: [{
    id: KALEM, ad: 'Deneme çubuk', miktar: '6', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null, malzemeNo: 21, kabul: null,
    sartliAlternatifler: [{ teklifId: TEKLIF, alternatif: ALT, nedenler: ['Kalite 6262 şartlı'], izin: null, izinZaman: null, izinNotu: null, ...s }],
  }],
});

function sunucuKur(sonra: Talebim) {
  const cagrilar: { yol: string; govde: unknown }[] = [];
  let simdiki = talep();
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    cagrilar.push({ yol, govde: istek?.body ? JSON.parse(String(istek.body)) : null });
    if (yol.startsWith('/satin-alma-taleplerim')) return json(200, { talepler: [simdiki], toplam: 1 } satisfies TaleplerimCevabi);
    if (yol === `/satin-alma-talepleri/${TALEP}/alternatif-izni`) { simdiki = sonra; return json(200, sonra); }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}
const sar = () => render(
  <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici><Taleplerim tam /></BildirimSaglayici></QueryClientProvider></MemoryRouter>,
);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3437-3b-1: Taleplerim şartlı alternatif onayı', () => {
  it('bekleyen alternatif kapalı satırda rozetle görünür; açınca nitelik ve neden; onay gördüğü alternatifle ve notla gider', async () => {
    const cagrilar = sunucuKur(talep({ izin: 'soru', izinZaman: '2026-11-19T10:00:00Z', izinNotu: 'Deneme izin' }));
    sar();
    expect(await screen.findByText('Alternatif onayınızda')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Kalite 6262 · d 52 mm')).toBeTruthy();
    expect(screen.getByText('Kalite 6262 şartlı')).toBeTruthy();
    expect(screen.getByText('Onayınızı bekliyor')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Not/), { target: { value: 'Deneme izin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(screen.getByText(/^Onayladınız/)).toBeTruthy());
    const g = cagrilar.find((c) => c.yol.endsWith('/alternatif-izni'))!.govde;
    expect(g).toEqual({ teklifId: TEKLIF, kalemId: KALEM, karar: 'onay', notu: 'Deneme izin', alternatif: ALT });
    expect(screen.queryByText('Alternatif onayınızda')).toBeNull();
    // Karar verilmiş satırda form kapalı; "Kararı değiştir" yalnız karşıt düğmeyi açar.
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reddet' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kararı değiştir' }));
    expect(screen.getByLabelText(/^Ret nedeni/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reddet' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
  });

  it('talepte şartlı kabul edilmiş alternatifte karar düğmesi yok; sunucu reddederse ileti görünür', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { talepler: [talep({ izin: 'talep' })], toplam: 1 } satisfies TaleplerimCevabi)));
    sar();
    fireEvent.click(await screen.findByRole('button', { expanded: false }));
    expect(screen.getByText('Talepte şartlı kabul edildi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => (String(adres).endsWith('/alternatif-izni')
      ? json(422, { kod: 'GECERSIZ', mesaj: 'Bu şartlı alternatif artık yok ya da teklif değişti.' })
      : json(200, { talepler: [talep()], toplam: 1 } satisfies TaleplerimCevabi))));
    sar();
    fireEvent.click(await screen.findByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/artık yok/);
  });
});
