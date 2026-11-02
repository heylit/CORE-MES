import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { BakiyeSatiri, KonumAyrintiCevabi, SayimFarki, SayimFarklariCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { DEPOCU, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// Kör sayım ve sayım farkı onayı (1279 a, 1691 teyit).
const ONAYCI: Kullanici = { id: 7, ad: 'Deneme Müdür', islemler: ['sayfa.stok', 'stok.sayim', 'stok.sayim-onayla'] };
const bakiye: BakiyeSatiri = {
  id: 501, malzemeId: 921, malzemeAd: 'Deneme flanş', konumId: 41, konumKod: 'A-01-1', partiId: 77, partiEtiketi: 'LOT-DENEME-77', miktar: '10.000',
  ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId: null, kaliteDurumu: 'serbest',
};
const KONUM: KonumAyrintiCevabi = {
  konum: { id: 41, kod: 'A-01-1', tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 1, haritaGozId: null, haritaAlanId: null, surum: 3 },
  raf: null, bakiyeler: [bakiye], haritaYeri: null, zemin: null,
};
const fark = (o: Partial<SayimFarki>): SayimFarki => ({
  id: 9, konumId: 41, konumKod: 'A-01-1', depoId: 1, malzemeId: 921, malzemeAd: 'Deneme flanş', partiId: 77, partiEtiketi: 'LOT-DENEME-77', sistemMiktar: '10.000',
  sayilanMiktar: '7.000', fark: '-3', guncelMiktar: '8.000', sayanKisiId: 5, sayanAd: 'Deneme Depocu', sayimZamani: '2026-11-01T09:00:00+03:00', durum: 'bekliyor',
  kararAd: null, kararZamani: null, kararNotu: null, hareketId: null, surum: 1, ...o,
});
const LISTE: SayimFarklariCevabi = {
  farklar: [fark({}), fark({ id: 10, sayanKisiId: 7, sayanAd: 'Deneme Müdür', malzemeAd: 'Deneme mil' }), fark({ id: 3, durum: 'reddedildi', kararAd: 'Deneme Müdür', kararZamani: '2026-10-31T10:00:00+03:00', kararNotu: 'Yeniden say', surum: 2 })],
  esikler: [{ depoId: 1, depoKod: 'ANA', depoAd: 'Ana depo', esikYuzde: '0.00', surum: 4 }],
};

describe('Kör sayım ve sayım onayları (1279 a)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('konumda kör sayım: sistem miktarı sayım kipinde gizlenir, gövde beklenen miktar taşımaz; onaya giden fark bildirilir', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar/41': () => json(200, KONUM),
      'POST /stok/sayim': () => json(200, { hareketIdler: [], farkSayisi: 0, onayaGiden: 1 }),
    });
    ac('/stok/konumlar/41');
    const tablo = await screen.findByRole('table', { name: 'Gözdeki stok' });
    expect(within(tablo).getByText('10')).toBeTruthy();
    expect(within(tablo).queryByLabelText(/^Sayılan/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Kör sayım/ }));
    const sayim = await screen.findByRole('table', { name: 'Gözdeki stok' });
    expect(within(sayim).queryByText('10')).toBeNull();
    expect(within(sayim).queryByText('Sistemde')).toBeNull();
    fireEvent.change(within(sayim).getByLabelText('Sayılan Deneme flanş'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /Sayımı kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/sayim')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/sayim')!.govde).toEqual({ konumId: 41, satirlar: [{ malzemeId: 921, partiId: 77, sayilanMiktar: '7' }] });
    expect(await screen.findByText(/1 fark eşiği aştı/)).toBeTruthy();
  });

  it('onaylayan başkasının farkını onaylar, kendi sayımını onaylayamaz; red nedensiz gitmez; eşik sürümle kaydedilir', async () => {
    const istekler = sunucuKur(ONAYCI, {
      'GET /stok/sayim-farklari': () => json(200, LISTE),
      'POST /stok/sayim-farklari/9/onayla': () => json(200, LISTE),
      'POST /stok/sayim-farklari/9/reddet': () => json(200, LISTE),
      'POST /stok/depolar/1/sayim-esigi': () => json(200, LISTE),
    });
    ac('/stok/sayim-onaylari');
    const bekleyen = await screen.findByRole('table', { name: 'Onay bekleyen sayım farkları' });
    expect(within(bekleyen).getAllByText('-3')).toHaveLength(2);
    expect(within(bekleyen).getByText('Kendi sayımınız')).toBeTruthy();
    expect(within(bekleyen).getAllByRole('button', { name: /Onayla/ })).toHaveLength(1);
    fireEvent.click(within(bekleyen).getByRole('button', { name: /Onayla/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sayim-farklari/9/onayla')?.govde).toEqual({ surum: 1 }));

    fireEvent.click(within(bekleyen).getByRole('button', { name: /Reddet/ }));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByRole('button', { name: /Reddet/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('Red nedeni'), { target: { value: 'Yeniden say' } });
    fireEvent.click(within(pencere).getByRole('button', { name: /Reddet/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sayim-farklari/9/reddet')?.govde).toEqual({ surum: 1, neden: 'Yeniden say' }));

    expect(within(screen.getByRole('table', { name: 'Karara bağlanan sayım farkları' })).getByText('Reddedildi')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('ANA sayım eşiği (%)'), { target: { value: '2,5' } });
    fireEvent.click(within(screen.getByRole('table', { name: 'Sayım eşikleri' })).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/depolar/1/sayim-esigi')?.govde).toEqual({ surum: 4, esikYuzde: '2.5' }));
  });

  it('sayan listeyi görür, düğme görmez; eşik salt okunur', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/sayim-farklari': () => json(200, LISTE) });
    ac('/stok/sayim-onaylari');
    const bekleyen = await screen.findByRole('table', { name: 'Onay bekleyen sayım farkları' });
    expect(within(bekleyen).queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('ANA sayım eşiği (%)')).toBeNull();
    expect(screen.getByText('%0')).toBeTruthy();
  });

  it('kör sayım düğmesi sayım yetkisi olmayanda yok', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/konumlar/41': () => json(200, KONUM) });
    ac('/stok/konumlar/41');
    await screen.findByRole('table', { name: 'Gözdeki stok' });
    expect(screen.queryByRole('button', { name: /Kör sayım/ })).toBeNull();
  });
});
