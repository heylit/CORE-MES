import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OkutCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';
import { ustEylemler } from './ust-eylem.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const KODLAR: Record<string, OkutCozCevabi> = {
  'MLZ:901': { tur: 'malzeme', malzeme: { id: 901, kod: 'HM-1', ad: 'Deneme sac', birim: 'kg' }, parti: null,
    yerler: [{ konumId: 20, kod: 'T1', ad: 'Torna 1', tur: 'istasyon', istasyonId: 1, partiId: 4, partiEtiketi: 'TP-4', statuId: null, miktar: '2.000' }] },
  T2: { tur: 'yer', yer: { konumId: 21, kod: 'T2', ad: 'Torna 2', tur: 'istasyon', istasyonId: 2 }, satirlar: null },
  KABUL: { tur: 'yer', yer: { konumId: 5, kod: 'KABUL', ad: 'Mal kabul', tur: 'kabul', istasyonId: null }, satirlar: [
    { malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 4, partiEtiketi: 'TP-4', statuId: null, miktar: '6.000' },
    { malzemeId: 902, kod: 'HM-2', ad: 'Başka', partiId: null, partiEtiketi: null, statuId: null, miktar: '1.000' },
  ] },
  'LOC:A-01-01': { tur: 'yer', yer: { konumId: 30, kod: 'A-01-01', ad: null, tur: 'raf_gozu', istasyonId: null }, satirlar: [] },
};

function ciz(kullanici: Kullanici, yollar: Record<string, (govde: unknown) => Response> = {}) {
  const istekler = sunucuKur(kullanici, {
    'GET /stok/teslim-kutusu/kod-coz': () => json(404, {}),
    'GET /stok/statuler': () => json(200, { statuler: [] }),
    ...yollar,
  });
  vi.mocked(fetch).mockImplementation(async (adres, secenek) => {
    const yol = String(adres).replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici });
    if (yol.startsWith('/stok/teslim-kutusu/kod-coz?')) {
      const kod = new URLSearchParams(yol.split('?')[1]).get('kod')!;
      return json(200, KODLAR[kod] ?? { tur: 'bilinmiyor', kod });
    }
    const isle = yollar[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle(secenek?.body ? JSON.parse(String(secenek.body)) : undefined) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  });
  const eylem = ustEylemler.find((e) => e.anahtar === 'qr-okut')!;
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><eylem.dugme /></BildirimSaglayici></QueryClientProvider>);
  return istekler;
}
async function okut(pencere: HTMLElement, kod: string) {
  fireEvent.change(within(pencere).getByRole('textbox', { name: /Kod/ }), { target: { value: kod } });
  fireEvent.click(within(pencere).getByRole('button', { name: 'Bul' }));
}

describe('QR okut paneli', () => {
  it('üst çubuğun solunda, stok.istek ile', () => {
    expect(ustEylemler.find((e) => e.anahtar === 'qr-okut')).toMatchObject({ yer: 'sol', islem: 'stok.istek' });
  });

  it('operatör: malzemeyi sonra istasyonu okutur, teslim eder; reddedilen gönderim aynı kaynak kimliğiyle yeniden gönderilir', async () => {
    let sayi = 0;
    const istekler = ciz(OPERATOR, {
      'POST /stok/teslimler/gonder': () => (++sayi === 1 ? json(422, { kod: 'DOGRULAMA', mesaj: 'Kaynakta yetmez.' }) : json(200, { teslim: { id: 1, no: 'TS-000001', durum: 'yolda' } })),
    });
    fireEvent.click(screen.getByRole('button', { name: 'QR okut' }));
    const pencere = await screen.findByRole('dialog');
    await okut(pencere, 'MLZ:901');
    expect(await within(pencere).findByText(/Torna 1 \(T1\) · İstasyon/)).toBeTruthy();
    await okut(pencere, 'T1');
    expect(await within(pencere).findByText('Kod tanınmadı: T1')).toBeTruthy();
    await okut(pencere, 'T2');
    const gonder = await within(pencere).findByRole('button', { name: 'Teslim et' });
    expect((within(pencere).getByRole('textbox', { name: /Miktar/ }) as HTMLInputElement).value).toBe('2');
    fireEvent.click(gonder);
    expect(await within(pencere).findByText('Kaynakta yetmez.')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yeniden gönder' }));
    expect(await within(pencere).findByText('TS-000001 yolda; Torna 2 teslim alınca kapanır.')).toBeTruthy();
    const postlar = istekler.filter((i) => i.yontem === 'POST').map((i) => i.govde as { kaynakKimligi: string });
    expect(postlar).toHaveLength(2);
    expect(postlar[0]).toMatchObject({ malzemeId: 901, miktar: '2', partiId: 4, statuId: null, kaynak: { istasyonId: 1 }, hedef: { istasyonId: 2 } });
    expect(postlar[1]!.kaynakKimligi).toBe(postlar[0]!.kaynakKimligi);
  });

  it('depocu: kabul alanını okutur, malzemeyi seçer, rafa yerleştirir (taşıma)', async () => {
    const istekler = ciz(DEPOCU, { 'POST /stok/tasima': () => json(200, { hareketIdler: [3] }) });
    fireEvent.click(screen.getByRole('button', { name: 'QR okut' }));
    const pencere = await screen.findByRole('dialog');
    await okut(pencere, 'KABUL');
    const secim = await within(pencere).findByRole('list', { name: 'Nereden alınacak' });
    fireEvent.click(within(secim).getAllByRole('button', { name: 'Bunu al' })[0]!);
    await okut(pencere, 'LOC:A-01-01');
    fireEvent.click(await within(pencere).findByRole('button', { name: 'Yerleştir' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({
      yol: '/stok/tasima', govde: { malzemeId: 901, kaynakKonumId: 5, partiId: 4, hedefKonumId: 30, miktar: '6' },
    }));
    expect(await within(pencere).findByText('Deneme sac A-01-01 yerine taşındı.')).toBeTruthy();
  });
});
