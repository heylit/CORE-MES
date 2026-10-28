import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AcikSiparisSatirlariCevabi, DepoSevkCevabi, DepoSevkSatiri, KonumlarCevabi, MalKabullerCevabi, MalzemeAyrintiCevabi, MalzemeOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bosListe = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
const satir = (s: Partial<DepoSevkSatiri> & Pick<DepoSevkSatiri, 'kalemId' | 'is' | 'kaynak'>): DepoSevkSatiri => ({
  uretimEmriId: null, emirNo: null, isEmriId: null, opNo: null, malzemeId: 921, malzemeAd: 'Deneme flanş', adet: '40.0000', kabulAdet: null,
  firmaId: 9, firmaAd: 'Örnek Firma B', tasima: 'biz', tetiklendi: '2026-10-28T09:00:00+03:00', erken: false, siparisSatirId: null, ...s,
});
const LISTE = {
  satirlar: [
    satir({ kalemId: 31, is: 'cikis', kaynak: 'fason', uretimEmriId: 12, emirNo: 'DENEME-UE-12', isEmriId: 70, opNo: 40, erken: true }),
    satir({ kalemId: 32, is: 'kabul', kaynak: 'alim', malzemeId: 922, malzemeAd: 'Deneme çubuk', adet: '25.0000', kabulAdet: '10.0000', siparisSatirId: 5, tasima: 'firma' }),
  ],
} satisfies DepoSevkCevabi;
const ozet = { ozet: { id: 922, tur: 'hammadde', kod: 'HM-922', ad: 'Deneme çubuk', onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } } satisfies MalzemeOzetiCevabi;
const AYRINTI = {
  satir: { malzemeId: 922, kod: 'HM-922', ad: 'Deneme çubuk', tur: 'hammadde', birim: 'adet', toplam: '0', durum: 'tanimsiz', kritikSeviye: null, serbest: '0' },
  bakiyeler: [], ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null }, sonHareketler: [], statuKirilimi: [],
  tanimliStatuler: [], rezerveler: [], bekleyenler: [],
} as unknown as MalzemeAyrintiCevabi;

describe('Depo sevk', () => {
  it('son çıkış listeden yazılır; kabul mal kabule kalemle gider ve satır kalem bağını taşır', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/depo-sevk': () => json(200, LISTE),
      'POST /stok/depo-sevk/31/cikis': () => json(200, { kalemId: 31, hareketIdler: [7], uyarilar: ['Eldeki kadar çıktı; 2 adet eksik.'] }),
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [] } satisfies AcikSiparisSatirlariCevabi),
      'GET /stok/malzemeler/922/ozet': () => json(200, ozet),
      'GET /stok/malzemeler/922': () => json(200, AYRINTI),
      'GET /stok/malzemeler/922/goz-onerisi': () => json(200, { oneri: null }),
      'POST /stok/mal-kabul': () => json(200, { belge: { id: 4, no: 'MK-000004', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-28T09:00:00+03:00', kisiAd: 'Deneme Depocu', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [4] }),
    });
    ac('/stok/depo-sevk');
    const cikacak = await screen.findByRole('table', { name: 'Son çıkış bekleyen' });
    expect(within(cikacak).getByText('Erken çıkış')).toBeTruthy();
    expect(within(cikacak).getByText('Fason gidişi · DENEME-UE-12 · OP 40')).toBeTruthy();
    fireEvent.click(within(cikacak).getByRole('button', { name: 'Çıkışı yap' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/depo-sevk/31/cikis')).toBe(true));
    expect(await screen.findByText('Eldeki kadar çıktı; 2 adet eksik.')).toBeTruthy();

    const girecek = screen.getByRole('table', { name: 'Kabul bekleyen' });
    expect(within(girecek).getByText('Firma getirir')).toBeTruthy();
    expect(within(girecek).getByText('10 / 25')).toBeTruthy();
    fireEvent.click(within(girecek).getByRole('button', { name: 'Kabul et' }));
    expect(await screen.findByText(/^Sevkiyat kalemi:/)).toBeTruthy();
    await waitFor(() => expect((screen.getAllByLabelText(/Sayılan miktar/) as HTMLInputElement[]).map((k) => k.value)).toEqual(['15']));
    fireEvent.click(screen.getByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/mal-kabul')).toBe(true));
    const govde = istekler.find((i) => i.yol === '/stok/mal-kabul')!.govde as { tur: string; satirlar: unknown[] };
    expect(govde.tur).toBe('satin_alma');
    expect(govde.satirlar).toEqual([expect.objectContaining({ malzemeId: 922, miktar: '15', siparisSatirId: 5, sevkKalemiId: 32 })]);
  });

  it('yetkisiz okuyucu listeyi görür, çıkış ve kabul düğmesi görmez', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler] }, { 'GET /stok/depo-sevk': () => json(200, LISTE) });
    ac('/stok/depo-sevk');
    await screen.findByRole('table', { name: 'Son çıkış bekleyen' });
    expect(screen.queryByRole('button', { name: 'Çıkışı yap' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kabul et' })).toBeNull();
  });

  it('kalem kabul beklemiyorsa mal kabul uyarır, satır doldurmaz', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/depo-sevk': () => json(200, { satirlar: [] } satisfies DepoSevkCevabi),
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [] } satisfies AcikSiparisSatirlariCevabi),
    });
    ac('/stok/mal-kabul?sevkKalemi=99');
    expect(await screen.findByText(/Sevkiyat kalemi kabul beklemiyor/)).toBeTruthy();
    expect(screen.queryByText(/^Sevkiyat kalemi:/)).toBeNull();
  });
});
