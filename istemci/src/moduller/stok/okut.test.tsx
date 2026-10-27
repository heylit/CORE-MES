import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OkutCozCevabi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
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
  // Katalog etiketi (DEP-64) sunucuda karta çevrilir; ekran için malzeme cevabıdır.
  'MK:HM-1': { tur: 'malzeme', malzeme: { id: 901, kod: 'HM-1', ad: 'Deneme sac', birim: 'kg' }, parti: null,
    yerler: [{ konumId: 20, kod: 'T1', ad: 'Torna 1', tur: 'istasyon', istasyonId: 1, partiId: 4, partiEtiketi: 'TP-4', statuId: null, miktar: '2.000' }] },
  'KSI-7': { tur: 'kisi', kod: 'KSI-7', kisi: { id: 7, ad: 'Deneme Alıcı' }, istasyon: { id: 2, kod: 'T2', ad: 'Torna 2' } },
  'KSI-8': { tur: 'kisi', kod: 'KSI-8', kisi: { id: 8, ad: 'Uzak Alıcı' }, istasyon: { id: 99, kod: 'X9', ad: 'Uzak tezgah' } },
};
const KUTU: TeslimKutusuCevabi = {
  gelenler: [], gonderdiklerim: [], isteklerim: [],
  istasyonlar: [{ id: 1, kod: 'T1', ad: 'Torna 1' }],
  hedefIstasyonlar: [{ id: 1, kod: 'T1', ad: 'Torna 1' }, { id: 2, kod: 'T2', ad: 'Torna 2' }],
  depoKonumlari: [], araAlanlar: [], buradakiIstasyonId: 1, harita: null, zemin: null,
};

function ciz(kullanici: Kullanici, yollar: Record<string, (govde: unknown) => Response> = {}) {
  const tum: Record<string, (govde: unknown) => Response> = {
    'GET /stok/teslim-kutusu/kod-coz': () => json(404, {}),
    'GET /stok/statuler': () => json(200, { statuler: [] }),
    'GET /stok/teslim-kutusu': () => json(200, KUTU),
    'GET /stok/teslim-kutusu/sayac': () => json(200, { gelen: 0 }),
    'GET /stok/teslim-kutusu/kisi-kodu': () => json(200, { kod: 'KSI-9-x', gecerlilikSonu: '2026-10-20T10:02:00+03:00' }),
    'GET /stok/teslim-kutusu/sepet': () => json(200, { istasyon: { id: 1, kod: 'T1', ad: 'Torna 1' }, emirler: [], satirlar: [] }),
    'GET /stok/teslim-kutusu/is-malzemeleri': () => json(200, { isler: [] }),
    'GET /stok/teslim-kutusu/sepet/gelecek': () => json(200, { satirlar: [] }),
    ...yollar,
  };
  const istekler = sunucuKur(kullanici, tum);
  vi.mocked(fetch).mockImplementation(async (adres, secenek) => {
    const yol = String(adres).replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici });
    if (yol.startsWith('/stok/teslim-kutusu/kod-coz?')) {
      const kod = new URLSearchParams(yol.split('?')[1]).get('kod')!;
      return json(200, KODLAR[kod] ?? { tur: 'bilinmiyor', kod });
    }
    const isle = tum[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle(secenek?.body ? JSON.parse(String(secenek.body)) : undefined) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  });
  const eylem = ustEylemler.find((e) => e.anahtar === 'malzeme-teslim')!;
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><eylem.dugme /></BildirimSaglayici></QueryClientProvider>);
  return istekler;
}
async function okut(pencere: HTMLElement, kod: string) {
  fireEvent.change(within(pencere).getByRole('textbox', { name: /Kod/ }), { target: { value: kod } });
  fireEvent.click(within(pencere).getByRole('button', { name: 'Bul' }));
}
async function okutVeBekle(pencere: HTMLElement, kod: string, metin: RegExp) {
  await okut(pencere, kod);
  return within(pencere).findByText(metin);
}

async function pencereAc(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /^Malzeme ve teslim/ }));
  return screen.findByRole('dialog');
}

