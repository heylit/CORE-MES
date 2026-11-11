import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdimDurumuCevabi, AdimliListeCevabi, HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { AdimDurumu } from './AdimDurumu.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR = {
  id: 5, emirNo: 'UE-0005', urun: { id: 1, kod: 'M-1', ad: 'Deneme flanş' }, adet: 40, oncelik: 2, baslangic: null, teslim: null, durum: 'basladi', arsiv: false,
} as unknown as AdimliListeCevabi['emirler'][number];
const HAZIRLIK: HazirlikCevabi = { maddeler: [], muafiyetler: [], isEmirleri: [] };
const ADIM = {
  isEmriId: 51, opNo: 10, ad: 'Testere kesim', durum: 'tamam', calisma: null, bagimlilik: 'bekleyen', fason: false, hedef: 40, yapilan: 40, yuzde: 100,
  sistemStatusu: 'bitti', nedenler: [], maddeler: [{ madde: 'cnc', hal: 'gerekmez', ham: 'gerekmez' }, { madde: 'malzeme', hal: 'tamam', ham: 'tamam' }], elle: null, onaylar: [], gecmis: [], tedarik: [],
} satisfies AdimDurumuCevabi['adimlar'][number];
const CEVAP = {
  emirId: 5, emirNo: 'UE-0005', urun: { kod: 'M-1', ad: 'Deneme flanş' }, adet: 40, teslim: null, durum: 'basladi', rotaYuzde: 45, hazirlik: HAZIRLIK,
  adimlar: [
    ADIM,
    {
      ...ADIM, isEmriId: 52, opNo: 20, ad: 'CNC freze', durum: 'bekliyor', yapilan: 0, yuzde: 0, sistemStatusu: 'program', nedenler: ['CNC kurulumu (NC) eksik'],
      maddeler: [{ madde: 'cnc', hal: 'eksik', ham: 'eksik' }, { madde: 'malzeme', hal: 'muaf', ham: 'eksik' }],
      tedarik: [{ asama: 'siparis', fason: false, talepNo: 'ST-2099-002', siparisNo: 'SP-2099-001', termin: '2099-03-01' }],
      elle: { statu: 'siparis', not: 'Tedarikçi bekleniyor', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' },
      onaylar: [{ madde: 'malzeme', gerekce: null, sistemHali: 'eksik', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' }],
      gecmis: [{ olay: 'statu', deger: 'siparis', not: 'Tedarikçi bekleniyor', kisiAdi: 'Deneme Müdür', zaman: '2026-11-11T07:00:00.000Z' }],
    },
  ],
} satisfies AdimDurumuCevabi;
const yollar = {
  'GET /adimli-emirler': () => json(200, { emirler: [EMIR] }),
  'GET /adimli-emirler/5/adim-durumu': () => json(200, CEVAP),
};
const ekran = [{ yol: '/adim-durumu', ekran: AdimDurumu }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Adım Durumu (2893)', () => {
  it('adımlar rota sırasıyla, son durum ve elle işaretiyle; okuyucu yazma alanı görmez', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu'] }, yollar);
    ac(ekran, '/adim-durumu?emir=5');
    const tablo = await screen.findByRole('table', { name: 'Adımlar ve hazırlık' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(within(satirlar[0]!).getByText('Bitti')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Sipariş bekliyor')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Elle')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Elle onay')).toBeTruthy();
    fireEvent.click(within(satirlar[1]!).getByText('CNC freze'));
    expect(await screen.findByText('CNC kurulumu (NC) eksik')).toBeTruthy();
    expect(screen.getByText('Program hazır değil')).toBeTruthy();
    expect(screen.getByText('Sipariş SP-2099-001 bekleniyor · termin 01.03.2099')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yaz' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Onayı kaldır' })).toBeNull();
  });

  it('yetkili durduran maddeyi gerekçeyle onaylar; gerekçesiz düğme kapalı; istek gördüğü hâli taşır', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.adim-durumu', 'uretim-emirleri.adim-durumu-yaz'] }, {
      ...yollar,
      'POST /adimli-emirler/5/is-emirleri/52/hazirlik-onayla': () => json(200, CEVAP),
    });
    ac(ekran, '/adim-durumu?emir=5');
    const tablo = await screen.findByRole('table', { name: 'Adımlar ve hazırlık' });
    fireEvent.click(within(tablo).getByText('CNC freze'));
    fireEvent.change(await screen.findByLabelText('Madde'), { target: { value: 'cnc' } });
    const onayla = screen.getByRole('button', { name: 'Onayla' });
    expect((onayla as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Gerekçe'), { target: { value: 'Program elde denendi' } });
    fireEvent.click(onayla);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ madde: 'cnc', gerekce: 'Program elde denendi', sistemHali: 'eksik' });
  });
});
