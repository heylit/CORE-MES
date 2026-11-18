import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { IrsaliyeCevabi, IrsaliyeListesiCevabi } from '#paylasilan/sozlesme/logo.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { rotalar } from '../rotalar.tsx';
import { TUM_IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { IrsaliyeSayfasi } from './IrsaliyeAyrintisi.tsx';
import { LogoIrsaliyeleri } from './LogoIrsaliyeleri.tsx';

// 3345 a: Logo irsaliyeleri yalnız okuma; fikstürler sözleşme tipine uyar, değerler sentetiktir (ORN-).
const DEPOCU: Kullanici = { id: 1, ad: 'Deneme Depo', islemler: ['sayfa.logo-irsaliyeleri', 'logo.irsaliye-oku'] };
const YONETICI: Kullanici = { id: 2, ad: 'Deneme Yonetici', islemler: ['sayfa.logo-irsaliyeleri', 'logo.irsaliye-oku', 'ayarlar.yaz', 'satin-alma.fiyat-oku'] };

const SATIR: IrsaliyeListesiCevabi['satirlar'][number] = {
  firma: 1, donem: 1, kayitNo: 101, tur: 1, turAdi: 'Satın alma', fisNo: 'ORN-IRS-101', belgeNo: 'ORN-E-101', tarih: '2026-11-10', cariKodu: 'ORN-C-1',
  cariAdi: 'ORN Tedarikçi', eIrsaliye: true, faturaNo: null, satirSayisi: 2, durum: 'fark', ozet: 'Sipariş SP-2026-901 · 1 satırda fark',
};
const LISTE: IrsaliyeListesiCevabi = {
  satirlar: [SATIR, { ...SATIR, kayitNo: 102, fisNo: 'ORN-IRS-102', eIrsaliye: false, faturaNo: 'ORN-F-1', durum: 'eslesti', ozet: 'Sipariş SP-2026-901' }],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
  turler: [{ tur: 1, ad: 'Satın alma', sayi: 2 }, { tur: 6, ad: 'Satın alma iade', sayi: 0 }],
  durumlar: [{ durum: 'fark', sayi: 1 }, { durum: 'eslesti', sayi: 1 }],
  okuma: { acik: true, sonOkuma: '2026-11-16T10:00:00+03:00' },
};
const BOS_KAPALI: IrsaliyeListesiCevabi = { ...LISTE, satirlar: [], toplam: 0, turler: [{ tur: 1, ad: 'Satın alma', sayi: 0 }], okuma: { acik: false, sonOkuma: null } };
const ayrinti = (fiyatGorunur: boolean): IrsaliyeCevabi => ({
  baslik: { ...SATIR, ambar: 'Merkez', iptal: false, logodaYok: false, okumaZamani: '2026-11-16T10:00:00+03:00' },
  fiyatGorunur,
  satirlar: [
    {
      kayitNo: 1001, malzemeKodu: 'ORN-M-1', malzemeAdi: 'ORN Malzeme', miktar: '30', birim: 'ADET', fiyat: fiyatGorunur ? '12.5' : null, tutar: fiyatGorunur ? '375.0' : null,
      dovizTuru: null, dovizFiyati: null, siparisNo: 'ORN-LS-1', durum: 'fark', neden: 'Logo net 30, CORE teslim 28',
      core: { tur: 'siparis', id: 3, no: 'SP-2026-901' }, coreMiktari: '28', coreBirimi: 'adet',
    },
    {
      kayitNo: 1002, malzemeKodu: 'ORN-M-2', malzemeAdi: null, miktar: '5', birim: 'ADET', fiyat: null, tutar: null, dovizTuru: null, dovizFiyati: null,
      siparisNo: null, durum: 'eslesmedi', neden: 'Siparişsiz satır', core: null, coreMiktari: null, coreBirimi: null,
    },
  ],
});

const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });

function sunucuKur(kullanici: Kullanici, liste = LISTE, tek = ayrinti(false)) {
  const istekler: { yol: string; yontem: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yol, yontem: secenek?.method ?? 'GET' });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/logo/irsaliyeler?')) return json(200, liste);
    if (/^\/logo\/irsaliyeler\/\d+\/\d+\/\d+$/.test(yol)) return json(200, tek);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
  }));
  return istekler;
}

