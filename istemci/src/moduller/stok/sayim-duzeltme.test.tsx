import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  KonumAyrintiCevabi, KonumlarCevabi, SayimFarki, SayimFarklariCevabi, SifirlamaAdaylariCevabi, SifirlamaSatiri, SonDuzeltmelerCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';

// Sayım ve düzeltme sayfası (3417 a).
const ONAYCI: Kullanici = { id: 7, ad: 'Deneme Müdür', islemler: ['sayfa.stok', 'stok.sayim', 'stok.sayim-onayla'] };
const YALNIZ_ONAYCI: Kullanici = { id: 8, ad: 'Deneme Onaycı', islemler: ['sayfa.stok', 'stok.sayim-onayla'] };
const KONUM: KonumAyrintiCevabi = {
  konum: { id: 41, kod: 'A-01-1', tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 1, haritaGozId: null, haritaAlanId: null, surum: 3 },
  raf: null, haritaYeri: null, zemin: null,
  bakiyeler: [{
    id: 501, malzemeId: 921, malzemeAd: 'Deneme flanş', konumId: 41, konumKod: 'A-01-1', partiId: 77, partiEtiketi: 'LOT-DENEME-77', miktar: '10.000',
    ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId: null, kaliteDurumu: 'serbest',
  }, {
    id: 502, malzemeId: 922, malzemeAd: 'Deneme statülü mil', konumId: 41, konumKod: 'A-01-1', partiId: 78, partiEtiketi: 'LOT-DENEME-78', miktar: '2.000',
    ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId: 3, kaliteDurumu: 'serbest',
  }, {
    id: 503, malzemeId: 923, malzemeAd: 'Deneme karantina burç', konumId: 41, konumKod: 'A-01-1', partiId: 79, partiEtiketi: 'LOT-DENEME-79', miktar: '1.000',
    ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId: null, kaliteDurumu: 'karar_bekliyor',
  }],
};
const KONUMLAR: KonumlarCevabi = { satirlar: [KONUM.konum], toplam: 1, sayfa: 1, sayfaBoyu: 200 };
const OZET = { ozet: { id: 930, tur: 'sarf', kod: 'ORN-SF-0930', ad: 'Örnek eldiven', onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } };
const satir = (o: Partial<SifirlamaSatiri>): SifirlamaSatiri => ({
  konumId: 41, konumKod: 'A-01-1', depoKod: 'ANA', partiId: 77, partiEtiketi: 'LOT-DENEME-77', miktar: '10.000', statuId: null, kaliteDurumu: 'serbest', engel: null, ...o,
});
const ADAYLAR: SifirlamaAdaylariCevabi = {
  malzemeId: 921, malzemeAd: 'Deneme flanş', kod: 'ORN-HM-0921', birim: 'adet', rezerveler: [], ayirmaIstekleri: [],
  satirlar: [satir({}), satir({ konumId: 42, konumKod: 'B-02-1', partiId: null, partiEtiketi: null, miktar: '4.000' }), satir({ konumId: 43, konumKod: 'C-01-1', statuId: 3, engel: 'statude', miktar: '2.000' })],
};
const fark = (o: Partial<SayimFarki>): SayimFarki => ({
  id: 9, konumId: 41, konumKod: 'A-01-1', depoId: 1, malzemeId: 921, malzemeAd: 'Deneme flanş', partiId: 77, partiEtiketi: 'LOT-DENEME-77', sistemMiktar: '10.000',
  sayilanMiktar: '0.000', fark: '-10', guncelMiktar: '10.000', sayanKisiId: 5, sayanAd: 'Deneme Depocu', sayimZamani: '2026-11-18T09:00:00+03:00', durum: 'bekliyor',
  kararAd: null, kararZamani: null, kararNotu: null, hareketId: null, surum: 1, kaynak: 'sifirlama', neden: 'kayip', aciklama: 'ORN açıklama', ...o,
});
const FARKLAR: SayimFarklariCevabi = {
  farklar: [fark({}), fark({ id: 10, sayanKisiId: 7, sayanAd: 'Deneme Müdür', kaynak: 'sayim', neden: null, aciklama: null, sayilanMiktar: '7.000', fark: '-3' }), fark({ id: 11, malzemeAd: 'Deneme mil' })],
  esikler: [{ depoId: 1, depoKod: 'ANA', depoAd: 'Ana depo', esikYuzde: '0.00', surum: 4 }],
};
const SON: SonDuzeltmelerCevabi = {
  kesildi: false,
  satirlar: [{
    hareketId: 70, fisNo: 'SE-000012', zaman: '2026-11-18T10:00:00+03:00', konumId: 41, konumKod: 'A-01-1', malzemeId: 921, malzemeAd: 'Deneme flanş', partiEtiketi: 'LOT-DENEME-77',
    fark: '-10', kaynak: 'sifirlama', neden: 'kayip', sayanAd: 'Deneme Depocu', onaylayanAd: 'Deneme Müdür', geriAlindi: false,
  }],
};
const sekmeAdlari = () => screen.getAllByRole('tab').map((t) => t.textContent?.trim());

