import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { EmirAkisiCevabi, EmirListesiCevabi } from '#paylasilan/sozlesme/akis.ts';
import { AkisEmirleri, EmirYolculugu } from './Akis.tsx';
import { sureMetni } from './gorunum.ts';

const LISTE: EmirListesiCevabi = {
  emirler: [
    { id: 5, emirNo: 'UE-000005', urun: 'DNM-1 Deneme mamul', adet: 10, durum: 'basladi', teslim: null },
    { id: 6, emirNo: 'UE-000006', urun: 'DNM-2 Deneme flanş', adet: 4, durum: 'bitti', teslim: '2026-01-20' },
  ],
};

const AKIS: EmirAkisiCevabi = {
  emir: { id: 5, emirNo: 'UE-000005', adet: 10, durum: 'basladi', teslim: null },
  simdi: '2026-01-07T08:00:00.000Z',
  damgalar: { malKabul: '2026-01-05T08:00:00.000Z', uretimBasladi: '2026-01-06T08:00:00.000Z', uretimBitti: null, sevkeHazir: null, sevk: null },
  olculer: {
    uctanUca: { dk: null, acik: false },
    hammaddeBekleme: { dk: 1440, acik: false },
    uretimAkis: { dk: 1440, acik: true },
    sevkBekleme: { dk: null, acik: false },
    islemeToplamDk: 300,
    akisVerimi: 0.208,
  },
  seritler: [
    { anahtar: 'hammadde', tur: 'hammadde', baslik: 'Hammadde', altBaslik: null,
      bolumler: [{ tur: 'bekleme', baslangic: '2026-01-05T08:00:00.000Z', bitis: '2026-01-06T08:00:00.000Z', acik: false }] },
    { anahtar: 'adim-1', tur: 'adim', baslik: 'OP10', altBaslik: 'Deneme Torna',
      bolumler: [{ tur: 'isleme', baslangic: '2026-01-06T08:00:00.000Z', bitis: '2026-01-07T08:00:00.000Z', acik: true }] },
  ],
  adimlar: [{
    isEmriId: 1, opNo: 10, istasyon: 'Deneme Torna', fason: false, beklemeDk: null, hazirlikDk: 20, islemeDk: 300, duraklamaDk: 0, durusDk: 0,
    fasonDk: null, saglamAdet: 6, cevrimBirimDk: 50, standartBirimDk: 45, standartHazirlikDk: 30, terminGun: null,
  }],
  statuler: [{ statuId: 3, ad: 'OP10 sonrası', tur: 'YM', girenAdet: 6, cikanAdet: 0, bekleyenAdet: 6, ortalamaKalisDk: null, enUzunKalisDk: null, enEskiBekleyenDk: 90 }],
  hammadde: [{ partiId: 7, lotNo: 'LT-000007', malKabul: '2026-01-05T08:00:00.000Z', kullanim: '2026-01-06T08:00:00.000Z', beklemeDk: 1440 }],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur() {
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    if (yol === '/akis/emirler') return json(200, LISTE);
    if (yol === '/akis/emirler/5') return json(200, AKIS);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Üretim emri bulunamadı.' });
  }));
}

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter initialEntries={[adres]}>
        <Routes>
          <Route path="/akis" element={<AkisEmirleri />} />
          <Route path="/akis/:id" element={<EmirYolculugu />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Akış Süresi', () => {
  it('emir listesi gelir ve aramayla süzülür', async () => {
    sunucuKur();
    ac('/akis');
    expect(await screen.findByText('UE-000005')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Emir ya da ürün ara'), { target: { value: 'flanş' } });
    expect(screen.queryByText('UE-000005')).toBeNull();
    expect(screen.getByText('UE-000006')).toBeTruthy();
  });

  it('emir yolculuğu: ölçüler, şerit, adım ve statü tabloları; ölçülemeyen değer "Veri yok" kalır', async () => {
    sunucuKur();
    ac('/akis/5');
    expect(await screen.findByRole('heading', { name: 'UE-000005' })).toBeTruthy();
    expect(screen.getAllByText('Veri yok').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('1 g 0 sa (sürüyor)')).toBeTruthy();
    expect(screen.getByText('%20,8')).toBeTruthy();
    const serit = screen.getByRole('group', { name: 'Emir yolculuğu şeridi' });
    expect(within(serit).getByText('OP10')).toBeTruthy();
    expect(within(serit).getByRole('img', { name: 'OP10: İşleme' })).toBeTruthy();
    const adimlar = screen.getByRole('table', { name: 'Adım süreleri' });
    expect(within(adimlar).getByText('50 dk')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Statüde kalış' })).getByText('1 sa 30 dk')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Hammadde partileri' })).getByText('LT-000007')).toBeTruthy();
  });

  it('olmayan emirde hata kutusu gösterilir', async () => {
    sunucuKur();
    ac('/akis/9');
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });
});

describe('sureMetni', () => {
  it('dakikayı okunur süreye çevirir; veri yoksa tire', () => {
    expect(sureMetni(null)).toBe('–');
    expect(sureMetni(12.5)).toBe('12,5 dk');
    expect(sureMetni(90)).toBe('1 sa 30 dk');
    expect(sureMetni(2900)).toBe('2 g 0 sa');
  });
});
