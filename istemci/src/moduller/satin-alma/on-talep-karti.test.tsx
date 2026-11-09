import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { OnTalepleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OnTalepKarti } from './OnTalepKarti.tsx';

const json = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
// Malzeme, emir ve firma uydurmadır.
const LISTE: OnTalepleriCevabi = {
  onTalepler: [
    { kaynak: 'plan', malzeme: { no: 1, kod: 'HM-DNM-1', ad: 'Deneme çubuk' }, miktar: 12.5, birim: 'kg', gerekenTarih: '2099-01-10', emirler: ['UE-1'], stokBilinmiyor: false, hesap: { eksik: 12.5, siparis: 0, talep: 0, yoksayilan: 0 } },
    { kaynak: 'fason', isEmriId: 5, uretimEmriId: 2, emirNo: 'UE-2', opNo: 30, adim: 'Deneme kaplama', parca: null, urun: null, miktar: 40, birim: 'adet', gerekenTarih: '2020-01-01', terminGun: 5, firmaAdi: null },
    { kaynak: 'fason', isEmriId: 6, uretimEmriId: 3, emirNo: 'UE-3', opNo: 40, adim: null, parca: null, urun: null, miktar: 2, birim: 'adet', gerekenTarih: null, terminGun: null, firmaAdi: null },
  ],
  yoksayilanlar: [],
};
const UC = '/satin-alma-on-talepleri';

function ac(islemler: string[], cevap: () => Response) {
  const cagrilar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = String(adres).replace('/api', '');
    cagrilar.push(yol);
    if (yol === '/oturum') return json({ kullanici: { id: 7, ad: 'Deneme Alıcı', islemler } });
    return cevap();
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BildirimSaglayici><MemoryRouter initialEntries={['/satin-alma']}><OnTalepKarti /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return cagrilar;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('Satın alma iş kutusunda ön talepler (2400)', () => {
  it('plan ve fason ön talepleri gereken güne göre dizilir; günü geçen işaretlenir, günü olmayan sona gider; özet sayar', async () => {
    ac(['satin-alma.yaz', 'satin-alma.talep-ac'], () => json(LISTE));
    expect(await screen.findByText('1 plan, 2 fason; 1 tanesinin günü geçti')).toBeTruthy();
    const metin = document.body.textContent ?? '';
    expect(metin.indexOf('UE-2 Op 30 Deneme kaplama')).toBeLessThan(metin.indexOf('HM-DNM-1 · Deneme çubuk'));
    expect(metin.indexOf('HM-DNM-1 · Deneme çubuk')).toBeLessThan(metin.indexOf('UE-3 Op 40'));
    expect(metin).toContain('geçti');
    expect(metin).toContain('12,5 kg');
    expect(screen.getByRole('button', { name: /Ön taleplere git/ })).toBeTruthy();
  });

  it('liste boşsa kısa boş durum gösterir', async () => {
    ac(['satin-alma.yaz', 'satin-alma.talep-ac'], () => json({ onTalepler: [], yoksayilanlar: [] }));
    expect(await screen.findByText('Bekleyen ön talep yok.')).toBeTruthy();
  });

  it('satın almayı yazmayan kişide kart çizilmez ve uç çağrılmaz', async () => {
    const cagrilar = ac(['satin-alma.talep-ac'], () => json(LISTE));
    await waitFor(() => expect(cagrilar).toContain('/oturum'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Ön talepler')).toBeNull();
    expect(cagrilar).not.toContain(UC);
  });
});
