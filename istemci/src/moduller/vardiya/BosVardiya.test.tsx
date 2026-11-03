import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GunlukMesaiCevabi, TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GunlukMesaiEkrani } from './GunlukMesai.tsx';
import { VardiyaEkrani } from './Vardiya.tsx';

const YAZAN: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.vardiya', 'sayfa.mesai', 'vardiya.yaz'] };
const IZLEYEN: Kullanici = { id: 2, ad: 'Deneme İzleyen', islemler: ['sayfa.vardiya', 'sayfa.mesai'] };

const BOS: TakvimCevabi = { vardiyalar: [], matris: [], gunler: [], isMerkezleri: [], kadro: [], kisiVardiyalari: [], bugun: '2026-10-10' };
const DOLU: TakvimCevabi = {
  ...BOS,
  vardiyalar: [{ id: 1, ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 1, molalar: [], netDakika: 480 }],
};
const MESAI: GunlukMesaiCevabi = { tarih: '2026-10-10', satirlar: [] };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Cagri { yol: string; yontem: string; govde: unknown; baslik: Record<string, string> }

function sunucuKur(kullanici: Kullanici, ilkPost?: () => Response, dusenSira = 1) {
  const cagrilar: Cagri[] = [];
  let post = 0;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({
      yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined,
      baslik: Object.fromEntries(new Headers(secenek?.headers).entries()),
    });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/vardiya-takvimi') return json(200, post > 0 ? DOLU : BOS);
    if (yol.startsWith('/gunluk-mesai')) return json(200, MESAI);
    if (yontem === 'POST') {
      post += 1;
      if (post === dusenSira && ilkPost) return ilkPost();
      return json(200, DOLU);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function ac(ekran: 'duzen' | 'mesai') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const E = ekran === 'duzen' ? VardiyaEkrani : GunlukMesaiEkrani;
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><E /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}

const postlar = (c: Cagri[]) => c.filter((x) => x.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each(['duzen', 'mesai'] as const)('Boş durum: %s', (ekran) => {
  it('yazma yetkisi olan ilk vardiyayı ve örnek düzeni önerir; kimse tohum göndermez', async () => {
    const cagrilar = sunucuKur(YAZAN);
    ac(ekran);
    const kart = await screen.findByRole('region', { name: 'Vardiya tanımlı değil' });
    expect(within(kart).getByRole('button', { name: 'İlk vardiyayı ekle' })).toBeTruthy();
    expect(within(kart).getByRole('button', { name: 'İki vardiyalı örnek düzen' })).toBeTruthy();
    expect(postlar(cagrilar)).toHaveLength(0);
  });

  it('yazma yetkisi olmayana yönetici metni gösterilir, düğme yoktur', async () => {
    sunucuKur(IZLEYEN);
    ac(ekran);
    const kart = await screen.findByRole('region', { name: 'Vardiya tanımlı değil' });
    await waitFor(() => expect(within(kart).getByText('Vardiya tanımlı değil; yöneticiniz tanımlayınca burada görünür.')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'İlk vardiyayı ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'İki vardiyalı örnek düzen' })).toBeNull();
  });
});

describe('Boş durum komutları', () => {
  it('örnek düzen önce onay ister; onayda iki vardiya ayrı istek kimliğiyle sözleşmeye uygun gövdeyle gider', async () => {
    const cagrilar = sunucuKur(YAZAN);
    ac('duzen');
    fireEvent.click(await screen.findByRole('button', { name: 'İki vardiyalı örnek düzen' }));
    const pencere = await screen.findByRole('dialog');
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    expect(postlar(cagrilar)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'İki vardiyalı örnek düzen' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(2));
    expect(postlar(cagrilar).map((p) => [p.yol, p.govde])).toEqual([
      ['/vardiyalar', { ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', molalar: [{ baslangic: '12:00', bitis: '12:30' }] }],
      ['/vardiyalar', { ad: 'Akşam', baslangic: '16:00', bitis: '00:00', molalar: [{ baslangic: '20:00', bitis: '20:30' }] }],
    ]);
    const kimlikler = postlar(cagrilar).map((p) => p.baslik['istek-kimligi']);
    for (const k of kimlikler) expect(k).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(kimlikler).size).toBe(2);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Vardiya tanımlı değil' })).toBeNull());
  });

  it('ilk eklenen vardiya tek istekle gider; ilk istek düşerse ikincisi gönderilmez', async () => {
    const cagrilar = sunucuKur(YAZAN);
    ac('mesai');
    fireEvent.click(await screen.findByRole('button', { name: 'İlk vardiyayı ekle' }));
    await waitFor(() => expect(postlar(cagrilar)).toHaveLength(1));
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/vardiyalar', govde: { ad: 'Vardiya 1', baslangic: '08:00', bitis: '16:00', molalar: [] } });
    expect(postlar(cagrilar)[0]!.baslik['istek-kimligi']).toMatch(/^[0-9a-f-]{36}$/);
    cleanup();

    const dusen = sunucuKur(YAZAN, () => json(422, { kod: 'DOGRULAMA', mesaj: 'Geçersiz.' } satisfies HataGovdesi));
    ac('duzen');
    fireEvent.click(await screen.findByRole('button', { name: 'İki vardiyalı örnek düzen' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(postlar(dusen)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(postlar(dusen)).toHaveLength(1);
    expect(await screen.findByText('Örnek düzen yarım kaldı: Gündüz, Akşam eklenemedi. Vardiyayı elle ekle.')).toBeTruthy();
  });

  it('ikinci istek düşerse hangi vardiyanın eklenemediği bildirilir', async () => {
    const cagrilar = sunucuKur(YAZAN, () => json(422, { kod: 'DOGRULAMA', mesaj: 'Geçersiz.' } satisfies HataGovdesi), 2);
    ac('duzen');
    fireEvent.click(await screen.findByRole('button', { name: 'İki vardiyalı örnek düzen' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText('Örnek düzen yarım kaldı: Akşam eklenemedi. Vardiyayı elle ekle.')).toBeTruthy();
    expect(postlar(cagrilar)).toHaveLength(2);
  });
});
