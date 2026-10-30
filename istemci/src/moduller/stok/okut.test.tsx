import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OkutCozCevabi, SepetEkleGovdesi, SepetSatiri, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
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
  // Taşıma sepeti (1338 a) sunucudadır: eklenen satır sonraki okumada gelir.
  const sepet: SepetSatiri[] = [];
  const tum: Record<string, (govde: unknown) => Response> = {
    'GET /stok/sepet': () => json(200, { satirlar: sepet }),
    'POST /stok/sepet/satir-ekle': (g) => {
      const x = g as SepetEkleGovdesi;
      sepet.push({ id: sepet.length + 1, malzemeId: x.malzemeId, malzemeAd: 'Deneme sac', malzemeKod: 'HM-1', kaynakKonumId: x.kaynakKonumId ?? null, kaynakKonumKod: 'K',
        partiId: x.partiId ?? null, partiEtiketi: 'TP-4', miktar: x.miktar, mevcut: x.miktar, eklenme: '2026-10-30T10:00:00+03:00' });
      return json(200, { satirlar: sepet });
    },
    'POST /stok/sepet/satirlar/1/sil': () => { sepet.splice(0); return json(200, { satirlar: sepet }); },
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
  it('ayrı QR tuşu yok; okuyucu pencere açılınca kutucukların üstünde hazır', async () => {
    expect(ustEylemler.some((e) => e.anahtar === 'qr-okut')).toBe(false);
    ciz(OPERATOR);
    expect(screen.queryByRole('button', { name: 'QR okut' })).toBeNull();
    const pencere = await pencereAc();
    const kod = within(pencere).getByRole('textbox', { name: /Kod/ });
    const serit = await within(pencere).findByRole('button', { name: /^Bana gelen/ });
    expect(kod.compareDocumentPosition(serit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('operatör: malzemeyi okutur, sepete düşer; istasyonu okutunca bırakır; reddedilen bırakma aynı kaynak kimliğiyle yeniden gönderilir (1338 a)', async () => {
    let sayi = 0;
    const istekler = ciz(OPERATOR, {
      'POST /stok/sepet/gonder': () => (++sayi === 1 ? json(422, { kod: 'DOGRULAMA', mesaj: 'Kaynakta yetmez.' }) : json(200, { teslimler: [{ satirId: 1, teslimNo: 'TS-000001' }], kalanlar: [] })),
    });
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    expect(await within(pencere).findByText(/Deneme sac · 2 sepete atıldı/)).toBeTruthy();
    expect(istekler.find((i) => i.yol === '/stok/sepet/satir-ekle')?.govde).toEqual({ malzemeId: 901, miktar: '2.000', kaynakKonumId: 20, partiId: 4 });
    expect(await within(pencere).findByRole('region', { name: 'Taşıma sepetim' })).toBeTruthy();
    await okut(pencere, 'T1');
    expect(await within(pencere).findByText('Kod tanınmadı: T1')).toBeTruthy();
    await okut(pencere, 'T2');
    const birak = await within(pencere).findByRole('button', { name: '1 kalemi bırak' });
    expect((within(pencere).getByRole('textbox', { name: /Miktar/ }) as HTMLInputElement).value).toBe('2');
    fireEvent.click(birak);
    expect(await screen.findByText('Kaynakta yetmez.')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: '1 kalemi bırak' }));
    expect(await within(pencere).findByText(/^1 kalem Torna 2 · .* yerine bırakıldı\.$/)).toBeTruthy();
    const postlar = istekler.filter((i) => i.yontem === 'POST' && i.yol === '/stok/sepet/gonder').map((i) => i.govde as { kaynakKimligi: string });
    expect(postlar).toHaveLength(2);
    expect(postlar[0]).toMatchObject({ satirlar: [{ satirId: 1, hedef: { istasyonId: 2 } }], aliciKodu: null });
    expect(postlar[1]!.kaynakKimligi).toBe(postlar[0]!.kaynakKimligi);
    expect(await within(pencere).findByRole('button', { name: /^Bana gelen/ })).toBeTruthy();
  });

  it('bırakma ekranı kutucukların yerine gelir; başka yer okutmaya dönünce kutucuklar geri gelir', async () => {
    ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    await within(pencere).findByText(/sepete atıldı/);
    await within(pencere).findByRole('region', { name: 'Taşıma sepetim' });
    await okut(pencere, 'T2');
    await within(pencere).findByText(/^Buraya bırak: Torna 2/);
    expect(within(pencere).queryByRole('button', { name: /^Bana gelen/ })).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Başka yer okut' }));
    expect(await within(pencere).findByRole('button', { name: /^Bana gelen/ })).toBeTruthy();
  });

  it('DEP-64: katalog etiketi (MK) okutulunca malzeme sepete düşer', async () => {
    const istekler = ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'MK:HM-1');
    expect(await within(pencere).findByText(/Deneme sac · 2 sepete atıldı/)).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu/kod-coz?kod=MK%3AHM-1')).toBe(true);
  });

  it('sepet doluyken kişi kodu: bırakma kişinin istasyonuna, alıcı koduyla elden gider (Bıraktım yok)', async () => {
    const istekler = ciz(OPERATOR, { 'POST /stok/sepet/gonder': () => json(200, { teslimler: [{ satirId: 1, teslimNo: 'TS-000002' }], kalanlar: [] }) });
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    await within(pencere).findByText(/sepete atıldı/);
    await within(pencere).findByRole('region', { name: 'Taşıma sepetim' });
    expect(await okutVeBekle(pencere, 'KSI-7', /Buraya bırak: Deneme Alıcı · Torna 2/)).toBeTruthy();
    expect(within(pencere).getByText('Alıcı: Deneme Alıcı. Teslim edince hemen kapanır; alıcı vardiya sonuna kadar itiraz edebilir.')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Bıraktım' })).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: '1 kalemi bırak' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sepet/gonder')?.govde).toMatchObject({ satirlar: [{ satirId: 1, hedef: { istasyonId: 2 } }], aliciKodu: 'KSI-7' }));
    expect(await within(pencere).findByText(/^1 kalem Deneme Alıcı · Torna 2 yerine bırakıldı\.$/)).toBeTruthy();
  });

  it('ilk okutulan kişi kodu Elimdekiler\'i o kişiye hedefli açar; gönderilemeyecek istasyondaki kişi hedef olmaz', async () => {
    ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'KSI-7');
    expect(await within(pencere).findByText('Alıcı: Deneme Alıcı. Teslim edince hemen kapanır; alıcı vardiya sonuna kadar itiraz edebilir.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Elimdekiler' })).toBeTruthy();
    expect((within(pencere).getByLabelText(/Nereye/) as HTMLSelectElement).value).toBe('i:2');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kameraya dön' }));
    await okut(pencere, 'KSI-8');
    expect(await within(pencere).findByText(/Uzak Alıcı buradan teslim edilebilecek bir istasyonda değil/)).toBeTruthy();
    expect(within(pencere).queryByText(/Teslim edince hemen kapanır/)).toBeNull();
    expect((within(pencere).getByRole('button', { name: 'Teslim et' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('depocu: kabul alanını okutur, malzemeyi sepete atar, rafa bırakır (taşıma, sepet satırı düşer)', async () => {
    const istekler = ciz(DEPOCU, { 'POST /stok/tasima': () => json(200, { hareketIdler: [3] }) });
    const pencere = await pencereAc();
    await okut(pencere, 'KABUL');
    const secim = await within(pencere).findByRole('list', { name: 'Nereden alınacak' });
    fireEvent.click(within(secim).getAllByRole('button', { name: 'Sepete at' })[0]!);
    await within(pencere).findByRole('region', { name: 'Taşıma sepetim' });
    await okut(pencere, 'LOC:A-01-01');
    fireEvent.click(await within(pencere).findByRole('button', { name: '1 kalemi bırak' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/tasima')).toMatchObject({
      govde: { malzemeId: 901, kaynakKonumId: 5, partiId: 4, hedefKonumId: 30, miktar: '6' },
    }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/sepet/satirlar/1/sil')).toBe(true));
    expect(await within(pencere).findByText(/^1 kalem A-01-01 · .* yerine bırakıldı\.$/)).toBeTruthy();
  });
});
