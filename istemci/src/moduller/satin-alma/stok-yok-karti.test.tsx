import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AcilisCevabi, StokYokIstekleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IsKutusuSayfasi } from './SatinAlma.tsx';
import { StokYokKarti } from './StokYokKarti.tsx';

const json = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
// Malzeme, emir ve kişi uydurmadır.
const LISTE: StokYokIstekleriCevabi = {
  istekler: [
    { id: 1, no: 'MI-000001', malzemeKodu: 'HM-DNM-1', malzemeAdi: 'Deneme çubuk', miktar: '3.000', birim: 'kg', emirNo: 'UE-100', acilma: '2026-10-14T08:00:00.000Z' },
    { id: 2, no: 'MI-000002', malzemeKodu: 'HM-DNM-2', malzemeAdi: 'Deneme levha', miktar: '1.500', birim: null, emirNo: null, acilma: '2026-10-15T09:00:00.000Z' },
  ],
};
const ACILIS: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
};
const STOK_YOK = '/satin-alma-stok-yok-istekleri';

function ac(islemler: string[], stokYok: () => Response, ekran: 'sayfa' | 'kart' = 'sayfa') {
  const cagrilar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = String(adres).replace('/api', '');
    cagrilar.push(yol);
    if (yol === '/oturum') return json({ kullanici: { id: 7, ad: 'Deneme Alıcı', islemler } });
    if (yol === STOK_YOK) return stokYok();
    return json(ACILIS);
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BildirimSaglayici><MemoryRouter initialEntries={['/satin-alma']}>{ekran === 'sayfa' ? <IsKutusuSayfasi /> : <StokYokKarti />}</MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return cagrilar;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('Satın alma iş kutusunda stokta olmayan malzeme istekleri (kart #435)', () => {
  it('satın almacı satırları sunucunun sırasıyla görür: istek no, malzeme kodu ve adı, miktar ve birim, emir no', async () => {
    ac(['satin-alma.yaz'], () => json(LISTE));
    expect((await screen.findAllByText('MI-000001')).length).toBeGreaterThan(0);
    const metin = document.body.textContent ?? '';
    expect(metin.indexOf('MI-000001')).toBeLessThan(metin.indexOf('MI-000002'));
    for (const p of ['HM-DNM-1 · Deneme çubuk', '3 kg', 'UE-100', 'HM-DNM-2 · Deneme levha']) expect(metin).toContain(p);
    expect(metin).toContain('1,5');
    expect(document.querySelector('.sa-kok')).not.toBeNull();
  });

  it('liste boşsa kart kısa boş durumu gösterir', async () => {
    ac(['satin-alma.yaz'], () => json({ istekler: [] }));
    expect(await screen.findByText('Stokta olmayan istek yok.')).toBeTruthy();
  });

  it('uç hata verirse ortak hata gösterimi çıkar', async () => {
    ac(['satin-alma.yaz'], () => json({ kod: 'SUNUCU', ileti: 'Hata' }, 500));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Stokta olmayan istek yok.')).toBeNull();
  });

  it('satin-alma.yaz olmayan kişide kart çizilmez ve uç çağrılmaz', async () => {
    const cagrilar = ac(['satin-alma.talep-ac'], () => json(LISTE), 'kart');
    await waitFor(() => expect(cagrilar).toContain('/oturum'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Stokta olmayan malzeme istekleri')).toBeNull();
    expect(cagrilar).not.toContain(STOK_YOK);
  });
});
