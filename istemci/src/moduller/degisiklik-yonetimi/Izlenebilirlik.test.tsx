import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { IzlenebilirlikCevabi, KonfigurasyonCevabi, SeriListeCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Izlenebilirlik } from './Izlenebilirlik.tsx';

// Sentetik veri; biçim sözleşmenin cevap tipidir.
const urun = { malzemeId: 5, kod: 'DENEME-1', ad: 'Deneme montaj' };
const seriler: SeriListeCevabi = {
  satirlar: [
    { sonUrun: urun, seriNo: 'SN-0001', revizyon: 'A', mod: 1, durum: 'sahada', uyum: 'uyumlu', emirNo: 'UE-1', sapmaReferansi: null, karantinada: false },
    { sonUrun: urun, seriNo: 'SN-0002', revizyon: 'B', mod: 2, durum: 'stokta', uyum: 'sapmali', emirNo: 'UE-1', sapmaReferansi: 'SAP-9', karantinada: false },
  ],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
};
const konfig = (o: Partial<KonfigurasyonCevabi> = {}): KonfigurasyonCevabi => ({
  sonUrun: urun, seriler: [], gecerlilikler: [], baseline: null, acikDegisiklikler: [], aileIpligi: null,
  revizyonStogu: [{ malzeme: { malzemeId: 7, kod: 'DENEME-3', ad: null }, revizyon: 'A', miktar: '1200.500', yer: 'Raf 1', durum: 'eski_yedek' }],
  ...o,
});
const ayrinti = (o: Partial<IzlenebilirlikCevabi> = {}): IzlenebilirlikCevabi => ({
  sonUrun: urun, seriNo: 'SN-0002', uyum: 'sapmali', modSeviyesi: 2, emirRevizyonu: 3, not: null,
  iplik: [{ katman: 'emir', etiket: 'UE-1', revizyon: null, degisiklikNo: null }],
  soyAgaci: {
    bilesenler: ['DENEME-3 rev A, lot L-1'],
    operasyonlar: [{ adimKodu: 'OP20', aciklama: 'Frezeleme', isMerkezi: 'İM-1', ncProgrami: 'P100 r3', ncOzeti: null, kisiAdi: 'Deneme Kişi', zaman: null }],
  },
  sapmalar: [{ referans: 'SAP-9', degisiklikNo: 'DEV-0001', kapsam: 'Yalnız bu seri', kalem: { malzemeId: 7, kod: 'DENEME-3', ad: null }, revizyon: 'A', emirNo: 'UE-1', bitis: '2099-01-31' }],
  ...o,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(cevaplar: Record<string, () => Response>) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    const yanit = cevaplar[yol];
    return yanit ? yanit() : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function cizdir(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter initialEntries={[adres]}>
        <Routes><Route path="/degisiklik-yonetimi/izlenebilirlik" element={<Izlenebilirlik />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const AYRINTI = '/degisiklik-yonetimi/izlenebilirlik?sonUrunMalzemeId=5&seriNo=SN-0002';
const temel = {
  '/degisiklik-yonetimi/seriler?sayfa=1': () => json(200, seriler),
  '/degisiklik-yonetimi/konfigurasyon/5': () => json(200, konfig()),
  [AYRINTI]: () => json(200, ayrinti()),
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('İzlenebilirlik', () => {
  it('bütün ürünlerin serileri tek listede; adresteki seri soy ağacı, sapma tablosu ve stokla açılır', async () => {
    const yollar = sunucuKur(temel);
    cizdir('/degisiklik-yonetimi/izlenebilirlik?urun=5&seri=SN-0002');
    const liste = await screen.findByRole('table', { name: 'Seriler' });
    expect(within(liste).getByText('Rev B, mod 2')).toBeTruthy();
    const agac = await screen.findByRole('list', { name: 'Soy ağacı' });
    expect(yollar).toContain(AYRINTI);
    expect(within(agac).getByText('DENEME-3 rev A, lot L-1')).toBeTruthy();
    expect(within(agac).getByText('OP20')).toBeTruthy();
    expect(within(agac).getByText('P100 r3')).toBeTruthy();
    expect(within(agac).getByText('mod 2')).toBeTruthy();
    expect(screen.getByText('UE-1, emir rev 3')).toBeTruthy();
    const sapmalar = screen.getByRole('table', { name: 'Sapmalar' });
    expect(within(sapmalar).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['No', 'Kalem', 'Emir', 'Kapsam', 'Onay ref.', 'Bitiş']);
    expect(within(sapmalar).getByText('DEV-0001')).toBeTruthy();
    expect(within(sapmalar).getByText('Yalnız bu seri')).toBeTruthy();
    const stok = await screen.findByRole('table', { name: 'Revizyon bazlı stok' });
    expect(await within(stok).findByText('1.200,5')).toBeTruthy();
    expect(within(stok).getByText('Eski konfigürasyon yedeği')).toBeTruthy();
  });

  it('seri seçilmeden ipucu yazar, ayrıntı istemez; listeden seçince soy ağacı gelir', async () => {
    const yollar = sunucuKur(temel);
    cizdir('/degisiklik-yonetimi/izlenebilirlik');
    const liste = await screen.findByRole('table', { name: 'Seriler' });
    expect(screen.getByText('Soy ağacını görmek için soldan bir seri seçin.')).toBeTruthy();
    expect(yollar.some((y) => y.includes('/izlenebilirlik?'))).toBe(false);
    fireEvent.click(within(liste).getByText('SN-0002'));
    expect(await screen.findByRole('list', { name: 'Soy ağacı' })).toBeTruthy();
  });

  it('arama sunucuya gider ve ilk sayfaya döner', async () => {
    const yollar = sunucuKur({
      ...temel,
      '/degisiklik-yonetimi/seriler?sayfa=1&ara=0001': () => json(200, { ...seriler, satirlar: seriler.satirlar.slice(0, 1), toplam: 1 } satisfies SeriListeCevabi),
    });
    cizdir('/degisiklik-yonetimi/izlenebilirlik');
    const liste = await screen.findByRole('table', { name: 'Seriler' });
    fireEvent.change(screen.getByLabelText('Seri ara'), { target: { value: '0001' } });
    expect(await within(liste).findByText('SN-0001')).toBeTruthy();
    await vi.waitFor(() => expect(within(liste).queryByText('SN-0002')).toBeNull());
    expect(yollar).toContain('/degisiklik-yonetimi/seriler?sayfa=1&ara=0001');
  });

  it('soy ağacı ve stok bağlı değilse ya da kayıt yoksa açıklama yazar', async () => {
    sunucuKur({
      ...temel,
      '/degisiklik-yonetimi/konfigurasyon/5': () => json(200, konfig({ revizyonStogu: null })),
      [AYRINTI]: () => json(200, ayrinti({ soyAgaci: { bilesenler: null, operasyonlar: [] }, sapmalar: [] })),
    });
    cizdir('/degisiklik-yonetimi/izlenebilirlik?urun=5&seri=SN-0002');
    const agac = await screen.findByRole('list', { name: 'Soy ağacı' });
    expect(within(agac).getByText('Bağlı değil')).toBeTruthy();
    expect(within(agac).getByText('Kayıt yok (geçiş öncesi, kâğıt kayıt)')).toBeTruthy();
    expect(screen.getByText('Aktif sapma yok.')).toBeTruthy();
    expect(await screen.findByText('Revizyon bazlı stok bağlı değil.')).toBeTruthy();
  });

  it('seri listesi alınamazsa hata ve yeniden dene', async () => {
    sunucuKur({ '/degisiklik-yonetimi/seriler?sayfa=1': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkin yok.' } satisfies HataGovdesi) });
    cizdir('/degisiklik-yonetimi/izlenebilirlik');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });
});