function ac(ekran = <LogoIrsaliyeleri yon="alis" />, adres = '/logo-irsaliyeleri') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[adres]}>
      <QueryClientProvider client={istemci}><BildirimSaglayici>
        <Routes><Route path="/logo-irsaliyeleri/:firma/:donem/:kayitNo" element={<IrsaliyeSayfasi />} /><Route path="*" element={ekran} /></Routes>
      </BildirimSaglayici></QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Logo irsaliyeleri (3345 a)', () => {
  it('liste rozetle ve CORE özetiyle gelir; tür süzgeci sayılı; istek yalnız okumadır', async () => {
    const istekler = sunucuKur(DEPOCU);
    ac();
    const satir = (await screen.findByText('ORN-IRS-101')).closest('tr')!;
    expect(within(satir).getByText('Fark var')).toBeTruthy();
    expect(within(satir).getByText('Sipariş SP-2026-901 · 1 satırda fark')).toBeTruthy();
    expect(within(satir).getByText('e-İrsaliye')).toBeTruthy();
    expect(within(screen.getByText('ORN-IRS-102').closest('tr')!).getByText('Kağıt')).toBeTruthy();
    expect(screen.getByText('Tümü (2)')).toBeTruthy();
    expect(screen.getByText('Satın alma iade (0)')).toBeTruthy();
    expect(screen.queryByText(/Konsinye/)).toBeNull();
    expect(istekler.find((x) => x.yol.startsWith('/logo/irsaliyeler?'))?.yol).toContain('yon=alis');
    fireEvent.change(screen.getByLabelText('Eşleşme'), { target: { value: 'fark' } });
    await waitFor(() => { expect(istekler.some((x) => x.yol.includes('durum=fark'))).toBe(true); });
    expect(istekler.every((x) => x.yontem === 'GET')).toBe(true);
  });

  it('satıra basınca çekmece açılır: satır farkı ve nedeni görünür; fiyat yetkisizde hiç yok; tam sayfa bağlantısı', async () => {
    sunucuKur(DEPOCU);
    ac();
    fireEvent.click(await screen.findByText('ORN-IRS-101'));
    const pencere = await screen.findByRole('dialog');
    expect(await within(pencere).findByText('Logo net 30, CORE teslim 28')).toBeTruthy();
    expect(within(pencere).getByText(/CORE teslim 28 adet/)).toBeTruthy();
    expect(within(pencere).getByText('Siparişsiz satır')).toBeTruthy();
    expect(within(pencere).getByRole('link', { name: /Sipariş SP-2026-901/ }).getAttribute('href')).toBe('/satin-alma/siparisler');
    expect(within(pencere).queryByText(/Fiyat/)).toBeNull();
    expect(within(pencere).getByText(/hiçbir kaydı değiştirmez/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: /Tam sayfada aç/ }));
    expect(await screen.findByRole('heading', { name: 'Logo irsaliyesi' })).toBeTruthy();
  });

  it('fiyat yetkisi olana fiyat ve tutar Türkçe yazımla görünür', async () => {
    sunucuKur(YONETICI, LISTE, ayrinti(true));
    ac(undefined, '/logo-irsaliyeleri/1/1/101');
    expect(await screen.findByText(/Fiyat 12,5 TL · Tutar 375 TL/)).toBeTruthy();
  });

  it('okuma kapalı ve kayıt yokken kapalı kartı; ayar düğmesi yalnız ayar yazabilene', async () => {
    sunucuKur(DEPOCU, BOS_KAPALI);
    ac();
    expect(await screen.findByText('Logo\'dan irsaliye okuması kapalı')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sistem Ayarları/ })).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YONETICI, BOS_KAPALI);
    ac();
    expect(await screen.findByRole('button', { name: /Sistem Ayarları/ })).toBeTruthy();
  });

  it('süzgeç ve arama istek parametresine gider; süzgeç değişince sayfa 1\'e döner', async () => {
    const istekler = sunucuKur(DEPOCU, { ...LISTE, toplam: 120 });
    ac();
    await screen.findByText('ORN-IRS-101');
    const listeIstekleri = () => istekler.filter((x) => x.yol.startsWith('/logo/irsaliyeler?')).map((x) => new URLSearchParams(x.yol.split('?')[1]));
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki sayfa' }));
    await waitFor(() => { expect(listeIstekleri().at(-1)?.get('sayfa')).toBe('2'); });
    fireEvent.click(screen.getByText('Satın alma iade (0)'));
    await waitFor(() => { expect(listeIstekleri().at(-1)?.get('tur')).toBe('6'); });
    expect(listeIstekleri().at(-1)?.get('sayfa')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki sayfa' }));
    await waitFor(() => { expect(listeIstekleri().at(-1)?.get('sayfa')).toBe('2'); });
    fireEvent.change(screen.getByLabelText('İrsaliye ara'), { target: { value: '  ORN-M-1 ' } });
    await waitFor(() => { expect(listeIstekleri().at(-1)?.get('ara')).toBe('ORN-M-1'); });
    expect(listeIstekleri().at(-1)?.get('sayfa')).toBe('1');
    expect(listeIstekleri().at(-1)?.get('tur')).toBe('6');
  });

  it('satış ve tam sayfa yolları rota tablosundan doğru ekranı açar', async () => {
    const istekler = sunucuKur(DEPOCU);
    const tablodan = (adres: string) => {
      const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <MemoryRouter initialEntries={[adres]}>
          <QueryClientProvider client={istemci}><BildirimSaglayici>
            <Routes>{rotalar.filter((r) => r.yol.startsWith('/logo-irsaliyeleri')).map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
          </BildirimSaglayici></QueryClientProvider>
        </MemoryRouter>,
      );
    };
    tablodan('/logo-irsaliyeleri/satis');
    expect(await screen.findByRole('table', { name: 'Satış irsaliyeleri' })).toBeTruthy();
    expect(istekler.find((x) => x.yol.startsWith('/logo/irsaliyeler?'))?.yol).toContain('yon=satis');
    cleanup();
    tablodan('/logo-irsaliyeleri/1/1/101');
    expect(await screen.findByRole('heading', { name: 'Logo irsaliyesi' })).toBeTruthy();
    expect(await screen.findByText('Logo net 30, CORE teslim 28')).toBeTruthy();
    expect(istekler.some((x) => x.yol === '/logo/irsaliyeler/1/1/101')).toBe(true);
  });

  it('ikinci menünün her maddesinin rotası var', () => {
    const yollar = new Set(rotalar.map((r) => r.yol));
    const menu = TUM_IKINCI_MENULER.find((x) => x.kok === '/logo-irsaliyeleri');
    expect(menu).toBeDefined();
    for (const g of menu!.gruplar) for (const m of g.maddeler) expect(yollar.has(m.yol)).toBe(true);
  });
});