describe('Malzeme penceresinin okuyucusu (372 a)', () => {
  it('ayrı QR tuşu yok; okuyucu pencere açılınca sekmelerin üstünde hazır', async () => {
    expect(ustEylemler.some((e) => e.anahtar === 'qr-okut')).toBe(false);
    ciz(OPERATOR);
    expect(screen.queryByRole('button', { name: 'QR okut' })).toBeNull();
    const pencere = await pencereAc();
    const kod = within(pencere).getByRole('textbox', { name: /Kod/ });
    const serit = within(pencere).getByRole('tablist', { name: 'Malzeme ve teslim' });
    expect(kod.compareDocumentPosition(serit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('operatör: malzemeyi sonra istasyonu okutur, teslim eder; reddedilen gönderim aynı kaynak kimliğiyle yeniden gönderilir', async () => {
    let sayi = 0;
    const istekler = ciz(OPERATOR, {
      'POST /stok/teslimler/gonder': () => (++sayi === 1 ? json(422, { kod: 'DOGRULAMA', mesaj: 'Kaynakta yetmez.' }) : json(200, { teslim: { id: 1, no: 'TS-000001', durum: 'yolda' } })),
    });
    const pencere = await pencereAc();
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
    expect(await within(pencere).findByRole('tablist', { name: 'Malzeme ve teslim' })).toBeTruthy();
  });

  it('akış başlayınca sekmeler gizlenir; vazgeçince geri gelir', async () => {
    ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    await within(pencere).findByText(/Torna 1 \(T1\) · İstasyon/);
    expect(within(pencere).queryByRole('tablist', { name: 'Malzeme ve teslim' })).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç, sekmelere dön' }));
    expect(await within(pencere).findByRole('tablist', { name: 'Malzeme ve teslim' })).toBeTruthy();
  });

  it('DEP-64: katalog etiketi (MK) okutulunca malzeme akışı açılır', async () => {
    const istekler = ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'MK:HM-1');
    expect(await within(pencere).findByText(/Torna 1 \(T1\) · İstasyon/)).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu/kod-coz?kod=MK%3AHM-1')).toBe(true);
  });

  it('nereye adımında kişi kodu: teslim kişinin istasyonuna, alıcı koduyla elden gider (Bıraktım yok); malzemenin durduğu istasyondaki kişi reddedilir', async () => {
    const istekler = ciz(OPERATOR, { 'POST /stok/teslimler/gonder': () => json(200, { teslim: { id: 2, no: 'TS-000002', durum: 'teslim' } }) });
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    await within(pencere).findByText(/Torna 1 \(T1\) · İstasyon/);
    expect(await okutVeBekle(pencere, 'KSI-7', /Deneme Alıcı · Torna 2 \(T2\)/)).toBeTruthy();
    expect(within(pencere).getByText('Alıcı: Deneme Alıcı. Teslim edince hemen kapanır; alıcı vardiya sonuna kadar itiraz edebilir.')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Bıraktım' })).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ kaynak: { istasyonId: 1 }, hedef: { istasyonId: 2 }, aliciKodu: 'KSI-7' }));
    expect(await within(pencere).findByText('TS-000002: Deneme Alıcı kişisine elden teslim edildi.')).toBeTruthy();
  });

  it('ilk okutulan kişi kodu Teslim et\'i o kişiye hedefli açar; gönderilemeyecek istasyondaki kişi hedef olmaz', async () => {
    ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'KSI-7');
    expect(await within(pencere).findByText('Alıcı: Deneme Alıcı. Teslim edince hemen kapanır; alıcı vardiya sonuna kadar itiraz edebilir.')).toBeTruthy();
    expect(within(pencere).getByRole('tab', { name: 'Gönder' }).getAttribute('aria-selected')).toBe('true');
    expect((within(pencere).getByLabelText(/Nereye/) as HTMLSelectElement).value).toBe('i:2');
    await okut(pencere, 'KSI-8');
    expect(await within(pencere).findByText(/Uzak Alıcı buradan teslim edilebilecek bir istasyonda değil/)).toBeTruthy();
    expect(within(pencere).queryByText(/Teslim edince hemen kapanır/)).toBeNull();
    expect((within(pencere).getByRole('button', { name: 'Teslim et' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('depocu: kabul alanını okutur, malzemeyi seçer, rafa yerleştirir (taşıma)', async () => {
    const istekler = ciz(DEPOCU, { 'POST /stok/tasima': () => json(200, { hareketIdler: [3] }) });
    const pencere = await pencereAc();
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
