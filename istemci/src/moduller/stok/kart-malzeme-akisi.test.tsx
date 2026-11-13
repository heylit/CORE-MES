import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { IstasyonSepetiSatiri, IstasyonSepetleriCevabi, OkutCozCevabi, RefakatKartSatiri, RefakatPartisi, Teslim, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OkutmaSonucu } from './OkutmaSonucu.tsx';
import { json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3162 a (B "Yer listesi"): kart okutulunca tek cümle, okutana göre tek düğme, malzeme nerede; işlemden sonra yeni durum.
const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek', 'terminal.uret'] };
const PLANCI: Kullanici = { id: 10, ad: 'Deneme Planlamacı', islemler: ['stok.istek'] };
const KART: RefakatPartisi = {
  id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme mil', birim: 'adet',
  partiId: 40, lotNo: 'LT-000040', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '10', durum: 'acik', surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00', lotaBaglanmaZamani: null,
  ust: null, birlestigi: null, birlesmeZamani: null,
};
const T1 = { id: 3, kod: 'T1', ad: 'Torna 1' };
const F2 = { id: 4, kod: 'F2', ad: 'Freze 2' };
const satir = (x: Partial<RefakatKartSatiri>): RefakatKartSatiri => ({
  konumId: 31, konumKod: 'IST-T1', konumAd: 'Torna 1', konumTur: 'istasyon', istasyonId: 3, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme mil', birim: 'adet',
  partiId: 40, partiEtiketi: 'LT-000040', statuId: null, kaliteDurumu: 'serbest', miktar: '10', yolda: '0', alinabilir: '10', ...x,
});
const cevap = (x: Partial<Extract<OkutCozCevabi, { tur: 'malzeme' }>> = {}): OkutCozCevabi => ({
  tur: 'malzeme', malzeme: { id: 901, kod: 'HM-1', ad: 'Deneme mil', birim: 'adet' }, parti: { id: 40, etiket: 'LT-000040', uretimEmriId: null },
  yerler: [], refakat: KART, kartSatirlari: [satir({})], anaEylem: 'teslim-et', ...x,
});
const kutu = (buradakiIstasyonId: number | null, depoKonumlari: TeslimKutusuCevabi['depoKonumlari'] = []): TeslimKutusuCevabi => ({
  gelenler: [], gonderdiklerim: [], isteklerim: [], istasyonlar: buradakiIstasyonId === null ? [] : [buradakiIstasyonId === 3 ? T1 : F2], hedefIstasyonlar: [T1, F2],
  depoKonumlari, araAlanlar: [], buradakiIstasyonId, harita: null, zemin: null,
});
const cikan = (x: Partial<IstasyonSepetiSatiri>): IstasyonSepetiSatiri => ({
  malzemeId: 901, kod: 'HM-1', ad: 'Deneme mil', partiId: 40, partiEtiketi: 'LT-000040', statuId: null, miktar: '10', yolda: '0', uretimEmriId: 1,
  getiren: null, gelis: null, koken: 'uretim', sonraki: { istasyonId: 4, kod: 'F2', ad: 'Freze 2', opNo: 30 }, sonrakiYok: null, ...x,
});
const sepetler = (x: Partial<IstasyonSepetleriCevabi>): IstasyonSepetleriCevabi => ({ istasyon: T1, gelen: { bekleyen: [], yolda: [] }, cikan: [], ...x });
const GELEN: Teslim = {
  id: 501, no: 'TS-000501', malzemeId: 901, malzemeAd: 'Deneme mil', miktar: '10', partiId: 40, statuId: null, kaliteDurumu: 'serbest',
  kaynak: { konumId: 31, kod: 'IST-T1', ad: 'Torna 1', istasyonId: 3 }, hedef: { konumId: 41, kod: 'IST-F2', ad: 'Freze 2', istasyonId: 4 },
  uretimEmriId: 1, istekId: null, aciklama: null, durum: 'yolda', alinan: null, redNedeni: null, gonderenAd: 'Deneme', kapatanAd: null, aliciAd: null,
  gonderim: '2026-10-22T10:00:00+03:00', kapanis: null, surum: 3,
};

function ciz(c: OkutCozCevabi, salt = false) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>
      <OkutmaSonucu okunan={{ kod: 'RP:12', cevap: c }} sec={() => undefined} kapat={() => undefined} salt={salt} />
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}
const blok = () => screen.findByRole('region', { name: 'Malzeme akışı' });
const cumle = async () => (await within(await blok()).findByRole('status')).textContent ?? '';

