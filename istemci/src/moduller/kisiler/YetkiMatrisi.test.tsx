import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { PersonelCevabi, RolIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Personel } from './Personel.tsx';

const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['kisiler.oku', 'sayfa.personel'] };
const ROL_YONETEN: Kullanici = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'kisiler.rol-yonet'] };

const MATRIS = {
  islemler: ['kisiler.oku', 'kisiler.yaz', 'stok.oku', 'sayfa.personel'],
  roller: [
    { id: 1, ad: 'Planlama', yonetici: null, islemler: ['kisiler.oku', 'sayfa.personel'] },
    { id: 2, ad: 'Yönetici', yonetici: null, islemler: ['kisiler.oku', 'kisiler.yaz', 'stok.oku', 'sayfa.personel'] },
  ],
} satisfies RolIslemleriCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function ac(kullanici: Kullanici) {
  const cagri = vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/kisiler') return json(200, { kisiler: [] } satisfies PersonelCevabi);
    if (yol === '/rol-islemleri') return json(200, MATRIS);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  });
  vi.stubGlobal('fetch', cagri);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter><BildirimSaglayici><Personel /></BildirimSaglayici></MemoryRouter>
    </QueryClientProvider>,
  );
  return cagri;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Yetki matrisi', () => {
  it('sekmede rol sütunları, modül önekine göre gruplu işlem satırları ve işaretli hücreler görünür', async () => {
    ac(ROL_YONETEN);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yetki matrisi' }));
    const tablo = await screen.findByRole('table', { name: 'Yetki matrisi' });
    const t = within(tablo);

    expect(t.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['İşlem', 'Planlama', 'Yönetici']);
    expect(t.getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
      'kisiler', 'kisiler.oku', 'kisiler.yaz', 'stok', 'stok.oku', 'Sayfalar', 'sayfa.personel',
    ]);
    const hucreler = (islem: string) =>
      within(t.getByRole('rowheader', { name: islem }).closest('tr')!).getAllByRole('cell').map((h) => h.textContent);
    expect(hucreler('kisiler.yaz')).toEqual(['Yok', 'Var']);
    expect(hucreler('kisiler.oku')).toEqual(['Var', 'Var']);
    expect(hucreler('stok.oku')).toEqual(['Yok', 'Var']);
  });

  it('kişileri okuyup rol yönetmeyen sekmeyi görmez ve matrisi istemez', async () => {
    const cagri = ac(OKUYUCU);
    await screen.findByText('Personel');
    await vi.waitFor(() => expect(cagri.mock.calls.some(([a]) => String(a).endsWith('/oturum'))).toBe(true));
    await new Promise((bitti) => setTimeout(bitti, 0));
    expect(screen.queryByRole('tab', { name: 'Yetki matrisi' })).toBeNull();
    expect(cagri.mock.calls.some(([a]) => String(a).endsWith('/rol-islemleri'))).toBe(false);
  });
});
