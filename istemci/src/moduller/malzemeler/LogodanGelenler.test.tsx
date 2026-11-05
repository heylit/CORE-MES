import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { LogoGelenCevabi, LogoKarsiligi } from '#paylasilan/sozlesme/malzemeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { LogodanGelenler } from './LogodanGelenler.tsx';

const YAZAN: Kullanici = { id: 1, ad: 'Deneme Yazan', islemler: ['sayfa.malzemeler', 'malzemeler.yaz'] };
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['sayfa.malzemeler'] };
const TUR_ADLARI = { hammadde: 'Hammadde', sarf: 'Sarf' };
const KARSILIKLAR: LogoKarsiligi[] = [
  { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' },
  { cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: null },
  { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06' },
];
const ortak = { aciklama2: null, aciklama3: null, birimSeti: '06', aktif: true, sonOkuma: '2026-11-05T08:00:00+00:00' };
const LISTE: LogoGelenCevabi = {
  baglanti: true,
  kartlar: [
    { ...ortak, logoKayitNo: 1, kod: 'HM-DEN-00001', ad: 'Deneme yeni', kartTuru: '10', durum: 'yeni', koduUyar: true, tmi: null, farklar: [] },
    { ...ortak, logoKayitNo: 2, kod: '150.01', ad: 'Deneme eslenecek', kartTuru: '13', durum: 'yeni', koduUyar: false, tmi: null, farklar: [] },
    {
      ...ortak, logoKayitNo: 3, kod: 'HM-DEN-00003', ad: 'Deneme bagsiz', kartTuru: '10', durum: 'bagsiz', koduUyar: true,
      tmi: { kimlik: 'k3', stokKodu: 'HM-DEN-00003', ad: 'TMI', onayDurumu: 'aktif', surum: 4 }, farklar: [],
    },
    {
      ...ortak, logoKayitNo: 4, kod: 'HM-DEN-00004', ad: 'Logo adi', kartTuru: '10', durum: 'bagli', koduUyar: true,
      tmi: { kimlik: 'k4', stokKodu: 'HM-DEN-00004', ad: 'TMI', onayDurumu: 'aktif', surum: 2 }, farklar: [{ alan: 'aciklama_1', logo: 'Logo adi', tmi: 'TMI' }],
    },
  ],
  sonraki: 4,
};

const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });

function sunucuKur(kullanici: Kullanici, liste: LogoGelenCevabi = LISTE) {
  const istekler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/malzeme-logo-kartlari?')) { istekler.push({ yol, govde: null }); return json(200, liste); }
    if (yol === '/malzeme-birimleri') return json(200, { birimler: [{ kod: 'kg', aktif: true }, { kod: 'adet', aktif: true }] });
    if (yol.startsWith('/malzeme-logo-kartlari/') && secenek?.method === 'POST') {
      istekler.push({ yol, govde: JSON.parse(String(secenek.body)) });
      if (yol.endsWith('/al')) return json(200, { id: 'logo-1', stok_kodu: 'HM-DEN-00001', eslendi: false });
      return json(200, { id: 'x', surum: 5 });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
  }));
  return istekler;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><LogodanGelenler turAdlari={TUR_ADLARI} karsiliklar={KARSILIKLAR} /></BildirimSaglayici>
    </QueryClientProvider>,
  );
}
const satir = (kod: string) => screen.getByText(kod).closest('tr')!;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('LogodanGelenler (2116)', () => {
  it('durumlar ve fark görünür; yazan için yeni kartta Al, bağsızda Bağla, farklı bağlıda Logo\'dakini al', async () => {
    sunucuKur(YAZAN);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(within(satir('HM-DEN-00001')).getByRole('button', { name: 'HM-DEN-00001 al' })).toBeTruthy();
    expect(within(satir('150.01')).getByText('Kod eşlenecek')).toBeTruthy();
    expect(within(satir('Deneme bagsiz')).getByRole('button', { name: 'HM-DEN-00003 bağla' })).toBeTruthy();
    expect(within(satir('Logo adi')).getByText('Açıklama 1: Logo adi')).toBeTruthy();
    expect(within(satir('Logo adi')).getByRole('button', { name: "HM-DEN-00004 Logo'dakini al" })).toBeTruthy();
  });

  it('okuyucu listeyi görür, işlem düğmesi yok', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await screen.findByText('HM-DEN-00001');
    expect(screen.queryByRole('button', { name: /al$|bağla$/ })).toBeNull();
  });

  it('alma: tür ve birim karşılıktan önerilir, uyan kodda önek gitmez; uymayan kodda önek alanı çıkar', async () => {
    const istekler = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'HM-DEN-00001 al' }));
    await screen.findByText("Kart Logo'daki koduyla açılır.");
    await waitFor(() => expect((screen.getByLabelText(/^Birim/) as HTMLSelectElement).value).toBe('kg'));
    expect((screen.getByLabelText(/CORE türü/) as HTMLSelectElement).value).toBe('hammadde');
    fireEvent.click(screen.getByRole('button', { name: 'Taslak aç' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-logo-kartlari/1/al')).toBe(true));
    expect(istekler.find((i) => i.yol === '/malzeme-logo-kartlari/1/al')?.govde).toEqual({ tur: 'hammadde', birim: 'kg', onek: null });
    fireEvent.click(await screen.findByRole('button', { name: '150.01 al' }));
    expect(await screen.findByLabelText(/Yeni kodun öneki/)).toBeTruthy();
    expect((screen.getByLabelText(/CORE türü/) as HTMLSelectElement).value).toBe('');
  });

  it('bağlama onayla gider ve kartın sürümünü taşır; sonraki sayfa imleçle istenir', async () => {
    const istekler = sunucuKur(YAZAN);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'HM-DEN-00003 bağla' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/malzeme-logo-kartlari/3/bagla')?.govde).toEqual({ surum: 4 }));
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki sayfa' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/malzeme-logo-kartlari?sonra=4')).toBe(true));
  });

  it('bağ yoksa neden yazılır, tablo çizilmez', async () => {
    sunucuKur(YAZAN, { baglanti: false, kartlar: [], sonraki: null });
    ac();
    expect(await screen.findByText(/malzeme okuması bağlı değil/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