describe('Kartla malzeme akışı (3162 a)', () => {
  it('işi biten tek düğmeyle sonraki istasyona gönderir (bırakmadan); sonra cümle ve liste yolda der', async () => {
    let gonderildi = false;
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, kutu(3)),
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, sepetler({ cikan: [gonderildi ? cikan({ miktar: '0', yolda: '10' }) : cikan({})] })),
      'POST /stok/teslimler/gonder': () => { gonderildi = true; return json(200, { teslim: GELEN, acilanKartlar: [] }); },
      'GET /stok/teslim-kutusu/kod-coz': () => json(200, cevap({ kartSatirlari: [satir({ yolda: '10', alinabilir: '0' })] })),
    });
    ciz(cevap());
    fireEvent.click(await within(await blok()).findByRole('button', { name: /Sonraki istasyona gönder: Freze 2/ }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({
      malzemeId: 901, miktar: '10', partiId: 40, statuId: null, kaynak: { istasyonId: 3 }, hedef: { istasyonId: 4 }, uretimEmriId: 1,
    }));
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).not.toHaveProperty('birak');
    await waitFor(async () => expect(await cumle()).toMatch(/Gönderildi: 10 adet yolda, Freze 2 istasyonuna/));
    expect(within(screen.getByRole('list', { name: 'Malzeme nerede' })).getByRole('listitem').textContent).toMatch(/tamamı yolda/);
  });

  it('son adım sunucunun sonrakiYok değerinden okunur; depo yeri yalnız depo listesinden, Depoya teslim et', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, kutu(3, [{ id: 901, kod: 'MD-1', ad: 'Mamul deposu' }, { id: 902, kod: 'SVK', ad: 'Sevk alanı' }])),
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, sepetler({ cikan: [cikan({ sonraki: null, sonrakiYok: 'son-adim' })] })),
      'POST /stok/teslimler/gonder': () => json(200, { teslim: GELEN, acilanKartlar: [] }),
    });
    ciz(cevap());
    expect(await cumle()).toMatch(/rotanın son adımı bitti/);
    fireEvent.change(await screen.findByLabelText('Depo yeri'), { target: { value: '902' } });
    fireEvent.click(screen.getByRole('button', { name: 'Depoya teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ kaynak: { istasyonId: 3 }, hedef: { konumId: 902 } }));
  });

  it('sonraki adım fasonsa düğme yok, Teslim et yolu söylenir; başka yerden gelen girdi gönderilmez (2920 a)', async () => {
    sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, kutu(3)),
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, sepetler({ cikan: [cikan({ sonraki: null, sonrakiYok: 'fason' })] })),
    });
    ciz(cevap());
    await waitFor(async () => expect(await cumle()).toMatch(/Sonraki adım fason: Teslim et ile gönderin/));
    expect(within(await blok()).queryByRole('button')).toBeNull();
    cleanup();
    sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, kutu(3)),
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, sepetler({ cikan: [cikan({ koken: 'teslim' })] })),
    });
    ciz(cevap());
    await waitFor(async () => expect(await cumle()).toMatch(/^ ?Malzeme sende: 10 adet\./));
    expect(within(await blok()).queryByRole('button', { name: /Sonraki istasyona/ })).toBeNull();
  });

  it('gönderilmemiş parça önceki istasyonda bekliyorsa sıra sende der, Teslim al blokta', async () => {
    sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, kutu(4)),
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, sepetler({ istasyon: F2, gelen: { bekleyen: [{ ...cikan({}), kaynak: T1 }], yolda: [] } })),
    });
    ciz(cevap());
    await waitFor(async () => expect(await cumle()).toMatch(/Malzeme Torna 1 istasyonunda bekliyor: 10 adet.*Sıra sende/));
    expect(await within(await blok()).findByRole('button', { name: /Teslim al, 10/ })).toBeTruthy();
  });

  it('bana gönderilmişse Al ve işi aç blokta ve en üstte; Yalnız teslim al altında', async () => {
    sunucuKur(OPERATOR, { 'GET /stok/teslim-kutusu': () => json(200, kutu(4)) });
    ciz(cevap({ gelenler: [GELEN], anaEylem: 'teslim-al' }));
    expect(await cumle()).toMatch(/sana yolda/);
    const dugmeler = await within(await blok()).findAllByRole('button');
    expect(dugmeler.map((d) => d.textContent)).toEqual(['Al ve işi aç', 'Yalnız teslim al']);
  });

  it('bilgi kipinde ve gönderme yetkisi olmayanda düğme yok; bölünmüş partide iki yer sayılır', async () => {
    sunucuKur(PLANCI, { 'GET /stok/teslim-kutusu': () => json(200, kutu(null)) });
    ciz(cevap({ kartSatirlari: [satir({ miktar: '8' }), satir({ konumId: 41, konumKod: 'IST-F2', konumAd: 'Freze 2', istasyonId: 4, miktar: '2', yolda: '2', alinabilir: '0' })] }), true);
    expect(await cumle()).toMatch(/Malzeme 2 yerde: Torna 1 8 adet, Freze 2 2 adet\./);
    const yerler = within(screen.getByRole('list', { name: 'Malzeme nerede' })).getAllByRole('listitem');
    expect(yerler.map((y) => y.textContent)).toEqual([expect.stringMatching(/Torna 1.*8 adet/), expect.stringMatching(/Freze 2.*tamamı yolda.*2 adet/)]);
    expect(within(await blok()).queryByRole('button')).toBeNull();
  });

  it('iptal kartta blok yok', () => {
    sunucuKur(OPERATOR, {});
    ciz(cevap({ refakat: { ...KART, durum: 'iptal' } }));
    expect(screen.queryByRole('region', { name: 'Malzeme akışı' })).toBeNull();
  });
});
