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
  // İki gözde duran lot: "Hangi gözden alınacak?" seçimi.
  'LOT:4': { tur: 'malzeme', malzeme: { id: 901, kod: 'HM-1', ad: 'Deneme sac', birim: 'kg' }, parti: { id: 4, etiket: 'TP-4' }, yerler: [
    { konumId: 5, kod: 'KABUL', ad: 'Mal kabul', tur: 'kabul', istasyonId: null, partiId: 4, partiEtiketi: 'TP-4', statuId: null, miktar: '6.000' },
    { konumId: 31, kod: 'A-01-02', ad: null, tur: 'raf_gozu', istasyonId: null, partiId: 4, partiEtiketi: 'TP-4', statuId: null, miktar: '1.000' },
  ] },
  'LOC:A-02-01': { tur: 'yer', yer: { konumId: 32, kod: 'A-02-01', ad: null, tur: 'raf_gozu', istasyonId: null }, satirlar: [
    { malzemeId: 901, kod: 'HM-1', ad: 'Deneme sac', partiId: 4, partiEtiketi: 'TP-4', statuId: null, miktar: '3.000' },
  ] },
  'LOC:A-02-02': { tur: 'yer', yer: { konumId: 33, kod: 'A-02-02', ad: null, tur: 'raf_gozu', istasyonId: null }, satirlar: [
    { malzemeId: 903, kod: 'YM-1', ad: 'Statülü parça', partiId: 6, partiEtiketi: 'TP-6', statuId: 2, miktar: '4.000' },
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
  fireEvent.click(await screen.findByRole('button', { name: /^Okut(,|$)/ }));
  return screen.findByRole('dialog');
}

// 3085: sepete alınan kartta "Sepete eklendi · Geri al" satırıyla, bırakmanın sonucu kalıcı sonuç kartıyla görünür.
async function sepeteEklendi(pencere: HTMLElement, ne: RegExp): Promise<void> {
  await within(pencere).findByText('Sepete eklendi');
  expect(pencere.querySelector('.tc-stok-sepette')?.textContent).toMatch(ne);
}
async function sonucKarti(pencere: HTMLElement): Promise<string> {
  return (await within(pencere).findByRole('status', { name: 'İşlem sonucu' })).textContent ?? '';
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
    await sepeteEklendi(pencere, /Deneme sac · 2/);
    expect(istekler.find((i) => i.yol === '/stok/sepet/satir-ekle')?.govde).toEqual({ malzemeId: 901, miktar: '2.000', kaynakKonumId: 20, partiId: 4 });
    expect(await within(pencere).findByRole('region', { name: 'Taşıma sepetim' })).toBeTruthy();
    await okut(pencere, 'T1');
    expect(await within(pencere).findByText('Kod tanınmadı: T1')).toBeTruthy();
    await okut(pencere, 'T2');
    const birak = await within(pencere).findByRole('button', { name: '1 kalemi bırak' });
    expect((within(pencere).getByRole('textbox', { name: /Miktar/ }) as HTMLInputElement).value).toBe('2');
    fireEvent.click(birak);
    expect((await screen.findAllByText('Kaynakta yetmez.')).length).toBeGreaterThan(0);
    fireEvent.click(within(pencere).getByRole('button', { name: '1 kalemi bırak' }));
    expect(await sonucKarti(pencere)).toMatch(/^Yolda.*Teslim edildi: Torna 2 · /);
    const postlar = istekler.filter((i) => i.yontem === 'POST' && i.yol === '/stok/sepet/gonder').map((i) => i.govde as { kaynakKimligi: string });
    expect(postlar).toHaveLength(2);
    expect(postlar[0]).toMatchObject({ satirlar: [{ satirId: 1, hedef: { istasyonId: 2 } }], aliciKodu: null });
    expect(postlar[1]!.kaynakKimligi).toBe(postlar[0]!.kaynakKimligi);
    expect(await within(pencere).findByRole('button', { name: /^Bana gelen/ })).toBeTruthy();
  });

  it('bırakma ekranı okuyucunun altında açılır, kutucuklar yerinde kalır (3085 düzeni); Başka yer okut bırakmayı kapatır', async () => {
    ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    await within(pencere).findByText('Sepete eklendi');
    await within(pencere).findByRole('region', { name: 'Taşıma sepetim' });
    await okut(pencere, 'T2');
    await within(pencere).findByText(/^Buraya bırak: Torna 2/);
    expect(within(pencere).getByRole('button', { name: /^Bana gelen/ })).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Başka yer okut' }));
    await waitFor(() => expect(within(pencere).queryByText(/^Buraya bırak: Torna 2/)).toBeNull());
    expect(within(pencere).getByRole('button', { name: /^Bana gelen/ })).toBeTruthy();
  });

  it('DEP-64: katalog etiketi (MK) okutulunca malzeme sepete düşer', async () => {
    const istekler = ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'MK:HM-1');
    await sepeteEklendi(pencere, /Deneme sac · 2/);
    expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu/kod-coz?kod=MK%3AHM-1')).toBe(true);
  });

  it('sepet doluyken kişi kodu: bırakma kişinin istasyonuna, alıcı koduyla elden gider (Bıraktım yok)', async () => {
    const istekler = ciz(OPERATOR, { 'POST /stok/sepet/gonder': () => json(200, { teslimler: [{ satirId: 1, teslimNo: 'TS-000002' }], kalanlar: [] }) });
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    await within(pencere).findByText('Sepete eklendi');
    await within(pencere).findByRole('region', { name: 'Taşıma sepetim' });
    expect(await okutVeBekle(pencere, 'KSI-7', /Buraya bırak: Deneme Alıcı · Torna 2/)).toBeTruthy();
    expect(within(pencere).getByText('Alıcı: Deneme Alıcı. Teslim edince hemen kapanır; alıcı vardiya sonuna kadar itiraz edebilir.')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Bıraktım' })).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: '1 kalemi bırak' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sepet/gonder')?.govde).toMatchObject({ satirlar: [{ satirId: 1, hedef: { istasyonId: 2 } }], aliciKodu: 'KSI-7' }));
    expect(await sonucKarti(pencere)).toMatch(/^Yapıldı.*Elden teslim edildi: Deneme Alıcı · Torna 2/);
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

  it('3085: aynı kod 2 sn içinde ikinci kez gelirse yok sayılır; sonra sepetteki kalem yeniden okutulunca "Zaten sepette" yazar, yeniden eklenmez', async () => {
    const istekler = ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    await sepeteEklendi(pencere, /Deneme sac · 2/);
    await okut(pencere, 'MLZ:901');
    expect(istekler.filter((i) => i.yol.startsWith('/stok/teslim-kutusu/kod-coz?kod=MLZ')).length).toBe(1);
    const simdi = Date.now();
    const saat = vi.spyOn(Date, 'now').mockReturnValue(simdi + 3000);
    try {
      await okut(pencere, 'MLZ:901');
      expect(await within(pencere).findByText('Zaten sepette')).toBeTruthy();
      expect(istekler.filter((i) => i.yol === '/stok/sepet/satir-ekle')).toHaveLength(1);
    } finally { saat.mockRestore(); }
  });

  it('3085: Son yaptıklarım bugünkü işlemi durumuyla gösterir; yoldaki teslimde Geri çek var', async () => {
    ciz(OPERATOR, { 'GET /stok/teslim-kutusu/son-islemlerim': () => json(200, { islemler: [
      { tur: 'teslim', id: 7, no: 'TS-000007', malzemeAd: 'Deneme sac', partiEtiketi: 'TP-4', miktar: '2.000', nereye: { kod: 'T2', ad: 'Torna 2' }, aliciAd: null,
        durum: 'yolda', redNedeni: null, zaman: '2026-10-30T10:05:00+03:00', surum: 1 },
      { tur: 'tasima', id: 3, no: null, malzemeAd: 'Deneme sac', partiEtiketi: null, miktar: '1.000', nereye: { kod: 'A-01-01', ad: null }, aliciAd: null,
        durum: 'yapildi', redNedeni: null, zaman: '2026-10-30T09:00:00+03:00', surum: null },
    ] }) });
    const pencere = await pencereAc();
    const liste = await within(pencere).findByRole('region', { name: 'Son yaptıklarım' });
    const satirlar = await within(liste).findAllByRole('listitem');
    expect(satirlar).toHaveLength(2);
    expect(satirlar[0]!.textContent).toMatch(/Teslim: Torna 2 · TS-000007/);
    expect(within(satirlar[0]!).getByText('Yolda')).toBeTruthy();
    expect(within(satirlar[0]!).getByRole('button', { name: 'Geri çek' })).toBeTruthy();
    expect(satirlar[1]!.textContent).toMatch(/Taşıma: A-01-01/);
    expect(within(satirlar[1]!).queryByRole('button', { name: 'Geri çek' })).toBeNull();
  });

  it('3085: göz seçimi açıkken başka kod okutulursa seçim bırakılır, yeni kod işlenir', async () => {
    const istekler = ciz(DEPOCU);
    const pencere = await pencereAc();
    await okut(pencere, 'LOT:4');
    expect(await within(pencere).findByText('Hangi gözden alınacak?')).toBeTruthy();
    await okut(pencere, 'MLZ:901');
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/stok/teslim-kutusu/kod-coz?kod=MLZ'))).toBe(true));
    await waitFor(() => expect(within(pencere).queryByRole('list', { name: 'Nereden alınacak' })).toBeNull());
    await sepeteEklendi(pencere, /Deneme sac · 2/);
    expect(within(pencere).queryByText('Hangi gözden alınacak?')).toBeNull();
  });

  it('3119: yer etiketi okutulunca gözün içi görünür; tek kalem olsa da sepete kendiliğinden girmez, "Al" ile girer', async () => {
    const istekler = ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'LOC:A-02-01');
    const goz = await within(pencere).findByRole('generic', { name: 'Göz A-02-01 içeriği' });
    expect(goz.textContent).toMatch(/Deneme sac.*TP-4.*3/);
    expect(istekler.some((i) => i.yol === '/stok/sepet/satir-ekle')).toBe(false);
    fireEvent.click(within(goz).getByRole('button', { name: 'Al' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sepet/satir-ekle')).toMatchObject({ govde: { malzemeId: 901, kaynakKonumId: 32, partiId: 4, miktar: '3.000' } }));
  });

  it('3119: gözdeki statülü parça sepete girmez; "Teslim et" bugünkü gibi nereye adımına gider', async () => {
    ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'LOC:A-02-02');
    const goz = await within(pencere).findByRole('generic', { name: 'Göz A-02-02 içeriği' });
    expect(within(goz).queryByRole('button', { name: 'Al' })).toBeNull();
    fireEvent.click(within(goz).getByRole('button', { name: 'Teslim et' }));
    expect(await within(pencere).findByRole('button', { name: 'Teslim et: yeri ya da kişiyi okut' })).toBeTruthy();
  });

  it('3085: "Geri al" sepete eklenen satırı siler', async () => {
    const istekler = ciz(OPERATOR);
    const pencere = await pencereAc();
    await okut(pencere, 'MLZ:901');
    await sepeteEklendi(pencere, /Deneme sac · 2/);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(istekler.some((i) => /^\/stok\/sepet\/satirlar\/\d+\/sil$/.test(i.yol))).toBe(true));
  });

  it('depocu: kabul alanını okutur, malzemeyi sepete atar, rafa bırakır (taşıma, sepet satırı düşer)', async () => {
    const istekler = ciz(DEPOCU, { 'POST /stok/tasima': () => json(200, { hareketIdler: [3] }) });
    const pencere = await pencereAc();
    await okut(pencere, 'KABUL');
    const goz = await within(pencere).findByRole('generic', { name: 'Göz KABUL içeriği' });
    expect(istekler.some((i) => i.yol === '/stok/sepet/satir-ekle')).toBe(false);
    fireEvent.click(within(goz).getAllByRole('button', { name: 'Al' })[0]!);
    await within(pencere).findByRole('region', { name: 'Taşıma sepetim' });
    await okut(pencere, 'LOC:A-01-01');
    fireEvent.click(await within(pencere).findByRole('button', { name: '1 kalemi bırak' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/tasima')).toMatchObject({
      govde: { malzemeId: 901, kaynakKonumId: 5, partiId: 4, hedefKonumId: 30, miktar: '6' },
    }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/sepet/satirlar/1/sil')).toBe(true));
    expect(await sonucKarti(pencere)).toMatch(/^Yapıldı.*Bırakıldı: A-01-01 · /);
  });
});
