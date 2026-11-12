import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MalKabulSatirlariCevabi, MalKabulSatirOzeti } from '#paylasilan/sozlesme/stok-mal-kabul-satirlari.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { DEPOCU, OKUYUCU, json, sunucuKur } from './test-ortak.tsx';
import { kabulSatiriDurumu } from './gorunum.ts';
import { MalKabulYapilanlar } from './MalKabulYapilanlar.tsx';
import { MalKabul } from './MalKabul.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 2890: mal kabulü yapılanlar tablosu; veriler uydurmadır.
const SATIR: MalKabulSatirOzeti = {
  id: 501, malKabulId: 77, belgeNo: 'MK-000077', tur: 'satin_alma', irsaliyeNo: 'IRS-1', zaman: '2026-11-10T09:30:00+03:00', kisiAd: 'Deneme Depocu',
  sira: 1, malzemeId: 901, malzemeKod: 'HM-001', malzemeAd: 'Deneme sac', birim: 'kg', sayilanMiktar: '10',
  partiId: 12, lotNo: 'LT-000012', tedarikciPartiNo: 'TP-9', partiBelgeleri: [], irsaliyeBelgeleri: [], ilkKonumKod: 'KABUL',
  yerler: [
    { konumId: 3, konumKod: 'KABUL', konumTur: 'kabul', miktar: '4', kaliteDurumu: 'serbest' },
    { konumId: 8, konumKod: 'A-01-02', konumTur: 'raf_gozu', miktar: '6', kaliteDurumu: 'serbest' },
  ],
  fasonGidenAd: null, gkk: false, logoDurumu: 'irsaliye_bekleniyor', duzeltenId: null, siparisNo: 'SP-000041', tedarikciAdi: 'Deneme Tedarik',
};
const cevap = (satirlar: MalKabulSatirOzeti[]): MalKabulSatirlariCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });

function goster(sayfa: 'tablo' | 'sayfa' = 'tablo') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter initialEntries={['/stok/mal-kabul']}>{sayfa === 'tablo' ? <MalKabulYapilanlar /> : <MalKabul />}</MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

