import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { GecikenlerimCevabi, KademeAyarlariCevabi, KademeAyarSatiri } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { AcikTakipler, Gecikenlerim, KademeliUyari, KademeSeridi } from './Kademe.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function kur(oge: React.ReactNode, cevap: (yol: string, yontem: string, govde: unknown) => Response) {
  const cagrilar: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    const govde: unknown = typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined;
    cagrilar.push({ yontem, yol, govde });
    return cevap(yol, yontem, govde);
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>{oge}</MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SATIR: KademeAyarSatiri = {
  kaynak: 'kalibrasyon.vade', ad: 'Kalibrasyon vadesi', grup: 'Kalibrasyon', sayac: 'son-gun', asama: 1, para: false, acik: true,
  k2Gun: 10, k3Gun: null, k3Birim: 'gun', k4Gun: 3, k5Gun: 7, epostaKademe: 2, serit: true, kapatilamaz: true, yoneticiRolId: null, varsayilan: true,
  surum: 1, degistiren: null, degisti: null, takipte: 4, gecikti: 1,
};
const AYARLAR: KademeAyarlariCevabi = { kaynaklar: [SATIR], roller: [{ id: 3, ad: 'ORN-Müdür' }] };
const KAYIT = {
  kaynak: 'kalibrasyon.vade', kayit: '7:2026-11-10', no: 'ORN-ALET-7', baslik: 'Kumpas', yol: '/kalibrasyon/7', sonGun: '2026-11-10',
  baslangic: null, kademe: 4, gecikmeGun: 5,
} as const satisfies GecikenlerimCevabi['kayitlar'][number];

