import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { BakiyeSatiri, MalzemeAyrintiCevabi, MalzemeStokSatiri, SahipsizStatuluCevabi } from '#paylasilan/sozlesme/stok.ts';
import { MUDUR, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 2547 a (B-2482-12): statüde durup açık hiçbir emre ayrılmamış stok. Veriler uydurmadır.
const STATULER = { statuler: [{ id: 7, malzemeNo: 'YM-900', ad: 'OP 10 Tornalama', kaynakAdim: '12-o10', urunKodu: 'MM-950', revizyon: 'B', renk: 'x', tur: 'YM', zaman: '2026-10-05T08:00:00+03:00' }] };
const LISTE: SahipsizStatuluCevabi = {
  satirlar: [{ malzemeId: 901, malzemeKod: 'HM-001', malzemeAd: 'Deneme sac', statuId: 7, kaliteDurumu: 'serbest', miktar: '10.000', ayrilan: '6.000', sahipsiz: '4.000', konumlar: ['IST-01'] },
    { malzemeId: 901, malzemeKod: 'HM-001', malzemeAd: 'Deneme sac', statuId: 7, kaliteDurumu: 'karar_bekliyor', miktar: '2.000', ayrilan: '0', sahipsiz: '2.000', konumlar: ['IST-01'] }],
};

describe('Sahipsiz statülü stok (2547 a)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('statüdeki, emre ayrılan ve sahipsiz miktarı statü adıyla listeler', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/sahipsiz-statulu': () => json(200, LISTE), 'GET /stok/statuler': () => json(200, STATULER) });
    ac('/stok/sahipsiz-statulu');
    const tablo = await screen.findByRole('table', { name: 'Sahipsiz statülü stok' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Malzeme' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Stok kodu' })).toBeTruthy();
    const [satir, bekleyen] = within(tablo).getAllByText('Deneme sac').map((x) => x.closest('tr')!) as [HTMLTableRowElement, HTMLTableRowElement];
    expect(await within(satir).findByText('YM-900 (MM-950 · Rev B · OP 10 Tornalama)')).toBeTruthy();
    expect(within(satir).getByText('IST-01')).toBeTruthy();
    expect(within(satir).getByText('4')).toBeTruthy();
    expect(within(satir).queryByText('Karar bekliyor')).toBeNull();
    expect(within(bekleyen).getByText('Karar bekliyor')).toBeTruthy();
    expect(screen.getByText('Plan bu stoğu bir emrin zincirinde görmez')).toBeTruthy();
  });

  it('sahipsiz yoksa sıfır satır uydurmaz, açıkça söyler', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/sahipsiz-statulu': () => json(200, { satirlar: [] }), 'GET /stok/statuler': () => json(200, STATULER) });
    ac('/stok/sahipsiz-statulu');
    expect(await screen.findByText('Sahipsiz statülü stok yok')).toBeTruthy();
    expect(screen.getByText('Statüdeki bütün stok açık emirlere ayrılı.')).toBeTruthy();
  });

  it('rezerveyi kaldırma penceresi kaldırılanın sahipsiz kalacağını ve planın yeniden ihtiyaç göstereceğini söyler', async () => {
    const satir: MalzemeStokSatiri = { malzemeId: 901, ad: 'Deneme sac', stokKodu: 'HM-001', tur: 'hammadde', birim: 'kg', toplam: '2', serbest: '0', statude: '2', rezerve: '1.5', kritikSeviye: null, durum: 'tanimsiz', konumSayisi: 1, konumlar: [{ kod: 'C-01-01', katNo: 1, miktar: '2' }], kategoriAdi: null, kartDurumu: null, varsayilanKonum: null, sonHareket: null };
    const bakiye = { id: 13, malzemeId: 901, malzemeAd: 'Deneme sac', konumId: 9, konumKod: 'C-01-01', partiId: 4, partiEtiketi: null, miktar: '2.000', ilkGiris: '2026-10-05T08:00:00+03:00', ambalaj: null, statuId: 7 } satisfies BakiyeSatiri;
    const ayrinti = {
      satir, bakiyeler: [bakiye], ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null }, sonHareketler: [],
      statuKirilimi: [{ statuId: 7, miktar: '2.000', ilkGiris: bakiye.ilkGiris }], tanimliStatuler: [], rezerveler: [{ statuId: 7, uretimEmriId: 41, emirNo: 'UE-0041', miktar: '1.500' }], bekleyenler: [],
    } satisfies MalzemeAyrintiCevabi;
    sunucuKur({ ...MUDUR, islemler: [...MUDUR.islemler, 'stok.statu-degistir'] }, { 'GET /stok/malzemeler/901': () => json(200, ayrinti), 'GET /stok/statuler': () => json(200, STATULER) });
    ac('/stok/malzemeler/901');
    const rezerve = await screen.findByRole('table', { name: 'Rezerve' });
    fireEvent.click(within(rezerve).getByRole('button', { name: 'Rezerveyi kaldır' }));
    const not = await screen.findByRole('note');
    expect(not.textContent).toContain('statüde sahipsiz kalır: plan bu emre yeniden ihtiyaç gösterir');
    expect(within(not).getByRole('link', { name: 'Sahipsiz statülü stok' }).getAttribute('href')).toBe('/stok/sahipsiz-statulu');
  });
});