describe('Sayım ve düzeltme sayfası (3417 a)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('sekmeler yetkiye göre: sayan dört sekmeyi, yalnız onaylayan onay ve son düzeltmeleri görür; eski adres onay sekmesine gider', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/konumlar': () => json(200, KONUMLAR) });
    ac('/stok/sayim-duzeltme');
    await screen.findByRole('tab', { name: /Göz say/ });
    expect(sekmeAdlari()).toEqual(['Göz say', 'Kartı sıfırla', 'Onay bekleyen', 'Son düzeltmeler']);
    cleanup();
    sunucuKur(YALNIZ_ONAYCI, { 'GET /stok/sayim-farklari': () => json(200, FARKLAR) });
    ac('/stok/sayim-duzeltme?sekme=say');
    await screen.findByRole('table', { name: 'Onay bekleyen sayım farkları' });
    expect(sekmeAdlari()).toEqual(['Onay bekleyen', 'Son düzeltmeler']);
    cleanup();
    sunucuKur(ONAYCI, { 'GET /stok/sayim-farklari': () => json(200, FARKLAR) });
    ac('/stok/sayim-onaylari');
    await screen.findByRole('table', { name: 'Onay bekleyen sayım farkları' });
    expect(screen.getByRole('tab', { name: /Onay bekleyen/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('göz say kör kalır; sistemde olmayan malzeme "Kayıt yok" satırıyla eklenir ve sayım gövdesine partisiz girer', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, KONUMLAR),
      'GET /stok/konumlar/41': () => json(200, KONUM),
      'GET /stok/malzemeler/930/ozet': () => json(200, OZET),
      'POST /stok/sayim': () => json(200, { hareketIdler: [], farkSayisi: 1, onayaGiden: 1 }),
    });
    ac('/stok/sayim-duzeltme?sekme=say');
    await screen.findByRole('option', { name: /A-01-1/ });
    fireEvent.change(screen.getByLabelText('Göz'), { target: { value: '41' } });
    const tablo = await screen.findByRole('table', { name: 'Sayılacak satırlar' });
    expect(within(tablo).queryByText('10')).toBeNull();
    expect(within(tablo).queryByText('Sistemde')).toBeNull();
    // Kör sayım yalnız serbest stoğu sayar (STK-S3): statüdeki ve kalite kararı bekleyen satır sayıma gelmez.
    expect(within(tablo).getByLabelText('Sayılan Deneme flanş LOT-DENEME-77')).toBeTruthy();
    expect(within(tablo).queryByText(/Deneme statülü mil/)).toBeNull();
    expect(within(tablo).queryByText(/Deneme karantina burç/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Sistemde olmayan malzeme ekle'), { target: { value: '930' } });
    const ekle = screen.getByRole('button', { name: /Sayıma ekle/ });
    await waitFor(() => expect((ekle as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(ekle);
    expect(await within(tablo).findByText('Kayıt yok')).toBeTruthy();
    fireEvent.change(within(tablo).getByLabelText('Sayılan Deneme flanş LOT-DENEME-77'), { target: { value: '9' } });
    fireEvent.change(within(tablo).getByLabelText('Sayılan Örnek eldiven'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Sayımı kaydet/ }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST' && i.yol === '/stok/sayim')?.govde).toEqual({
      konumId: 41, satirlar: [{ malzemeId: 921, partiId: 77, sayilanMiktar: '9' }, { malzemeId: 930, partiId: null, sayilanMiktar: '3' }],
    }));
  });

  it('kartı sıfırla: engelli satır seçilemez, neden seçilmeden gitmez; gövde seçilen satırları beklenen miktarla taşır', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/921/sifirlama': () => json(200, ADAYLAR),
      'GET /stok/malzemeler/921/ozet': () => json(200, { ozet: { ...OZET.ozet, id: 921, kod: 'ORN-HM-0921', ad: 'Deneme flanş' } }),
      'POST /stok/sifirla': () => json(200, { onayaGiden: 1 }),
    });
    ac('/stok/sayim-duzeltme?sekme=sifirla&malzeme=921');
    const tablo = await screen.findByRole('table', { name: 'Kartın bulunduğu gözler' });
    const kutular = within(tablo).getAllByRole('checkbox') as HTMLInputElement[];
    expect(kutular.map((k) => [k.checked, k.disabled])).toEqual([[true, false], [true, false], [false, true]]);
    expect(within(tablo).getByText(/Statüde/)).toBeTruthy();
    const gonder = screen.getByRole('button', { name: /satırı sıfırlamaya gönder/ }) as HTMLButtonElement;
    expect(gonder.textContent).toContain('2 satırı');
    expect(gonder.disabled).toBe(true);
    fireEvent.click(kutular[1]!);
    fireEvent.change(screen.getByLabelText(/^Neden/), { target: { value: 'kayip' } });
    expect(gonder.disabled).toBe(false);
    fireEvent.click(gonder);
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sifirla')?.govde).toEqual({
      malzemeId: 921, neden: 'kayip', aciklama: '', satirlar: [{ konumId: 41, partiId: 77, beklenenMiktar: '10.000' }],
    }));
  });

  it('kartı sıfırla: serbest stok emre ayrılmışsa gönderilemez ve neden söylenir', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/921/sifirlama': () => json(200, { ...ADAYLAR, rezerveler: [{ uretimEmriId: 55, emirNo: 'ORN-UE-55', statuId: null, miktar: '3.000' }] } satisfies SifirlamaAdaylariCevabi),
      'GET /stok/malzemeler/921/ozet': () => json(200, { ozet: { ...OZET.ozet, id: 921 } }),
    });
    ac('/stok/sayim-duzeltme?sekme=sifirla&malzeme=921');
    expect((await screen.findByRole('alert')).textContent).toMatch(/ORN-UE-55/);
    fireEvent.change(screen.getByLabelText(/^Neden/), { target: { value: 'kayip' } });
    expect((screen.getByRole('button', { name: /sıfırlamaya gönder/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('onay bekleyen: kutular boş gelir, seçim yokken toplu onay pasif; kendi sayımı seçilemez; seçilenler sürümle gider', async () => {
    const istekler = sunucuKur(ONAYCI, {
      'GET /stok/sayim-farklari': () => json(200, FARKLAR),
      'POST /stok/sayim-farklari/toplu-onayla': () => json(200, { ...FARKLAR, sonuclar: [{ id: 9, tamam: true, ileti: null }, { id: 11, tamam: true, ileti: null }] }),
    });
    ac('/stok/sayim-duzeltme?sekme=onay');
    const tablo = await screen.findByRole('table', { name: 'Onay bekleyen sayım farkları' });
    const kutular = within(tablo).getAllByRole('checkbox') as HTMLInputElement[];
    expect(kutular).toHaveLength(2);
    expect(kutular.every((k) => !k.checked)).toBe(true);
    expect(within(tablo).getByText('Kendi sayımınız')).toBeTruthy();
    expect(within(tablo).getAllByText(/Kayıp/).length).toBeGreaterThan(0);
    const toplu = screen.getByRole('button', { name: /Seçilenleri onayla/ }) as HTMLButtonElement;
    expect(toplu.disabled).toBe(true);
    kutular.forEach((k) => fireEvent.click(k));
    expect(toplu.disabled).toBe(false);
    fireEvent.click(toplu);
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sayim-farklari/toplu-onayla')?.govde).toEqual({ farklar: [{ id: 9, surum: 1 }, { id: 11, surum: 1 }] }));
  });

  it('son düzeltmeler: fiş, neden, sayan ve onaylayan görünür; dönem değişince yeniden okunur', async () => {
    const istekler = sunucuKur(ONAYCI, { 'GET /stok/sayim-duzeltmeleri': () => json(200, SON) });
    ac('/stok/sayim-duzeltme?sekme=gecmis');
    const tablo = await screen.findByRole('table', { name: 'Son düzeltmeler' });
    for (const metin of ['SE-000012', 'Kayıp', 'Deneme Depocu', 'Deneme Müdür']) expect(within(tablo).getByText(metin)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dönem'), { target: { value: '7' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/sayim-duzeltmeleri?gun=7')).toBe(true));
  });
});