describe('Kademeli uyarı (3405)', () => {
  it('kaynak satırı yan pencerede açılır; değişen gün sürümle gönderilir', async () => {
    const c = kur(<KademeliUyari />, (yol, yontem, govde) => {
      if (yol === '/bildirim-kademe/kaynaklar') return json(200, AYARLAR);
      if (yontem === 'POST') return json(200, { ...AYARLAR, kaynaklar: [{ ...SATIR, ...(govde as object), surum: 2, varsayilan: false }] });
      return json(404, {});
    });
    fireEvent.click(await screen.findByText('Kalibrasyon vadesi'));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/K5 Devret/), { target: { value: '9' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(c.some((x) => x.yontem === 'POST')).toBe(true); });
    expect(c.find((x) => x.yontem === 'POST')).toEqual({
      yontem: 'POST', yol: '/bildirim-kademe/kaynaklar/kalibrasyon.vade/ayarla',
      govde: { acik: true, k2Gun: 10, k3Gun: null, k3Birim: 'gun', k4Gun: 3, k5Gun: 9, epostaKademe: 2, serit: true, kapatilamaz: true, yoneticiRolId: null, surum: 1 },
    });
  });

  it('3456: takip anahtarı pencere açmadan bütün ayarla ve sürümle yazar; Geri al yeni sürümle geri açar', async () => {
    const c = kur(<KademeliUyari />, (yol, yontem, govde) => {
      if (yol === '/bildirim-kademe/kaynaklar') return json(200, AYARLAR);
      if (yontem === 'POST') return json(200, { ...AYARLAR, kaynaklar: [{ ...SATIR, ...(govde as object), surum: ((govde as { surum: number }).surum) + 1 }] });
      return json(404, {});
    });
    fireEvent.click(await screen.findByRole('switch', { name: 'Kalibrasyon vadesi: takip' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => { expect(c.filter((x) => x.yontem === 'POST')).toHaveLength(1); });
    expect(c.find((x) => x.yontem === 'POST')?.govde).toEqual({
      acik: false, k2Gun: 10, k3Gun: null, k3Birim: 'gun', k4Gun: 3, k5Gun: 7, epostaKademe: 2, serit: true, kapatilamaz: true, yoneticiRolId: null, surum: 1,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(c.filter((x) => x.yontem === 'POST')).toHaveLength(2); });
    expect(c.filter((x) => x.yontem === 'POST')[1]?.govde).toMatchObject({ acik: true, surum: 2 });
  });

  it('boş bırakılan gün kademeyi kapatır (null gider)', async () => {
    const c = kur(<KademeliUyari />, (yol, yontem) => (yontem === 'POST' ? json(200, AYARLAR) : yol === '/bildirim-kademe/kaynaklar' ? json(200, AYARLAR) : json(404, {})));
    fireEvent.click(await screen.findByText('Kalibrasyon vadesi'));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/K2 Yaklaşıyor/), { target: { value: '' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect((c.find((x) => x.yontem === 'POST')?.govde as { k2Gun: unknown } | undefined)?.k2Gun).toBeNull(); });
  });

  it('bekleme kaynağında Gecikti saat birimiyle gönderilir; son gün kaynağında birim seçilmez (3418)', async () => {
    const bekleme: KademeAyarSatiri = {
      ...SATIR, kaynak: 'uretim-emirleri.bekleme-takim', ad: 'Takım bekleyen iş emri', grup: 'Üretim', sayac: 'bekleme', k2Gun: null, k3Gun: 4,
      k3Birim: 'saat', k4Gun: 2, k5Gun: null, epostaKademe: 3,
    };
    const c = kur(<KademeliUyari />, (yol, yontem) => (yontem === 'POST' || yol === '/bildirim-kademe/kaynaklar'
      ? json(200, { ...AYARLAR, kaynaklar: [SATIR, bekleme] }) : json(404, {})));
    expect(await screen.findByText(/K3 4 saat bekleyince/)).toBeTruthy();
    fireEvent.click(screen.getByText('Kalibrasyon vadesi'));
    expect(within(await screen.findByRole('dialog')).queryByLabelText('K3 süre birimi')).toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByText('Takım bekleyen iş emri'));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByLabelText(/iş günlerinde kaç saat/)).toBeTruthy();
    expect(within(pencere).getByText(/Gecikmenin 1. iş günü K3'ün geldiği gündür/)).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/K3 Gecikti/), { target: { value: '6' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(c.some((x) => x.yontem === 'POST')).toBe(true); });
    expect(c.find((x) => x.yontem === 'POST')?.govde).toMatchObject({ k3Gun: 6, k3Birim: 'saat' });
    c.length = 0;
    fireEvent.click(await screen.findByText('Takım bekleyen iş emri'));
    const ikinci = await screen.findByRole('dialog');
    fireEvent.change(within(ikinci).getByLabelText('K3 süre birimi'), { target: { value: 'gun' } });
    expect(within(ikinci).getByLabelText(/kaç iş günü bekleyince/)).toBeTruthy();
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(c.find((x) => x.yontem === 'POST')?.govde).toMatchObject({ k3Birim: 'gun' }); });
  });

  it('gün birimli bekleme kaynağında Saat seçilince govdeye saat gider (3418, Test T1)', async () => {
    const bekleme: KademeAyarSatiri = {
      ...SATIR, kaynak: 'uretim-emirleri.bekleme-malzeme', ad: 'Malzeme bekleyen iş emri', grup: 'Üretim', sayac: 'bekleme', k2Gun: null, k3Gun: 2,
      k3Birim: 'gun', k4Gun: 4, k5Gun: null, epostaKademe: 3,
    };
    const c = kur(<KademeliUyari />, (yol, yontem) => (yontem === 'POST' || yol === '/bildirim-kademe/kaynaklar'
      ? json(200, { ...AYARLAR, kaynaklar: [bekleme] }) : json(404, {})));
    fireEvent.click(await screen.findByText('Malzeme bekleyen iş emri'));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByLabelText(/kaç iş günü bekleyince/)).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText('K3 süre birimi'), { target: { value: 'saat' } });
    expect(within(pencere).getByLabelText(/iş günlerinde kaç saat/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(c.find((x) => x.yontem === 'POST')?.govde).toMatchObject({ k3Gun: 2, k3Birim: 'saat' }); });
  });

  it('Gecikenlerim kaydı kademe adıyla ve kaydın ekranına bağlantıyla verir', async () => {
    kur(<Gecikenlerim />, (yol) => (yol === '/bildirim-kademe/gecikenlerim' ? json(200, { kayitlar: [KAYIT] }) : json(404, {})));
    const bag = await screen.findByRole('link', { name: 'ORN-ALET-7' });
    expect(bag.getAttribute('href')).toBe('/kalibrasyon/7');
    expect(screen.getAllByText(/K4 Yöneticide/).length).toBeGreaterThan(0);
  });

  it('Açık takipler işin kimde olduğunu yazar', async () => {
    kur(<AcikTakipler />, (yol) => (yol === '/bildirim-kademe/acik-takipler' ? json(200, { kayitlar: [{ ...KAYIT, kimde: ['ORN Kişi', 'ORN Yönetici'] }], kesik: false }) : json(404, {})));
    expect((await screen.findAllByText('ORN Kişi, ORN Yönetici')).length).toBeGreaterThan(0);
  });

  it('3456-2 a: kademe sayısı basınca süzer; sıfır olan basılamaz; arama kimde içinde de arar', async () => {
    const kayitlar = [
      { ...KAYIT, kimde: ['ORN Kişi'] },
      { ...KAYIT, kayit: '8:2026-11-12', no: 'ORN-ALET-8', baslik: 'Mikrometre', kademe: 3, kimde: ['ORN Ayarcı'] },
      { ...KAYIT, kaynak: 'satin-alma.talep-onay', kayit: '9', no: 'ORN-TLP-9', baslik: 'Talep', kademe: 2, kimde: ['ORN Alıcı'] },
    ];
    kur(<AcikTakipler />, (yol) => (yol === '/bildirim-kademe/acik-takipler' ? json(200, { kayitlar, kesik: false }) : json(404, {})));
    const k3 = await screen.findByRole('button', { name: '1 K3 Gecikti' });
    expect((screen.getByRole('button', { name: '0 K5 Devret' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(k3);
    expect(screen.queryAllByText('Kumpas')).toHaveLength(0);
    expect(screen.getAllByText('Mikrometre').length).toBeGreaterThan(0);
    fireEvent.click(k3);
    fireEvent.change(screen.getByLabelText('Kaynak'), { target: { value: 'satin-alma.talep-onay' } });
    expect(screen.queryAllByText('Kumpas')).toHaveLength(0);
    expect(screen.getAllByText('Talep').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Kaynak'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Kayıt, iş ya da kimde ara' }), { target: { value: 'ayarcı' } });
    expect(screen.queryAllByText('Kumpas')).toHaveLength(0);
    expect(screen.queryAllByText('Talep')).toHaveLength(0);
    expect(screen.getAllByText('Mikrometre').length).toBeGreaterThan(0);
  });

  it('kişisel oturumda geciken iş kapanmayan şerit açar', async () => {
    kur(<KademeSeridi />, (yol) => {
      if (yol === '/oturum/cihaz') return json(200, { ortak: false, id: null, ad: null });
      if (yol === '/bildirim-kademe/seridim') return json(200, { kayitlar: [KAYIT] });
      return json(404, {});
    });
    const serit = await screen.findByTestId('kademe-seridi');
    expect(serit.textContent).toContain('5 iş günü gecikti');
    expect(screen.getByRole('link', { name: 'İşe git' }).getAttribute('href')).toBe('/kalibrasyon/7');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ortak cihazda şerit çıkmaz ve uyarı sorulmaz', async () => {
    const c = kur(<KademeSeridi />, (yol) => (yol === '/oturum/cihaz' ? json(200, { ortak: true, id: 4, ad: 'ORN-TERMINAL' }) : json(200, { kayitlar: [KAYIT] })));
    await waitFor(() => { expect(c.some((x) => x.yol === '/oturum/cihaz')).toBe(true); });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.queryByTestId('kademe-seridi')).toBeNull();
    expect(c.some((x) => x.yol === '/bildirim-kademe/seridim')).toBe(false);
  });
});