describe('Mal kabulü yapılanlar (2890)', () => {
  it('satırda ne, ne zaman, kim, lot, bugün nerede, durum, belge ve etiket görünür', async () => {
    sunucuKur({ ...DEPOCU, islemler: [...DEPOCU.islemler, 'sayfa.etiket-merkezi'] }, { 'GET /stok/mal-kabul-satirlari': () => json(200, cevap([SATIR])) });
    goster();
    const tablo = within(await screen.findByRole('table', { name: 'Mal kabulü yapılanlar' }));
    const satir = (await tablo.findByText('Deneme sac')).closest('tr')!;
    const s = within(satir);
    expect(s.getByText('Deneme Depocu')).toBeTruthy();
    expect(s.getByText('10 kg')).toBeTruthy();
    expect(s.getByText('LT-000012')).toBeTruthy();
    expect(s.getByRole('link', { name: 'A-01-02' }).getAttribute('href')).toBe('/stok/konumlar/8');
    expect(s.getByText('Kısmen yerleşti')).toBeTruthy();
    expect(s.getByRole('link', { name: 'MK-000077' }).getAttribute('href')).toBe('/stok/mal-kabul/77');
    expect(s.getByText('SP-000041')).toBeTruthy();
    expect(s.getByText('Deneme Tedarik')).toBeTruthy();
    expect(s.getByText('TP-9')).toBeTruthy();
    expect(s.getByText('IRS-1')).toBeTruthy();
    expect(s.getByRole('link', { name: 'LT-000012 etiketi' }).getAttribute('href')).toBe('/etiket-merkezi?tur=lot&id=12');
  });

  it('sipariş ve tedarikçi gelmezse yazılmaz; lotsuz satırda etiket düğmesi yok', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/mal-kabul-satirlari': () => json(200, cevap([{ ...SATIR, siparisNo: null, tedarikciAdi: null, partiId: null, lotNo: null, yerler: [], ilkKonumKod: null }])) });
    goster();
    const satir = within((await screen.findByText('Deneme sac')).closest('tr')!);
    expect(satir.queryByText('SP-000041')).toBeNull();
    expect(satir.queryByText('Deneme Tedarik')).toBeNull();
    expect(satir.queryByRole('link', { name: /etiketi/ })).toBeNull();
    expect(satir.getByText('Hizmet: stoğa girmez')).toBeTruthy();
  });

  it('sayfa iki sekmedir: teslim alan önce formu görür, yapılanlara geçince tablo gelir; teslim alamayan doğrudan tabloyu görür', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/mal-kabul-satirlari': () => json(200, cevap([SATIR])) });
    goster('sayfa');
    expect(await screen.findByRole('heading', { name: 'Yeni mal kabul' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Mal kabulü yapılanlar' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Mal kabulü yapılanlar' }));
    expect(await screen.findByRole('table', { name: 'Mal kabulü yapılanlar' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Yeni mal kabul' })).toBeNull();
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /stok/mal-kabul-satirlari': () => json(200, cevap([SATIR])) });
    goster('sayfa');
    expect(await screen.findByRole('table', { name: 'Mal kabulü yapılanlar' })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Yeni mal kabul' })).toBeNull();
  });

  // 2940 a: her kabul satırı tek satır, tablo yana kayar.
  it('tablo yana kayar; Malzeme solda, Etiket sağda sabit; uzun ad kesilir ve ipucunda tam yazar', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/mal-kabul-satirlari': () => json(200, cevap([SATIR])) });
    goster();
    const tablo = await screen.findByRole('table', { name: 'Mal kabulü yapılanlar' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Malzeme' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Etiket' }).classList.contains('tc-tablo-sabit-sag')).toBe(true);
    expect((await within(tablo).findByText('Deneme sac')).closest('.tc-tablo-kes')?.getAttribute('title')).toBe('Deneme sac');
  });

  it('ikiden çok konumda ilk ikisi yazılır, kalanı +n olur; tamamı ipucunda', async () => {
    const yer = (konumId: number, konumKod: string) => ({ konumId, konumKod, konumTur: 'raf_gozu' as const, miktar: '1', kaliteDurumu: 'serbest' as const });
    sunucuKur(DEPOCU, { 'GET /stok/mal-kabul-satirlari': () => json(200, cevap([{ ...SATIR, yerler: [yer(8, 'A-01-02'), yer(9, 'A-01-03'), yer(10, 'A-01-04')] }])) });
    goster();
    const satir = (await screen.findByText('Deneme sac')).closest('tr')!;
    expect(within(satir).queryByRole('link', { name: 'A-01-04' })).toBeNull();
    expect(within(satir).getByText('+1')).toBeTruthy();
    expect(satir.querySelector('[title="A-01-02 1 kg, A-01-03 1 kg, A-01-04 1 kg"]')).not.toBeNull();
  });

  it('durum lotun bakiyesinden türer', () => {
    const y = (konumTur: 'kabul' | 'raf_gozu' | 'karantina', kaliteDurumu: 'serbest' | 'karar_bekliyor' | 'sartli' | 'red' = 'serbest') => ({ konumTur, kaliteDurumu });
    expect(kabulSatiriDurumu({ duzeltenId: 3, ilkKonumKod: 'KABUL', yerler: [y('kabul')] }).etiket).toBe('Düzeltildi');
    expect(kabulSatiriDurumu({ duzeltenId: null, ilkKonumKod: 'KABUL', yerler: [] }).etiket).toBe('Depoda kalmadı');
    expect(kabulSatiriDurumu({ duzeltenId: null, ilkKonumKod: 'KRN', yerler: [y('karantina', 'karar_bekliyor')] }).etiket).toBe('Giriş kontrolü bekliyor');
    expect(kabulSatiriDurumu({ duzeltenId: null, ilkKonumKod: 'KRN', yerler: [y('karantina', 'red')] }).etiket).toBe('Reddedildi');
    expect(kabulSatiriDurumu({ duzeltenId: null, ilkKonumKod: 'KRN', yerler: [y('karantina', 'red'), y('kabul')] }).etiket).toBe('Kısmen reddedildi');
    expect(kabulSatiriDurumu({ duzeltenId: null, ilkKonumKod: 'KRN', yerler: [y('raf_gozu', 'sartli')] }).etiket).toBe('Şartlı kabul');
    expect(kabulSatiriDurumu({ duzeltenId: null, ilkKonumKod: 'KRN', yerler: [y('raf_gozu', 'sartli'), y('raf_gozu')] }).etiket).toBe('Şartlı kabul');
    expect(kabulSatiriDurumu({ duzeltenId: null, ilkKonumKod: 'KABUL', yerler: [y('kabul')] }).etiket).toBe('Mal kabul alanında');
    expect(kabulSatiriDurumu({ duzeltenId: null, ilkKonumKod: 'KABUL', yerler: [y('raf_gozu')] }).etiket).toBe('Yerleşti');
  });
});
